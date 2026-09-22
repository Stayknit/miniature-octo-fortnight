# StayKnit — Current In-App Legal Copy (for review)

**Purpose:** this is the exact text currently published in the app at `/terms`, `/privacy`, and `/cookie-policy`. It is a founder-written starting draft, **not** vetted legal advice. Please review it, correct it, and make it enforceable and POPIA/CPA/ECTA-compliant.

**Confirmed entity details** (wired into these pages): StayKnit (Pty) Ltd · CIPC reg. 2026/740258/07 · SARS taxpayer no. 9155051304 *(held as source of truth in `lib/legal.ts`; **not shown on public pages** — the taxpayer number is withheld from public view as StayKnit is not VAT-registered)* · Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa · support@stayknit.org · privacy@stayknit.org · governing law: Republic of South Africa · data-retention: 12-month inactivity auto-purge.

---

## TERMS OF SERVICE (current copy at /terms)

These Terms of Service (the "Terms") govern your access to and use of StayKnit (the "Service"), operated by StayKnit (Pty) Ltd (registration 2026/740258/07) ("StayKnit", "we", "us"). By creating an account or using the Service you agree to these Terms. If you do not agree, do not use the Service.

**1. What StayKnit does.** StayKnit mirrors calendar availability between your listing sites over iCal. It is a sync relay, not a booking channel. Only dates sync — guest messages, payments, and cancellations remain on the original channel. We never ask for or store your channel passwords; we read the public iCal export links you provide.

**2. Minimum age and capacity to contract.** You must be at least 18 years old and legally capable of entering into a binding contract under South African law to create an account or use the Service. By registering, you confirm that you meet this requirement.

> **Counsel note on §2 (added 22 Sep 2026):** new clause. Please confirm the age/capacity wording is appropriate under South African contract law and the CPA, and whether any additional handling is needed for accounts opened by or on behalf of minors (contracts with minors being voidable).

**3. Your account.** You must provide accurate information and confirm your email address before your account becomes fully active. You are responsible for activity under your account and for keeping your credentials secure. Public sign-up creates a host account; owner logins are provisioned by their host and are read-only.

**4. Licence to use the Service.** Subject to these Terms and your active subscription, StayKnit grants you a limited, non-exclusive, non-transferable licence to access and use the Service for your own property-management purposes. This licence does not permit you to resell, sublicense, copy, or reverse-engineer any part of the Service, or to use it to build a competing product.

> **Counsel note on §4 (added 22 Sep 2026):** new clause. Please review the licence scope and restrictions (resale, sublicensing, copying, reverse-engineering, competing product) for enforceability and consistency with our IP position.

**5. Acceptable use.** You remain the host of record on every channel and must have the right to sync the listings you connect. You agree not to misuse the Service, interfere with its operation, attempt to access other users' data, or use it for unlawful purposes.

**6. Sync is best-effort.** Channels refresh iCal on their own schedules and may be delayed or unavailable. StayKnit is not liable for double-bookings, lost revenue, or other harm caused by a channel's delay, outage, or incorrect data. Payout and statement figures are estimates calculated from synced data and your settings; reconcile them against channel payouts before paying owners.

**7. Third-party listing sites.** The Service connects to third-party listing sites (such as Airbnb, Booking.com, and LekkerSlaap) via the calendar feeds you provide. These sites are operated independently of StayKnit, and we have no control over their content, availability, or accuracy. Your use of any listing site remains governed by that site's own terms, and StayKnit is not responsible for any loss arising from your dealings with them.

> **Counsel note on §7 (added 22 Sep 2026):** new clause. Please confirm this links/feeds disclaimer is adequate, and cross-check it against the s72 cross-border question for listing-site data flows raised in `03-instructions-to-counsel.md` §B3(b) and the channel-partner terms in `08-compliance-frameworks-overview.md` §5.

**8. Billing and cancellation.** StayKnit is a flat prepaid fee with no booking commission. Paid plans are billed once, upfront, for a fixed term. **Auto-renewal is optional and off by default**: unless you choose to enable it, a plan does not auto-renew, and when the term ends access reverts to the free trial unless you purchase another term. If you opt into auto-renewal — at checkout or later from your plan — you authorise StayKnit to store a secure payment token with Paystack and to charge the same term shortly before it ends, at the price then in effect, until you switch auto-renewal off. You can turn auto-renewal off at any time from your plan.

**Cancellation.** You may cancel a paid plan at any time from your plan. A notice period applies — **one month** for monthly terms and **two months** for yearly terms — measured from the date you cancel. You keep full access through the notice period, after which your account returns to the free trial, and any auto-renewal is switched off so no further charge is made. Where you have prepaid beyond the notice period, we refund the unused balance on a pro-rata basis to your original payment method. Refunds are reviewed and released by StayKnit and typically reflect within 5–10 business days, depending on your bank. Please note that the payment processor's transaction fee is typically non-refundable, so a refund may be slightly less than the original amount paid. Amounts covering the applicable notice period are retained and are otherwise non-refundable except where required by law. The free trial requires no card, and nothing is charged until you confirm a paid plan. Payments are processed by Paystack; StayKnit never stores your full card details.

> **Counsel note on §5 (updated 20 Sep 2026 — supersedes the earlier "no refund / keeps paid time" note):** Two mechanics to review. **(a) Optional auto-renewal:** off by default (a host who does nothing is never auto-charged and reverts to the free trial at term end); a host may *opt in* (at checkout or later), which stores a reusable Paystack card authorisation and charges the same term shortly before expiry at the then-current price until switched off. Implemented as a Paystack card authorisation + a daily renewals cron (not Paystack Subscriptions). **(b) Cancellation:** now carries a **notice period** (one month monthly / two months yearly, measured from the cancel date) after which access reverts to the free trial, plus a **pro-rata refund of any prepaid balance beyond the notice period** (Paystack's transaction fee is typically non-refundable). **Please review both the recurring-charge / card-on-file clause and the notice-period + pro-rata-refund mechanics against the Consumer Protection Act and ECTA** — pre-charge notice, price-change disclosure, ease of cancellation, fixed-term/cooling-off rules, and consent/record-keeping for stored payment credentials. **Drafting flag:** the live §5 above names only "monthly" and "yearly" notice periods, but the app also applies the two-month notice to the **6-month** term (see `lib/billing/cancellation.ts`) — the in-app §5 wording should be extended to name the 6-month term, and the in-app "last updated" date bumped to reflect this §5 change.

**9. Your data.** Your data is scoped to your account and is never sold. You may export or delete your data at any time from Settings. Deleting your profile permanently erases your account and associated data and cannot be undone. Profiles left inactive for 12 months are deleted automatically. Our handling of personal data is described in the Privacy Policy.

**10. Disclaimers and limitation of liability.** The Service is provided "as is" without warranties of any kind, to the fullest extent permitted by law. To the maximum extent permitted by law, StayKnit's total liability arising out of or relating to the Service is limited to the amount you paid us in the twelve months preceding the claim. Nothing in these Terms excludes liability that cannot lawfully be excluded.

**11. Changes and termination.** We may update these Terms from time to time; material changes will be reflected by the "last updated" date above and, where appropriate, notified in-app. You may stop using the Service and delete your account at any time. We may suspend or terminate access for breach of these Terms.

**12. Governing law.** These Terms are governed by the laws of the Republic of South Africa, and disputes are subject to the courts of the Republic of South Africa.

**13. Contact.** StayKnit (Pty) Ltd · Registration number: 2026/740258/07 · Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa · support@stayknit.org

---

## PRIVACY POLICY (current copy at /privacy)

This Privacy Policy explains how StayKnit (Pty) Ltd ("StayKnit", "we") collects, uses, and shares personal information when you use StayKnit. We act as the responsible party (controller) for this data.

**1. Information we collect.** *Account data* you give us: your name, email address, and password (stored only as a secure hash). *Workspace data* you create: properties, iCal feed URLs, bookings, owner records, statements, cost settings, and support messages. *Payment data:* plan purchases are handled by Paystack; we receive confirmation and status, not your full card number. *Technical data:* basic request and usage information (e.g. IP address, device/browser, aggregate analytics) collected to run and secure the Service.

**2. How we use it.** To provide and operate the Service (syncing calendars, generating statements), to authenticate you and secure your account, to process payments, to respond to support requests, and to comply with legal obligations. We do not sell your personal information.

**3. Legal bases.** We process data to perform our contract with you (providing the Service), to comply with legal obligations, and for our legitimate interests in securing and improving the Service, consistent with applicable data-protection law. Where required, non-essential processing (such as analytics) relies on your consent, which you can withdraw.

**4. Who we share it with.** We share data only with the service providers needed to run StayKnit:
- **Vercel Inc.** — Application hosting, analytics, and content delivery
- **Neon Inc.** — Managed PostgreSQL database storage
- **Paystack Payments Limited** — Payment processing for plan purchases
- **Namecheap (Private Email)** — Transactional email delivery

These providers process data on our behalf under contract, or as independent controllers for payments. We may also disclose data where required by law.

**5. Retention.** We keep your data for as long as your account is active. Profiles left inactive for 12 months are deleted automatically, and you can delete your account at any time from Settings, which permanently erases your data. Some records may be retained longer where the law requires it (for example, payment records for tax purposes).

**6. Your rights.** Subject to applicable law, you may access, correct, export, or delete your personal information, and object to or restrict certain processing. StayKnit provides self-service **export** and **deletion** in Settings. To exercise any other right, contact us at privacy@stayknit.org.

**7. Cookies and tracking.** StayKnit uses essential cookies for authentication and a privacy-friendly analytics measurement to understand usage. See our Cookie Policy for details and your choices.

**8. Security.** Passwords are hashed, sessions use HttpOnly cookies, and data is scoped per account. No method of transmission or storage is completely secure, but we take reasonable measures to protect your information.

**9. Contact.** StayKnit (Pty) Ltd · Registration number: 2026/740258/07 · Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa · privacy@stayknit.org

> **Counsel note on the sub-processor list:** please confirm the correct legal name of each provider (e.g. "Paystack Payments Limited", and "Namecheap (Private Email)" for the current SMTP email provider) and whether operator agreements are required.

---

## COOKIE POLICY (current copy at /cookie-policy)

This policy explains the cookies and similar technologies StayKnit uses. A cookie is a small file stored on your device; we use them sparingly and only for the purposes below.

**Essential cookies.** These are required for the Service to work and cannot be switched off. They keep you signed in (a secure, HttpOnly session cookie) and protect against cross-site request forgery. Because they are strictly necessary, they do not require consent.

**Analytics.** We use Vercel Analytics to understand aggregate usage (such as which pages are visited). It is designed to be privacy-friendly and does not use analytics cookies to build advertising profiles. Where consent is required, this measurement runs only after you accept non-essential tracking in the cookie banner.

**Third-party requests.** Our typefaces are self-hosted — they are bundled at build time and served from StayKnit itself — so simply displaying the app makes no request to Google or any other font provider, and no cookie or IP address is shared with them. On the plan page, the app does load Paystack to process payments securely; Paystack may set its own cookies or receive your IP address as part of delivering that service.

**Your choices.** You can accept or decline non-essential tracking using the banner shown on your first visit, and you can change your choice at any time by clearing this site's data in your browser. You can also block or delete cookies in your browser settings, though essential cookies are needed to stay signed in.

