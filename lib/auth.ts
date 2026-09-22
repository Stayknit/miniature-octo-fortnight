import { betterAuth } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { twoFactor } from "better-auth/plugins"
import { nextCookies } from "better-auth/next-js"
import { pool } from "@/lib/db"
import { rateLimit as consumeRateLimit } from "@/lib/rate-limit"
import { sendChangeEmailVerification, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email"
import { isKnownOwnerEmail } from "@/lib/owners"

// Shared, DB-backed store for Better Auth's built-in rate limiter.
//
// Better Auth's default rate-limit storage is an in-memory Map. On Vercel's
// serverless runtime each lambda has its OWN map, so the limit is per-instance,
// not per-attacker: a distributed brute-force / credential-stuffing run against
// /sign-in or /request-password-reset fans out across instances and is
// effectively unthrottled. Routing the limiter through our Postgres
// `rate_limit` table (the same shared store the help-assistant limiter uses)
// enforces the window across every instance.
//
// Better Auth still owns the RULES (which paths, how many, what window). Its
// built-in defaults already cover the sensitive auth paths:
//   - /sign-in*, /sign-up*, /change-password*, /change-email*  -> 3 per 10s
//   - /request-password-reset, /forget-password*,
//     /send-verification-email, /email-otp/*                    -> 3 per 60s
// everything else falls back to the global 100 per 10s. We only swap the
// STORAGE from per-lambda memory to the shared table.
//
// `consume` must be atomic (check-and-increment in one step); our
// `consumeRateLimit` does that with a single INSERT ... ON CONFLICT, and it
// fails OPEN if the store is unavailable so a limiter outage can't lock every
// user out of signing in. `rule.window` is seconds; retryAfter is seconds.
const sharedRateLimitStorage = {
  async consume(key: string, rule: { window: number; max: number }) {
    const res = await consumeRateLimit(`better-auth:${key}`, rule.max, rule.window * 1000)
    return { allowed: res.ok, retryAfter: res.ok ? null : res.retryAfterSeconds }
  },
}

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    // On the live production deployment, pin the canonical www host so session
    // cookies and verification/reset links all share one origin — never the
    // apex or the *.vercel.app URL (the proxy 308-redirects those to www).
    (process.env.VERCEL_ENV === "production"
      ? "https://www.stayknit.org"
      : process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    // No usable session until the email is verified (report #10): someone who
    // signs up with an inbox they don't control can't get functional access.
    autoSignIn: false,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url)
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // When an unverified user tries to sign in, resend the link instead of
    // stranding them.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 1 day
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url)
    },
  },
  hooks: {
    // Block reusing the current password when completing a password reset.
    // Better Auth has no built-in "new must differ from old" rule, so we
    // intercept the reset-password POST, resolve the user from the reset token
    // WITHOUT consuming it (findVerificationValue — the real handler still
    // consumes it afterwards), and reject when the new password verifies
    // against the stored credential hash.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/reset-password") return

      const token = ctx.body?.token ?? ctx.query?.token
      const newPassword = ctx.body?.newPassword
      if (typeof token !== "string" || typeof newPassword !== "string") return

      const verification = await ctx.context.internalAdapter.findVerificationValue(`reset-password:${token}`)
      // Invalid or expired token: let the normal handler return its standard
      // INVALID_TOKEN error rather than leaking token validity from here.
      if (!verification || verification.expiresAt < new Date()) return

      const account = await ctx.context.internalAdapter.findCredentialAccount(verification.value)
      const currentHash = account?.password
      if (!currentHash) return // no existing password to clash with

      const sameAsOld = await ctx.context.password.verify({ hash: currentHash, password: newPassword })
      if (sameAsOld) {
        throw new APIError("BAD_REQUEST", {
          message: "Your new password must be different from your current password.",
        })
      }
    }),
  },
  databaseHooks: {
    user: {
      // Normalize every email to trimmed lowercase before ANY user row is
      // created — including Better Auth's own /api/auth/sign-up/email endpoint,
      // which bypasses the startSignUp server action and its checks. Combined
      // with the case-insensitive unique index (user_email_lower_idx), this
      // makes it impossible to create two accounts for the same address in a
      // different case.
      create: {
        before: async (userData, context) => {
          const email = (userData as { email?: string }).email
          if (typeof email !== "string") return
          const normalized = email.trim().toLowerCase()

          // Backstop for the owners-can't-become-paying-hosts rule. startSignUp
          // already blocks known owners, but a raw POST to /sign-up/email would
          // bypass it. Only enforce on that public sign-up endpoint: internal
          // provisioning (createOwnerLogin, comp accounts) calls the adapter
          // directly with NO endpoint context and MUST still be able to create
          // an owner's user row. Returning false aborts the create.
          if (context?.path === "/sign-up/email" && (await isKnownOwnerEmail(normalized))) {
            return false
          }

          if (normalized === email) return
          return { data: { ...userData, email: normalized } }
        },
      },
    },
  },
  user: {
    // Email changes require confirmation via a link sent to the CURRENT
    // address, so a signed-in session alone can't repoint the account to an
    // inbox the user doesn't control.
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({
        user,
        newEmail,
        url,
      }: {
        user: { email: string }
        newEmail: string
        url: string
      }) => {
        await sendChangeEmailVerification(user.email, newEmail, url)
      },
    },
    additionalFields: {
      // Trading name captured at host sign-up. `input: true` lets the value be
      // supplied on signUpEmail; it's validated as required in startSignUp so
      // the message is friendly and enumeration-safe.
      businessName: {
        type: "string",
        required: false,
        input: true,
      },
      // Mobile (required) and landline (optional) captured at sign-up.
      // Required-ness is enforced in startSignUp for friendly messaging.
      phone: {
        type: "string",
        required: false,
        input: true,
      },
      telephone: {
        type: "string",
        required: false,
        input: true,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "host",
        // Public sign-up is host-only. `input: false` makes Better Auth ignore
        // any client-supplied role, so a visitor can never self-register as an
        // owner. Owner accounts are provisioned exclusively by a host through
        // createOwnerLogin, which sets role via a direct db.update.
        input: false,
      },
    },
  },
  trustedOrigins: [
    // Always trust the explicitly-configured base URL and the Vercel git-branch
    // alias. This is how the `staging` branch preview (which runs with
    // NODE_ENV=production but on stayknit-git-staging-*.vercel.app, not the prod
    // domain) avoids "Invalid origin" on sign-in. Empty/absent in normal prod.
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
    ...(process.env.NODE_ENV === "development"
      ? [
          "http://localhost:3000",
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === "production"
      ? [
          // StayKnit's canonical custom domains. Both apex and www are served,
          // so both must be trusted or sign-in/up fails with "Invalid origin"
          // on whichever one the visitor lands on.
          "https://stayknit.org",
          "https://www.stayknit.org",
          ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
        ]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  rateLimit: {
    // Enabled in EVERY environment (Better Auth otherwise only enables it in
    // production) so the shared store is actually exercised in preview too.
    // The fix that matters is `customStorage`: it moves the counters out of
    // per-lambda memory and into the shared Postgres table so the limit holds
    // across serverless instances. Rules use Better Auth's built-in defaults
    // (sign-in/sign-up/change-*: 3 per 10s; reset/verification: 3 per 60s).
    enabled: true,
    customStorage: sharedRateLimitStorage,
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // In dev (v0 preview iframe), force cross-site cookies so the
          // session cookie is stored by the browser.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
  plugins: [
    // Optional per-host TOTP two-factor. When a host with 2FA enabled signs in
    // with the correct password, Better Auth withholds the session and returns
    // `twoFactorRedirect: true`; the client must then verify a 6-digit
    // authenticator code (or a one-time backup code) before a session is
    // issued. Enrolling requires the current password (verifyPassword).
    twoFactor({
      issuer: "StayKnit",
      // 10 single-use backup codes generated at enable time for device-loss
      // recovery (the second recovery path is the existing security questions).
      backupCodeOptions: { amount: 10, length: 10 },
    }),
    // nextCookies MUST stay last so Set-Cookie headers from server-side auth
    // calls reach Next.js.
    nextCookies(),
  ],
})
