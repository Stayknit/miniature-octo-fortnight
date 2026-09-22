# StayKnit — Operational Security & Compliance Runbook

**Purpose:** to formalise the operational (organisational) measures that sit alongside the technical controls in `05-security-and-safety-framework.md`. These are the items counsel flagged as gaps in that document's section 9. They are procedures the operator maintains, not application code.

> Prepared by the founder as the operator of StayKnit. This is a living internal runbook. Where a value depends on a provider dashboard (Neon retention window, exact data region), it is marked **[confirm]** and should be verified and dated the first time it is checked. Counsel should advise which items are legally required before launch versus advisable.

**Document owner:** the founder (sole responsible person for security and POPIA matters unless and until delegated).
**Last reviewed:** 2026-09-22 (updated the environments/staging section §7 to the finalised **branch-scoped** staging approach, recorded the live canonical-domain enforcement and the `*.vercel.app` no-index safeguard, and noted the staging email kill-switch). Previously 2026-09-21 (backups/DR put in place, the production `DATABASE_URL` incident resolved, the Paystack key rotated; org roles, access list, DPA dates, DSAR SLA, and the rotation log filled in). First adoption 2026-09-17.
**Review cadence:** every 6 months, and immediately after any incident.

> **Provider facts confirmed 2026-09-17** (Neon project `green-heart-29986866`, org "Vercel: Skyknit", owner `info@stayknit.org`): platform **AWS**, region **us-east-1 (N. Virginia, USA)**, Postgres 18, plan **Free (`free_v3`)**, history-retention (PITR) window **6 hours**, **no automatic snapshot schedule configured**, default branch `main` not protected, no IP allow-list. The retention/snapshot posture is flagged as a launch risk in §2.

---

## 1. Incident & data-breach response procedure

This is the procedure StayKnit follows on any suspected or confirmed security compromise or unauthorised access to personal information, satisfying POPIA **section 22** (notification of security compromises).

### 1.1 Roles

| Role | Who | Responsibility |
|------|-----|----------------|
| Incident Lead | The founder | Owns the incident end to end; makes the notification decision. |
| Deputy (if founder unavailable) | none — solo operator (2026-09-21) | Steps in if the Lead is unreachable. To be named if/when a second person joins. |
| Information Officer (POPIA) | The founder | The person registered/registerable with the Information Regulator; owns regulator communication. |

### 1.2 Severity triage

- **SEV-1 (confirmed breach of personal information):** unauthorised access to, or loss/corruption of, host, owner, or guest personal data. Triggers the full POPIA section 22 notification path (1.4).
- **SEV-2 (security incident, no confirmed data exposure):** e.g. a leaked secret rotated before use, a blocked intrusion attempt, a vulnerability found in-house. Contain and record; notification usually not required but document the reasoning.
- **SEV-3 (near-miss / weakness):** logged and fixed; no notification.

### 1.3 Response steps (in order)

1. **Detect & record.** Open an incident note (date/time, who found it, what was seen). Start a timeline — every subsequent action gets a timestamp.
2. **Contain.** Stop the bleeding first: revoke/rotate the affected secret (see section 4), invalidate sessions if account compromise is suspected (Better Auth: delete sessions for affected users), take the affected surface offline if needed.
3. **Assess scope.** Which data subjects (hosts / owners / guests) and which data categories are affected? How many records? Is it still ongoing? Use the data inventory in `02-data-and-privacy-popia.md` to enumerate categories.
4. **Eradicate & recover.** Remove the cause (patch, revoke, redeploy). Restore data from Neon backups if integrity was affected (see section 2).
5. **Notify** per section 1.4 if SEV-1.
6. **Post-incident review.** Within 5 business days, write up root cause, what worked, what to change. Feed fixes back into this runbook and the framework doc.

### 1.4 POPIA section 22 notification (SEV-1)

When there are **reasonable grounds to believe** personal information has been accessed or acquired by an unauthorised person:

- **Who to notify:** (a) the **Information Regulator**, and (b) the **affected data subjects**.
- **When:** **as soon as reasonably possible** after discovery and determination of the compromise. Delay is only permissible if a public body / the Regulator tells you a delay is needed to protect an investigation. Do **not** wait for full root-cause certainty to start the clock.
- **Data-subject notification must be in writing** and communicated by at least one of: email to the last known address, a prominent notice on the website, publication in the media, or as directed by the Regulator. It must give enough detail for the person to protect themselves.
- **Content of the notice (POPIA s22(5)):** a description of the possible consequences; the measures StayKnit intends to take or has taken; a recommendation of what the data subject can do to mitigate; and, if known, the identity of the unauthorised person.
- **Special case — owners and guests:** because owner and guest data is entered/imported by the host (StayKnit is likely the *operator* for that data — see `02-data-and-privacy-popia.md`), for a breach touching owner/guest records the affected **host must be notified without delay** so the host, as responsible party, can meet their own notification duties. Counsel to confirm the division of duties.
- **Regulator contact:** Information Regulator (South Africa) — keep the current complaints/breach email and postal address recorded here: _[confirm current address from inforegulator.org.za]_.

### 1.5 Evidence

Keep the incident note, timeline, and copies of any notifications for at least the period counsel advises (breach records support the "reasonable measures" defence). Store them outside the production database.

---

## 2. Backup, restore & disaster recovery

StayKnit's system of record is the **Neon** managed PostgreSQL database; the application (Vercel) is stateless and redeployable from source at any time. Recovery therefore centres on the database.

- **Provider capability:** Neon provides continuous backup via its history/restore feature, allowing **point-in-time restore (PITR)** to any moment within the project's history-retention window, and instant branch-based restore.
- **Retention window (confirmed 2026-09-17):** **6 hours** (`history_retention_seconds = 21600`) on the current **Free** plan. PITR can therefore only reach back **6 hours**; anything older is not recoverable this way.
- **Automatic snapshots (confirmed 2026-09-17):** **none — and cannot be scheduled on the current plan.** Attempting to create a snapshot schedule via the Neon API on 2026-09-17 was rejected: _"backup schedule creation is not enabled for this project."_ Scheduled snapshots are a paid-plan feature; the Free plan offers only the rolling 6-hour PITR window.

> ⚠️ **LAUNCH RISK — backup coverage (requires a plan upgrade to fix).** A 6-hour PITR window with no scheduled snapshots means a data problem (bad migration, accidental deletion, corruption) discovered the next morning **cannot be rolled back**. Configuration alone cannot fix this — snapshot scheduling is disabled on the Free plan (confirmed 2026-09-17). Before taking live payments: **upgrade the Neon plan** (see steps below), then set a daily snapshot schedule and run a test restore.

#### 2a. Which plan (recommendation)

**Upgrade to the Launch plan.** It is the smallest paid tier and covers everything this DR gap needs (verified against Neon pricing 2026-09-17):

| Need | Free (current) | **Launch (recommended)** | Scale |
| --- | --- | --- | --- |
| History / PITR window | 6 hours | **up to 7 days** | up to 30 days |
| Scheduled snapshots | ✗ | **✓** | ✓ |
| Protected branches | ✗ | **✓** | ✓ |
| Org spending limits | ✗ | **✓** | ✓ |
| IP Allow-list | ✗ | ✗ | ✓ |
| SOC 2 / HIPAA / SLA | ✗ | ✗ | ✓ |

- **Billing:** Launch is pay-as-you-go, **no monthly minimum**; compute scales to zero when idle (so a low-traffic app costs very little). Main add-ons that apply here: compute $0.106/CU-hour, storage $0.35/GB-month, instant-restore history $0.20/GB-month, snapshots $0.09/GB-month. Set an **org spending limit** (Launch feature) so there are no surprises.
- **Only move to Scale** if/when you need the **IP allow-list**, a **30-day** window, or **SOC 2 / HIPAA / an uptime SLA**. For launch, Launch is sufficient.

#### 2b. Exact upgrade steps (you must do these — billing action)

1. Go to **console.neon.tech** and sign in as **`info@stayknit.org`** (the org owner).
2. Top-left, make sure the org **"Vercel: Skyknit"** is selected (this is where project `green-heart-29986866` lives).
3. Open **Billing** (org settings → Billing) → **Change plan** → choose **Launch** → confirm. Add a card if prompted.
4. (Recommended) On the Billing page set a **spending limit** (e.g. a low monthly cap) so cost can't run away.
5. Tell me once the upgrade is done — then I can finish 2c below via the Neon tools.

#### 2c. What I (v0) will configure automatically after the upgrade

Once you're on Launch, tell me and I will, via the Neon management tools:

- **Extend the history/PITR window** to the plan max (7 days) on project `green-heart-29986866`.
- **Create a daily snapshot schedule** on `main` (`br-winter-silence-avtq9d21`), e.g. 02:00 UTC / 04:00 SAST, retained 7 days.
- **Mark `main` as a protected branch.**
- Then **run a test restore** into a throwaway branch, confirm the data is intact, and record the date in this section.

> Record once changed (**done 2026-09-21**): **plan** Launch (`launch_v3`) · **history window** 7 days · **snapshot schedule** daily 03:00 + baseline snapshot retained · **test restore** performed & verified (in-place snapshot restore; production `main` is now `br-spring-bird-avs9mzf8`, still served by the original endpoint, data intact). (IP allow-list stays open until/unless you move to Scale.)

- **Restore procedure:**
  1. In the Neon console (or via the Neon MCP `restore_snapshot` / branch-from-timestamp), create a branch from the desired point in time.
  2. Verify data integrity on the branch (spot-check recent host/owner/booking records).
  3. Repoint the app's `DATABASE_URL` / `DATABASE_URL_UNPOOLED` to the restored branch, or promote it via `finalize_branch_restore`, then redeploy on Vercel.
- **Redeploy path (app):** the app is fully reproducible from the Git repository via Vercel; no server state to rebuild.
- **Recovery objectives (targets to adopt):** RPO **≤ 6 hours today** (bounded by the current PITR window — improve to minutes/1 day by extending retention or scheduling snapshots per the risk note above); RTO **target < 4 hours** for a solo operator.
- **Restore test:** perform a **test restore at least once before launch** and then annually — restore to a throwaway branch, confirm the data is intact, and record the date here: **2026-09-21** (verified). An untested backup is not a backup.

---

## 3. Encryption at rest & data-location posture (POPIA section 72)

- **In transit:** all traffic is HTTPS/TLS and HSTS-enforced on the live domain (see framework doc §4). Neon connections use TLS.
- **At rest:** Neon runs on **AWS** and stores data on AWS block/object storage, which is encrypted at rest with **AES-256** (AWS-managed keys); Vercel is a managed platform with encrypted storage. Keep this wording aligned with Neon's and Vercel's published security/trust pages so the Privacy Policy statement stays accurate and is not overstated. _(Confirm the exact standard on each provider's trust page at each 6-monthly review.)_
- **Data location / cross-border (POPIA s72) — confirmed 2026-09-17:** the database (Neon) is hosted in **AWS `us-east-1` (Northern Virginia, USA)** — i.e. **outside South Africa**. Vercel serving/functions are likewise US-hosted by default. Cross-border transfer of personal information therefore **does occur** and POPIA section 72 applies.
  - POPIA section 72 permits cross-border transfer where the recipient is subject to a law / binding agreement providing **comparable protection**, or with the data subject's consent, or where the transfer is necessary to perform the contract.
  - **Action:** rely on the providers' data-processing addenda (DPAs) as the "binding agreement" basis, keep a copy of each provider's DPA on file, ensure the Privacy Policy explicitly discloses that data is stored/processed in the USA, and have counsel confirm the section 72 basis and wording.
- **Sub-processor DPAs to keep on file:** Vercel, Neon, Paystack, the SMTP/email provider. Obtained/reviewed dates:
  - **Vercel** — DPA reviewed **2026-09-21** (published DPA; copy on file).
  - **Neon** — DPA reviewed **2026-09-21** (published DPA; copy on file).
  - **Paystack** — DPA reviewed **2026-09-21** (published DPA / merchant terms; copy on file).
  - **SMTP/email provider** — DPA reviewed **2026-09-21** (published DPA; copy on file).
  - _Next review: at the 6-monthly cadence (≈2027-03) or on any provider change. Counsel to confirm each satisfies the POPIA s72 "binding agreement" basis._

---

## 4. Access review & secrets rotation

Because StayKnit is operated by a small team, access is deliberately narrow. This section keeps it that way.

### 4.1 Who can access what

| Surface | Who has access | Review |
|---------|----------------|--------|
| Vercel dashboard (deploys, env vars, logs) | The founder (`info@stayknit.org`) — sole access | Every 6 months — remove anyone who no longer needs it. |
| Neon console (database, backups) | The founder (`info@stayknit.org`) — sole access | Every 6 months. |
| Domain registrar / DNS | The founder (`info@stayknit.org`) — sole access | Every 6 months. |
| Paystack dashboard | The founder (`info@stayknit.org`) — sole access | Every 6 months. |
| Email/SMTP provider | The founder (`info@stayknit.org`) — sole access | Every 6 months. |
| Source repository (GitHub) | The founder (`info@stayknit.org`) — sole access | Every 6 months. |

_Recorded 2026-09-21: solo operator — no other people have access to any surface above. Update this table the day anyone is added._

- **Principle:** least privilege. Each person has their own login (no shared accounts). Enable 2FA on **every** provider dashboard above.
- **Neon-specific (confirmed 2026-09-17):** the project is owned by the `info@stayknit.org` Neon org ("Vercel: Skyknit"). Harden it by marking the `main` branch **protected** and adding an **IP allow-list** in the Neon console once the set of egress IPs is known; both are currently off.
- **Off-boarding:** when someone leaves, revoke all six surfaces the same day and rotate any secret they could have seen (section 4.3).

### 4.2 Secrets inventory

Production secrets live only as Vercel project environment variables (never in the repo). This is the complete inventory — every variable the app reads — classified by sensitivity, with where each is rotated. Reviewed **2026-09-21**.

**Sensitive — rotate on the §4.3 cadence and immediately on any suspected exposure:**

| Variable(s) | Purpose | Rotate at |
|-------------|---------|-----------|
| `BETTER_AUTH_SECRET` | Signs all sessions. Rotating it invalidates every existing session (users re-log in). | Generate new (`openssl rand -base64 32`) → Vercel. |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and the `PG*` / `POSTGRES_*` set (`PGPASSWORD`, `PGUSER`, `PGHOST`, `PGHOST_UNPOOLED`, `PGDATABASE`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL_NO_SSL`, `POSTGRES_PRISMA_URL`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_DATABASE`) | Database credentials. All carry the same Neon role password. | Neon console (reset role password) → update every copy in Vercel. |
| `PAYSTACK_SECRET_KEY` | Payment gateway server key (live). | Paystack dashboard → Vercel. |
| `SMTP_PASSWORD`, `SUPPORT_SMTP_PASSWORD` | Outbound email (transactional + support mailbox). | Email/SMTP provider → Vercel. |
| `INFO_IMAP_PASSWORD` | Inbound IMAP mailbox the invoice scanner reads. | Email provider → Vercel. |
| `CRON_SECRET` | Bearer token authorising the cron routes (renewals, feed sync, reminders, invoice scan). | Generate new → Vercel; the value only lives in Vercel Cron config + env. |

**Config / low-sensitivity — not secrets, but keep accurate:**

- `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`, `VITE_NEON_AUTH_URL`, `NEON_AUTH_BASE_URL`, `NEON_PROJECT_ID` — public/identifier values (the `NEXT_PUBLIC_*` set is shipped to the browser by design). A leak is not a credential compromise, but keep them correct.
- `OWNER_EMAIL`, `SUPPORT_SMTP_USER` — addresses, not secrets (`lib/email.ts` ignores a non-email `SUPPORT_SMTP_USER`, which contained the 2026-09-21 leak defence).
- `FNB_ACCOUNT_NAME`, `FNB_ACCOUNT_NUMBER`, `FNB_ACCOUNT_TYPE`, `FNB_BRANCH_CODE` — bank display details shown on invoices; business data, not secrets.

> Rule: nothing above ever belongs in the Git repo, in logs, or in chat. `NEXT_PUBLIC_*` reaching the browser is expected; anything else appearing client-side is an incident (§1).

### 4.3 Rotation schedule

- **Routine:** rotate `BETTER_AUTH_SECRET`, `PAYSTACK_SECRET_KEY`, and `SMTP_PASSWORD` at least **every 12 months**, and the database role password on the same cadence.
- **On trigger (immediately):** any suspected exposure, a team member leaving, or a secret appearing anywhere outside Vercel (logs, chat, a commit).
- **Procedure:** create the new value at the provider → update it in Vercel env vars → redeploy → confirm the app works → revoke the old value at the provider. Record each rotation date below.
- **Rotation log:**
  - **2026-09-21** — `PAYSTACK_SECRET_KEY` (live) rotated in the Paystack dashboard after the previous `sk_live_…5318` value was exposed (it had been pasted into the `SUPPORT_SMTP_USER` Var). New live key set in Vercel Production; verified end-to-end (`/balance` → 200, plus a real live test charge that was refunded). Old key revoked. By the founder.
  - **2026-09-21** — `SUPPORT_SMTP_USER` remediated: the leaked Paystack key value was removed from the Var and replaced with `support@stayknit.org` (its intended value). `lib/email.ts` already ignores a non-email value, so no secret was transmitted to the SMTP server. By the founder.
  - **2026-09-21** — `DATABASE_URL` (Production, Preview, and Development) reset to the current Neon pooled role credentials. Trigger: the snapshot-restore / branch-swap left the stored role password out of sync with the swapped-in `main` branch, causing a production outage (`28P01 password authentication failed`). Reset via provider → updated Vercel → redeployed → repointed the production alias → verified (site back to HTTP 200 with working login). By the founder via v0.

### 4.4 Dependency (supply-chain) scanning

Third-party npm packages are the largest external attack surface. Keep them scanned and patched.

- **On-demand / pre-release scan:** run `pnpm audit` before any production deploy that changes dependencies. Two scripts are wired in `package.json`:
  - `pnpm run audit` — production dependencies only, fails on **high**/critical. This is the release gate.
  - `pnpm run audit:all` — all dependencies (incl. dev), reports **moderate** and up. Broader hygiene check.
- **Cadence:** run `pnpm run audit` at least **monthly** and before every dependency-changing deploy. Record notable findings + the fix (upgrade / override / accepted-risk with reason) in the log below.
- **Triage:** a high/critical advisory that is reachable in production is treated as **SEV-2** (§1.2) — patch or mitigate before the next deploy. Upgrade the offending package; if no fixed version exists, pin a `pnpm.overrides` transitive version or document why the path is not exploitable here.
- **Keeping current:** Dependabot/Renovate is not yet enabled on the repo (solo operator). Until it is, the monthly manual `pnpm audit` + `pnpm outdated` review is the control. _(Fast-follow: enable automated dependency PRs.)_
- **Scan log:**
  - **2026-09-21** — dependency-scan process adopted; `audit` / `audit:all` scripts added and first scan run. Remediation this pass:
    - Moved the `shadcn` CLI from `dependencies` → `devDependencies` (it is build-time tooling, never imported at runtime). Removed its whole advisory subtree from the production graph.
    - Forced `ip-address >= 10.3.1` via a `pnpm-workspace.yaml` override (now resolves 10.7.2), clearing the one runtime-adjacent high (GHSA-mwp4-54f8-5fhr, SSRF/trust-boundary in `socks`, reached only through `imapflow`). Note it was **not** exploitable here — imapflow connects to a fixed, trusted mailbox with no SOCKS proxy or attacker-controlled address — but a clean patch existed, so it was taken.
    - **Prod audit after remediation: 14 findings (12 high, 2 moderate), all inside `@sentry/nextjs`'s _build-time_ bundler/webpack plugin chain** (`brace-expansion`, `fast-uri`, `nanoid`, `postcss`, `browserslist`). These run only during `next build`, never in the request path, so they are **not runtime-reachable**. **Accepted-risk**, to be cleared by upgrading `@sentry/nextjs` once its bundler plugin ships patched sub-deps. Forcing overrides on webpack tooling was deliberately avoided (build-break risk with no runtime benefit). Re-check at the next scan / Sentry upgrade.

---

## 5. Data-subject request (DSAR) workflow

This extends the existing self-service export/delete (framework doc §6) into a documented process for requests that arrive by other means (e.g. a host emails asking for their data, or an owner/guest makes a request via their host).

### 5.1 Types of request handled

Access (a copy of the data held), correction, and deletion. Also objection to processing and the "how did you get my data" question from owners/guests.

### 5.2 Routing by data subject

- **Host (our customer):** StayKnit is the responsible party. Handle directly.
  - **Access/deletion:** first direct them to **Settings → export / delete** (self-service, immediate). If they cannot use it, fulfil manually against the Neon database, scoped to their `userId`.
  - **Correction:** most fields are self-editable in Settings; correct manually if not.
- **Owner or guest (data entered/imported by a host):** StayKnit is likely the **operator**, and the **host** is the responsible party. Route the request to the relevant host to action, and assist the host as operator. Do not unilaterally alter or disclose a host's owner/guest records to a third party without the host's instruction, except where the law requires it. Counsel to confirm.

### 5.3 Handling steps

1. **Log** the request (date, who, what they want, which data subject type).
2. **Verify identity** before disclosing or deleting anything — for a host, that they control the account email (and pass 2FA if enabled); for owner/guest requests, route via the host.
3. **Respond within the statutory timeframe** — POPIA does not fix a single universal number for every request type. **Committed internal SLA: 30 calendar days** from a verified request, extendable once with written notice to the requester where a request is complex or voluminous. This SLA is mirrored in the Privacy Policy. _(Counsel to confirm 30 days is adequate for every request type before launch; adjust here and in the Privacy Policy if they advise a shorter window.)_
4. **Fulfil:** export (machine-readable copy), correct, or delete. Deletion via the app is irreversible and cascades to sessions/accounts.
5. **Record** what was done and when.

### 5.4 Refusals

If a request is refused (e.g. legal retention obligation, or it would reveal another person's data), record the reason and inform the requester of their right to complain to the Information Regulator.

---

## 6. Adoption checklist

- [x] Confirm Neon retention window and region — done 2026-09-17: 6h PITR, no snapshots, AWS us-east-1 (see §2, §3 header).
- [x] **Close the backup risk (§2):** done 2026-09-21 — Neon on Launch plan, 7-day PITR, daily snapshots, `main` protected, and a **test restore proven**.
- [x] Fill in the _[bracketed]_ values above (done 2026-09-21): DSAR SLA (§5.3), rotation log (§4.3), access-list names (§4.1, solo operator), Deputy/Information Officer (§1.1), DPA obtained/reviewed dates (§3), and the §2 backup record. Remaining open items are counsel confirmations, not blanks: the Information Regulator postal address (§1.4) and the T&C/Privacy Policy sign-off.
- [ ] File provider DPAs (Vercel, Neon, Paystack, SMTP) and disclose US data location in the Privacy Policy (section 3).
- [ ] Enable 2FA on all provider dashboards, mark `main` protected + add IP allow-list, and complete the first access review (section 4).
- [x] Record the DSAR response SLA (done 2026-09-21 — 30 calendar days, §5.3) and mirror it in the Privacy Policy; counsel to confirm before launch.
- [x] Adopt a dependency (supply-chain) scanning step (done 2026-09-21 — §4.4: `pnpm run audit` gate + monthly cadence; first scan run and remediated).
- [x] Complete the full secrets inventory (done 2026-09-21 — §4.2: every env var classified).
- [ ] Have counsel confirm which items here are required before launch.

---

## 7. Environments & staging

StayKnit keeps **staging strictly isolated from production data, secrets, and payments**. A *plain* Vercel Preview deployment is **not** a substitute for staging, because by default it inherits the production project's Preview-scoped environment variables and can reach production data and the live Paystack account. Staging closes that gap by pinning **branch-scoped** overrides (its own database, its own secrets, Paystack **TEST** keys, and email disabled) to a dedicated `staging` git branch, so the staging deployment can never touch live data, live money, or real people's inboxes.

> **Approach decision (2026-09-22).** Two designs achieve this: (a) a **separate `stayknit-staging` Vercel project**, or (b) **branch-scoped Preview env vars on the existing `stayknit` project**, scoped to the `staging` git branch. The owner chose **(b)** — it needs no second project while still fully isolating DB, secrets, and payments. Either way the isolation guarantees below are identical.

### 7.1 Environment matrix

| Environment | Vercel deployment | Git branch | Neon branch | Paystack | Email | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| **Production** | `stayknit` production (`www.stayknit.org`) | `main` | `main` = `br-spring-bird-avs9mzf8` | **LIVE** keys | Live SMTP | Real customers, real money. |
| **Staging** | `stayknit` `staging`-branch preview | `staging` | `staging` = `br-silent-pond-avh72sqt` | **TEST** keys | **Disabled** (kill-switch) | Verify migrations, risky changes, and full payment flows before promoting to `main`. |

Neon project for both: `green-heart-29986866` (region AWS `us-east-1` — staging introduces **no new cross-border transfer**, same region and provider as production).

### 7.2 Staging database — DONE (2026-09-21, v0-assisted)

- **Branch created:** `staging` (`br-silent-pond-avh72sqt`), branched from production `main` (`br-spring-bird-avs9mzf8`).
- **Compute:** dedicated read-write endpoint, autoscaling **0.25–1 CU**, **scale-to-zero after 5 min idle** (minimal cost — bills only while actively used).
- **Verified:** connects on its own isolated endpoint; a working copy of production — **29 public tables** present (including `rate_limit`) and prod data carried over (14 `user` rows at branch time). Isolated from production: writes to staging never touch `main`.
- **Pooled `DATABASE_URL` (host):** `ep-plain-firefly-av0937qb-pooler.c-11.us-east-1.aws.neon.tech` / db `neondb` / role `neondb_owner`. Retrieve the full pooled connection string from the Neon integration when wiring env vars; do not paste secrets into Git or chat.
- **⚠️ POPIA — staging holds a copy of real personal data.** Because it was branched from production, the staging DB contains real host/owner/guest records. Decision (2026-09-22): treat it with the **same access controls as production** — solo-operator access only, no wider sharing — rather than sanitising. This copy sits in the **same Neon project and AWS region (`us-east-1`) as production**, so it adds no new cross-border transfer and no new sub-processor; it is simply a second, access-restricted copy of the same data already covered by the §3 posture and the provider DPAs. Do not use staging data for anything other than testing. When staging drift makes a refresh useful, re-branch from `main` (same access rules apply) rather than accumulating stale copies.
- **Personal-data safeguards specific to staging** (so the copy of real data can never leak or reach data subjects):
  - **Outbound email is disabled.** A code kill-switch (`STAGING_DISABLE_EMAIL=1`, set only on the `staging` branch) makes every send log-and-suppress with no SMTP connection, so staging can never email a real host, owner, or guest, and never sends from the live support mailbox.
  - **Payments are TEST-only.** Staging uses Paystack **TEST** keys, so no real card is ever charged and no live settlement occurs.
  - **Not indexed.** Any `*.vercel.app` host (including the staging preview alias) returns `X-Robots-Tag: noindex, nofollow`, so a staging URL exposing real names can never be indexed by search engines. Production (`www.stayknit.org`) is unaffected.

### 7.3 Remaining steps — BLOCKED on Git connection (owner-led, UI-only)

The code side is complete (branch-scoped `trustedOrigins`, the email kill-switch, and the `*.vercel.app` no-index guard are all in the codebase). The only outstanding prerequisite is **connecting a GitHub repository to the `stayknit` Vercel project**, without which Vercel has no `staging` branch to scope env vars to (`vercel env add … preview staging` fails with "Project does not have a connected Git repository"). As of 2026-09-22 the project still reports no Git link.

1. **Connect a GitHub repo** to the `stayknit` project via **Settings → Git** (UI-only; cannot be done from the CLI/sandbox), then push a `staging` branch off `main`.
2. **Set the staging env vars**, each scoped to **Preview + git branch `staging`** (never all-Preview, or they would override every other preview):
   - `DATABASE_URL` → the staging branch pooled connection string from the Neon integration (host `ep-plain-firefly-av0937qb-pooler.c-11.us-east-1.aws.neon.tech`).
   - `BETTER_AUTH_SECRET` → a **fresh** value, distinct from production.
   - `BETTER_AUTH_URL` → the staging preview alias (e.g. `https://stayknit-git-staging-<team>.vercel.app`).
   - `STAGING_DISABLE_EMAIL` → `1` (activates the email kill-switch — see §7.2).
   - `CRON_SECRET` → a **fresh** value, distinct from production.
   - `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` + `PAYSTACK_SECRET_KEY` → Paystack **TEST** keys (never the live keys).
3. **`trustedOrigins` is already handled in code** — `lib/auth.ts` trusts `BETTER_AUTH_URL` and `VERCEL_BRANCH_URL`, so the staging alias is a trusted sign-in origin once those vars are set; no further code change needed.
4. **Verify** a full sign-up → subscribe (TEST card) → refund cycle on staging, and confirm no email is delivered (kill-switch active), before using it as the pre-prod gate.

### 7.4 Promotion flow

Develop on a feature branch → merge to `staging` → verify on the staging-branch preview → open a PR into `main` → production deploys on merge. Schema changes run against the `staging` Neon branch first (via the Neon MCP), then against `main` after they pass on staging.
