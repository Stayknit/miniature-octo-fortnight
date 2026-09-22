# StayKnit — Pre-Launch Audit Findings & Suggestions

**Date:** 17 September 2026
**Scope:** Simulation run (26 automated probes), app-vs-documentation function/limitation check, in-app and external security review, and Terms/Privacy/Business-Model alignment. This document records what was found, what was fixed in this pass, and what is left as a suggestion (add/remove) for a decision.

---

## 1. Summary

- **Simulation:** all 26 protocol probes pass against the live domain (functions, security headers, tenant isolation, account-enumeration safety, input integrity, owners-never-charged).
- **Overall:** the app is factually consistent with the documentation on the things that matter (payments on Paystack, no card storage, per-user data scoping, data minimisation, calendar best-effort). Three real discrepancies were found and fixed in this pass; a short list of suggestions remains below.

---

## 2. Findings fixed in this pass

### 2.1 False 2FA claim — REMOVED, then LATER BUILT FOR REAL
- **Found:** Settings showed a two-factor-authentication toggle labelled "code required at sign in", and the security framework + legal pack claimed "optional 2FA". In reality Better Auth had **no second factor configured** — no code was ever requested at login. The toggle only flipped a boolean.
- **Risk:** materially overstated security; a POPIA/consumer-facing misrepresentation.
- **Fix (this pass):** removed the toggle from Settings, removed the claim from the security framework doc and the generated legal pack, and marked the dead `user_settings.twoFactor` DB column deprecated (kept to avoid a destructive migration).
- **UPDATE (post-audit):** real **optional TOTP 2FA — available to all accounts (hosts and owners) and recommended by StayKnit** — has since been implemented with the Better Auth `twoFactor` plugin: authenticator-app enrolment (QR + verified live code), a genuine second-factor challenge enforced at sign-in, single-use backup codes, and security-question recovery for device loss (stored in `user.twoFactorEnabled` + the `twoFactor` table). It is offered and encouraged from Settings; no role is gated on it. The "optional 2FA" claim is now **accurate** and has been re-added to the security framework doc and the legal pack. See suggestion 4.2 (now resolved).

### 2.2 Billing model contradiction — RESOLVED to prepaid + self-cancel (later extended, see 2.5)
- **Found:** the Business Model doc described an "intended auto-renewing recurring subscription", while the app and Terms §5 said plans are **prepaid and do NOT auto-renew**. Genuine contradiction.
- **Decision (owner):** align everything to the **real** model — prepaid fixed term, no auto-renewal, host selects a plan and can cancel (unsubscribe) any time.
- **Fix:** aligned Business Model doc, Instructions to Counsel, in-app legal copy note, and the generator. **Added a self-service Cancel/Resume control** to the Plan screen with a new `canceledAt` field; cancelling keeps paid access to the term end, issues no refund, and silences renewal reminders.
- **⚠️ Superseded (18 Sep 2026):** the owner subsequently requested **optional, off-by-default auto-renewal**, which has since shipped. The "no auto-renewal at all" position recorded here is therefore no longer current — see finding **2.5** for the realignment.

### 2.5 Auto-renewal now offered — legal pack realigned (18 Sep 2026)
- **Found:** after the owner enabled **optional, off-by-default auto-renewal** in the app (Paystack card authorisation + a daily renewals cron; opt-in at checkout or from the Plan screen), the in-app Terms §5 was updated to describe it — but the **legal pack** (Business Model, Instructions to Counsel, and the "current in-app copy" snapshot) still stated the opposite: "plans do NOT auto-renew / no recurring or card-on-file billing." The published Terms authorised recurring card-on-file charges while the counsel-facing pack denied any existed. Genuine, launch-relevant contradiction.
- **Fix (this pass):** realigned `01-business-model.md` (billing terms + card-token storage + counsel ask), `03-instructions-to-counsel.md` (ToS scope + CPA/ECTA item C1), and `04-current-inapp-legal-copy.md` §5 to the shipped model: prepaid, auto-renewal off by default, opt-in stores a reusable Paystack authorisation and charges the next term before expiry until switched off, cancelling stops future charges and keeps paid time. Bumped the in-app "last updated" date to 18 September 2026.
- **⚠️ For counsel:** the recurring-charge / card-on-file clause of Terms §5 is new — please review pre-charge notice, price-change disclosure, ease of opting out, and stored-credential consent/record-keeping under the CPA and ECTA.

### 2.6 Font sub-processor over-disclosure — CORRECTED (18 Sep 2026)
- **Found:** the Privacy Policy listed **"Google LLC (Fonts)"** as a data sub-processor and the Cookie Policy stated the app makes runtime requests to Google Fonts that "may set cookies or receive your IP address." This overstates data sharing: StayKnit loads its typefaces via Next.js `next/font/google`, which downloads the font files at **build time** and self-hosts them from StayKnit's own domain, so a visitor's browser never contacts Google and no end-user IP is shared.
- **Fix (this pass):** removed Google from the sub-processor list (`lib/legal.ts`, which drives `/privacy`) and rewrote the Cookie Policy "Third-party requests" section (and the `04-current-inapp-legal-copy.md` snapshot) to state that fonts are self-hosted and that Paystack, loaded only on the plan page, is the sole third-party runtime request.

### 2.7 Cancellation model changed to notice-period + pro-rata refund — legal pack realigned (20 Sep 2026)
- **Found:** the shipped app and the live Terms §5 now implement a **notice period** (one month for monthly terms, two months for 6-month and yearly terms, measured from the cancel date) plus a **pro-rata refund of any prepaid balance beyond the notice period** (see `lib/billing/cancellation.ts`; the Paystack transaction fee is typically non-refundable, and notice-period amounts are retained). But the legal pack — Business Model §3, Instructions to Counsel A1/C1, and the "current in-app copy" §5 snapshot — still described the earlier **prepaid / no-refund / keep-paid-time-to-term-end** model recorded in findings 2.2 and 2.5. The published contract granted refunds the counsel-facing pack denied. Genuine, launch-relevant contradiction.
- **Fix (this pass):** realigned `01-business-model.md` (§3 cancellation + §6 counsel ask), `03-instructions-to-counsel.md` (A1 + C1), and `04-current-inapp-legal-copy.md` §5 (now reproduces the live two-paragraph §5 verbatim) and its counsel note, plus the `generate-legal-pack.mjs` generator (Part 1, Part 4, Part 5), and regenerated the `.docx`.
- **⚠️ For counsel:** confirm the notice-period + pro-rata-refund mechanics against the CPA (fixed-term agreements, cooling-off) and ECTA. **Drafting flag:** the live Terms §5 names only "monthly" and "yearly" notice periods; the app also applies the two-month notice to the **6-month** term — the in-app §5 wording should be extended to name the 6-month term, and the in-app "last updated" date (currently 18 Sep 2026 in `lib/legal.ts`) bumped to reflect this §5 change.

### 2.3 Trial card wording — RESOLVED (copy now matches behaviour)
- **History:** an earlier pass changed the copy from "no card required" to "card details required at signup, charged only on confirming a paid plan" — but the signup flow never actually captured a card, creating a copy-vs-behaviour gap.
- **Decision (owner):** rather than keep an inaccurate statement live in legal copy, **pull the card claim** and revert to the truthful "no card required" wording. Reversible if/when the capture flow is built.
- **Fix:** reverted the card claim across all live surfaces — pricing section, FAQ, plan blurb, terms gate, `/terms`, the in-app copy + business-model + instructions-to-counsel docs, and the legal-pack generator. Copy now states: 14-day trial, no card at signup, charged only on confirming a paid plan. No behaviour change; the gap is closed.

### 2.4 Inactivity purge hardened
- **Found:** the 12-month inactivity purge existed but ran only *lazily* (2% chance on reads). With low traffic the "deleted automatically" claim was fragile.
- **Fix:** the purge now also runs on the **daily cron** (guaranteed cadence); the lazy on-read sweep remains as a straggler catch.

---

## 3. Verified accurate (no change needed)

- **Payments:** Paystack only; server-side init + HMAC-SHA512 signature-verified webhook; idempotent activation re-verifies status **and** amount; no card data on StayKnit servers. Paystack is the only payment processor referenced anywhere in the pack.
- **Tenant isolation:** every query filters by `userId`; owner portals are token-scoped and read-only. Confirmed in code and by simulation.
- **Password + security answers:** both hashed via Better Auth's hasher; never plaintext.
- **Data minimisation:** guest data is name + stay dates only (no contact/ID/payment).
- **Self-service export & delete:** `exportMyData` and `deleteProfile` both exist and work; deletion cascades.
- **Account integrity:** one account per email (case-insensitive, DB-enforced); owners never charged; enumeration-safe reset/login.
- **Transport:** HTTPS/HSTS, CSP, and standard headers verified live.
- **LekkerSlaap** spelling and the registered address (street number withheld from public copy) are correct across app + docs.

---

## 4. Suggestions — to ADD

### 4.1 (Optional) Capture the card at trial signup
The copy-vs-behaviour gap has been closed by reverting the copy (see 2.3), so this is now an **optional feature**, not a fix. If the business later wants a card on file during the trial, build a Paystack card-authorization step at signup (tokenise, store authorization, charge on plan confirmation) **and** re-add the "card required" copy at the same time so the two stay in sync.

### 4.2 Real 2FA (optional) — DONE
Implemented. Better Auth's `twoFactor` plugin now provides optional TOTP for all accounts (hosts and owners), recommended by StayKnit: authenticator-app enrolment with a verified live code, a second-factor challenge enforced at sign-in, single-use backup codes, and security-question recovery. No role is gated on 2FA. The claim was re-added to the docs only after the feature shipped.

### 4.3 Outgoing iCal feed (Option B, already deferred)
Still outstanding from earlier: per-unit tokenised `.ics` feed + manual-block model, with origin tagging to avoid echo loops. Carries a liability shift (StayKnit becomes a calendar source), so counsel must re-approve Terms before it ships.

### 4.4 Error tracking + email deliverability — PARTLY DONE
Add Sentry for runtime error visibility *(still outstanding)*.

**Email deliverability (investigated 17 Sep 2026; re-verified 20 Sep 2026):** the sender is **Namecheap Private Email** (`mail.privateemail.com`). DNS for `stayknit.org` now publishes all three authentication records — **SPF** (`include:spf.privateemail.com ~all`), **DKIM** (Namecheap Private Email `privateemail._domainkey` selector), and **DMARC** (`p=none`, monitoring) — all verified live in DNS on 20 Sep 2026. DKIM was the outstanding item and has since been added. Optional next step: once DMARC monitoring is clean, tighten the policy from `p=none` to `quarantine`/`reject`. An owner-only **Support → Email** diagnostics panel now runs a live SMTP handshake and a real test send, and every send is logged (`[v0] email sent/FAILED`). The verification and password-reset screens now report send success/failure honestly (enumeration-safe) instead of always claiming a link was sent.

---

## 5. Suggestions — to REMOVE / watch

- **Dead `user_settings.twoFactor` column** — left in place (deprecated comment) to avoid a destructive migration. This is the OLD fake flag; real 2FA now lives in `user.twoFactorEnabled` + the `twoFactor` table. Drop the legacy column in a future planned migration if desired.
- **"Recurring payments" phrasing** in ops notes — the *default* is prepaid-and-expiring, but **opt-in auto-renewal (card-on-file) now exists**; make sure any such phrasing is scoped to the opt-in path, not presented as the default.

---

## 6. Open items for counsel (unchanged intent, clarified)

- Confirm the **prepaid fixed-term + self-service cancellation + notice-period + pro-rata-refund** mechanics, and the **optional opt-in auto-renewal** (card-on-file recurring charge), against the Consumer Protection Act and ECTA.
- Confirm the **host ↔ owner ↔ guest** data relationship and whether an operator/data-processing agreement is needed under POPIA.
- Confirm PCI-DSS SAQ level with Paystack given no card data touches StayKnit servers.
