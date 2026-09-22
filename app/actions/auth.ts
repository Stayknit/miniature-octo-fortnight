"use server"

import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import {
  sendExistingAccountNotice,
  sendOwnerSignupNotice,
  verificationChannel,
  type MailChannel,
} from "@/lib/email"
import { isKnownOwnerEmail } from "@/lib/owners"

export type SignUpResult =
  | { ok: true }
  | { ok: false; message: string }

async function originFromHeaders() {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  const proto = h.get("x-forwarded-proto") ?? "https"
  return host ? `${proto}://${host}` : "https://stayknit.org"
}

// Enumeration-safe host signup (report #9). Whether or not the email already
// exists, this returns the SAME generic success and the client shows the same
// "check your inbox" screen — mirroring the non-enumerating password-reset
// endpoints. The real inbox owner always gets a useful email in either branch:
// a verification link for a new account, or a "you already have an account"
// notice for an existing one. Never surface "user already exists" to the caller.
export async function startSignUp(input: {
  name: string
  email: string
  password: string
  businessName: string
  phone: string
  telephone?: string
}): Promise<SignUpResult> {
  const name = input.name?.trim() ?? ""
  const businessName = input.businessName?.trim() ?? ""
  const phone = input.phone?.trim() ?? ""
  const telephone = input.telephone?.trim() ?? ""
  const email = input.email?.trim().toLowerCase() ?? ""
  const password = input.password ?? ""

  // Lenient phone check: digits, spaces, +, -, (), min 7 digits. Keeps real
  // SA/international formats valid without being fussy about punctuation.
  const digits = phone.replace(/\D/g, "")

  // These validation errors are safe to surface: they don't reveal whether the
  // address is registered. Keep them in sync with the client + Better Auth.
  if (!name) return { ok: false, message: "Please enter your name." }
  if (!businessName) return { ok: false, message: "Please enter your business name." }
  if (!phone) return { ok: false, message: "Please enter your mobile number." }
  if (digits.length < 7) return { ok: false, message: "Please enter a valid mobile number." }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Please enter a valid email address." }
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." }

  const origin = await originFromHeaders()

  try {
    // Property owners get a free, read-only portal and never pay. If this email
    // was registered as an owner by a host (in owner_client), do NOT create a
    // paying host account — even if they don't have a login yet. Stay
    // enumeration-safe: same generic success, and email the real inbox owner an
    // explanation that their host manages their access.
    if (await isKnownOwnerEmail(email)) {
      await sendOwnerSignupNotice(email).catch((e) =>
        console.error("[v0] owner-signup notice failed", e),
      )
      return { ok: true }
    }

    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)

    if (existing) {
      // Don't create anything; nudge the real owner toward signing in.
      await sendExistingAccountNotice(email, `${origin}/sign-in`).catch((e) =>
        console.error("[v0] existing-account notice failed", e),
      )
      return { ok: true }
    }

    // New account: Better Auth creates the user (emailVerified=false, no session
    // because autoSignIn is off) and fires the verification email via config.
    await auth.api.signUpEmail({ body: { email, password, name, businessName, phone, telephone } })
    return { ok: true }
  } catch (err) {
    // A race can still land here as a duplicate — treat it exactly like the
    // "existing" branch so the response stays uniform and non-enumerating.
    const code = (err as { body?: { code?: string } })?.body?.code
    if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      await sendExistingAccountNotice(email, `${origin}/sign-in`).catch(() => {})
      return { ok: true }
    }
    console.error("[v0] startSignUp failed", err)
    return { ok: false, message: "We couldn't complete signup right now. Please try again." }
  }
}

export type PasswordResetRequestResult =
  | { ok: true }
  | { ok: false; reason: "send_failed" }

// Send a password-reset link and report whether the email actually went out, so
// the "Check your inbox" screen can stop lying when the mail server is down.
// Enumeration-safe: for an address with no account we do nothing and still
// return ok:true (no email is sent, but account existence isn't leaked). A
// genuine SMTP failure for a real account is surfaced as `send_failed` so the
// user is told the truth instead of waiting for a link that never arrives.
export async function requestPasswordResetEmail(rawEmail: string): Promise<PasswordResetRequestResult> {
  const email = rawEmail?.trim().toLowerCase() ?? ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: true }

  try {
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)

    // Unknown address: stay quiet and generic (no send, no leak).
    if (!row) return { ok: true }

    const origin = await originFromHeaders()
    // Real account: actually send. If SMTP throws, tell the truth.
    await auth.api.requestPasswordReset({ body: { email, redirectTo: `${origin}/reset-password` } })
    return { ok: true }
  } catch (err) {
    console.error("[v0] requestPasswordResetEmail failed", err)
    return { ok: false, reason: "send_failed" }
  }
}

export type ResendVerificationResult =
  | { ok: true }
  | { ok: false; reason: "send_failed" }

// Explicitly (re)send the email-verification link and report whether the send
// actually succeeded, so the sign-in screen can stop claiming "we've sent you a
// link" when the mail server is down. Enumeration-safe: for an address that
// doesn't exist or is already verified we do nothing and still return ok:true
// (no email is sent, but account existence isn't leaked). A genuine SMTP
// failure for a real, unverified account is surfaced as `send_failed` so the
// user is told the truth instead of being sent to check an empty inbox.
//
// `channel` picks the sending mailbox: "primary" (default) uses the normal
// mailbox; "support" re-sends the SAME link from the support@ mailbox — the
// self-service "email not arriving?" fallback, which can get through when the
// primary mailbox is the thing being filtered.
export async function resendVerificationEmail(
  rawEmail: string,
  channel: MailChannel = "primary",
): Promise<ResendVerificationResult> {
  const email = rawEmail?.trim().toLowerCase() ?? ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: true }

  try {
    const [row] = await db
      .select({ id: user.id, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)

    // Unknown address or already verified: stay quiet and generic.
    if (!row || row.emailVerified) return { ok: true }

    const origin = await originFromHeaders()
    // Real, unverified account: actually send. If SMTP throws, tell the truth.
    // Carry the chosen mailbox through to sendVerificationEmail via ALS.
    await verificationChannel.run(channel, async () => {
      await auth.api.sendVerificationEmail({ body: { email, callbackURL: `${origin}/` } })
    })
    return { ok: true }
  } catch (err) {
    console.error("[v0] resendVerificationEmail failed", err)
    return { ok: false, reason: "send_failed" }
  }
}
