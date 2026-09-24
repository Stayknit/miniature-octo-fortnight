# StayKnit Owner's Manual

*A business-owner / operator guide to the StayKnit app: what it is, how it is built, how money and compliance flow through it, and how to run the admin console. Written for the app owner.*

Last updated: 24 September 2026

---

## 1. What you own

StayKnit is a short-stay hosting management web app for the South African market. Hosts pay a flat subscription (no commission on their bookings) to:

- merge the calendars of every booking site a property is listed on into one view (import-only iCal),
- publish StayKnit's own availability back out to those sites (outgoing iCal),
- record direct bookings and blocks,
- and generate monthly payout statements for the property owners they manage.

Two product surfaces sit on one codebase:

- **Host portal** — the full management app (Today, Calendar, Channels, Finances, Plan, Settings).
- **Owner portal** — a read-only statement/calendar view for the property owners your hosts pay out.

And one operator surface:

- **Admin console** (`/admin/...`) — your back office for accounts, billing, refunds, support, promo codes, marketing, and internal documents. Gated to your admin account.

> Positioning to keep consistent everywhere (product, Terms, marketing): StayKnit is **best-effort** and **not the system of record** for bookings. Hosts reconcile against each channel's own payouts. Money is never held or moved by StayKnit — guests pay the channels/host, hosts pay owners directly.

---

## 2. How it is built

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) |
| Database | Neon (PostgreSQL), accessed with Drizzle ORM |
| Auth | Better Auth (email + password), sessions in Postgres |
| Payments | **Paystack only** (South Africa). No Stripe in code. |
| Email | SMTP (transactional + support mailbox) |
| Hosting | Vercel, custom domain `www.stayknit.org` |
| Errors | Sentry |

Key environment variables (names only — never print values): `DATABASE_URL` / `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `CRON_SECRET`, SMTP credentials, `OWNER_EMAIL`, and the `FNB_*` payout-account fields shown on statements.

> There is **no drizzle-kit migration flow** in this project. Schema changes are applied to the live Neon database with idempotent raw SQL (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE ... IF NOT EXISTS`) and mirrored into `lib/db/schema.ts`. Keep that pattern.

> `typescript.ignoreBuildErrors` is intentionally removed from the Next config — type errors fail the build. Do not re-add it.

---

## 3. Calendar sync model

- **Import (incoming):** `lib/ical.ts` + the Channels screen read each listing's `.ics` export and merge them into one read-only availability view. One feed per (unit × site).
- **Export (outgoing):** each unit can publish a tokenised `.ics` feed at `/ical/<token>.ics` (`app/ical/[token]/route.ts`, public, unauthenticated by token). It carries **only StayKnit-origin holds** (manual blocks + direct bookings) — never OTA-imported reservations — so a site never sees its own booking echoed back, and one per-unit link is safe for every consumer. Guest names are never exposed (direct bookings surface as generic "Reserved"); only host-authored block reasons appear.
- Cross-site date blocking ultimately relies on the OTAs' own peer-to-peer iCal exchange. The app ships an in-app guide explaining the both-ways Export/Import setup rather than taking on that liability.
- Tokens rotate via **Regenerate** (kills the old URL) and clear via **Stop publishing**.

---

## 4. Billing & subscriptions

StayKnit is a flat-fee SaaS subscription, billed in **ZAR** through Paystack.

### 4.1 Model
- **Prepaid terms**, billed once: monthly, 6-month (10% off), yearly.
- **Free trial** first; if it lapses with no paid term, the whole app freezes behind a non-dismissible subscribe gate.
- **Auto-renewal is opt-in and off by default.** It uses a Paystack **card authorization + a daily renewals cron** (`app/api/cron/renewals/route.ts`, registered in `vercel.json`), *not* Paystack Subscriptions. On a successful charge the reusable `authorization_code`, customer code, and charge currency are stored; auto-renew turns on only if the host opted in and the authorization is reusable. The cron charges a couple of days before the term end, throttled so it cannot double-attempt.

### 4.2 Activation pipeline
- `startPlanCheckout` initializes a Paystack transaction and returns a **discriminated result** (`{ok:true,...}` | `{ok:false,error,detail}`) — it never throws, because a thrown Server Action shows users the minified React digest instead of a real message. Follow this pattern for any new payment action.
- `activatePlanFromReference` (`lib/billing/activate.ts`) is the shared confirm + webhook path. It is idempotent and validates the charged amount against the **discount-adjusted** price using the server-set `promoPct` in Paystack metadata. Renewals pass no promo and charge full price.
- Payment references use `buildPaymentReference` → `SK-<NAMESLUG≤12>-<8 hex>` (or `SKCARD-...` for trial card capture), which is the end-to-end idempotency key.

### 4.3 Cancellation & refunds
- Cancel → keep access through a **notice period** (1 month monthly, 2 months for 6-month/yearly), then revert to trial. Unused prepaid balance **beyond** the notice is refunded **pro-rata**, and the refund is **owner-approved — never auto-charged**.
- A cancel inserts a **pending `refund_request`**; resuming withdraws it. The refundable window is clamped to the last payment's term (a Paystack refund can only reverse that transaction).
- Standard user-facing refund wording: **"5–10 business days, depending on your bank."**

### 4.4 Promo & access codes
- Two kinds: **access** codes (grant months of access) and **promo** codes (percentage discount). Generated from the admin console.
- Redemption is one-per-user; a discount code also stops applying after it has reduced one successful payment (`consumedAt`).

---

## 5. The admin console

All admin routes are gated to your admin account (`assertAdmin`, keyed off `OWNER_EMAIL`). Sections:

### 5.1 Accounts (`/admin/accounts`)
Your revenue and account back office:
- **Refund requests** — approve (calls Paystack refund) or reject host cancellation refunds.
- **Payments & refunds** — list recent Paystack charges and issue full or partial refunds without leaving the app. Amounts show exact cents (e.g. R19.90).
- **Abandoned checkouts** — checkouts that started but never activated.
- **By plan** — paying accounts, monthly value, and share of MRR.
- **Accounts table** — every account with billing, status, monthly value, and renew/end dates; filterable by plan.
- **Monthly statement / running costs / net** — MRR (paying, excluding complimentary), running costs normalised to monthly, and net.

### 5.2 Support (`/admin/support`)
- **SMTP connection** test and **send a test email**.
- Per-account lookup: contact details, plan & access (including granting **complimentary** access with no expiry/billing), and account actions.
- **Generate a code** — build access/promo codes (plan granted, months, % off, max redemptions, expiry, custom code, prefix, internal note).
- **VAT status** — SARS VAT registration number and rate.
- **Subscription fee** settings.

### 5.3 Invite (`/admin/invite`)
- Generate branded invitation letters for prospective hosts (recipient, business name, properties).

### 5.4 Marketing (`/admin/marketing`)
- Campaign hub for planning/organising marketing across platforms.

### 5.5 Docs (`/admin/docs`)
- Browse and print internal documents; download all as a spreadsheet.

---

## 6. Legal & compliance

- **Legal pack** lives in `docs/legal/*.md` and is compiled to `docs/legal/StayKnit-Legal-Pack.docx` via `scripts/generate-legal-pack.mjs` (`node scripts/generate-legal-pack.mjs`). Parts cover business model, POPIA data & privacy, security framework, instructions to counsel, in-app legal copy, audit findings, and an operational security runbook.
- **In-app legal pages:** `/terms`, `/privacy`, `/cookie-policy`, plus the one-time relay **Terms gate** every host accepts before use.
- **POPIA:** the privacy copy splits the responsible party (host account data) from the operator (owner/guest data) and covers cross-border processing via provider DPAs (POPIA s72). DSAR, breach response (s22), backup/DR, and secrets rotation are formalised in the operational runbook (`07-operational-security-runbook.md`), which has `[confirm]` placeholders to fill from the Neon/Vercel dashboards.
- **Payments compliance:** card-on-file / recurring-charge language (CPA/ECTA) is the clause to keep counsel-reviewed whenever billing changes.
- **Outgoing-iCal caveat:** publishing availability shifts some booking-accuracy expectation onto StayKnit, which is in tension with the "best-effort / not system of record" positioning — keep Terms aligned when this feature is emphasised.

---

## 7. Operations & runbook pointers

- **Database backups / DR:** Neon daily snapshots + point-in-time restore. A test restore must be exercised and recorded (see runbook). A retained pre-restore backup branch exists and can be deleted once production has run cleanly post-launch (set `protected:false` first).
- **Secrets to rotate on schedule:** `BETTER_AUTH_SECRET`, `PAYSTACK_SECRET_KEY`, SMTP passwords, database credentials. Note: the support mailbox `SUPPORT_SMTP_USER` should hold the email address, not an API key — verify and rotate anything leaked.
- **Cron jobs:** renewals run daily (registered in `vercel.json`); the endpoint is protected by `CRON_SECRET`.
- **SEO / Search Console:** verified via DNS TXT and a meta tag in `app/layout.tsx`. The canonical 308 redirect in `proxy.ts` must exclude search-verifier files; `*.vercel.app` is noindexed.
- **Deployment:** merges to `main` deploy to production on Vercel. Watch **Rolling Releases** — a canary stage can pin the live domain below 100%; approve the final stage (or set a single 100% / automatic promotion in Settings → Build and Deployment) so merges go fully live.
- **Stripe env vars:** unused `STRIPE_*` variables are injected by a still-connected Stripe Marketplace integration. To remove them, disconnect that integration in Vercel project Settings → Integrations (they cannot be deleted from code — they re-inject).

---

## 8. Glossary

- **Channel / listing site** — a booking platform (Airbnb, Booking.com, Nightsbridge, LekkerSlaap, Vrbo).
- **Feed** — one iCal connection for a single (unit × site).
- **Direct booking** — a stay entered by hand in StayKnit (walk-in, repeat guest).
- **Block** — a manual hold on dates (owner stay, maintenance).
- **Owner** — a property owner your host pays out (the read-only portal user). Distinct from **you**, the app/business owner (admin).
- **Statement** — a monthly per-owner payout breakdown: gross revenue minus commission, cost lines, and VAT = net payout.
- **Complimentary account** — an account granted access with no expiry and no billing, from the support console.
- **MRR** — monthly recurring revenue from paying accounts, excluding complimentary.

---

*This manual describes the app as configured for StayKnit (Next.js + Neon/Better Auth + Paystack, South Africa). Keep it in sync with `docs/` — the legal pack, launch runbook, and integrations reference — when the product changes.*
