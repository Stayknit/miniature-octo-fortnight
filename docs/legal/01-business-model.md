# StayKnit — Business Model & Product Overview

**Purpose of this document:** to give legal counsel a plain, accurate picture of what StayKnit is, who uses it, how money flows, and where the legal risk sits — so that the Terms of Service, Privacy Policy, and any other agreements can be drafted to fit the actual business.

> This is a founder-prepared briefing, not a legal opinion. Every statement here is a description of how the product currently works, for an attorney to review and turn into enforceable documents.

---

## 1. What StayKnit is

StayKnit is a **software-as-a-service (SaaS) web application** for **short-stay / self-catering property managers** in South Africa (and potentially neighbouring markets). It is a management tool, **not** a booking platform and **not** a payment intermediary between guests and property owners.

A typical user ("host") is a small agency or individual who manages a handful of holiday rentals — cottages, guest houses, rooms — that are listed on third-party sites such as Airbnb, Booking.com, and LekkerSlaap. StayKnit helps them:

- **Sync calendars** across all the listing sites (via iCal feeds) so a booking on one site blocks the dates everywhere and prevents double-bookings.
- **See all bookings** across channels in one place.
- **Produce owner statements** — monthly financial breakdowns (gross income, commission, cleaning, VAT, net payout) for the property owners they manage.
- **Give property owners a read-only "owner portal"** to see their own units' bookings and statements.

## 2. Who the users are (three roles)

| Role | Who they are | What they can do |
|------|--------------|------------------|
| **Host** | The paying customer — a property manager or agency. | Full access: manage properties, calendars, bookings, owner clients, statements, settings, billing. |
| **Owner** | A client of the host — the person who actually owns a property the host manages. | Read-only access to a scoped portal showing **only their own** units' bookings and statements. Does not pay StayKnit. |
| **Guest** | The end traveller who books a stay. | **Not a user of StayKnit.** Guests never log in. Their name and stay dates appear in the host's booking records (imported from the listing sites). |

This three-party structure matters legally: **the host is our customer and pays us; the owner is the host's customer; the guest is the owner's/host's customer.** StayKnit has a direct contractual relationship only with the host.

## 3. How StayKnit makes money (revenue model)

StayKnit charges the **host** a **flat subscription fee by tier**. Key characteristics:

- **No commission.** We never take a percentage of bookings or guest payments. The fee is a fixed software subscription, independent of how much the host earns.
- **We never touch guest or owner money.** Guest payments are handled entirely by the listing sites (Airbnb etc.) or directly between guest and host, outside StayKnit. Owner payouts are made by the host, outside StayKnit. StayKnit only records these figures for reporting; it does not process, hold, or transfer them.
- **Tiers are defined by number of properties managed.** Higher tiers allow more listings.

### Current pricing (South African rand, per month)

| Tier | Listings included | Monthly price (ZAR) |
|------|-------------------|---------------------|
| Free trial | 1 | R0 (14 days; no card required, charged only on confirming a paid plan) |
| Starter | up to 3 | R199 |
| Host | up to 5 | R299 |
| Professional | up to 15 | R499 |
| Business | up to 30 | R899 |
| Enterprise | 30+ | Custom quote |

*(All plans are **billed in ZAR** — the Rand is the single billing source of truth. Prices may be **displayed** in USD, EUR, GBP or NAD as an approximate convenience conversion for hosts outside South Africa, but the amount actually charged is always the ZAR figure; a foreign card is converted by the cardholder's own bank at its rate. Updated 18 Sep 2026 — supersedes the earlier "billing currency locked to the host's region" position, which billed foreign cards in their local currency.)*

### Billing terms

- The host chooses a **billing period**: monthly, 6-month, or 1-year.
- **Longer terms are not discounted per month**; instead they reward commitment differently — the 6-month term takes 10% off the upfront total, and the 1-year term grants **bonus free months** (pay for 12, get 14 months of access).
- Payment model is a **prepaid, fixed-term subscription with optional, off-by-default auto-renewal.** A host selects a plan and pays once, upfront, for the chosen term via Paystack. By default the plan does **not** renew: when the term ends, access reverts to the free trial unless the host buys another term. A host may, however, **opt in** to auto-renewal — at checkout or later from the Plan screen — in which case StayKnit stores a reusable Paystack card authorisation and charges the same term shortly before it expires (at the then-current price) until the host switches auto-renewal off. *(Implemented as a Paystack card authorisation + a daily renewals cron, not Paystack Subscriptions. Updated 18 Sep 2026 — supersedes the earlier "never auto-renews / no card-on-file" position; aligned to the shipped app and to Terms §5. Counsel should review the recurring-charge / card-on-file mechanics — see `03-instructions-to-counsel.md`.)*
- **Cancellation (unsubscribe) and turning off auto-renewal:** a host can cancel, or switch auto-renewal off, at any time from the Plan screen. **A notice period applies — one month for monthly terms and two months for 6-month and yearly terms — measured from the cancel date.** The host keeps full access through the notice period, after which the account reverts to the free trial and any future auto-renewal charge is stopped. **Where the host has prepaid beyond the notice period, StayKnit refunds the unused balance pro-rata** to the original payment method (the Paystack transaction fee is typically non-refundable, so a refund may be slightly less than the amount paid); amounts covering the notice period are retained and are otherwise non-refundable except where required by law. Cancelling also silences renewal reminders; resuming before the end date restores them. *(Updated 20 Sep 2026 — supersedes the earlier "no refund / keeps paid time to term end" position; aligned to the shipped `lib/billing/cancellation.ts` and to Terms §5.)*
- **Referrals:** hosts can refer other hosts; both sides receive a free month when the invitee joins.
- **Founding-member rate:** early customers may be locked to a preferential rate.

## 4. Payment processing

- Payments are processed by **Paystack**, a South African payment gateway, paying out to the company's local (FNB) business bank account.
- StayKnit stores **no card numbers**. Card data is entered on/handled by the gateway; StayKnit stores only a payment reference and the resulting plan status — plus, **for hosts who opt into auto-renewal**, an opaque Paystack card-authorisation token (and customer code) that lets the gateway charge the same card again. That token is not a card number and cannot be used outside Paystack; it is cleared when the host turns auto-renewal off or cancels.
- The gateway is a **third-party processor** and will have its own merchant agreement the company must accept.

## 5. The company

- **Trading name:** StayKnit
- **Website:** https://www.stayknit.org
- **Jurisdiction / market:** South Africa (primary), with pricing support for other currencies.
- **Registered entity:** StayKnit (Pty) Ltd *(owner-confirmed; counsel to verify exact registered form)*
- **Registration number:** 2026/740258/07 *(CIPC — owner-confirmed)*
- **Taxpayer registration number:** 9155051304 *(SARS — owner-confirmed)*
- **Registered address:** Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa *(owner-confirmed; street number withheld from public-facing copy)*
- **Contact:** support@stayknit.org · privacy/data-rights: privacy@stayknit.org

> **Counsel please note:** these details are owner-confirmed and already wired into the app's legal pages (`lib/legal.ts`). The CIPC registration number (2026/740258/07) and SARS taxpayer number (9155051304) are now distinct as expected. Please verify the registered legal form and confirm **VAT registration status**. StayKnit itself offers hosts an optional VAT feature (15% SA default) on their **management-fee** lines in owner statements — this is the host's VAT on their service to owners, separate from StayKnit's own VAT position.

### StayKnit's own VAT: an admin setting, not hard-coded

StayKnit's own VAT status on its **subscription invoices** is a configurable operator setting (Admin dashboard → Pricing → **VAT status**; stored in `app_setting` key `stayknit_vat`, logic in `lib/vat.ts`), **defaulting to "not registered."** This exists so the app can switch cleanly if/when StayKnit crosses the SARS VAT-registration threshold, without a code change and without altering advertised prices:

- **While not registered (current default):** subscription invoices carry **no VAT line** and state plainly that StayKnit is not a registered VAT vendor and the document is a payment receipt / invoice, **not** a SARS tax invoice. A non-vendor may not represent that VAT is charged or included (VAT Act), so this is the only lawful presentation.
- **Once registered:** an admin records the SARS VAT number and turns the setting on. Invoices then become proper **tax invoices** showing the VAT registration number, with the **15% presented as already included** in the same advertised price (e.g. R199 → R173.04 + R25.96 VAT). The app will not let the setting be turned on without a VAT number.
- **Prices never change when VAT is toggled** — VAT is back-computed as included in the existing ZAR price, so hosts always pay the advertised figure.

> **Counsel / accountant action:** before this setting is switched on in production, StayKnit's South African accountant must confirm the **final tax-invoice wording and the VAT-inclusive treatment** (included vs. added-on) are correct for the business's registration.

## 6. What we are asking counsel to produce

See `03-instructions-to-counsel.md` for the full scope. In short:

1. **Terms of Service** (host-facing subscription agreement).
2. **Privacy Policy** — POPIA-compliant (see `02-data-and-privacy-popia.md`).
3. Advice on **consumer-protection** (CPA / ECTA) obligations for the prepaid fixed-term subscription, its **optional opt-in auto-renewal**, and the cancellation mechanics. *(Note: auto-renewal is off by default; a host who does nothing is never auto-charged and re-purchases manually. When a host opts in, StayKnit stores a reusable Paystack card authorisation and charges the next term before expiry — please review pre-charge notice, price-change disclosure, ease of cancellation, and stored-credential consent. Cancellation now carries a **notice period (1 month monthly / 2 months for 6-month and yearly terms) and a pro-rata refund of any prepaid balance beyond that notice** — please confirm these comply with the CPA's fixed-term and cooling-off rules.)*
4. Advice on the **host↔owner↔guest data relationship** and whether StayKnit needs a data-processing/operator agreement with hosts under POPIA.
