# StayKnit — Change log

A dated record of notable changes to the app, its security posture, and the legal/ops documentation. Newest first. Dates are the working dates on which the change was made.

> How to use this: skim the top entry for the latest state. Each entry lists **what changed**, **why**, and **any action still on you**. Items marked ⚠️ need your attention before launch.

---

## 2026-09-24

### Collapsible categories, applied across the app
- **Statement costing (Finances):** each cost line collapses to a compact summary header (name + fee chip + scope/VAT/off badges) that expands to the edit fields on tap. Existing lines start collapsed; a newly added line auto-expands. (Branch `v0/collapsible-statement-costing`.)
- **Channel pricing (Finances):** each per-site fee row now uses the same pattern — collapsed header shows the site, unit, and a fee summary (e.g. "15% commission · 15% VAT", or an amber "No fee set — net = gross" for unconfigured sites). Configured sites start collapsed; unconfigured sites auto-expand to invite setup.
- **Why:** as a host adds fees/sites, these lists were getting long and every row showed its full form at once. Collapsing to summaries keeps the screen scannable while one tap still reveals the full editor. Purely presentational — no costing/pricing math, server actions, or persistence changed. (Left already-compact surfaces alone: the iCal feed rows use a separate edit form, and owner rows already open into a modal.)

### Cancellation sync — handle feeds that retain STATUS:CANCELLED
- **What:** `parseIcal` never read the iCal `STATUS` property, so the live importer treated a `STATUS:CANCELLED` VEVENT as a normal confirmed stay. Now `parseIcal` surfaces `status`, and `syncFeedsForUser` skips a `CANCELLED` event so any stored row it owns is deleted and the date frees.
- **Why it matters:** When a guest cancels, Airbnb and Booking.com *remove* the event from the .ics export — that case already synced correctly (the reconciliation loop deletes the vanished row). But some feeds instead keep the event flagged `STATUS:CANCELLED`; those were staying on the calendar as a confirmed booking, silently blocking a date that was actually free (a lost-booking risk, the inverse of a double-booking). Both cancel styles now free the date.
- **Scope/safety:** `parseIcal` is used only by the live legacy importer; the channel-sync beta adapter uses `node-ical` and already mapped `CANCELLED`. Additive (new optional `IcalEvent.status`), no schema/data change. tsc clean; parse unit-tested (CONFIRMED/CANCELLED surfaced, no-status defaults undefined/kept).
- **Note on booking refunds:** StayKnit does not process guest payments for stays (guests pay the OTA, or the host directly), so there is no guest-refund money flow to sync — a cancellation simply frees the date and drops the (host-entered) payout for that stay. The app's refund system (`refundRequest` table, `admin-refunds.ts`, Paystack `refund.processed`) is entirely for the host's own **subscription**, not bookings.

### Manual reservation pricing + per-site fee rules
- **What:** iCal-imported channel reservations carry dates only (feeds never include the amount a guest paid), so they always showed "No price". Added a way to fill that in by hand and make it stick:
  - **Channel sync screen** — every non-block reservation now shows an "Add price" affordance; the detail modal has a gross-amount field with a live payout breakdown (gross − commission − VAT = net). Saving writes a `financial_breakdown` row with `source: 'manual'`.
  - **Finances tab → new "Channel pricing" card** — save each booking site's fee **once per unit + channel** (commission % and VAT %). Because each site (Airbnb, Booking.com, LekkerSlaap, …) withholds a different commission, the rule is keyed per `(property, channel)`; when the host prices a reservation from that site the payout is computed automatically from the saved rule.
- **Why permanent:** the sync engine only ever writes financials an adapter itself returns, and the iCal adapter declares `financials: false` and returns none — and the engine never deletes existing `financial_breakdown` rows. So a manually-entered price is **never overwritten or removed by a re-sync**. Editing is explicit (Update / Clear price).
- **Data:** additive migration applied to production Neon — new table `channel_pricing_rule` only (`IF NOT EXISTS`, FK to existing `property`, unique on `(propertyId, channel)`); no existing table altered. Gross is capped at R1,000,000 and clamped > 0; net is floored at 0 so an over-large fee can't go negative. All money stays in ZAR minor units.
- **Verification:** tsc 0 errors; pricing math unit-checked (R3630 @15% → net R3085.50; commission+VAT split; over-fee floors to 0); permanence guarantee confirmed by reading the sync engine. Live authed click-through not yet run (needs a throwaway host + seeded reservations). Not merged/deployed.
- **Action:** Owner to set each connected site's real commission/VAT in Finances → Channel pricing; then prices entered on Channel sync compute payouts automatically.

### Blocked dates now surface on the calendar
- **What:** A block (feed "Not available" hold or host block) only drew on the monthly grid in its own month and was excluded from both booking lists, so a far-future block (e.g. a 2027-09 hold) was invisible from the default view. Added a "Blocked dates" list on the calendar screen with one-tap jump to each block's month. (Branch `v0/calendar-blocked-dates-list`, PR #13.)
- **Why:** The 2027-09-24 Airbnb "Not available" hold showed on no calendar. Confirmed the date itself is correct — it matches the raw Airbnb feed (`DTSTART:20270924`); nothing was shifted by timezone (SA/`Africa/Johannesburg` is already the default everywhere) or parser.

### Full simulation re-run — 26/26 green after correcting a stale probe
- **What:** Ran the self-contained protocol harness (`simulation/stayknit-protocol.mjs --live-auth`) against the running app. All public routes, security headers (CSP enforcing + Paystack allowlisted, `nosniff`, `Referrer-Policy`, `SAMEORIGIN`, no `X-Powered-By`), anonymous-data-isolation, live signup/enumeration-safety, and DB-integrity checks passed. The live-auth throwaway `@stayknit-sim.test` account was created and deleted within the run.
- **Probe correction (not an app change):** the one initial failure — `AI help assistant: Empty question is rejected (400)` returning **401** — was a **stale test expectation**, not a bug. The route (`app/api/help-assistant/route.ts`) is intentionally **session-gated**: it checks auth → per-user rate limit → empty-input → model, so an anonymous caller (the harness) is correctly rejected with **401 before the model is ever reached** — the paid-model lockdown recorded in the 2026-09-21 entry. Updated the two AI probes to assert this stronger auth-gate reality (anonymous → 401, model never reached) and refreshed the runbook's "what it checks" section. No application code changed; the harness now reflects the real, more-secure behavior and exits 0 (26 passed, 0 failed).
- **Action:** None.

### Channel-sync date ranges now show the year (sync-confusion fix)
- **What:** The `/channels-sync` dashboard's `dateRange` helper omitted the year, so a far-future block (e.g. **24 Sept 2027**) rendered as just "24 Sept" and — on 24 Sept 2026 — looked like it was happening *today*, giving the false impression the channel-sync list and the main calendar were out of sync. Added `year: 'numeric'`. Verified in the DB that both stores (`booking` and `reservation`) actually hold identical events; this was purely a display bug.
- **Why:** Removes a real "calendar not in sync" support report that was actually a mislabeled date. (Merged to `main` in PR #11.)

### Host "Owners" tab renamed to "Finances" + owner-login refresh fix
- **What:** Renamed the host nav tab label and screen heading from **Owners** → **Finances** to stop confusion with the separate **Owner portal** login. The internal tab key and all owner-portal terminology are unchanged. Also fixed the one non-refreshing mutation on that tab: `OwnerLoginCard`'s `createOwnerLogin` had no `router` and never called `router.refresh()`, so the access toggle/statements/portal state stayed stale until a manual reload — added `useRouter` + `router.refresh()`, matching every other mutation in the app. Owner portal re-verified: still exactly 3 read-only tabs (Overview / Calendar / Statement), Overview and Statement both computed from the shared `buildOwnerStatement` builder so figures reconcile with the host Finances tab by construction.
- **Why:** Naming clarity + closes the last known fire-and-forget sync gap on the Finances tab. (Merged to `main` in PR #11.)

---

## 2026-09-22

### SARS taxpayer number removed from exported/printed owner documents
- **What:** Stopped rendering the SARS **Tax no.** on every owner-facing exported/printed document. `companyIdentityLines()` in `lib/company-details.ts` (used by the Word letterhead in `lib/markdown-to-docx.ts`, the compiled `.xlsx` in `lib/docs-spreadsheet.ts`, and the admin print/PDF view in `components/admin/doc-print-view.tsx`) now shows only entity, CIPC reg. no., address, email, and web. Also fixed the spreadsheet footer, which hand-built its own `Tax …` string, to use the shared `companyFooterLine()`.
- **Why:** The taxpayer number had already been withheld from the public legal pages, the emailed receipts/statements, and the counsel legal pack — but the exported/printed owner documents still leaked it, so an owner statement a host downloaded or printed carried it. This closes that inconsistency. The number remains the source of truth in `lib/legal.ts` for genuine internal / counsel use only.
- **Action:** None. Type-check passes; no public-facing surface renders the taxpayer number now.

---

## 2026-09-21

### Staging environment — isolated Neon branch created & verified
- **What:** Created a dedicated **`staging` Neon branch** (`br-silent-pond-avh72sqt`) off production `main` (`br-spring-bird-avs9mzf8`) in project `green-heart-29986866`, with its own scale-to-zero read-write compute (0.25–1 CU, suspends after 5 min idle). Verified it's a working, isolated copy of production: 29 public tables (incl. `rate_limit`) and prod data present, writes never touch `main`.
- **Why:** Closes the DB half of the "separate, verified staging environment" launch item (§5). A Vercel *Preview* deployment shares the production project's secrets and can reach live data/Paystack, so it isn't a true staging env — a standalone branch + project is.
- **Remaining (owner-led):** create the `stayknit-staging` Vercel project on a `staging` git branch and give it its own secrets — a **fresh** `BETTER_AUTH_SECRET`, Paystack **TEST** keys, staging SMTP/cron — never the live values. Full step-by-step + POPIA note (staging holds a copy of real personal data → same access controls as prod) in `docs/legal/07-operational-security-runbook.md` §7.

### Restore test / DR — status synced (§10)
- **What:** Synced the master status doc to reflect the DR work already completed 2026-09-21: real in-place snapshot restore executed and verified (production `main` now `br-spring-bird-avs9mzf8`, data intact), 7-day PITR, and a daily 03:00 snapshot schedule — all recorded and dated in `07-operational-security-runbook.md` §2. The "restore test executed and dated" launch item is now closed (repeat at least annually).

### Auth brute-force hardening: Better Auth rate limiter now uses a shared store
- **What:** Wired Better Auth's built-in rate limiter to a **shared Postgres store** (`rateLimit.customStorage` in `lib/auth.ts` → the existing `rate_limit` table via `lib/rate-limit.ts`), replacing its default **in-memory** map. Enabled in all environments (Better Auth otherwise only enables it in production).
- **Why:** The in-memory limiter is **per-lambda** on Vercel's serverless runtime, so a distributed brute-force / credential-stuffing run against `/sign-in` or `/request-password-reset` fanned out across instances and was effectively unthrottled. A shared store enforces the window across every instance. This closes the last "must fix before launch" security item in `docs/master-ownership-execution-status.md` (§6).
- **Rules (Better Auth defaults, unchanged):** sign-in / sign-up / change-password / change-email → **3 per 10s**; request-password-reset / forget-password / send-verification / email-otp → **3 per 60s**; everything else → 100 per 10s. Only the *storage* changed, not the limits.
- **Safety:** the store adapter's `consume` is atomic (single `INSERT ... ON CONFLICT`) and **fails open** if the DB is unreachable, so a limiter outage can't lock every user out of signing in — password hashing and the other auth controls remain the primary defence.

### Public AI endpoint lockdown — confirmed closed
- **What:** Re-verified and recorded that the one public AI route, `app/api/help-assistant/route.ts`, is fully gated: it requires a valid signed-in session (401 otherwise) and a **shared DB-backed per-user rate limit** (20/hour) before any paid-model call, backed by prompt-injection output filtering. The other AI routes (`generate-promo`, `generate-voiceover`) are hard-disabled in production (403).
- **Why:** Marked the corresponding "must fix before launch" item done in the status doc — it had shipped in an earlier pass but the status table still read ❌.

### Database backups & DR — configured and DR-tested
- **What:** The Neon org was upgraded off Free to the **Launch plan**, unlocking a **7-day point-in-time-restore window**, **daily snapshots**, and **protected branches**. Production `main` is protected, and a **test restore was performed and verified** (data intact) — proving the recovery path, not just the config.
- **Why:** On Free, a problem found the next day couldn't be rolled back and snapshot scheduling was unavailable — a launch blocker for taking real payments. This closes it.
- **Note:** an extra pre-restore backup branch (`pre-restore-backup-2026-09-21`) is retained temporarily as a belt-and-braces copy; it will be deleted once production has run cleanly post-launch (daily snapshots + 7-day PITR already cover DR).

### Payments cleared for launch — live key rotated & verified end-to-end
- **What:** The exposed `sk_live_…5318` key was **rotated** in Paystack, the new live key set in Vercel Production, and verified end-to-end: `/balance` → 200 **plus a real live test charge that activated a subscription and was then refunded**. The old key is revoked.
- **Why:** The previous live key had been exposed (pasted into `SUPPORT_SMTP_USER`) and had to be treated as compromised. Rotation + a real charge/refund confirms both that the new key works and that the signed webhook verifies against it.
- **Result:** the payments launch gate is **cleared**.

### Security fix: leaked Paystack key removed from `SUPPORT_SMTP_USER`
- **What:** `SUPPORT_SMTP_USER` had been holding a live Paystack secret key instead of an email address. It's now set to its intended value, `support@stayknit.org`. No secret was ever transmitted — `lib/email.ts` validates the value and ignores a non-email, falling back to the primary mailbox — but the value was rotated regardless (see above).
- **Why:** Closes the secret-exposure path and lets support mail send *from* support@ if a valid password is set.

### ⚠️ Production outage resolved: stale `DATABASE_URL` after the branch restore
- **What:** After the snapshot restore/branch-swap, the live site showed StayKnit's "Something went wrong" error boundary. Every request was failing with Postgres `28P01 password authentication failed for user 'neondb_owner'` at `auth.api.getSession()`. Root cause: the project's `DATABASE_URL` held a **stale password** that no longer matched the role on the swapped-in `main` branch. Fixed by resetting `DATABASE_URL` (all environments) to the current Neon pooled credentials, redeploying, and **repointing the production aliases**.
- **Domain gotcha (fixed):** the custom domains `www.stayknit.org` and `stayknit.org` kept showing the error even after the `.vercel.app` domain was fixed, because a Vercel **redeploy does not auto-repoint aliases** — all three production aliases had to be moved to the healthy build individually. All three now serve the current build.
- **Why it matters for launch:** documents that env-var/credential changes require a fresh deploy *and* an explicit alias repoint of every production domain. Recorded in the ops runbook rotation log.

### Error tracking: Sentry is now LIVE
- **What:** Added `NEXT_PUBLIC_SENTRY_DSN`, triggering a fresh production build (the DSN is build-time inlined) so Sentry now captures errors in production. Verified the Sentry ingest endpoint is present in the live client bundle. Init stays gated to production only, so preview/dev remain quiet.
- **Why:** Today's outage would have paged automatically with this on. Optional `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` (readable source-mapped stack traces) remain unset — not required for capture.

### Ops & compliance runbook fully filled in
- **What:** `docs/legal/07-operational-security-runbook.md` — all previously-bracketed placeholders resolved: POPIA roles (Information Officer = the founder; Deputy = none, solo operator), the §2 backup/test-restore record, §3 sub-processor DPA review dates (Vercel/Neon/Paystack/SMTP), the §4.1 access list (founder sole access), the §4.3 secrets-rotation log (today's Paystack key, `SUPPORT_SMTP_USER`, and `DATABASE_URL` changes), and the §5.3 DSAR SLA (30 calendar days).
- **Remaining open** are counsel confirmations only (Information Regulator postal address; Terms/Privacy sign-off), not blanks.

---

## 2026-09-18

### Critical fix: discounted checkout was charged but never activated
- **What:** A subscription bought with a promo/discount code was successfully charged by Paystack but then failed to activate — the host saw "We could not confirm your payment," even though money had left their card. Fixed so a discounted payment now activates the plan correctly.
- **Why:** Checkout charges the discounted amount (full price minus the host's promo %), but the server-side activation check was comparing what Paystack collected against the **full, undiscounted** price and rejecting the difference. It now re-applies the same discount (carried securely in the server-set transaction metadata) before validating the amount, on both the in-tab confirmation and the Paystack webhook. Charges without a discount, and auto-renewals, are unaffected.
- **How it surfaced:** Caught in the first live smoke test — the owner account holds a 90% test code, so a R199 Starter plan was charged as R19.90 (successful on Paystack) but never activated.
- **⚠️ Action on you:** The one payment already collected in that test (R19.90) did not grant a plan. After this deploys, either **resend that transaction's `charge.success` event from the Paystack Dashboard** (it will activate with no new charge) or **refund it** — don't just click "Try again," which starts a brand-new charge.

### Sentry trace sampling made env-tunable
- Trace sampling was already launch-appropriate (100% in dev, **10% in production** — not 100% as an earlier note wrongly said; corrected here). Made the production rate configurable without a code deploy so you can raise it at launch (low traffic → sample more to actually see traces) and lower it as volume grows.
- New optional env vars: **`SENTRY_TRACES_SAMPLE_RATE`** (server + edge) and **`NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`** (browser). Both take a value in `0..1`; a missing, non-numeric, or out-of-range value safely falls back to `0.1`, so a typo can never silence tracing or accidentally send 100%. Dev is always full (1.0). Unchanged if you set nothing.
- Session Replay remains intentionally off (bundle weight + POPIA/guest-data privacy). Typecheck passes.

### Optional trial card capture (built, shipped OFF behind a switch)
- Hosts can now optionally save a card during the free trial. Because Paystack South Africa can't tokenise a card for free, "saving a card" runs a **R1 validation charge that is refunded immediately** — the host's net cost is R0 — and stores the reusable card authorization for one-tap upgrades later. It does **not** start any subscription and does **not** turn on auto-renewal.
- Placement follows the sign-up constraints: the step appears **in-app after first sign-in** (on the Plan screen's trial status card), never at sign-up — sign-up has no session because email verification is required and auto-sign-in is off. It is **optional** and never blocks using the trial.
- Flow is server-authoritative end to end: `startTrialCardCapture()` initialises a 100-cent ZAR charge tagged `kind:'card_capture'` (no plan in metadata, so the webhook's activation path ignores it and can never grant a term); the inline popup collects the card; `confirmTrialCardCapture()` re-verifies with Paystack (must be this user, a card-capture charge, ≤ R2), **refunds the R1**, then saves the authorization. The refund never touches the plan-revert path because the reference is never stored as the activating payment.
- **⚠️ Action on you:** this is gated behind `TRIAL_CARD_CAPTURE_ENABLED` (default **off**) because counsel has not yet approved the card-on-file / recurring-charge clause of **Terms §5**. Do **not** set `TRIAL_CARD_CAPTURE_ENABLED=1` in production until that clause is approved.

### Canonical domain: apex → www redirect
- Added a host-gated `redirects()` in `next.config.mjs` sending `stayknit.org/*` → `https://www.stayknit.org/*` (permanent/308), matching the canonical `www` host already used by `metadataBase`/OpenGraph in `app/layout.tsx`.
- The `has: [{ type: 'host', value: 'stayknit.org' }]` gate means it only fires for the bare apex — never on Vercel preview URLs or localhost — and can't loop since the destination host (www) differs from the matched apex. Verified: `pnpm build` passes and the dev preview loads without redirecting.
- Note: this handles the redirect at the app layer. For it to take effect in production, both `stayknit.org` and `www.stayknit.org` must be added to the Vercel project's Domains (with `www` as primary); the apex must resolve to Vercel so the request reaches the app.

### Error tracking: Sentry wired in (awaiting DSN)
- Installed `@sentry/nextjs` 10.75 and added the full Next.js 16 setup: `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` (with `onRouterTransitionStart`), `instrumentation.ts` (registers server/edge configs + exports `onRequestError` so Server Component/route errors are captured), and a branded `app/global-error.tsx` that reports the render error.
- `next.config.mjs` wrapped with `withSentryConfig`. Uses `tunnelRoute: '/monitoring'` so browser events post **same-origin** — staying within the app's enforcing CSP (`connect-src 'self'`) without widening it to Sentry's ingest domain, and dodging ad-blockers. `org`/`project`/`authToken` read from env (source-map upload skipped when unset).
- **Everything is gated on `NEXT_PUBLIC_SENTRY_DSN`**: with no DSN, every Sentry `init` is skipped and the app runs unchanged — verified via a clean dev boot and a passing `pnpm build`. To activate: add `NEXT_PUBLIC_SENTRY_DSN` (required) and optionally `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` (readable stack traces) to the Vercel project env. Sampling: traces at 100% (tune down after launch), session replay off by default.

### App-download assist moved to the Home page
- Relocated the PWA install control from the sign-in form to the public Home page, in the final "Start knitting your stays together" CTA under a "Prefer an app?" label. Removed `<InstallPrompt />` from `auth-form.tsx`.
- Renamed the always-visible `auth` variant to `hero` (default). It always renders an "Install StayKnit app" button: native Chrome/Edge/Android prompt when available, iOS Safari Share-sheet steps on iOS, and a **manual-instructions fallback** (open browser menu → "Install StayKnit"/"Add to Home Screen" → confirm) on browsers that never fire `beforeinstallprompt` (Firefox, desktop Safari, embedded webviews, the v0 preview).
- The dashboard `banner` and `settings` variants still hide themselves when there's nothing actionable. Replaced the `⋮`/`⋯` glyphs (rendered as tofu) with "the three-dots icon". Verified at 618×638: assist visible on Home and expands to steps; no longer present on `/sign-in`.

### Re-verified: DB-level overlap guard (#3) + security headers (#21)
- **No code change needed — both confirmed live.** Re-ran the checks against the running app and live DB.
- **Overlap guard:** `booking_feed_identity_idx` unique index confirmed present in the live database (`CREATE UNIQUE INDEX … ON public.booking ("sourceFeedId","sourceUid")`). Behavioral test inside a rolled-back transaction: a duplicate `(feedId, uid)` is rejected (`23505 booking_feed_identity_idx`), two NULL-identity rows both insert (manual/direct bookings stay unconstrained), and an `ON CONFLICT DO NOTHING` re-insert is a clean 0-row no-op — matching the importer's path. No production rows were mutated.
- **Security headers:** all six served and enforcing on actual dev-server responses (HSTS w/ `includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`, and the enforcing CSP), and `X-Powered-By` is suppressed (`poweredByHeader: false`).

### Pilot invitation letter is now a signed PDF
- The personalised pilot invitation is generated as a **print-ready A4 PDF** (was `.docx`) via a new server-only `lib/invite-letter-pdf.ts` (pdfkit). Branded teal letterhead + accent rule, flowing body, bulleted terms/confidentiality, and automatic pagination.
- Added a proper **signature block** kept together at the bottom: "Warm regards," → a signature-style "The StayKnit Team" flourish with an accent underline → printed "The StayKnit Team", the registered entity (`StayKnit (Pty) Ltd`), and `support@stayknit.org · stayknit.org`.
- Downloads now produce `StayKnit-Pilot-Invite-<name>.pdf` and the emailed attachment is `application/pdf`. The shared download helper picks its MIME from the file extension, so the blank details form stays a `.docx` fill-in form. Button/label/copy updated to "PDF letter".
- Verified: `tsc` clean; the full pdfkit sequence (multi-page overflow, `addPage`, keep-together signature, all four Helvetica variants) assembles to a valid PDF; the owner-gated route compiles.

### Auto email send-out for "Invite a pilot host"
- The owner-only invite tool can now **email the invitation directly from StayKnit** — no Outlook step. New **"Send invitation email"** button sends a branded, personalised invite (from `support@` so replies land in the inbox) with the **full pilot letter attached** as a Word doc.
- The email CTA points at the public `/sign-up` page (origin resolved to match Better Auth), so the pilot creates their own account and the normal email-verification flow takes over.
- Added attachment support to the shared `sendMail` (including the support→primary fallback path) and a new `sendPilotInviteEmail` builder; new `sendPilotInvite` server action reuses the exact same validation + document as the download path, so the emailed letter is identical to the manual one.
- The "Download Word letter" and blank-form options remain. Verified: `tsc` clean; the invite page is owner-gated (404 for non-owners).

### DB-level double-import guard (booking idempotency)
- **New unique index `booking_feed_identity_idx` on `(sourceFeedId, sourceUid)`** enforces at the database level that a given feed event can exist at most once — closing the concurrent/overlapping-import race the app-level dedupe couldn't fully guarantee.
- **Non-destructive by design:** Postgres treats NULLs as distinct, so manual and direct bookings (NULL identity) are never constrained, and genuine cross-feed double-bookings (distinct identities) still surface as clashes — the double-booking *detection* feature is untouched.
- The importer's insert now uses `onConflictDoNothing` on that index, so a racing re-sync is a clean no-op instead of a thrown error. Reflected in the Drizzle schema.
- Verified against the live DB: no pre-existing duplicates; a duplicate identity is rejected (`23505 booking_feed_identity_idx`); two NULL-identity rows both insert; `onConflictDoNothing` returns 0 rows without error. `tsc` clean.
- **Security headers (audit #21):** confirmed already fully implemented and *enforcing* in `next.config.mjs` (HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy, and a Content-Security-Policy) — no change needed.

### POPIA: atomic account erasure + complete data export
- **`purgeUserData` is now a single transaction** — a POPIA "right to be forgotten" erasure is all-or-nothing. The previous `Promise.all`-then-delete-user could partially fail and orphan rows (e.g. bookings gone but subscription kept); now any failure rolls the whole thing back.
- **Closed two orphan gaps:** `promoRedemption` (has `userId`, was never deleted) and `supportMessage` (keyed by `ticketId`, was orphaned when tickets were deleted) are now purged. Message threads are cleared before their tickets.
- **Export completeness:** `exportMyData` now also returns `promoRedemptions` and `supportMessages`, so the POPIA access/portability right returns everything the erasure removes. (Password hash and security-question answers remain excluded.)
- Verified against the live DB: all purge deletes execute cleanly inside a transaction with correct table/column names; `tsc` clean. Both the self-service delete and the 12-month inactivity sweep use this same transactional path.

### iCal parser: recurring-block (RRULE) expansion + robust date handling
- **Recurring owner holds are no longer collapsed to a single date.** `parseIcal` now expands `RRULE` events into individual dated occurrences — supports `FREQ` (DAILY/WEEKLY/MONTHLY/YEARLY), `INTERVAL`, `COUNT`, and `UNTIL`.
- **Bounded** to 400 occurrences / ~2-year horizon; fully-past occurrences are dropped (no DB churn); each occurrence gets a stable per-date UID (`<uid>#<date>`) so reconciliation treats them as distinct stays.
- **Date handling clarified & hardened:** UTC-based date arithmetic (no timezone drift), a missing `DTEND` now defaults to a one-night stay, and timed/`TZID`/floating values use the encoded local calendar day (what channel feeds intend). Documented residual limitation for pure-UTC near-midnight times.
- Verified with fixtures: all-day `VALUE=DATE`, a `TZID=Africa/Johannesburg` timed event, and a `WEEKLY;COUNT=4` recurrence (expanded to exactly 4 dated occurrences). `tsc` clean.

### Scheduled background calendar sync + per-feed sync-status system
- **Calendars now stay fresh without the host opening the app.** New `/api/cron/sync-feeds` cron (every 3 hours) reconciles every active host's iCal feeds in the background, building directly on the reconciliation work so cancellations/date-changes are picked up automatically.
- **Per-feed health tracking** on `feed` (`lastAttemptAt`, `lastSyncedAt`, `lastStatus`, `lastError`, `failureCount`, `nextRetryAt` — all live-migrated). The importer was refactored into a shared `syncFeedsForUser()` used by both the manual "Sync now" action and the cron.
- **Exponential backoff with retries:** a healthy feed re-syncs every ~3h; a failing one backs off 30m → doubling → capped at 24h, so a permanently broken URL isn't hammered. The cron only touches feeds that are actually due (`onlyDue`) and skips lapsed accounts (`skipIfNoAccess`).
- **Host-visible status** in the Channels screen: each feed now shows "Synced 3h ago", "Sync failed: <reason> · will retry automatically", or "Not synced yet".
- **Operator alerting:** systemic failures in the batch are reported via `reportServerError`; the whole run is wrapped so a crash returns 500 instead of failing silently.
- Verified end-to-end against the live DB: `tsc` clean; cron returns 401 without `CRON_SECRET` and 200 with it; processed 3 due hosts; failed demo feeds recorded distinct errors (`feed unreachable`, `feed returned 404`), `failureCount=1`, and `nextRetryAt=+30m`; locked (over-cap) feeds correctly left untouched.

### Error monitoring + no more silent renewal failures
- **Auto-renewal failures now notify everyone who needs to know.** When a renewal card charge fails (thrown error *or* a non-success Paystack status), the host gets a **dunning email** (access-still-valid, please renew/update card — copy escalates on repeat attempts), and the operator (`OWNER_EMAIL`) gets an **operational alert**. Previously a failed renewal was only a server log line.
- **Failure tracking** on `subscription` (`renewalFailureCount`, `renewalFailedAt`, live-migrated) — escalates the dunning copy and lets support spot stuck renewals. Counters reset to 0/null the instant a renewal succeeds. The existing daily retry throttle is unchanged.
- **Baseline error monitoring without an external service:** new fail-safe `reportServerError()` / `sendOwnerAlertEmail()` helpers in `lib/email.ts` (they never throw, so they're safe in catch blocks). All three cron routes — **renewals, expiry-reminders, scan-invoices** — are now wrapped so an unexpected crash emails the operator and returns a 500 (marking the Vercel run failed) instead of failing silently. A total renewal wipeout (every attempt failing) sends an extra "likely outage" alert.
- Verified: `tsc --noEmit` clean.

### Calendar sync now reconciles cancellations and date changes (no longer insert-only)
- **Fixed the highest-impact calendar risk:** `importIcalFeeds` was insert-only, so a reservation cancelled or moved on Airbnb/Booking.com/LekkerSlaap/NightsBridge left a **phantom block** on the StayKnit calendar forever — silently costing bookings. The importer now **reconciles** each feed: inserts new reservations, **updates** ones whose dates changed, and **removes** ones that disappeared from the feed (cancellations).
- **Identity model:** added nullable `booking.sourceUid` + `booking.sourceFeedId` columns (live-migrated, additive). Feed-imported rows are matched by VEVENT **UID** (falling back to date range when a feed omits UIDs). Legacy pre-reconciliation rows are **adopted by date match** on first sync so nothing duplicates.
- **Safety guarantees:** reconciliation — including deletion — runs **only for a feed that fetched and parsed successfully**. An unreachable/timed-out/errored feed is reported and its rows left untouched, so an outage can never wipe blocks and cause double bookings. Manual and direct bookings, and manually-added blocks (no `sourceFeedId`), are never modified or deleted. Same-date duplication across multiple feeds for one property is still de-duplicated.
- **Host feedback:** the Channels screen now reports `updated` and `cancelled removed` counts alongside new/unchanged, giving clear sync feedback.
- Verified: `tsc --noEmit` clean; `parseIcal` confirmed to capture UIDs and detect owner-hold blocks on an Airbnb/Booking-style feed.
- ⚠️ Still open (separate item): iCal date parsing drops timed-event `TZID` and `RRULE` — validate against real NightsBridge/LekkerSlaap feeds during channel testing.

### Launch-blocker fixes: AI route lockdown, auto-renewal copy, ZAR renewal guard
- **Secured the help-assistant AI endpoint** (`app/api/help-assistant/route.ts`) — it now requires a valid signed-in session (401 otherwise) and enforces a **shared, DB-backed per-user rate limit** (20/hour) via the new `lib/rate-limit.ts` + `rate_limit` table, so a single account can't loop the paid model into a large AI-Gateway bill. Fails open if the limiter store is unavailable, with the auth check as the primary control.
- **Fixed the auto-renewal copy/doc contradiction** — the Plan-screen footer no longer says "billed once — no auto-renewal"; it now states auto-renewal is optional and off by default. Updated the three stale "no auto-renewal" references in `docs/launch-checklist.md` to "prepaid with optional, off-by-default auto-renewal." (The dynamic Plan-screen status text was already correct.)
- **ZAR cutover guard in the renewals cron** — audited `subscription.chargeCurrency` live: all rows null, **zero** active auto-renewers on a non-ZAR currency. Added a defensive default so the renewal charge always re-derives the amount in the same currency it charges (ZAR), even for a stray legacy/null value.
- Surfaced the **Master ownership & security execution-status annex** in the in-app support **Docs** tab (allow-listed manifest entry).

### Master Ownership & Security Execution Plan — v0.app status annex added
- Reviewed the owner's **Master Ownership and Security Execution Plan** (Draft 1.0; `data/StayKnit_Master_Ownership_and_Security_Execution_Plan_Draft-60cdbd.docx`) and added a companion status annex at **`docs/master-ownership-execution-status.md`**.
- The annex maps every v0.app-owned and joint section of the plan (§4–§11, §15–§16) to its **verified current state** from the prior read-only audits, marks owner-only sections (§2, §3, §12–§14) as owner actions, and ends with a **prioritised list of open v0.app-side items** for launch sign-off (plan §17).
- Documentation only — **no pricing, business rules, or production functionality changed** (per the plan's §1 operating rule).
- ⚠️ **Action on you:** work the "Must fix before public launch" list in the annex; owner-only items (ownership register, 2FA, restore test, incident response, store/domain accounts) remain with you.

### VAT as a configurable admin setting + ZAR as the single billing currency
- **VAT is now an operator setting, not hard-coded.** Admin dashboard → Pricing → **VAT status** (stored in new `app_setting` table, key `stayknit_vat`; logic in `lib/vat.ts`). Defaults to **not registered**.
  - While not registered, subscription invoices carry **no VAT line** and state they are receipts, not SARS tax invoices — the only lawful presentation for a non-vendor.
  - Once an admin records a SARS VAT number and enables it, invoices become proper **tax invoices** showing the number with the 15% **already included** in the same price. The app refuses to enable it without a VAT number.
  - **Advertised prices never change when VAT is toggled** — VAT is back-computed as included in the existing ZAR price (`vatBreakdown()`), so an R199 plan stays R199.
- **ZAR is now the single billing source of truth.** `chargeCurrencyFor()` always returns `zar`; foreign currencies are shown only as approximate conversions (marketing page labels them "approximate… billed in ZAR"), never the amount charged. Removes the previous region-locked foreign-currency billing. Plan screen caption updated to "Billed in ZAR."
- Docs updated: `01-business-model.md` (VAT admin setting + ZAR billing sections), `integrations-and-functions.md` (billing currency + VAT status).
- ⚠️ **Action on you:** have your South African accountant confirm the final tax-invoice wording and VAT-inclusive treatment **before** switching the VAT setting on in production.

### Email footers: hide sending mailbox + taxpayer no. across ALL emails
- Removed the "Sent from resetpasswords@stayknit.org" line from every email (it exposed the raw SMTP mailbox). `shell()` now takes a `footer` mode: `auto` (automated / please-don't-reply / "email support@stayknit.org") for transactional mail — verification, email-change, account notices, subscription & trial reminders, password reset, test — and `support` (reply-friendly, no mailbox shown) for support/admin/outreach mail. Financial docs (invoice/refund/statement) use the same `auto` no-reply footer.
- Removed the SARS **Taxpayer no.** line from the financial-document legal footer (kept only entity, reg no., address, support email). Taxpayer number still appears on the legal pages via `lib/legal.ts` where appropriate.
- Replies still work: all financial + transactional sends carry Reply-To `support@stayknit.org`, so a reply reaches the monitored inbox rather than the password-reset mailbox. Note: the visible **From** address is still the SMTP mailbox (Namecheap sends as the authenticated mailbox); a true `noreply@` From needs a dedicated mailbox created + `SMTP_USER`/`FROM` repointed.

### Added host-facing financial emails (invoice, refund, statement) + reviewed in legal pack
- **Three new emails to the host (subscriber only — never to owners):** (1) **payment receipt/invoice** sent automatically on every successful subscription charge from `activatePlanFromReference` (initial + auto-renewals), (2) **refund confirmation** sent from `revertPlanForRefund` when a Paystack refund is processed, and (3) **owner statement copy** the host can email to themselves on demand from the Owners screen (owners still view their own statements in the in-app portal only — per product rule). All in `lib/email.ts` via a shared `financialDoc` layout with the registered-entity legal footer.
- **VAT:** because StayKnit is not yet VAT-registered, the invoice is a plain receipt/invoice with **no VAT line** and states "…not a SARS tax invoice." Easy to switch to a full SARS tax invoice on registration.
- **Wiring:** invoice/refund sends are best-effort (a mail failure never rolls back a paid activation or a refund revert) and fire only on the single idempotent path, so a webhook race can't double-send. New `emailStatementToHost(ownerId)` server action reuses the same `buildOwnerStatement` builder as the in-app statement, so the emailed figures match the app by construction. The old client `mailto:`-to-owner "Email statement" button was replaced with a server-sent "Email to me" (to the host).
- **Simulation:** sent all three live to the `info@stayknit.org` inbox and verified receipt over IMAP — subjects and full content confirmed (invoice `INV-…`, refund full-refund wording, statement with reconciling nights/gross/fees/net/due). Temp preview route + verify script removed afterward. `tsc --noEmit` clean; app compiles and boots clean.
- **Legal pack:** regenerated `docs/legal/StayKnit-Legal-Pack.docx` with a new Part 5 subsection reproducing the verbatim wording of all three documents plus counsel notes (VAT-not-registered receipt language, refund confirmation vs. refund right, statement calculation disclaimer).
- ⚠️ Not exercised: the "Email to me" button's live click through a signed-in host session (the send path and email content are proven; the thin server-action glue typechecks and reuses proven builders). Confirm during your manual review.

### Added Paystack refund handling (refund.processed)
- The webhook now handles Paystack's `refund.processed` event (confirmed via Paystack docs — there is no `charge.refund` event; the refund payload carries `data.transaction_reference` + `data.amount`). New `revertPlanForRefund(transactionReference, refundedAmount)` in `lib/billing/activate.ts` is the counterpart to `activatePlanFromReference`.
- Behavior: a **full** refund of the activating payment reverts the host to the (expired) trial — `plan: trial`, `status: canceled`, `autoRenew: false`, `cancelAt`/`lastPaymentRef` cleared — so access is revoked immediately and no further charge fires. **Partial** refunds keep access (the refunded amount is compared against the original charge, re-verified server-side with Paystack). Mirrors `applyPendingCancellation`'s field set; leaves `trialEndsAt` untouched so the re-subscribe freeze re-triggers.
- Idempotent: matches only the subscription still backed by that exact reference and only while it's on a paid plan, so re-delivered refund events and already-reverted accounts are no-ops. Verified locally with a temporary guarded route seeding a synthetic paid subscription: full refund → `reverted:true`, plan flipped to `trial/canceled/autoRenew:false/lastPaymentRef:null`; re-delivery → `reverted:false` (no-op). Temp route removed; `tsc --noEmit` clean.
- Note: the local/preview dev server has no `PAYSTACK_SECRET_KEY`, so a signature-verified webhook test must be run on production (via a real refund or Paystack's test-webhook tool).

### Fixed first-load crash for brand-new users (race condition)
- During the host/owner core-flow walkthrough, a freshly-created host hit a **500 on the dashboard root** (`/`). Root cause: `page.tsx` fans out into many parallel requests on first load, and both first-run seeders used check-then-insert:
  - `ensureSettings` — the losers of the race violated `user_settings_userId_key` (unique on `userId`), which threw and crashed the page. Fixed with an idempotent upsert: `insert ... onConflictDoNothing({ target: userSettings.userId })` then re-select the winner's row.
  - `ensureCostLines` — `cost_line` has no unique key on `userId`, so concurrent callers would each insert a full set of default cost lines, **duplicating every line and doubling statement costs**. Fixed by serialising the seed behind a per-user `pg_advisory_xact_lock` inside a transaction, re-checking once the lock is held.
- Verified end-to-end in the browser: sign up → email-verification gate → agreement gate → dashboard loads → add property + owner → connect iCal feed (imported 83 events, 1/1 feeds reachable) → owner **Overview** and **Statement** reconcile exactly (R −87 814, 83 nights, gross R0; Cleaning R950×83 + Laundry R108×83 = single, non-duplicated multiples — confirming the cost-line fix). Host Owners tab, owner Overview, and owner Statement all agree.
- Test scaffolding was fully removed afterward: the temporary guarded `app/api/dev/seed-verify` route (used to verify a `qa+...@stayknit.org` test host and to delete test data) is deleted, and all test users + scoped data were purged from the DB (`deletedUsers: 2`, re-run `0`).

### CRON_SECRET added — daily jobs armed
- `CRON_SECRET` is now set in project Vars. Verified both daily crons flip from 503/401 to **HTTP 200** with the correct Bearer token: `/api/cron/renewals` → `{"ok":true,"scanned":0,"charged":0,"renewed":0,"failed":0}` and `/api/cron/expiry-reminders` → `{"ok":true,"scanned":0,"sent":0,"failed":0,"purged":true}`. Requests without the secret are correctly rejected (401).
- This arms the opt-in **auto-renewal** engine and the **expiry-reminder + 12-month inactivity purge** job. Flipped the launch-checklist `cron-secret` item to `done`.

### DKIM/DMARC verified live — deliverability item closed
- Confirmed all three records resolve: SPF ✅, DKIM ✅ (`privateemail._domainkey`, valid 2048-bit key), DMARC ✅ (`p=none; rua=mailto:info@stayknit.org; fo=1`). A real password-reset email was delivered to the **inbox** (not junk) on iCloud Mail and rendered correctly; the apex→www reset link redirect was verified (`stayknit.org/api/auth/reset-password/<token>` → `www.stayknit.org/reset-password`).
- Flipped the launch-checklist `dns` item from `action` to `done`. Remaining warm-up guidance: keep marking mail "not junk", tighten DMARC to `p=quarantine` after a week or two of consistent passes.

### DKIM/DMARC setup runbook
- Re-checked live DNS: SPF ✅, MX ✅, but **DKIM still missing** and **DMARC still weak** (`v=DMARC1; P=NONE`). Nameservers are Vercel (ns1/ns2.vercel-dns.com).
- Could not apply the records automatically: the Vercel CLI in the sandbox is unauthenticated (`not_authorized`), and the DKIM public key can only be generated by the Namecheap Private Email dashboard. Both are user-driven steps.
- Wrote `docs/dkim-dmarc-setup.md` — exact copy-paste runbook: generate DKIM in Namecheap → add TXT in Vercel DNS (Name `default._domainkey`/`privateemail._domainkey`), fix `_dmarc` to `v=DMARC1; p=none; rua=mailto:info@stayknit.org; fo=1` (later `p=quarantine`), plus DoH verification commands and a Gmail "Show original" SPF/DKIM/DMARC=PASS check. Pointed the in-app `dns` checklist item at the runbook.

### Full simulation + diagnostics + legal review
- **Diagnostics:** `pnpm exec next build` passes clean — TypeScript OK, all 30 routes built (18/18 static pages). Only output is a benign `pg` SSL-mode deprecation advisory (future major version; no current behavior change). `typescript.ignoreBuildErrors` remains removed.
- **Runtime simulation (dev server):** public pages (`/`, `/sign-in`, `/sign-up`, `/forgot-password`, `/terms`, `/privacy`, `/cookie-policy`, manifest, `.well-known`) all 200; admin routes correctly 404 for unauthenticated visitors; cron routes (`renewals`, `expiry-reminders`, `scan-invoices`) correctly refuse without `CRON_SECRET` (503, clear message); Paystack webhook GET health 200, and POST correctly returns 400 on missing/forged signature (timing-safe compare). Local webhook POST shows 500 only because this dev shell lacks `PAYSTACK_SECRET_KEY` (`secretConfigured:false`) — production was verified `secretConfigured:true`, so real forged requests get a clean 400. No code bug.
  - ⚠️ **Action:** `CRON_SECRET` must be set in production for the three crons to run.
- **Legal review — two accuracy fixes (docs realigned to the shipped app):**
  1. **Auto-renewal contradiction resolved.** The published in-app Terms §5 already described optional, off-by-default auto-renewal (stored Paystack token + daily renewals cron), but the whole legal pack still said "plans do NOT auto-renew / no card-on-file billing." Realigned `01-business-model.md`, `03-instructions-to-counsel.md`, `04-current-inapp-legal-copy.md`, the pack generator, and the schema `canceledAt` comment; logged as finding **2.5** and marked **2.2** superseded. Regenerated `StayKnit-Legal-Pack.docx`.
  2. **Font over-disclosure corrected.** Fonts load via `next/font/google`, which self-hosts them at build time — no visitor request or IP reaches Google. Removed "Google LLC (Fonts)" from the Privacy sub-processor list (`lib/legal.ts`) and rewrote the Cookie Policy "Third-party requests" section (Paystack on the plan page is now the only third-party runtime request). Logged as finding **2.6**.
- **Also:** bumped in-app legal "last updated" to 18 September 2026.
- **⚠️ For counsel:** the recurring-charge / card-on-file clause of Terms §5 is new — review pre-charge notice, price-change disclosure, ease of opting out, and stored-credential consent under the CPA & ECTA.

## 2026-09-17

### Email/DNS smoke test — mostly green, DKIM missing + support mailbox misconfig
- **Verified working (live):** primary SMTP mailbox `resetpasswords@stayknit.org` authenticates and a real test email was accepted by the server (250 queued) → verification/reset emails send. IMAP `info@stayknit.org` connects and reads the inbox (50 messages). SPF (`v=spf1 include:spf.privateemail.com ~all`) and MX (mx1/mx2.privateemail.com) are correct.
- **Found broken — support mailbox:** `SUPPORT_SMTP_USER` in Vars holds a **Paystack key** (`sk_live_…5318`), not an email, and the correct `support@stayknit.org` login also fails auth (bad/stale `SUPPORT_SMTP_PASSWORD`) → all support/contact email would have failed to send.
- **Code fix:** hardened `sendMail()` in `lib/email.ts` — if an independent support mailbox send fails, it now retries once via the primary mailbox (From primary, Reply-To support@) instead of throwing. Verified live: a support email that previously failed now sends (`ok:true`). No support message is dropped anymore.
- **Still on you (DNS):** add **DKIM** (missing — enable in Namecheap Private Email, add `default._domainkey` TXT to Vercel DNS) and strengthen **DMARC** (`P=NONE` → `p=none; rua=mailto:…`, later `p=quarantine`). Optional: fix `SUPPORT_SMTP_USER`/`SUPPORT_SMTP_PASSWORD` so support mail comes from support@ directly, and rotate the leaked `sk_live_…5318` key.
- **Checklist:** `email-test` → done (transport verified); `dns` stays an action with exact records.

### Phase 4 COMPLETE — live Paystack payments verified
- **What:** The live keys now work. `PAYSTACK_SECRET_KEY` (`sk_live_…a43b`) authenticates against Paystack — a fresh authenticated `GET /balance` returned **HTTP 200** with a live ZAR balance (`{"status":true,"message":"Balances retrieved"}`). Public key is `pk_live_…6969`. Root cause of the earlier 401s was a combination of the wrong value saved in Vercel (a stale `sk_test_` in the secret slot) and the public key needing Config type; once corrected and redeployed, the fresh `sk_live_` key was accepted.
- **Marked done:** `paystack-live` item in the in-app checklist (`components/launch-checklist-view.tsx` → `done`) and Phase 4 in `docs/launch-checklist.md` (✅).
- **Confirmed by user (2026-09-18):** live webhook registered and saved at `https://www.stayknit.org/api/paystack/webhook` (verified reachable in production — `GET` returns 200 with signing secret present), and the FNB business account is uploaded/saved in Paystack for settlements. Phase 4 fully closed — real money flows end to end.

### Payment guard now does a real authenticated health check
- **What:** Closed the gap where the mode guard trusted only the key *prefix*. Added `checkPaystackHealth()` (authenticated `GET /balance`, 4s timeout, 5-min in-memory cache) and `resolvePaymentModeWarning()` in `lib/payment-mode.ts`; `app/page.tsx` now awaits the async resolver (in parallel with data loads).
- **Behavior:** a live-formatted key that Paystack rejects (401) now raises a **critical, non-dismissible** banner ("Live Paystack key is being rejected") instead of a false all-clear. A transient/unreachable Paystack only shows a soft, dismissible notice (and only on production) so a network blip can't fake a blocker.
- **Verified:** with the current key the resolver returns `health: "rejected"` → critical warning. The old sync `paymentModeWarning()` (prefix-only) is retained and still used inside the resolver for the fast missing/test/unknown cases.

### Phase 4 — live payments still BLOCKED (live key rejected 401)
- **What:** Attempted to confirm live mode. The keys in Vars are live-*formatted* (`sk_live_…` / `pk_live_…`), so `paystackKeyMode()` returns `live` and the test-mode banner hides — but an authenticated `GET /balance` with the live secret key returns **`401 Invalid key`**, so real charges would fail. This is the same live-key activation issue noted previously, now confirmed still present.
- **How verified:** two temporary owner-side routes — one read `paystackKeyMode()` (`live` / `pk_live_`), one called Paystack `/balance` (HTTP 401, "Invalid key"). Both removed immediately after.
- **Result:** left `paystack-live` as **Your action** in the in-app checklist and marked Phase 4 **⛔ blocked** in `docs/launch-checklist.md` (did NOT mark done).
- **Action on you:** in the Paystack dashboard confirm the account is fully activated for **live**, **regenerate** the live keys (Settings → API Keys & Webhooks), and paste the fresh `sk_live_`/`pk_live_` into Vars; set the live webhook to `https://www.stayknit.org/api/paystack/webhook`; enable FNB payouts. Then ask me to re-verify. ⚠️
- **Known guard gap:** `paymentModeWarning()` checks only the key prefix, so a live-formatted-but-401 key shows no warning. Candidate fix: add a real authenticated health check.

### Phase 1 complete — FNB business account opened
- **What:** The FNB business bank account is open in the company name. Marked **Phase 1 done** in both the in-app pre-launch checklist (`components/launch-checklist-view.tsx`, `fnb` item → `done`) and `docs/launch-checklist.md`, and updated the "how close you are" summary.
- **Where the details live:** the account number and branch code are stored as the `FNB_*` environment variables and already feed the manual-EFT payout details in the legal pack.
- **Action still on you:** go live (Phase 4) — in the Paystack dashboard confirm **FNB payouts are enabled**, then swap the test keys for live `sk_live_…`/`pk_live_…` in Vars and set the live webhook. ⚠️

### "Free feature" messaging on the public marketing site
- **What:** Advertised the customer-facing **accounting / owner-statements** capability as a free, included feature on the public www.stayknit.org pages. Added a "Free on every plan" badge and an "Owner statements and accounting are included free — there is never an add-on charge" line to the Owner Portal section (`components/marketing/owner-portal-section.tsx`), and a "Free" chip on the "Payouts & statements" card in the Features section (`components/marketing/features-section.tsx`).
- **Scope correction:** This is a **public-site** message for customers (hosts/property managers), not the internal `/admin/accounts` tab. An earlier revision mistakenly put a "Free feature" badge on the admin Accounts dashboard header; that badge was removed — the admin accounting tab carries no such label.
- **Why:** Owner wanted prospective clients on the marketing site to see that accounting/owner statements cost nothing extra.

### Accounts dashboard (revenue & subscriptions)
- **What:** New owner-only page at `/admin/accounts` (in the shared admin nav + a card on the home hub). Shows revenue headline (MRR = summed monthly plan value of paying non-comp accounts; ARR = MRR×12), status counts (trialing / past due / canceled / total subs), a **by-plan** breakdown table with each tier's paying count, monthly value, and share of MRR, and a searchable/plan-filterable **accounts table** (business/name, email, plan, billing period, status badge, monthly value, renew/end date). Comp/pilot accounts are flagged and excluded from revenue.
- **Data:** `getAccountStats()` in `app/actions/admin-accounts.ts` (gated by `assertAdmin`) joins `subscription`→`user` and resolves each paid tier's monthly ZAR price via `applyPriceOverrides`/`monthlyCents`, so figures match what hosts are actually charged. Reporting currency is ZAR (StayKnit home market); billing is prepaid so MRR is a normalised run-rate, not cash collected. No new tables.
- **Also:** home hub now shows MRR in its overview row and an Accounts card with "R… MRR · N paying".
- **Why:** Owner asked for an accounts dashboard alongside Support/Marketing/Invitations.

### Admin home hub + shared cross-page nav
- **What:** Added a main dashboard at `/admin` that lists every admin dashboard as a card (Support, Marketing & ads, Invitations) with a one-line description and a live stat per card (open tickets, active campaigns), plus an overview row (total users, paying, new-30-days, open tickets). Added a shared `AdminNav` (`components/admin/admin-nav.tsx`) with a **Home** tab, wired into all admin pages so you can move between them from anywhere; the current page is highlighted (`aria-current`).
- **Why:** Owner wanted a single landing page tying the dashboards together with easy back-and-forth navigation.

### Marketing & ads hub (owner-only)
- **What:** New owner-only page at `/admin/marketing` (linked from the support header, 404s for everyone else). Three parts: (1) **deep links** to each platform's native Ads Manager — Facebook, Instagram, LinkedIn, Reddit, YouTube; (2) a **UTM link builder** that generates a trackable destination URL per platform; (3) a DB-backed **campaign tracker** (name, platforms, objective, status, budget, dates, destination + UTM link, notes) with create/edit/status/delete. Backed by a new `ad_campaign` table and `app/actions/admin-marketing.ts` (all actions gated by `assertAdmin`). Shared constants/types live in `lib/marketing.ts` (kept out of the `"use server"` file, which may only export async functions).
- **Important — no programmatic ad buying:** StayKnit does NOT launch ads via platform APIs. Each platform (Meta/LinkedIn/Reddit/Google Ads) gates that behind its own approved developer app + business verification + app review, which happen on the platform's side. This hub centralises planning, tracking, and attribution links; the actual ad creative is still made in each platform's Ads Manager.
- **Why:** Owner wanted a single place to control and track ad campaigns across all five platforms; this delivers the realistic version of that.

### User count summary in the support dashboard
- **What:** Added a totals bar at the top of the owner support console (`/admin/support`) showing **Total users**, **Verified**, **Paying** (active paid plan, excluding comp/pilot grants), and **New in the last 30 days**. Backed by a new `getUserStats()` server action that uses SQL `COUNT` queries (accurate beyond the 200-row user list) and re-checks the admin gate.
- **Why:** Owner wanted an at-a-glance user count built into the support domain.

### Stripe references scrubbed from docs
- **What:** Removed every Stripe mention from the documentation — the dormant "Stripe" row and the whole "Stripe (dormant)" section in the integrations doc (renumbered the code-map section), and reworded the audit-findings payments note to state Paystack is the only processor referenced. The codebase already had zero Stripe code, dependencies, or imports; Paystack is the sole payment processor.
- **Your action required:** The `STRIPE_*` environment variables are injected by the connected Stripe Marketplace integration and can only be removed by **disconnecting Stripe in project Settings → Integrations**. Until you do, the unused vars (`STRIPE_SECRET_KEY`, `STRIPE_ACCESS_TOKEN`, `STRIPE_ACCESS_TOKEN_2`, `STRIPE_MCP_KEY`, `STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) remain in the environment. Nothing in the app depends on them.
- **Why:** Owner wants all traces of Stripe removed; keeping unused payment secrets around is needless attack surface.

### Compiled legal pack regenerated
- **What:** Rebuilt `docs/legal/StayKnit-Legal-Pack.docx` (28.9 KB) from the updated generator so the downloadable pack reflects every recent correction: distinct CIPC (2026/740258/07) and SARS (9155051304) numbers, the reverted "no card at signup" trial copy, and Paystack as the live processor.
- **Verified:** extracted the .docx text and confirmed the SARS number is present, the old merged "Registration & taxpayer number" line is gone, and no stale "card details required" phrasing remains.

### SARS taxpayer number corrected (now distinct from CIPC)
- **What:** Set the real SARS taxpayer number **9155051304** in `lib/legal.ts` (the source of truth the legal pages read from). It was previously placeholdered as identical to the CIPC registration number (2026/740258/07). Because the two are now distinct, `registrationLines()` automatically renders them as two separate lines on the Terms/Privacy contact sections instead of a merged "Registration & taxpayer number" line. Bumped `lastUpdated` to 17 September 2026.
- **Also updated:** the business-model briefing and the legal-pack generator script (contact blocks + entity table) so a regenerated `StayKnit-Legal-Pack.docx` carries the correct, distinct numbers.
- **Why:** Owner correction — the earlier value was a known placeholder flagged for verification.

### Apple Pay domain verification for Paystack
- **What:** Added a route handler at `/.well-known/apple-developer-merchantid-domain-association` so Paystack can verify the domain and enable Apple Pay in the checkout popup. It serves the merchant token from the `PAYSTACK_APPLE_PAY_DOMAIN_ASSOCIATION` env var (returns 404 until set) with Content-Type `application/text` as Paystack requires, mirroring the existing `assetlinks.json` route since Next.js doesn't reliably serve dotfolders from `public/`.
- **Your action:** In Paystack → Settings → Apple Pay, click **Download verification file**, paste its full contents into the `PAYSTACK_APPLE_PAY_DOMAIN_ASSOCIATION` project var, redeploy, then enter your live domain and click **Verify domain**.
- **Why:** Enables Apple Pay as a payment method for subscription checkout. No secret is exposed — the association token is public by design.

### Trial card copy reverted to match behaviour (review §3.1)
- **What:** Removed the "card details required at signup" claim from every live surface — pricing section, FAQ, plan blurb (`lib/plans.ts`), terms gate, `/terms` page, the in-app-copy / business-model / instructions-to-counsel legal docs, and the legal-pack generator script. Copy now reads: 14-day free trial, **no card required**, charged only when you confirm a paid plan.
- **Why:** The signup flow never actually captured a card, so the copy was a factual misstatement in legal documents. Reverting is the honest, safe position and is fully reversible — if card-at-trial is built later, the copy gets re-added alongside the real flow. Audit-findings 2.3/4.1 and the launch checklist were updated to reflect the gap is closed (capture is now an optional future feature, not a fix). No product behaviour changed.

### Legal-pack doc-sync (from Claude legal-pack review)
- **What:** Synced the source legal docs to already-confirmed production reality: POPIA briefing now states Paystack is **live** (not "planned"), the database region is **AWS us-east-1 (USA)**, and outbound email is **Namecheap Private Email** (was "provider to confirm"); the cross-border s72 flag names all three US-based processors; the stale "no email provider is connected" note was removed. Instructions-to-counsel: removed the contradictory "one-month notice period" cancellation line (every other doc says cancel anytime, no notice) and replaced it with the accurate prepaid/expiry wording.
- **Why:** A third-party review flagged these as factual drift between the docs and the shipped system. These are description-only corrections; no product behaviour changed. Note: the "free trial requires card details" copy-vs-behaviour gap (review §3.1) was intentionally left as-is pending an explicit decision, since the current wording was a deliberate prior choice with card capture deferred.

### New doc: "Third-party connections & functions"
- **What:** Added a document to Support → Docs (under Security & ops) mapping every external service StayKnit connects to — Neon (database), Better Auth, Paystack (payments), Namecheap SMTP email, and FNB reference details — with the env vars each needs and the key server functions behind each connection.
- **Why:** Gives the owner and counsel a single accurate reference for how the system is wired, including which secrets stay server-side and where each integration lives in the code.

### Docs tab "updated" date no longer shows 2018
- **What:** The "updated {date}" line under each document in Support → Docs now shows the document's real date instead of "20 Oct 2018".
- **Why:** It was reading the file's filesystem modified-time (`fs.stat().mtime`). In the deployed build every source file is written with the same fixed build-constant mtime, so it had nothing to do with when a doc was edited. The date is now parsed from each document's own body (newest real date it contains — ISO or "17 September 2026" style), with a curated per-document fallback for the few docs that carry no inline date. mtime is no longer used for dates (still used for file size, which is reliable).

### Support dashboard timestamps no longer look like "2018"
- **What:** Dates in the support dashboard (tickets, users, dormant list, audit log, promo expiry) now render as e.g. `16 Sep 2026 · 10:18 pm` instead of `16 Sept 2026, 22:18`.
- **Why:** In South African / UK locales the old combined format used 24-hour time, so a correct 2026 timestamp showed the time "20:18/22:18" right after the year — which reads like the year "2018" at a glance. The stored data was always correct (verified against the live database: users, audit log, and bookings all carry proper 2025/2026 dates); only the display was ambiguous. The formatter now forces 12-hour time and separates date from time with "·", so no 4-digit time can be mistaken for a year. Also added an "Invalid date" guard.

### Sign-in "confirm your email" — explicit resend + backup-mailbox fallback
- **What:** When sign-in is blocked because the email isn't confirmed yet, the banner now shows an explicit **Resend confirmation link** button (people expect a button to press, not just an auto-send), plus a second self-service path — **Send from backup address** — that re-sends the same link from the `support@stayknit.org` mailbox. If a spam filter is eating mail from the primary sending address, the alternate sender can still get through, so a host can verify without waiting on support.
- **How:** New `channel` argument on the `resendVerificationEmail` server action, carried through Better Auth's fixed callback via an `AsyncLocalStorage` mail-channel. Both sends stay enumeration-safe and report success/failure honestly. Verified end-to-end in the browser (both buttons send and show a confirmation) using a throwaway unverified account that was deleted afterward.
- **⚠️ Action for a true second sender:** the backup button only sends from a genuinely different mailbox once **`SUPPORT_SMTP_USER`** and **`SUPPORT_SMTP_PASSWORD`** (for `support@stayknit.org`) are set. Until then it gracefully falls back to the primary mailbox — still a real retry, but from the same address.

### Full system check + documentation alignment
- **What:** Ran a full pass — production build + type-check (both clean), a route/flow simulation (all public pages return 200; owner-only doc/admin routes correctly blocked for signed-out visitors), and a documentation-vs-app audit. Verified in code that the claims in the legal pack still hold: real TOTP 2FA (`twoFactor` plugin), Paystack webhook HMAC-SHA512 with constant-time compare, per-user data scoping, and the prepaid `canceledAt` cancel/resume field.
- **Why:** To confirm the app and every document still describe the same product after the recent email changes.
- **Fixed drift:** the docs described outbound email as an unnamed "SMTP provider (to confirm)" — now correctly named **Namecheap Private Email** across the security framework, audit findings, launch checklist, and the compiled legal pack. Deliverability status (SPF + DMARC set, DKIM to add) and the new Email diagnostics panel + honest send messaging are now reflected in the pre-launch docs, and `StayKnit-Legal-Pack.docx` was regenerated to match.
- **Action:** None — informational. The one open deliverability item (add DKIM) is tracked in the launch checklist.

### Email diagnostics + honest "confirmation sent" messaging
- **What:** New owner-only **Email** tab in the support dashboard. It runs a live SMTP handshake to prove the mailbox credentials work, and sends a real test email so you can confirm end-to-end delivery (and whether mail lands in spam). The sign-in screen no longer claims "we've sent you a link" unless the send actually succeeded — a real mail-server failure now tells the user the truth and points them to support. The **password-reset** screen got the same treatment: it stays enumeration-safe (unknown emails still show "Check your inbox"), but if the mail server is genuinely down it now says so instead of sending the user to an empty inbox.
- **Why:** Users reported confirmation emails not arriving. The old flow showed "check your inbox" on every unverified sign-in even if sending had failed silently, so there was no way to tell a broken mailbox from a spam-folder problem.
- **Findings:** DNS for stayknit.org has correct **SPF** and **DMARC**, but **no DKIM** record — adding the Namecheap Private Email DKIM key (Vercel DNS) will improve inbox placement. Every send now logs a `[v0] email sent…` / `[v0] email FAILED…` line for future debugging.
- **Action:** If users report missing email, open **Support → Email**, run the check, and send yourself a test. If it authenticates and arrives, it's a deliverability/spam issue (add DKIM); if it fails to authenticate, reset the mailbox password and update `SMTP_PASSWORD`.

### Docs tab — download any document as Word or PDF
- **What:** Every document in the **Docs** tab now has **Word** and **PDF** download buttons. Word (`.docx`) is generated on the fly from the markdown; PDF opens a clean, print-optimized view that auto-launches the browser's print dialog (choose "Save as PDF").
- **Why:** So you can hand documents to counsel, an accountant, or a bank in a standard format rather than sharing raw files.
- **Action:** None. Open **Docs**, pick a document, and use the Word or PDF button. Both are owner-only.

### Admin "Docs" tab — in-app document reader
- **What:** Added a **Docs** tab to the owner-only support console (`/admin/support`). It lists every legal and operational document grouped by category and renders the markdown in-app; the compiled legal pack is offered as a `.docx` download.
- **Why:** So you can read and review all documentation from inside the app instead of opening files.
- **Action:** None. Sign in as the owner and open **Docs**.

### This change log
- **What:** Started this dated change log and wired it into the Docs tab so update history is reviewable in-app.
- **Why:** You asked to keep a dated record of updates.

### Neon backup posture — investigated and documented
- **What:** Pulled the live Neon project settings (read-only) and recorded the real numbers in the runbook §2/§3: platform **AWS**, region **us-east-1 (USA)**, Postgres 18, plan **Free**, point-in-time-restore window **6 hours**, **no automatic snapshots**.
- **Attempted:** Setting a daily snapshot schedule on `main` — **rejected by Neon** ("backup schedule creation is not enabled for this project"), confirming snapshot scheduling is a paid-plan feature.
- **⚠️ Action (before live payments):** Upgrade the Neon org "Vercel: Skyknit" to the **Launch** plan (pay-as-you-go, no monthly minimum). That unlocks a 7-day restore window, scheduled snapshots, and protected branches. Exact console steps are in the runbook §2b. Once done, tell me and I'll configure the 7-day window + daily snapshots + protected `main` + a test restore (§2c).

### POPIA cross-border (§72) — confirmed
- **What:** Because the database is hosted in the USA, cross-border transfer of personal information is confirmed and POPIA §72 applies. Documented the basis (provider DPAs) and the Privacy Policy disclosure action in the runbook §3.
- **Action:** Keep provider DPAs on file; ensure the Privacy Policy discloses US storage; have counsel confirm the §72 basis.

### Encryption at rest — confirmed
- **What:** Recorded AES-256 encryption at rest (AWS-backed Neon storage) and TLS in transit in the runbook §3.

### Operational security & compliance runbook — created
- **What:** New runbook (`07-operational-security-runbook.md`) covering incident/data-breach response (POPIA §22 timelines + named owner), backup/DR, encryption & data location, access reviews, secrets rotation, and the data-subject-request workflow.
- **Action:** Fill the remaining `[confirm]` placeholders that need a human decision — names/deputy, DSAR response SLA, provider DPA dates, secrets-rotation log, test-restore date.

### 2FA policy — finalised as optional for all, recommended
- **What:** Two-factor authentication is **optional for every account (hosts and owners) but recommended by StayKnit**. Earlier this session it was briefly made mandatory for owners; that gate was removed. The Settings card now shows a "Recommended" badge and prompt when 2FA is off.
- **Also:** Added a clock-drift hint on the sign-in challenge and enrollment steps — after repeated code rejections it explains that the phone clock is likely out of sync and how to fix it.
- **Docs:** Security framework, audit findings, launch checklist, and the generated legal pack were all updated to state this consistently.

### Production build hardening
- **What:** Removed `typescript.ignoreBuildErrors` from `next.config.mjs`, so TypeScript errors now fail the build instead of shipping silently. Verified with a clean production build.

### Stripe cleanup — status
- **What:** Confirmed there is **no Stripe code or dependency** in the app (Paystack is the payment provider). The unused `STRIPE_*` environment variables are injected by the still-connected Stripe marketplace integration.
- **⚠️ Action:** To remove those variables, disconnect the Stripe integration in project **Settings → Integrations** (they can't be deleted from code; the integration re-injects them).
