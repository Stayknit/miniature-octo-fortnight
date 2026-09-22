# StayKnit — Launch Runbook

An **execution-ordered** companion to `launch-checklist.md`. The checklist is the *status reference* (what's done, why); this runbook is the *day-of script* (do these, in this order). Where they overlap, the checklist wins on detail.

> **Golden rule:** never paste an API key, password, or signing secret into chat. Values go into Vercel → Settings → Environment Variables. A secret leaked in chat must be regenerated.

Legend: 🧑 you only · 🤖 paste a prompt to v0 · 🤝 v0 preps, you click.

---

## What's already live-verified (do not redo)

Domain + HTTPS + HSTS, security headers (26/26), auth + data isolation, account integrity, email send/receive (SPF+MX), **live Paystack keys** (`/balance` → 200), live webhook, FNB payout account. See checklist Phases 0–4.

---

## Blockers to clear before you flip the switch

### 1. 🧑 Legal sign-off on Terms & Privacy
Gates **two** now-built features as well as general launch:
- **Outgoing iCal feed** — publishing shifts calendar-accuracy liability onto StayKnit (contradicts "best-effort / not system of record").
- **Trial card capture** — the card-on-file / recurring-charge clause (Terms §5).

Give counsel `docs/legal/StayKnit-Legal-Pack.docx`. **Done when:** a lawyer signs off, or you accept the drafts with eyes open.

### 2. ✅ Email deliverability (SPF/DKIM/DMARC) — DONE, not a blocker
Re-verified live 2026-09-18: **SPF, DKIM, and DMARC are all published and correct.** DKIM is on selector
**`privateemail._domainkey`** (Namecheap's current selector), which is why an older check of `default._domainkey`
wrongly looked "missing." DMARC is live at `v=DMARC1; p=none; rua=mailto:info@stayknit.org; fo=1`.
**No action required.** Only optional follow-up: after 1–2 weeks of consistent passes, tighten DMARC to
`p=quarantine` (later `p=reject`) in Vercel DNS. Details: `docs/dkim-dmarc-setup.md`.

### 3. 🧑 Neon plan upgrade (backups)
Free plan = 6-hour restore window, no scheduled snapshots. Upgrade the Neon org **"Vercel: Skyknit"** to **Launch** (pay-as-you-go, scales to zero). Steps in `docs/legal/07-operational-security-runbook.md` §2b.
**Then 🤖:** say *"configure Neon backups"* and I'll set the 7-day window + daily snapshots + protected `main` + a test restore.

### 4. 🧑 Confirm canonical domain wiring
Vercel → Settings → Domains: both `stayknit.org` and `www.stayknit.org` added, **`www` set primary**. The 308 apex→www redirect is already in `next.config.mjs`; this just makes sure the apex reaches the app.

---

## Smoke test (the real "are we launched" gate)

### 5a. 🤝 (Recommended) Safe preview checkout test — TEST keys only
So you can walk the full pay flow without moving real money **and without risking the live keys**:

> ⚠️ The app charges with whatever `PAYSTACK_SECRET_KEY` is set — it does **not** auto-switch to test mode in previews. So only ever put **`sk_test_` / `pk_test_`** keys in a **non-production** scope, and never the live keys.

1. Vercel → Settings → Environment Variables → **Add New**.
2. `PAYSTACK_SECRET_KEY` = your `sk_test_…`, and **untick Production** — tick **Preview** (and Development) only.
3. `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` = your `pk_test_…`, same scope (Preview/Development only).
4. Redeploy a preview, open it, and run checkout with a Paystack **test card** (`4084 0840 8408 4081`, any future expiry, any CVV). Confirm the plan activates.

> ✅ **Status (2026-09-18):** the test keys have been added via v0. Before testing, confirm in Vercel that both show **Preview + Development only, Production unticked**, and that Production still holds the separate `sk_live_`/`pk_live_` pair.

> ℹ️ **Activation does not need the webhook.** When the inline popup succeeds, the client calls a server action that runs `verifyTransaction` + `activatePlanFromReference` synchronously (`app/actions/stayknit.ts`), so the plan activates in the preview even though Paystack's `charge.success` webhook never reaches an ephemeral preview URL. The webhook (`app/api/paystack/webhook/route.ts`) is only an idempotent backstop for when the payer's tab closes early — worth testing in production, not required for the preview smoke test.

This leaves Production untouched (still `sk_live_`).

### 5b. 🧑 Production smoke test — one real charge
On **https://www.stayknit.org**: sign up with a real email → confirm the verification email arrives → complete the core host flow (Today, Owners, Calendar, Billing) → subscribe with a **real card** → confirm instant activation → **refund that charge from the Paystack dashboard**. Open it on your phone too.
**Launched when:** a stranger could do all of this without your help.

---

## Optional, when you want them

### 6. 🧑 Turn on error tracking (Sentry)
Code is fully wired and dormant until you add the DSN.
1. Create a project at sentry.io → copy its **DSN**.
2. Vercel → Environment Variables → add `NEXT_PUBLIC_SENTRY_DSN` (optionally `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` for readable stack traces).
3. Redeploy. No code change needed.
4. **Tuning (optional):** trace sampling defaults to 10% in prod. At launch, low traffic means you may want more — set `SENTRY_TRACES_SAMPLE_RATE` and `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` to e.g. `0.5` or `1`, then lower as volume grows. Any value outside `0..1` safely falls back to `0.1`.

### 7. 🧑 Enable trial card capture (after legal §1)
Once counsel approves Terms §5, add `TRIAL_CARD_CAPTURE_ENABLED=1` in Vercel and redeploy. Until then it stays off and the app behaves exactly as today. (The R1 validation charge is auto-refunded; saving a card does not start a subscription.)

### 8. 🧑 Fix the support mailbox (non-blocking; code hardened)
`SUPPORT_SMTP_USER` currently holds a stale Paystack key, not an email. **Code fix shipped:** `lib/email.ts` now validates this Var — a non-email value is ignored (never transmitted to the SMTP server, closing a secret-leak path) and support mail cleanly falls back to the primary mailbox (Reply-To support@), so nothing is dropped. **Do:** (1) **Rotate the leaked `sk_live_…5318` key in Paystack** — it was pasted into a Var and must be treated as exposed. (2) In Vercel, either **remove** `SUPPORT_SMTP_USER` (keeps the clean fallback) or **set it correctly** — `SUPPORT_SMTP_USER=support@stayknit.org` + a valid `SUPPORT_SMTP_PASSWORD` — to send *from* support@ directly. Verify afterward in **Support → Email** (the check now reports the misconfig clearly).

**Done when:** the Support row in the in-app email check shows either a green independent mailbox or the clean "falls back to primary" note (not an auth error), and the old `sk_live_…5318` key is rotated.

---

## One-line status

App, domain, and email (SPF/DKIM/DMARC) are **live-verified**. Payments are code-complete on live keys but **waiting on Paystack account activation** (Pre-Approved → Approved). Remaining true blockers: **Paystack activation** (with Paystack), **legal sign-off**, **Neon plan upgrade**, and the **real-customer smoke test**. Email auth (incl. DKIM) is done — only an optional DMARC tighten remains. Everything else is optional/deferred by design.
