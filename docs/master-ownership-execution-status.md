# StayKnit — Master Ownership & Security Execution Plan: v0.app Status Annex

**Companion to:** `data/StayKnit_Master_Ownership_and_Security_Execution_Plan_Draft-60cdbd.docx` (Draft 1.0, 18 Sep 2026)
**This annex prepared:** 18 September 2026
**Scope:** verified current state of the **v0.app-owned** and joint items in that plan, from the read-only audits already run. No pricing, business rules, or production functionality were changed to produce this (per the plan's §1 operating rule).

## How to read this

- **Status legend:** ✅ verified in place · ⚠️ partial / needs work · ❌ not implemented · 👤 owner action (v0.app cannot verify — outside the codebase).
- Section numbers mirror the plan. Owner-only sections (§2, §3, §12, §13, §14) are listed for completeness with the owner actions restated; v0.app has no code visibility into those and makes no claim about them.
- Every "⚠️/❌" item traces to a finding in the audits and, where relevant, to `docs/legal/06-audit-findings.md`.

---

## §4 Source code, IP & developer access — OWNER + v0.app

| Item | Status | Note |
|---|---|---|
| No credentials/secrets embedded in source | ✅ | Secrets read from env; SSRF, webhook, and Paystack keys are env-driven. No hardcoded production secrets found in the app code. |
| Schema/migrations accessible | ✅ | Drizzle schema in `lib/db/schema.ts`; `app_setting` created via raw SQL (documented). |
| Repository ownership, branch/deploy settings, least-privilege team review | 👤 | Owner action — GitHub/Vercel org ownership and member permissions are outside the codebase. |

## §5 Secrets & API keys — v0.app + OWNER

| Item | Status | Note |
|---|---|---|
| Secrets in env mechanism, not source | ✅ | Confirmed. |
| **Separate dev / staging / production secrets & data** | ⚠️ | **DB done 2026-09-21; code done 2026-09-22; blocked on Git connection.** Isolated **staging Neon branch created & verified** — `staging` (`br-silent-pond-avh72sqt`) off prod `main`, scale-to-zero compute, 29 tables + prod data present, isolated from `main`. Chosen approach = **branch-scoped Preview env vars on the existing `stayknit` project** (owner's pick over a separate project). Code side complete: branch-scoped `trustedOrigins`, staging email kill-switch (`STAGING_DISABLE_EMAIL=1`), and `*.vercel.app` no-index guard. **Blocked (owner, UI-only):** the `stayknit` project has **no connected Git repo**, so branch-scoped `staging` env vars can't be written yet — connect GitHub via Settings → Git, push a `staging` branch, then the 7 prepared env vars go in. Full setup in `docs/legal/07-operational-security-runbook.md` §7. ⚠️ staging holds a copy of real personal data → same access controls as prod; email disabled + payments TEST-only + not indexed (see §7.2). |
| Rotate any exposed secret | 👤 | Owner action — rotate anything ever shared in chat/commits. |
| Document purpose/controller/revocation per secret | ⚠️ | Partly covered by `docs/integrations-and-functions.md`; a full secret inventory with owner + revocation path is not yet a single document. |

## §6 Production architecture — v0.app

| Item | Status | Note |
|---|---|---|
| Common backend for web/iOS/Android/admin | ✅ | Single Next.js backend + Neon; delivered as PWA (iOS A2HS) and Android TWA. No divergent native logic. |
| AuthN / session / token handling | ✅ | Better Auth, httpOnly cookies, email verification required, `autoSignIn: false`, case-insensitive email uniqueness at DB level, optional TOTP + backup codes + security questions. |
| IDOR — cannot access another user's data by changing IDs | ✅ | Per-query `userId` scoping throughout server actions; admin routes behind `assertAdmin`. |
| Input validation / SSRF / file-upload controls | ✅ | iCal fetch guarded (private-range block, `redirect:'error'`, 5 MB cap, 8 s timeout). |
| **Rate limiting** | ✅ | **Done 2026-09-21.** Better Auth's rate limiter is now wired to a **shared Postgres store** (`rateLimit.customStorage` → the `rate_limit` table via `lib/rate-limit.ts`), replacing the per-lambda in-memory map, so the window holds across serverless instances. Built-in rules throttle sign-in/sign-up/change-* (3 per 10s) and password-reset/verification (3 per 60s); enabled in all environments. Fails open on a store outage so a limiter fault can't lock everyone out. |
| **Public AI endpoint hardening** | ✅ | **Done.** `app/api/help-assistant/route.ts` requires a valid signed-in session (401 otherwise) and enforces a **shared DB-backed per-user rate limit** (20/hour) before any paid-model call, plus prompt-injection output filtering. The other AI routes (`generate-promo`, `generate-voiceover`) are hard-disabled in production (403). |
| **Secure response headers (HSTS, X-Content-Type-Options, Referrer-Policy, etc.)** | ✅ | **Re-verified live on served responses 2026-09-21** (curl against the running app, page + API routes via the `/:path*` rule in `next.config.mjs`): `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy` (camera/mic/geolocation/browsing-topics off), and an **enforcing** `Content-Security-Policy` all present; `X-Powered-By` suppressed (`poweredByHeader: false`). Note: `script-src` includes `'unsafe-eval'` in DEV only (React/HMR); production drops it. |
| TLS/HTTPS | ✅ | Vercel-managed. |
| Dependency vulnerability scan | ⚠️ | No scheduled scan configured; note the SheetJS/xlsx CVE guidance already followed for parsing. Add a scan step (plan §15). |
| DB permissions & prod separation | ⚠️ | Staging DB now on a **separate isolated Neon branch** (`br-silent-pond-avh72sqt`) from production `main`; remaining separation work is the owner-led Vercel project + secrets split (see §5 row and runbook §7). |

## §7 Payments & subscriptions — OWNER + v0.app

| Item | Status | Note |
|---|---|---|
| Webhook handling | ✅ | HMAC-SHA512 + `timingSafeEqual` on raw body; `force-dynamic`. |
| Server-side re-verification of status **and** amount | ✅ | Rejects tampered/replayed references. |
| Idempotent activation | ✅ | Via `lastPaymentRef`; renewal stacking never discards paid days. |
| Refund / partial-refund handling | ✅ | Revert with partial-refund protection. |
| Cancellation / failed payment | ✅ | **Closed (2026-09-18).** Auto-renew failures now send a host dunning email + owner alert, track `renewalFailureCount`/`renewalFailedAt`, and retry daily. See §11. |
| **ZAR as source currency; other currencies presentation-only** | ✅ | `chargeCurrencyFor()` always returns ZAR — matches the plan's rule exactly. |
| **VAT status configurable; no "VAT inclusive" while unregistered** | ✅ | Admin setting (`app_setting` key `stayknit_vat`, `lib/vat.ts`), defaults to **not registered** → invoices are receipts, not tax invoices; cannot enable without a VAT number. Matches the plan's rule exactly. |
| Subscription limits enforced server-side | ⚠️ | Listing cap is **soft**: `addProperty` has no cap check (unlimited create); overflow is locked from iCal sync and from display, not from creation. Confirm this is the intended behaviour vs. blocking creation past the cap. |
| **ZAR cutover for existing foreign-currency auto-renewers** | ✅ | **Closed (2026-09-18).** Live audit: all rows null, zero non-ZAR auto-renewers. Renewal cron now re-derives the amount in the same currency it charges (ZAR), so a stray legacy value can't mismatch. |
| Merchant account company-owned; invoices retrievable | 👤 | Owner action (Paystack account ownership). |
| Apple/Google store billing rules | ⚠️ | Decision required: PWA/TWA (Paystack fine) vs App Store listing (Apple 3.1.1 / Google Play Billing engage). Do not submit to a store assuming Paystack passes review. |

## §8 Calendar & channel integrations — v0.app

| Item | Status | Note |
|---|---|---|
| Connection / authorization / import | ✅ | One-way iCal import via `importIcalFeeds`. |
| **Cancellations & modified reservations reconciled** | ✅ | **Closed (2026-09-18).** `importIcalFeeds` now reconciles per successfully-fetched feed: inserts new, updates date changes, removes cancellations — keyed by VEVENT UID (`booking.sourceUid`/`sourceFeedId`), with date-match adoption of legacy rows. A failed feed is never reconciled, so outages can't wipe blocks. |
| Time-zone / DST / all-day handling | ✅ | **Closed (2026-09-18).** `RRULE` recurring holds now expand into individual dated occurrences (FREQ/INTERVAL/COUNT/UNTIL, bounded to 400 occ / 2yr, past-only dropped, stable per-date UIDs). Timed/`TZID`/floating events use the encoded local calendar day (the channels' intent); documented residual: a pure-UTC `Z` time near midnight could differ by a day, which channel availability feeds don't use. |
| **Sync status + user-facing errors** | ✅ | **Closed (2026-09-18).** Per-feed status columns (last attempt/success, status, error, failureCount, nextRetryAt); `/api/cron/sync-feeds` every 3h; exponential backoff (30m→24h); host-visible status in the Channels screen. |
 | Duplicate / conflicting writes prevented | ✅ | **Closed (2026-09-18).** DB-level unique index `booking_feed_identity_idx (sourceFeedId, sourceUid)` makes feed imports idempotent even under concurrency (importer uses `onConflictDoNothing`). NULL-identity manual/direct rows are intentionally unconstrained, and genuine cross-feed clashes still surface via the advisory `lib/overlap.ts` detector (a business feature, not a bug). |
| Token refresh / disconnect / revoke | ⚠️ | iCal is URL-based (no OAuth tokens); "revoke" = remove the URL. Confirm this matches the plan's intent for the four SA/OTA channels. |
| Outgoing `.ics` feed (cross-channel block export) | ❌ | Deferred (per project memory). Without it, other channels only see StayKnit blocks if *they* import — protection is inbound-only. Decide if required for launch. |

## §9 Data protection & privacy (POPIA) — OWNER + v0.app

| Item | Status | Note |
|---|---|---|
| Deletion process matches app | ✅ | `deleteProfile` → `purgeUserData`, plus 12-month inactivity auto-purge. Cookie-consent gating present. |
| **Purge is atomic** | ✅ | **Closed (2026-09-18).** `purgeUserData` now runs in a single `db.transaction` (all-or-nothing). Also closed two orphan gaps — `promoRedemption` and `supportMessage` (via ticket ids) are now cleared. Verified valid against the live schema inside a txn. |
| **Data subject access / export (portability)** | ✅ | **Closed.** `exportMyData` returns the full account as JSON (wired into the app shell); now includes promo redemptions + support-message threads, mirroring what erasure removes. Password hash / security answers excluded. |
| No PII over-logged | ✅ | No passwords/tokens/card data logged in reviewed paths. |
| Access controls per role | ✅ | Host vs owner vs admin/support separation enforced. |
| **Service-worker caching of authenticated shells** | ⚠️ | `sw.js` is network-first for navigations (live data via bypassed `/api`), but cached HTML shells aren't versioned/cleared on logout — on a shared device an offline open could show the prior user's shell. Ensure no PII is server-rendered into the shell; consider cache purge on logout. |
| Privacy notice / terms / consent match reality | ✅ | **Closed (2026-09-18).** The Plan-screen footer and the launch-checklist doc now describe the shipped opt-in, off-by-default auto-renewal model. |
| Subprocessors documented | ⚠️ | Neon, Paystack, SMTP covered; confirm the AI Gateway/OpenAI (US) cross-border transfer basis is documented, and the Information Officer is registered with the Information Regulator. |

## §10 Backups & disaster recovery — OWNER + v0.app

| Item | Status | Note |
|---|---|---|
| Automated DB backups exist | ✅ | **Closed 2026-09-21.** Neon project `green-heart-29986866` on plan `launch_v3`: PITR history window extended to the plan max (**7 days**), a **daily snapshot schedule (03:00)** plus a retained baseline snapshot on production `main`. Retention window and policy now documented in `docs/legal/07-operational-security-runbook.md` §2. |
| **Actual restore test performed** | ✅ | **Closed 2026-09-21.** A real restore was executed and verified — in-place snapshot restore; production `main` is now `br-spring-bird-avs9mzf8`, still served by the original endpoint, data intact (spot-checked). Dated in `docs/legal/07-operational-security-runbook.md` §2 (repeat at least annually). A retained pre-restore copy (`pre-restore-backup-2026-09-21`, `br-winter-silence-avtq9d21`) is kept temporarily as an extra DR copy. |
| Recovery steps for DB/app/domain/DNS documented | ✅ | **Closed 2026-09-21.** `docs/legal/07-operational-security-runbook.md` §2 now holds the full DR runbook: restore procedure (Neon MCP `restore_snapshot` / branch-from-timestamp), app redeploy path (fully reproducible from Git via Vercel), RPO/RTO targets (RPO ≤ 6h, RTO < 4h), and the last-restore-test date. |

## §11 Monitoring, alerts & audit logs — v0.app

| Item | Status | Note |
|---|---|---|
| Admin/security actions auditable | ✅ | Admin audit log present; `assertAdmin` gating. |
| **Error / crash / API-failure monitoring** | ⚠️ | **Partial (2026-09-18).** Baseline in place: fail-safe `reportServerError()`/`sendOwnerAlertEmail()` wrap all cron routes and email the operator on crashes. A full APM/Sentry with client-side error capture is still worth adding. |
| **Alerts on critical failures** | ✅ | **Closed (2026-09-18).** Renewal, sync, expiry, and invoice-scan failures now alert the operator (`OWNER_EMAIL`); renewal failures also notify the host. |
| No secrets/PII in logs | ✅ | Confirmed in reviewed paths. |

## §15 Final production release — OWNER + v0.app

- **Freeze RC / E2E across web+iOS+Android / security scan / restore check / record version+rollback:** not yet done — this is the release gate. E2E must cover cancellation and date-change on calendar (the §8 insert-only gap) on all three surfaces.

## §16 Post-launch — OWNER

- Analytics for growth + the month-3/month-6 pricing reviews **depend on analytics existing before launch** (see §11 ❌). Note: the plan's own §16 rule — *review pricing only after real customer data, not because competitors differ* — is consistent with the existing business rules and is not affected by this annex.

---

## Owner-only sections (restated, no v0.app code visibility)

- **§2 Master Ownership Register**, **§3 Account Ownership**, **§12 Mobile App Ownership** (Apple Developer / Google Play), **§13 Domain/DNS/Email**, **§14 Incident Response** — all 👤 owner actions.
- One code-adjacent note for **§13**: DKIM/DMARC setup guidance already exists at `docs/dkim-dmarc-setup.md`; the owner must confirm SPF + DKIM + DMARC are **published and passing** for `stayknit.org`, since transactional email (verification, receipts, resets) depends on it.
- One code-adjacent note for **§12**: Android TWA Digital Asset Links endpoint exists (`.well-known/assetlinks.json`, env-driven) and requires **both** the upload and Play app-signing SHA-256 fingerprints; iOS has **no** `apple-app-site-association` yet (only needed if you wrap for the App Store).

---

## Consolidated open items (v0.app side), by priority

**Must fix before public launch**
1. ~~Lock down the public AI endpoint — auth + rate limit~~ — **done** (§6): help-assistant requires a session + shared DB-backed 20/hour per-user limit before any model call; the promo/voiceover AI routes are 403 in production.
2. ~~Shared-store rate limiting for auth (sign-in / reset)~~ — **done 2026-09-21** (§6): Better Auth's limiter now uses `customStorage` backed by the shared Postgres `rate_limit` table instead of the per-lambda in-memory map, so brute-force/credential-stuffing on sign-in and reset is throttled across all serverless instances.
3. ~~Calendar sync must reconcile cancellations & modifications~~ — **done 2026-09-18** (§8).
4. ~~Error monitoring + alerting; stop silent renewal failures~~ — **done 2026-09-18** (baseline alerting; full APM still optional) (§11).
5. **Staging environment — DB done 2026-09-21, code done 2026-09-22, blocked on Git connection** (§5): isolated staging Neon branch `staging` (`br-silent-pond-avh72sqt`) created off prod `main` and verified (29 tables + prod data, scale-to-zero, isolated writes). Approach = branch-scoped Preview env vars on the existing `stayknit` project (email disabled, payments TEST-only, not indexed). Remaining (owner, UI-only): connect a GitHub repo to `stayknit` via Settings → Git and push a `staging` branch — then the prepared branch-scoped env vars (staging `DATABASE_URL`, fresh `BETTER_AUTH_SECRET` + `CRON_SECRET`, `BETTER_AUTH_URL`, `STAGING_DISABLE_EMAIL=1`, Paystack TEST keys) can be written. Full runbook: `docs/legal/07-operational-security-runbook.md` §7.
6. ~~Confirm secure response headers~~ — **done 2026-09-18**: all six enforcing (HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy, CSP) + `X-Powered-By` suppressed; re-verified live on served responses (§6).
7. ~~Fix the auto-renewal copy/doc contradictions~~ — **done 2026-09-18** (§9 / Documentation).
8. ~~Restore test executed and dated~~ — **done 2026-09-21** (§10): real in-place snapshot restore verified (production `main` now `br-spring-bird-avs9mzf8`, data intact), plus 7-day PITR + daily 03:00 snapshot schedule; dated in the DR runbook (`07-operational-security-runbook.md` §2). Repeat at least annually.

**Should fix / decide**
9. ~~ZAR cutover treatment for legacy foreign-currency auto-renewers~~ — **resolved in code 2026-09-21** (§7): billing is single-currency ZAR. `chargeCurrencyFor()` (`lib/pricing.ts`) collapses **every** stored/display currency to `zar`, and the renewals cron re-derives the amount in the same currency it charges — so a legacy non-ZAR row can never charge in a foreign currency or have amount/currency disagree. Display currency (host/owner statements) is independent and unaffected. Recommended one-time owner check: confirm no live auto-renewer was onboarded expecting foreign-currency billing before the ZAR-only cutover; if any exist, a courtesy note that renewals bill in ZAR is advisable (comms decision, not a code change).
10. ~~Calendar sync-status system with retries + user feedback~~ — **done** (§8): per-feed health persisted (`lastAttemptAt`/`lastSyncedAt`/`lastStatus`/`lastError`/`failureCount`/`nextRetryAt`), exponential backoff (30m→24h cap) in `syncFeedsForUser`, a scheduled `sync-feeds` cron that only re-pulls due feeds, and host-facing status on every feed row ("Sync failed: … · will retry automatically" / "Synced {ago}" / "Not synced yet") plus operator alerting on systemic failure.
11. ~~POPIA data export; make `purgeUserData` transactional~~ — **done 2026-09-18** (§9): `purgeUserData` runs in a single `db.transaction` (all-or-nothing erasure); `exportMyData` returns a full machine-readable JSON of the account.
 12. ~~DB-level overlap constraint~~ — **done 2026-09-18**: added idempotency unique index (`booking_feed_identity_idx` on `sourceFeedId,sourceUid`); advisory clash detection kept as a feature (§8).
13. **Store-billing decision — recommendation recorded 2026-09-21, owner sign-off pending** (§7). Recommendation: **stay PWA-first** (installable web app, billed via Paystack). Distributing the app through the Apple App Store or Google Play as a paid digital subscription would trigger their in-app-purchase rules (≈15–30% cut + mandatory native billing SDKs), which are incompatible with the existing Paystack subscription flow. A Play **TWA** wrapper is possible but still risks Google's IAP policy for digital goods. Native + store billing is deferred as a post-launch business decision; the current PWA/Paystack architecture already satisfies launch. Owner to confirm.
14. ~~Service-worker logout cache purge; confirm no PII in SSR shell~~ — **done 2026-09-21** (§9). Finding: the authenticated `/` route **does** embed PII in its SSR HTML (host/owner name, email, bookings serialized into `PortalSwitcher` props), so it must never be cached. Fixes: (a) the service worker no longer caches page navigations at all — navigations are network-only with a static, PII-free `/offline` fallback; (b) cache version bumped (`stayknit-v2`) so existing installs evict any PII a prior worker cached; (c) a `SK_PURGE` message handler + a client `purgeAppCaches()` clears all Cache Storage on every sign-out and profile-deletion path.
15. ~~Dependency-scan step + secret inventory doc~~ — **done 2026-09-21** (§4.2/§4.4 of the ops runbook). Added `pnpm run audit` (prod, high-gate) + `audit:all` scripts and ran the first scan: moved the `shadcn` CLI to `devDependencies` and pinned `ip-address ≥10.3.1` (clears the one runtime-adjacent high), leaving 12 high / 2 moderate that are all build-time-only `@sentry/nextjs` bundler tooling (not runtime-reachable; accepted-risk, revisit on Sentry upgrade). Completed the full secrets inventory (every env var classified by sensitivity + rotation location).

**Fast-follow after launch**
16. Push notifications (email fallback for beta); iOS AASA if going native; PWA version-update prompt; offline polish.

> This annex is a status snapshot for owner sign-off (plan §17). It records findings only and makes no functional changes. Items above should be scheduled explicitly before the corresponding sign-off boxes are ticked.
