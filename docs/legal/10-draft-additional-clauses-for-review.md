# StayKnit — Additional Draft Clauses, Reviewed Against the App (for counsel)

**Purpose.** These are the founder's proposed new clauses (Confidentiality, IP, Prohibited conduct, Availability, Force majeure, Assignment, a revised Changes clause, and a Data Processing schedule), **reviewed and rewritten to match what the app actually does and to fit the current published Terms**. They remain founder-drafted starting points, **not** vetted legal advice — every clause needs attorney review before publication.

**Read together with** `04-current-inapp-legal-copy.md` (the live Terms/Privacy this builds on) and `09-channel-partner-data-processing.md` (the iCal-only, no-API reality that several clauses below depend on).

---

## What I changed in review, and why

The founder draft assumed the Terms ran **§1–§10** and appended new clauses as §11–§17. The **live Terms now run §1–§13** (three clauses — age/capacity, licence, third-party listing sites — were added on 22 Sep 2026). That stale assumption created real overlaps, which I have resolved:

| Founder draft | Issue found against the live app | Resolution |
| --- | --- | --- |
| §12 Intellectual Property | Re-grants a use licence that **live §4 (Licence)** already grants — two licence grants would conflict | Kept the **ownership** statement and the valuable **"host retains rights in its own data"** line; **removed the duplicate licence grant** and cross-referenced §4 instead |
| §13 Prohibited conduct | Reverse-engineer / copy / derivative-works already banned by **live §4**; "access another host's data" already banned by **live §5** | Trimmed to the **genuinely new** items (malware, scraping/bots, vulnerability probing) and cross-referenced §4/§5 |
| §17 Changes (revised) | Duplicates **live §11 (Changes and termination)** | Treated as a **replacement for live §11**, not an add-on |
| Numbering of all new clauses | Would collide with live §11–§13 and push Contact out of last position | Renumbered so **Governing law and Contact stay last** (see map at the end) |
| Part B §4 security measures | Claimed "optional two-factor authentication" | **Verified accurate** — 2FA exists in the app (`app/2fa`, `components/two-factor-card.tsx`, `lib/auth.ts`), so the claim stands |
| Part B §3 sub-processors | Generic names | Aligned to the **exact names already in the Privacy Policy §4** (Vercel Inc., Neon Inc., Paystack Payments Limited, Namecheap Private Email) |

Clauses the founder draft got right for the app and I kept substantively as-is: **Confidentiality, Service availability, Force majeure, Assignment**, and the whole **Data Processing schedule** (its operator/responsible-party split matches how the app handles owner/guest data).

---

## Part A — Clauses to insert into the Terms of Service

> Insert these **after live §10 (Disclaimers and limitation of liability)** and **before Governing law/Contact**. The revised **§11** replaces the current §11.

### §11. Changes and termination *(revised — replaces the current §11)*

StayKnit may update these Terms from time to time. For **material** changes, StayKnit will give existing hosts at least **14 days' notice** by email or in-app notification before the change takes effect. If a host objects to a material change in writing before it takes effect, StayKnit will not apply the change to that host's account; in that case StayKnit may terminate the host's subscription with effect from the date the change would otherwise have applied, subject to a **pro-rata refund of any prepaid, unused balance**. Continued use of the Service after a change takes effect constitutes acceptance of it. You may stop using the Service and delete your account at any time. StayKnit may suspend or terminate access for breach of these Terms.

> **Counsel note (§11):** this strengthens the current live §11 (which only says changes are "reflected by the last updated date"). Please confirm the 14-day notice, object→terminate→pro-rata mechanism, and "continued use = acceptance" are CPA/ECTA-compliant, and that they are consistent with the notice-period + pro-rata refund already in §8 (Billing and cancellation).

### §12. Confidentiality *(new)*

"Confidential Information" means any non-public information disclosed by one party to the other in connection with the Service, including business, financial, and technical information, and — for the avoidance of doubt — any owner or guest data a host enters into the Service. Each party will use the other's Confidential Information only to perform its obligations under these Terms, and will not disclose it to any third party except: (a) to employees, contractors, or professional advisers who need it to perform the Service and who are bound by confidentiality obligations at least as strict as these; (b) where the information is or becomes public through no fault of the receiving party; (c) where the receiving party already lawfully held it before disclosure; or (d) where disclosure is required by law, regulation, or a competent authority. This clause survives termination.

> **Counsel note (§12):** new. The owner/guest-data carve-in is intentional and dovetails with the Data Processing schedule in Part B — please confirm the two are consistent.

### §13. Intellectual property *(new — licence grant deliberately omitted; see §4)*

StayKnit and its licensors own all right, title, and interest in the Service, including its software, design, trademarks, and documentation. **The limited licence granted to you is set out in §4 (Licence to use the Service); no other rights are granted.** You retain all rights in the data you enter into the Service (property, owner, and guest records) and in your own trademarks and content.

> **Counsel note (§13):** rewritten to avoid a second licence grant conflicting with §4. Please confirm the ownership/host-data split is the position StayKnit wants.

### §14. Prohibited conduct *(new — trimmed to avoid overlap with §4 and §5)*

In addition to the licence restrictions in §4 and the acceptable-use obligations in §5, the host must not, and must not permit any user of its account to: (a) introduce viruses, malware, or other harmful code into the Service; (b) use automated means (scraping, bots) to extract data from the Service beyond the export tools StayKnit provides; or (c) probe, scan, or test the vulnerability of the Service, or breach or circumvent its security, without authorisation.

> **Counsel note (§14):** the founder draft also listed reverse-engineering, copying, and accessing other users' data — those are **already** covered by live §4 and §5, so I removed them here to prevent duplicative/conflicting drafting. Confirm nothing essential was lost.

### §15. Service availability *(new)*

StayKnit targets high availability but does not guarantee uninterrupted access. Planned maintenance will, where practicable, be scheduled outside peak hours and notified in advance. StayKnit is not liable for unavailability caused by factors outside its reasonable control, including outages at its hosting or database providers or at third-party listing sites.

> **Counsel note (§15):** accurate to the stack (Vercel hosting, Neon database, host-provided iCal feeds). Consistent with §6 (best-effort sync) and §7 (third-party listing sites).

### §16. Force majeure *(new)*

Neither party is liable for any failure or delay in performance caused by circumstances beyond its reasonable control, including fire, flood, war, pandemic, labour disputes, or the failure of a third-party service StayKnit relies on to deliver the Service (including hosting, database, payment, or listing-site providers). The affected party's obligations are suspended for the duration of the event and a reasonable period afterwards to resume normal operation.

### §17. Assignment *(new)*

The host may not assign or transfer its rights or obligations under these Terms without StayKnit's prior written consent. StayKnit may assign these Terms in connection with a merger, acquisition, reorganisation, or sale of substantially all of its assets, provided the assignee agrees to be bound by these Terms.

### §18. Governing law *(unchanged — renumbered from §12)*
### §19. Contact *(unchanged — renumbered from §13)*

---

## Part B — Schedule 1: Data Processing Terms *(new schedule, incorporated by reference)*

Incorporate by reference in the Terms (e.g. "the data processing terms in Schedule 1 form part of these Terms"). This addresses the operator/responsible-party question in `03-instructions-to-counsel.md` §B1: for **owner and guest data the host enters**, StayKnit is the **operator** on the host's documented instructions and the **host is the responsible party**; for **host account data**, StayKnit is the responsible party (per the Privacy Policy).

**1. Roles and scope.** This Schedule applies to StayKnit's processing of personal information the host enters into, or generates through use of, the Service concerning the host's owners and guests ("Customer Personal Information"). As between the parties, the host is the responsible party (controller) and StayKnit is the operator (processor), processing it only to provide the Service and on the host's documented instructions (including this Schedule and the host's configuration of the Service).

**2. Nature and purpose of processing.** StayKnit processes Customer Personal Information to: sync calendar availability across listing channels; display bookings; generate owner statements; and provide the owner portal. Data subjects are owners and guests as described in the Privacy Policy. No special personal information (POPIA) / special category data (GDPR) is intentionally processed.

**3. Sub-processors.** The host consents to StayKnit engaging the sub-processors disclosed in the Privacy Policy — currently **Vercel Inc.** (hosting/CDN/analytics), **Neon Inc.** (database), **Paystack Payments Limited** (payments), and **Namecheap Private Email** (transactional email). StayKnit will give at least **14 days' notice** before engaging or replacing a sub-processor and will keep an up-to-date list available to hosts. If a host reasonably objects on data-protection grounds, the parties will work in good faith to resolve it; failing resolution, either party may terminate the affected part of the Service with a pro-rata refund of any prepaid balance.

> **Counsel note (Sched. 1 §3):** the four names above match Privacy Policy §4 exactly. Note StayKnit uses **no channel/listing-site API** and holds no data-processing agreement with Airbnb/Booking.com/LekkerSlaap — see `09-channel-partner-data-processing.md`. Those sites are therefore **not** StayKnit sub-processors.

**4. Security measures.** StayKnit will maintain the technical and organisational measures in its Security & Safety Framework (`05-security-and-safety-framework.md`), including **per-tenant data scoping, hashed credentials, optional two-factor authentication, HTTPS/HSTS, and a documented data-retention and deletion process**. StayKnit may update these measures provided the overall level of security is not reduced.

> **Counsel note (Sched. 1 §4):** all measures listed are **implemented today** — per-account scoping, Better Auth password hashing, HttpOnly sessions, and 2FA (`app/2fa`, `components/two-factor-card.tsx`). Safe to represent.

**5. Assistance with data-subject requests.** Where StayKnit receives a request directly from an owner or guest to exercise a data-protection right, it will inform the host without undue delay and will not respond directly except on the host's documented instruction, unless required by law. StayKnit will provide reasonable assistance, including through the Service's self-service **export and deletion** tools (which exist today in Settings).

**6. Cross-border transfers.** The host acknowledges Customer Personal Information may be processed and stored outside South Africa by StayKnit's hosting and database sub-processors. StayKnit will ensure any such transfer is subject to appropriate safeguards — contractual terms consistent with **POPIA section 72** and, where applicable, the GDPR Chapter V transfer mechanisms — and will document the basis on request.

> **Counsel note (Sched. 1 §6):** ties to the open s72 question in `03-instructions-to-counsel.md` §B3. Vercel and Neon regions/data-residency should be confirmed and named here once counsel advises.

**7. Personal data breach notification.** If StayKnit becomes aware of a compromise affecting Customer Personal Information, it will notify the host without undue delay and in any event within **72 hours**, with the information reasonably available to enable the host to meet its own obligations (POPIA s22; GDPR Arts 33–34). StayKnit will document the compromise and response and provide it on request.

**8. Audit rights.** On at least **30 days'** written notice and no more than once a year (except after a compromise), the host may request evidence of compliance, which StayKnit may satisfy by a written summary of its measures, sub-processor certifications, or a remote/on-site audit during business hours at the host's cost, subject to confidentiality safeguards.

**9. Deletion or return on termination.** On termination, StayKnit will delete or (on request made before termination) export the host's Customer Personal Information, save for data it must retain by law or for legitimate backup, which will be protected and not actively used pending deletion in the ordinary course. This aligns with the **12-month inactivity auto-purge** and self-service deletion already in the app.

**10. Precedence.** This Schedule applies specifically to Customer Personal Information and does not alter StayKnit's role as responsible party for host account data, which remains governed by the Privacy Policy.

---

## Renumbering map (current live → proposed)

| Live now | Proposed |
| --- | --- |
| §1–§10 | unchanged |
| §11 Changes and termination | §11 (revised text above) |
| — | §12 Confidentiality (new) |
| — | §13 Intellectual property (new) |
| — | §14 Prohibited conduct (new) |
| — | §15 Service availability (new) |
| — | §16 Force majeure (new) |
| — | §17 Assignment (new) |
| §12 Governing law | §18 |
| §13 Contact | §19 |
| — | Schedule 1 — Data Processing Terms (new) |

> If counsel adopts these, the **in-app `/terms` copy and `lib/legal.ts` must be updated to match, and the Terms "last updated" date bumped.** Nothing here is live yet.

---

*This is general drafting to support a legal review, not legal advice. Every clause should be checked against current POPIA, GDPR, CPA, and ECTA requirements, and against StayKnit's actual practices, before publication.*
