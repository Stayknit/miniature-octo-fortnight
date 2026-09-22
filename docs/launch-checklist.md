# StayKnit — Launch Checklist

**Product:** StayKnit — a web app for short-stay hosts and property owners, built with Next.js, a Neon Postgres database, Better Auth (email + password with email verification), and SMTP email from `stayknit.org`. Plan payments will run through **Paystack** (a South African payment gateway that supports ZAR and pays out to a local business bank account).

**Where it runs:** on Vercel, live at **https://www.stayknit.org**.

**Payments:** StayKnit runs on **Paystack**, a South African gateway that supports ZAR and pays out to your **FNB business account**. Checkout, a signature-verified webhook, and idempotent plan activation are all built and verified.

**How close you are:** the app itself is built and the production security, auth, and data layers are verified live. Your **business setup** is done — the FNB business account is open, and Paystack is on **working live keys**. **Payments are cleared:** the live key was **rotated (2026-09-21)** after an earlier exposure and re-verified end-to-end — `/balance` → 200 **plus a real live test charge that activated and was refunded**. Email send/receive is verified live, and **SPF/DKIM/DMARC are all live**. **Database backups/DR are now in place** (Neon Launch plan: 7-day PITR + daily snapshots + protected `main`, DR-tested 2026-09-21), and **error tracking (Sentry) is live**. The one remaining launch gate is the **legal review** of Terms & Privacy; the real-customer smoke test's payment leg has effectively been exercised by the live test charge + refund.

### Legend

- 🧑 **You** — needs your identity, accounts, payment details, or a decision. Nobody can do this for you.
- 🤖 **Agent** — paste the given prompt to me (v0) and I'll do it in the code.
- 🤝 **Together** — I prepare it, you click the final button or paste in a value.

> **Golden rule about secrets:** never paste an API key, password, or signing secret into chat. They go directly into the Vercel/v0 **Vars** settings. A "secret" leaked in chat has to be regenerated.

---

## Phase 0 — Already done and verified ✅

You don't need to act on these; they're here so you know what's solid.

- [x] ✅ **App builds and runs in production** at https://www.stayknit.org
- [x] ✅ **Custom domain connected, HTTPS enforced** — both `stayknit.org` and `www.stayknit.org` serve securely with HSTS (a header that forces browsers to always use the secure `https://` version).
- [x] ✅ **Security headers verified on the live site** — 26 of 26 automated protocol checks passed, including a Content-Security-Policy (rules that stop malicious scripts).
- [x] ✅ **Accounts can't be duplicated or enumerated** — signup, login, and password reset were tested against the live database. One email can only ever create one account, even if the casing differs (`John@x.com` and `john@x.com` are treated as the same person), enforced right in the database.
- [x] ✅ **Owners are never charged** — property owners get a free, read-only view set up by their host. If someone whose email is already registered as an owner tries the paid host sign-up, no paying account is created for them — checked both in the app and at the sign-up endpoint, and verified against the live database.
- [x] ✅ **Email sender configured** — verification and reset emails send from `stayknit.org` over SMTP.
- [x] ✅ **Registered business details on legal pages** — entity name, registration/tax number, and address (Pai Nosso Close, Paternoster, Western Cape, 7183; street number withheld from public copy).
- [x] ✅ **Payments on Paystack with a reliability pattern built** — checkout initializes a Paystack transaction server-side and completes with the inline popup; a signature-verified webhook (`/api/paystack/webhook`, HMAC-SHA512) activates the plan even if the customer's browser disconnects right after paying, with idempotent activation (a payment can never be double-counted). Now running on **live** keys and processing real ZAR charges (Phase 4).
- [x] ✅ **Pre-launch audit completed** — 26/26 simulation probes pass; app verified against the documentation. Three discrepancies were found and fixed (see `docs/legal/06-audit-findings.md`):
  - Removed a **non-functional 2FA toggle** and its overstated "2FA available" claim (Better Auth had no second factor wired up). **Real optional TOTP 2FA has since been built** (authenticator app + backup codes + security-question recovery, enforced at sign-in), so the claim is now accurate.
  - **Resolved the billing contradiction** in favour of the real model (**prepaid terms with optional, off-by-default auto-renewal**) and added a **self-service Cancel/Resume (unsubscribe)** control plus an auto-renewal toggle to the Plan screen. A host who never turns auto-renewal on is never charged again automatically; the copy on the Plan screen matches this behaviour.
  - Hardened the **12-month inactivity purge** to run on a daily cron, not just lazily.
- [x] ✅ **Show/hide password toggle** on the sign-in / sign-up form.
- [x] ✅ **Full-system simulation pass (2026-09-18)** — walked all three surfaces at the mobile viewport (300×496):
  - **Host portal** (signed in as a live host): Today/double-booking alert, Channels (iCal feeds + sync states), Owners (payouts, statements, plan-based listing locks), **create-owner-login** (generates a shareable password), Plan (trial state, ZAR pricing, no-commission copy), and full Settings (details, notifications, sync, 2FA + security questions, statement costing/VAT, export data, **delete profile** danger zone) — all functional.
  - **Owner portal** (signed in with a generated owner login): correctly scoped to the owner's single unit, **read-only**, no host toggle; Overview + Statement math verified (gross R9,200 − R3,818 itemised fees = R5,382 net).
  - **Admin dashboard** (OWNER_EMAIL, `info@stayknit.org`): visual walkthrough was **blocked by a browser-sandbox outage**, so verified server-side instead — every `/admin` action is gated by `assertAdmin()` (OWNER_EMAIL match; non-admins get 404), and the underlying queries return real figures (13 users / 9 verified; 6 trialing + 4 active; 3 business + 1 starter + 6 trial; 1 comp). Re-run the visual admin pass once the browser sandbox is available.
  - **Build/type check:** `pnpm build` green (all 30 routes compiled), `tsc --noEmit` clean.
  - The dev-preview **"Paystack key missing"** banner is expected in the sandbox (no `PAYSTACK_SECRET_KEY` in `.env.development.local`); the live key works on the deployment.

---

## Phase 1 — Open the FNB business account ✅

**Status: done.** The FNB business account is open in the company name, and its account number and branch code are stored as the `FNB_*` environment variables (they also feed the manual-EFT payout details in the legal pack). This is the local business account Paystack pays out to.

- [x] ✅ **FNB business bank account opened** — active account number and branch code on file.
  - Applied as a company with ID, CIPC registration, and tax number.
  - **Confirmed:** the account is active and its details are captured in the `FNB_*` vars.

---

## Phase 2 — Sign up with Paystack 🧑

- [x] ✅ **Create and verify a Paystack account** — **done, the account is active.**
  - Signed up at **paystack.com** as a South African business, with business registration, ID, and **FNB business account** details for payouts.
  - The Paystack dashboard shows the account activated with both test and live keys available.

> You don't have to wait for full activation to let me start the code — Paystack gives you **test keys** immediately. See Phase 3.

---

## Phase 3 — Paystack payment code 🤖 ✅ Done

The payment integration is complete and verified. No further action here.

- [x] ✅ **Paystack keys in Vars** — `PAYSTACK_SECRET_KEY` and `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` are set (live `sk_live_…` / `pk_live_…`; test keys were used during development).
- [x] ✅ **Payment code on Paystack** — checkout initializes a Paystack transaction server-side and completes with the inline popup (`@paystack/inline-js`); the webhook lives at `/api/paystack/webhook` with HMAC-SHA512 signature verification; the shared idempotent activation re-verifies each transaction (status **and** amount) before granting access, reusing the `lastPaymentRef` guard. The runtime key-mode guard flags test/missing keys.

---

## Phase 4 — Go live with real money ✅ (live activation cleared)

**Live and processing.** The live secret key (`sk_live_…`) authenticates against Paystack (`GET /balance` → **HTTP 200**, live ZAR balance), the public key is `pk_live_…`, the live webhook is registered and reachable in production, and the FNB business account is on file for settlements. **Live charges now process:** as of 2026-09-18 a real **live ZAR Starter subscription** activated (ref `SK-1vf8bObe…`, R199, status `active`, non-comp) and a refund was subsequently issued from the Paystack dashboard — both only possible once the account is out of Pre-Approved. Confirm the Paystack dashboard now reads **Approved**; if it still shows Pre-Approved, re-check before onboarding real customers at volume.

> Note: `/balance` returning 200 only proves the secret key is valid — it does **not** prove the account can process live charges. Live activation is a separate gate, confirmed via a failed `transaction/initialize` (which creates no transaction record, so the Transactions page looks empty in Live mode — check Developers → API Logs for the message).
>
> Interim option: the checkout now shows an amber **"Test mode"** badge whenever the app is built with a `pk_test_` public key, so test keys can be safely dropped into Production to validate the full flow with a Paystack test card, then swapped back to live keys + re-published once approved.

- [x] ✅ **Working live keys in Vars** — `PAYSTACK_SECRET_KEY` = `sk_live_…` (Secret), `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` = `pk_live_…` (Config). Secret verified accepted by Paystack (`/balance` → 200).
- [x] ✅ **Paystack account moved Pre-Approved → Approved** — confirmed by a real live ZAR charge activating a Starter subscription (`SK-1vf8bObe…`, R199) and a dashboard refund on 2026-09-18. 🧑 Sanity-check the dashboard still reads Approved before high-volume onboarding.

- [x] ✅ **Live webhook registered** — set to `https://www.stayknit.org/api/paystack/webhook` and saved in Paystack. Verified reachable in production (`GET` → 200, signing secret present).

- [x] ✅ **FNB payout account on file** — the FNB business account is uploaded/saved in Paystack for settlements.

> The app now runs a real authenticated Paystack health check (not just a prefix guard), so a rejected key would surface as a critical banner rather than a false "all clear."

---

## Phase 5 — Legal review 🧑

- [x] 🧑 **Launch cleared — drafts accepted with eyes open while counsel review continues (2026-09-22).** The owner has decided to launch now; the lawyer review of Terms & Privacy is **in progress, not a blocker**. This satisfies the "or you've accepted the drafts with eyes open" path below. ⚠️ Open caveats to fold in when counsel returns: the new clauses added 2026-09-22 (age/capacity §2, licence §4, third-party listing-sites §7 — see `docs/legal/04-current-inapp-legal-copy.md`), the outgoing iCal liability language (Phase 7.3), and the s72 cross-border questions in `03-instructions-to-counsel.md`. Bump the Terms "last updated" date whenever counsel-driven wording changes ship.
  - The Terms of Service and Privacy Policy pages exist and include your registered details, but they are a **solid starting draft, not vetted legal advice**.
  - Have someone qualified review the liability, governing-law, and billing/cancellation clauses — noting the model is **prepaid with optional, off-by-default auto-renewal** (plans expire and the host re-purchases manually, OR the host opts into auto-renewal, which charges the saved card to extend the term and can be turned off any time) — and the handling of personal data under South Africa's **POPIA**.
  - The consolidated `StayKnit-Legal-Pack.docx` compiles the five core parts for counsel (Business Model, POPIA brief, Security Framework, Instructions to Counsel, and current in-app legal copy). The supporting **audit findings**, **verification report**, and **operational security runbook** live alongside it in `docs/legal/` and can each be downloaded as Word or PDF from the in-app **Docs** tab.
  - **You'll know it worked when...** a lawyer has signed off, or you've accepted the drafts with eyes open.

---

## Phase 6 — Real-customer smoke test 🤝

The app isn't truly "launched" until you've walked it as a paying customer.

- [x] ✅ **Sign up as a brand-new user** — done: owner completed a live end-to-end walk-through (2026-09-22), including sign-up, email verification, and login.
- [x] ✅ **Walk the core host flow** — done: covered in the same live test (2026-09-22).
- [x] ✅ **Subscribe with a real card, then cancel/refund** — done: a real live ZAR charge activated a plan and was refunded (initial run 2026-09-18, re-exercised with the rotated live key on 2026-09-21; **payments re-confirmed working in the 2026-09-22 live test**). Live charge → instant activation → refund all work on the current key.
- [x] ✅ **Open it on your phone** — confirmed in the live test (2026-09-22).
- [x] ✅ **Launched.** Owner confirmed a full live walk-through works and payments process (2026-09-22).

---

## Phase 7 — Audit follow-ups (decide before or shortly after launch) 🤝

From `docs/legal/06-audit-findings.md`. None block launch, but 7.1 is a copy-vs-behaviour gap worth closing.

- [x] ✅ **Copy-vs-behaviour gap closed** — the trial copy previously said "card details required"; signup never collected a card. Resolved by pulling the card claim from all live surfaces (pricing, FAQ, plan blurb, terms gate, /terms, and the legal docs) so the copy now matches actual behaviour (14-day trial, no card at signup). *(Trial card capture has since been **BUILT (2026-09-18)** but ships **behind an off switch** — `TRIAL_CARD_CAPTURE_ENABLED`, default off. Because Paystack SA can't tokenise for free, saving a card runs a **R1 validation charge that's auto-refunded** (net R0) and starts no subscription; the step appears **in-app after first sign-in** on the Plan screen, and is **optional**. 🧑 Enable only after counsel approves the card-on-file clause in Terms §5.)*
- [x] ✅ **(Optional) Real 2FA** — built. Optional TOTP for all accounts (hosts and owners), recommended by StayKnit, via Better Auth's `twoFactor` plugin: authenticator-app enrolment (QR + verified code), second-factor challenge enforced at sign-in, single-use backup codes, and security-question recovery for device loss. No role is gated on it.
- [x] ✅ **Outgoing iCal feed (Option B) — BUILT (2026-09-18)** — per-unit tokenised `.ics` feed at `/ical/<token>.ics`, reusing the existing manual-block model. Origin tagging solved by exporting **only StayKnit-origin holds** (manual blocks + direct bookings), never OTA-imported reservations, so no OTA sees its own booking echoed back. Direct-guest bookings surface as generic `Reserved` (PII-safe). Managed from Channels → **Export availability** (Publish / Copy / Regenerate / Stop). Verified end-to-end in-browser. 🧑 **Still gated on counsel:** publishing shifts calendar-accuracy liability onto StayKnit, so re-approve Terms language before promoting it at launch.

---

## After launch — keep an eye on things

- [x] ✅ **Email deliverability — SPF, DKIM & DMARC all live** — re-verified 2026-09-18 against live DNS (DNS-over-HTTPS). The sender is **Namecheap Private Email**; `stayknit.org` has correct **SPF** (`v=spf1 include:spf.privateemail.com ~all`), **MX** (mx1/mx2.privateemail.com), **DKIM** (valid 2048-bit key published at selector **`privateemail._domainkey`** — *not* `default._domainkey`, which is why an earlier lookup looked empty), and **DMARC** (`v=DMARC1; p=none; rua=mailto:info@stayknit.org; fo=1`). Outbound SMTP (resetpasswords@) + inbound IMAP (info@) both authenticate. **Nothing left to add.** Only *optional* step: after ~1–2 weeks of consistent SPF/DKIM passes, tighten DMARC to `p=quarantine` (later `p=reject`). See `docs/dkim-dmarc-setup.md`.
- [x] ✅ **Support mailbox / leaked key — RESOLVED (2026-09-21)** — both actions are done. (1) The exposed `sk_live_…5318` Paystack key was **rotated** (new live key set in Vercel, verified end-to-end, old key revoked). (2) `SUPPORT_SMTP_USER` was corrected from the stray key value to `support@stayknit.org`. Throughout, `lib/email.ts` validated the value and ignored the non-email, so no secret was ever transmitted and support mail kept falling back to the primary mailbox with `Reply-To: support@`. To fully send *from* support@, ensure a valid `SUPPORT_SMTP_PASSWORD` is set; otherwise the fallback continues to work with nothing dropped.
- [x] ✅ **Error tracking (Sentry) — LIVE (2026-09-21)**: `NEXT_PUBLIC_SENTRY_DSN` was added and a fresh production build shipped (the DSN is build-time inlined), so Sentry now captures errors in production. Verified the ingest endpoint is present in the live client bundle. Init is gated to production only, so preview/dev stay quiet. Optional `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` (readable source-mapped stack traces) remain unset — not required for capture. **Trace sampling is env-tunable** (100% dev, 10% prod default) via `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`; raise toward `1` at launch when traffic is low, lower as volume grows.
- [x] ✅ **Database backups / DR — DONE & DR-tested (2026-09-21)** — the Neon org was upgraded to the **Launch plan**, unlocking a **7-day point-in-time-restore window**, **daily snapshots**, and **protected branches**. Production `main` is protected, and a **test restore was performed and verified** (data intact). A temporary pre-restore backup branch (`pre-restore-backup-2026-09-21`) is retained as an extra copy and will be deleted once production has run cleanly post-launch. Details in `docs/legal/07-operational-security-runbook.md` §2.
- [x] ✅ **Canonical domain redirect (code done)** — `next.config.mjs` now redirects `stayknit.org` → `www.stayknit.org` (permanent/308), host-gated so it never touches preview/localhost. Verified via `pnpm build` + preview. **Your one remaining step:** in Vercel → Settings → Domains, make sure both `stayknit.org` and `www.stayknit.org` are added with `www` set as primary, so the apex actually reaches the app for the redirect to run.

---

## Where things stand right now

| Item | Status |
|------|--------|
| App, domain, HTTPS, security headers | ✅ Done & live-verified |
| Auth, data isolation, email sender | ✅ Done & live-verified |
| Account integrity (one account/email, owners never charged) | ✅ Done & live-verified |
| Business details on legal pages | ✅ Done |
| Pre-launch audit (26/26 sim, app-vs-docs, security) | ✅ Done — 3 fixes applied, see `06-audit-findings.md` |
| Billing model aligned (prepaid + optional off-by-default auto-renew) + self-service cancel | ✅ Done |
| Payments on Paystack (checkout + webhook + idempotency) | ✅ Done & verified — on test keys |
| Paystack signup + verification | ✅ Done — account active |
| Paystack payment code | ✅ Done & verified |
| Live keys + live webhook | ✅ Keys accepted (`/balance` → 200), webhook reachable in prod |
| Paystack live activation (process real charges) | ✅ **Live — real charges processing.** Live key **rotated & re-verified end-to-end 2026-09-21** (live charge activated + refunded). Confirm dashboard reads Approved |
| Database backups / DR | ✅ Done & DR-tested 2026-09-21 — Neon Launch plan: 7-day PITR, daily snapshots, protected `main`, test restore verified |
| Error tracking (Sentry) | ✅ Live 2026-09-21 — DSN set, capturing in production |
| Support mailbox / leaked key | ✅ Resolved 2026-09-21 — key rotated, `SUPPORT_SMTP_USER` corrected |
| Email send/receive (SMTP + IMAP) | ✅ Verified live — outbound queued, inbox reads; support mailbox falls back to primary |
| SPF / MX | ✅ Set correctly (Namecheap Private Email) |
| DKIM record | ✅ Live — valid 2048-bit key at selector `privateemail._domainkey` (re-verified against DNS 2026-09-18) |
| DMARC record | ✅ Live — `p=none; rua=mailto:info@stayknit.org; fo=1`; optionally tighten to `p=quarantine` after 1–2 weeks of clean passes |
| Legal review of Terms/Privacy | 🟡 Launch cleared 2026-09-22 — drafts accepted with eyes open; counsel review continues in parallel (not blocking) |
| Real-customer smoke test | ✅ Done — live end-to-end walk-through + payments confirmed (2026-09-22) |

**Status: LIVE & DEPLOYED (2026-09-22).** Launch is cleared, the owner completed a live end-to-end walk-through with payments confirmed working, and the pending changes have been **published to production** — `www.stayknit.org` now serves the three new Terms clauses (age/capacity, licence, third-party listing sites), the taxpayer-number removal, the canonical-domain redirect, and the `*.vercel.app` no-index guard. The legal review runs in parallel (not blocking); fold counsel's edits into a follow-up deploy and bump the Terms "last updated" date when they return. Several recent edits are committed to the working files but not yet published — the three new Terms clauses (age/capacity, licence, third-party listing sites), removal of the taxpayer number from public view, the staging email kill-switch, the canonical-domain redirect, and the `*.vercel.app` no-index guard. Publish a fresh production build so `www.stayknit.org` serves them, then do the Phase 6 real-customer smoke test (sign up as a stranger, verify email, walk the host flow, open on a phone). Counsel-driven wording changes can ship as a follow-up deploy with a bumped Terms "last updated" date. Everything else technical — payments (live key rotated & verified), backups/DR, error tracking, email auth, ops runbook — is done and verified. Optional post-launch: tighten DMARC to `p=quarantine` after 1–2 weeks of clean passes, and delete the temporary `pre-restore-backup-2026-09-21` Neon branch once production has run cleanly.
