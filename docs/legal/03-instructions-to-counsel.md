# StayKnit — Instructions to Counsel

**To:** *(attorney / firm name)*
**From:** StayKnit (Pty) Ltd — reg. 2026/740258/07 — Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa
**Re:** Legal documents and advice required before public launch of a South African SaaS product

This document lists exactly what we need from you. Background is in `01-business-model.md` and `02-data-and-privacy-popia.md`. Please read those first — they describe the product and the data accurately.

---

## A. Documents we need drafted (or reviewed)

We have **draft in-app copy** for the items marked *(draft exists)* — please review and make them enforceable and compliant rather than starting from scratch, unless you advise otherwise.

1. **Terms of Service / Subscription Agreement** *(draft exists)* — the contract between StayKnit and the host. Must cover:
   - The subscription model, tiers, and ZAR pricing.
   - Billing periods (monthly / 6-month / 1-year), the "bonus free months" and "10% off upfront" mechanics. **Plans are prepaid with optional, off-by-default auto-renewal**: by default a plan expires at term end and the host re-purchases manually. If a host *opts in*, StayKnit stores a reusable Paystack card authorisation and charges the next term (at the then-current price) shortly before expiry until the host turns it off. Please draft/review the recurring-charge and card-on-file clause accordingly (updated 18 Sep 2026 — supersedes the earlier "no auto-renewal" instruction).
   - **Self-service cancellation and auto-renewal-off at any time** from the Plan screen. **A notice period applies — one month for monthly terms and two months for 6-month and yearly terms — measured from the cancel date;** the host keeps access through the notice period, then reverts to the free trial and any future auto-renewal charge stops. **Any prepaid balance beyond the notice period is refunded pro-rata** (the Paystack transaction fee is typically non-refundable); amounts covering the notice period are retained. See C1/C3 (updated 20 Sep 2026 — supersedes the earlier "no notice period / no refund" instruction).
   - Free-trial terms (14 days; no card captured at signup — the host is charged only when they confirm a paid plan).
   - Referral credits ("free month" for both sides) and any "founding rate" lock-in.
   - Acceptable use, limitation of liability, disclaimers (esp. that StayKnit is a management tool and is **not responsible for double-bookings, lost bookings, or calendar-sync failures** originating from third-party listing sites), and termination/suspension rights.
   - Governing law: South Africa.

2. **Privacy Policy** *(draft exists)* — **POPIA-compliant**. See section B.

3. **Operator / data-processing terms** — advise whether these should be a schedule to the Terms (see B2). **On channel partners specifically:** you asked for "data-processing arrangements with the channel partners, including the API terms." Please see `09-channel-partner-data-processing.md` — the short answer is that **no such agreements exist**, because StayKnit uses no channel API and holds no contract with Airbnb/Booking.com/LekkerSlaap; it reads host-provided **public iCal links** (inbound) and publishes a **dates-only .ics feed** (outbound, no guest PII), with the **host** as the party bound by each channel's terms. Please confirm that characterisation and whether any DPA is in fact required.

4. **Cookie / tracking notice** — advise whether required; the app uses session cookies and may add analytics.

## B. POPIA advice we specifically need

1. **Responsible party vs operator.** For **owner and guest** data that hosts enter to run their own businesses, are we an **operator** acting for the host (host = responsible party)? If so, we need operator obligations reflected in the Terms so the compliance burden sits correctly.

2. **Guest data with no relationship.** Guest names/dates are imported from listing sites; guests don't know StayKnit exists. What are our notification/lawful-processing duties, and can they be discharged via the host?

3. **Cross-border transfer (s72) — two distinct vectors, please advise on both.**
   - **(a) Hosting/infrastructure.** Our hosting (Vercel) and database (Neon, AWS `us-east-1`, USA) are outside South Africa. Advise whether this is permitted and how to disclose/paper it (SCC-style clauses, consent, or contractual necessity).
   - **(b) Listing-site / channel data exchange.** Hosts list on **Airbnb, Booking.com, and LekkerSlaap**, and StayKnit exchanges calendar data with them. Please advise on the s72 position for this vector specifically — **but note the exchange is calendar-oriented, not a full channel-manager guest-data sync.** Inbound is iCal feeds that primarily carry dates/availability (a guest name or booking reference may appear depending on the platform); our outbound **.ics feed exports dates/availability only and no guest PII** (see `07-operational-security-runbook.md`). We need counsel to (i) confirm which listing-site flows, if any, constitute a s72 transfer of personal information, and (ii) tell us what to disclose and paper for each channel. This bears on whether the channel-partner API/data terms in the compliance overview (`08-compliance-frameworks-overview.md` §5) create s72 obligations for us or sit with the host. *(Added 2026-09-22 after reviewing the compliance-frameworks overview, which frames StayKnit as a channel-manager with bidirectional guest-data flows; we want the record to reflect our actual, narrower calendar-data exchange.)*

4. **Data-subject requests.** Confirm our required process for access, correction, and deletion requests, and whether our existing **12-month auto-purge** plus on-request deletion is sufficient.

5. **Information Officer.** Do we need to register an Information Officer with the Information Regulator, and what must we put in place (PAIA manual)?

6. **Breach notification.** Confirm our obligations and the wording needed in the policy and internal process.

## C. Consumer-protection / e-commerce advice (CPA & ECTA)

1. **Prepaid fixed-term subscriptions + optional auto-renewal:** confirm our prepaid term, expiry, self-service cancellation, **notice-period (1 month monthly / 2 months for 6-month and yearly terms), and pro-rata-refund** mechanics comply with the Consumer Protection Act (e.g. rules on fixed-term agreements and cooling-off). Auto-renewal is **off by default** — a host who does nothing is never auto-charged. When a host *opts in*, we store a reusable Paystack card authorisation and charge the next term before expiry: please advise on CPA/ECTA requirements for that recurring charge — pre-charge notice, price-change disclosure, ease of opting out, and consent/record-keeping for stored payment credentials.
2. **ECTA (Electronic Communications and Transactions Act):** confirm the online-contracting flow (click-to-accept terms gate), required pre-contract disclosures, and the consumer's statutory cooling-off rights for electronic transactions.
3. **Refunds:** advise a compliant refund position for mid-term cancellations, given we bill upfront for terms.

## D. Company / tax items to confirm (so documents are consistent)

Please confirm and we will supply where needed:
- Correct **legal entity name**, **CIPC registration number**, **registered address**.
- **VAT registration status** of StayKnit itself. *(Separately, the product offers hosts an optional 15% VAT feature on their management-fee lines to their owners — this is the host's VAT, not ours, but flag if it creates any disclosure duty for us.)*

## E. Practical questions

1. Given we operate in ZAR and target SA, do you recommend any restriction on serving hosts **outside** South Africa (we support other currencies) — e.g. GDPR exposure if an EU host signs up?
2. Is there any licensing/regulatory issue with the product recording **financial figures and producing owner statements** (we do not hold or move money — see business model doc §3)? We want to be sure we are not inadvertently a payment intermediary, estate agent, or financial-services provider.
3. Any disclaimers you recommend around the **VAT/commission/statement calculations** the software performs, to avoid liability if a host relies on them for their own tax filings.

## F. What we are NOT asking for
- We do not process guest or owner payments and do not want documents that imply we do.
- We do not need employment or fundraising documents at this stage.

---

### Attachments provided
- `01-business-model.md` — product, users, revenue, pricing.
- `02-data-and-privacy-popia.md` — full personal-information inventory, hosting, retention, security.
- `04-current-inapp-legal-copy.md` — the exact Terms, Privacy, and Cookie copy currently published in the app, for you to review and make enforceable.
- `08-compliance-frameworks-overview.md` — a plain-language POPIA/GDPR/PCI-DSS reference overview with a compliance checklist, as a scoping aid (not a substitute for this instructions document).
- `09-channel-partner-data-processing.md` — the channel-partner data-processing & API-terms memo answering the reviewing lawyers' third request: it explains that StayKnit holds **no** channel API agreement or DPA (host-provided public iCal links only) and points to the terms that actually apply.
- `10-draft-additional-clauses-for-review.md` — founder-proposed **new** Terms clauses (Confidentiality, IP, Prohibited conduct, Service availability, Force majeure, Assignment, a revised Changes clause) plus a **Schedule 1 — Data Processing Terms**, all reviewed against the live app: numbering reconciled to the current §1–§13 Terms, duplicates with §4/§5/§11 removed, and each factual claim (sub-processors, 2FA, export/delete) verified. Includes a renumbering map.

> **Drafting note:** the in-app copy names **Paystack** as the payment processor. Please treat Paystack as the disclosed sub-operator (processor) in the Privacy Policy.

Please advise on your fee and turnaround. Our launch is gated on these items, so we would appreciate an early indication of any showstoppers.
