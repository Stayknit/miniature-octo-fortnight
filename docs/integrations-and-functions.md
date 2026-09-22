# StayKnit — Third-party connections & functions

**Updated 17 September 2026**

A plain map of every external service StayKnit talks to, what it is used for, which environment variables it needs, and the key server functions that drive each connection. This is a reference for the owner and for counsel — it describes how the system is wired today.

> Everything that touches an external service runs **server-side**. The browser never holds a secret key: it only ever receives opaque, short-lived tokens (e.g. a Paystack access code). Prices, amounts, and activation are always decided on the server.

---

## 1. Connections at a glance

| Service | What it does | Live? | Key env vars |
| --- | --- | --- | --- |
| **Neon (PostgreSQL)** | Primary database — all app data, users, sessions, subscriptions, tickets | Yes | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` |
| **Better Auth** | Authentication — email+password, email verification, 2FA | Yes | `BETTER_AUTH_SECRET` (uses Neon pool) |
| **Paystack** | Payment processor for subscriptions (ZAR, South Africa) | Yes | `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `PAYSTACK_APPLE_PAY_DOMAIN_ASSOCIATION` (Apple Pay) |
| **Namecheap Private Email (SMTP)** | All transactional email, from two mailboxes | Yes | `SMTP_PASSWORD`, `SUPPORT_SMTP_USER`, `SUPPORT_SMTP_PASSWORD` |
| **FNB bank details** | Manual EFT reference details shown in the legal/launch pack | Reference only | `FNB_ACCOUNT_NAME`, `FNB_ACCOUNT_NUMBER`, `FNB_ACCOUNT_TYPE`, `FNB_BRANCH_CODE` |

---

## 2. Neon (PostgreSQL)

**Role:** the single source of truth for every record — host accounts, owners, bookings, subscriptions, support tickets, promo codes, and the admin audit log.

- Accessed through a connection pool (`lib/db`) using the `pg` driver. No ORM sits between the app and the database.
- Better Auth uses the same pool, so user and session tables live alongside app data.
- Two URLs are provided: a **pooled** URL for normal request traffic and an **unpooled** URL for tasks that need a direct connection.

**Security:** every query that touches host-owned data is scoped by the signed-in user's id (there is no row-level security layer — isolation is enforced in the queries themselves). All queries are parameterised.

---

## 3. Better Auth

**Role:** the authentication layer, configured in `lib/auth.ts` on top of the Neon pool.

- **Email + password only.** No social login.
- **Email verification is mandatory** (`requireEmailVerification: true`, `autoSignIn: false`) — a new account has no usable session until the address is confirmed, so someone who signs up with an inbox they don't control can't get in.
- **Two-factor authentication** (TOTP) is available via the Better Auth `twoFactor` plugin.
- **Base URL** is pinned to `https://stayknit.org` in production.

**Key functions**

- Sign-up / sign-in — Better Auth endpoints under `app/api/auth/[...all]`.
- `resendVerificationEmail(email, channel)` — explicit resend, with a **support-mailbox fallback** (see §5) for when mail isn't arriving.
- Password reset (1-hour token) and change-email verification.
- Email normalisation hook — every address is lowercased before any row is created, so duplicate accounts in different cases are impossible.

---

## 4. Paystack (payments)

**Role:** the live payment processor for plan subscriptions, in ZAR. Card and bank-transfer methods are offered inside the Paystack popup.

**How a payment flows**

1. **Initialize (server):** `initializeTransaction()` in `lib/paystack.ts` calls `POST /transaction/initialize` with the amount, currency, and reference. The browser receives only the opaque **access code**.
2. **Pay (browser):** the Paystack inline popup resumes that access code. The amount is never set by the client.
3. **Confirm — two independent paths, both idempotent:**
   - **Fast path (in-tab):** `confirmPlanCheckout` verifies the reference right after payment.
   - **Safety net (webhook):** `app/api/paystack/webhook` receives `charge.success` even if the payer's tab closes.
   - Both call `activatePlanFromReference()`, whose `lastPaymentRef` guard makes activation idempotent — one payment can never grant access twice.
4. **Verify (server):** `verifyTransaction()` calls `GET /transaction/verify/:reference` — the authoritative check that the payment really succeeded and for how much. The client is never trusted.

**Webhook security:** the raw request body is verified with **HMAC-SHA512** keyed by the secret key, using a constant-time comparison (`app/api/paystack/webhook/route.ts`). Unsigned or mismatched requests are rejected. A `GET` on the same route is a health check that reports only *whether* a secret is configured — never the secret itself.

**Pricing:** monthly fees are editable per-currency in the admin **Pricing** tab. Checkout and verification resolve prices through the same overrides, so what a host is shown always matches what Paystack charges.

**Billing currency:** StayKnit settles in **ZAR only** — `chargeCurrencyFor()` in `lib/pricing.ts` always returns `zar`, so the Rand is the single billing source of truth. Other currencies are shown as approximate conversions only (marketing page, foreign-card statements) and are never the amount charged.

**VAT status:** StayKnit's own VAT on subscription invoices is an admin setting (Admin → Pricing → **VAT status**; `app_setting` key `stayknit_vat`, logic in `lib/vat.ts`), defaulting to **not registered**. While off, invoices carry no VAT line and are receipts, not tax invoices. Once an admin records a SARS VAT number and switches it on, invoices become tax invoices with the rate shown as already included in the same price (`vatBreakdown()` back-computes net + VAT from the gross). Toggling it never changes the advertised price, and it cannot be enabled without a VAT number.

**Apple Pay domain verification:** to offer Apple Pay inside the Paystack popup, Paystack (on Apple's behalf) fetches a merchant-specific token at `https://<domain>/.well-known/apple-developer-merchantid-domain-association` and compares it with the file downloaded in the Paystack dashboard (Settings → Apple Pay). The app serves that token from a route handler (`app/.well-known/apple-developer-merchantid-domain-association/route.ts`) driven by the `PAYSTACK_APPLE_PAY_DOMAIN_ASSOCIATION` env var — the same env-var pattern used for `assetlinks.json`, because Next.js does not reliably serve dotfolders from `public/`. Until the var is set the route returns 404 (so an unverified state is obvious); once set it serves the token on both the apex and `www` host. The response is sent with Content-Type **`application/text`**, which Paystack requires exactly — any other content-type fails verification. Verification runs against the **deployed HTTPS domain** (e.g. `https://stayknit.org/...`), not the v0 preview, so set the var and redeploy before clicking **Verify domain**.

---

## 5. Email (Namecheap Private Email over SMTP)

**Role:** all transactional email, sent with `nodemailer` from `lib/email.ts`. Host is `mail.privateemail.com` (SSL on port 465).

**Two mailboxes:**

| Mailbox | Address | Used for | Credentials |
| --- | --- | --- | --- |
| Primary | `resetpasswords@stayknit.org` | Verification, password reset, change-email, trial/renewal reminders | `SMTP_PASSWORD` |
| Support | `support@stayknit.org` | Support-ticket replies, and the "email not arriving?" backup send | `SUPPORT_SMTP_USER`, `SUPPORT_SMTP_PASSWORD` |

- Namecheap only lets a mailbox send **as itself**, so support mail authenticates with dedicated `support@` credentials.
- **Graceful fallback:** if support credentials are absent, support mail still goes out from the primary mailbox with `Reply-To: support@` — it just isn't a truly independent sender. `hasIndependentSupportMailbox` reflects which mode is active.
- The **verification-email channel** is carried through Better Auth's fixed callback via an `AsyncLocalStorage` (`verificationChannel`), so the resend fallback can choose which mailbox to send from.
- Every send logs a greppable `[v0] email sent …` / `[v0] email FAILED …` marker so deliverability can be told apart from send failures.

---

## 6. FNB bank details (reference only)

**Role:** the StayKnit bank account details, held in environment variables (`FNB_ACCOUNT_NAME`, `FNB_ACCOUNT_NUMBER`, `FNB_ACCOUNT_TYPE`, `FNB_BRANCH_CODE`).

These are used as **reference details in the legal and launch documentation** (manual EFT option), not as a live in-app payment path — the automated checkout is Paystack (§4).

---

## 7. Where each connection lives in the code

| Connection | Primary files |
| --- | --- |
| Neon / database | `lib/db`, `lib/db/schema.ts` |
| Better Auth | `lib/auth.ts`, `app/api/auth/[...all]`, `app/actions/auth.ts` |
| Paystack | `lib/paystack.ts`, `lib/billing/activate.ts`, `app/api/paystack/webhook/route.ts`, `app/.well-known/apple-developer-merchantid-domain-association/route.ts` (Apple Pay) |
| Marketing/ads hub | `app/admin/marketing/page.tsx`, `components/admin/marketing-hub.tsx`, `app/actions/admin-marketing.ts`, `lib/marketing.ts`, `ad_campaign` table (planning/tracking only — no platform ad APIs) |
| Accounts dashboard | `app/admin/accounts/page.tsx`, `components/admin/accounts-dashboard.tsx`, `app/actions/admin-accounts.ts` (reads `subscription`+`user`; revenue via `lib/pricing` + `lib/billing/plan-prices`). Owner-only internal tool |
| "Free feature" marketing | Public accounting/owner-statements feature advertised as free on the marketing site: `components/marketing/owner-portal-section.tsx` (badge + note), `components/marketing/features-section.tsx` ("Payouts & statements" card chip) |
| Email | `lib/email.ts` |
| Admin / support functions | `app/actions/admin-support.ts`, `app/actions/admin-docs.ts` |
