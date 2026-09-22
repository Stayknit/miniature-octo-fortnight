# StayKnit — Compliance Frameworks Overview (POPIA / GDPR / PCI-DSS)

**Purpose of this document:** a plain-language reference overview of the statutory frameworks most likely to apply to StayKnit, for internal reference and for scoping the conversation with counsel. It sits alongside the rest of the legal pack and does **not** replace `03-instructions-to-counsel.md` (which lists what we actually need drafted/advised).

> This is a founder-prepared reference overview, **not legal advice.** POPIA, GDPR, and PCI-DSS outcomes depend on StayKnit's actual data flows, contracts, and structure — counsel must advise on the specific facts before we rely on any of it. Compiled September 2026; folded into the pack 2026-09-22 from an external research brief.

> **Reconciliation note (read first).** The source brief characterised StayKnit as a *"vacation-rental calendar-sync company ... with guest and booking data moving between South Africa and other jurisdictions through channel-partner integrations,"* and treats cross-border channel-partner data flow as the dominant risk. That framing is broadly consistent with our product (`01-business-model.md` §1 — hosts list on Airbnb/Booking.com/LekkerSlaap and we sync calendars via iCal), **but it is wider than what we actually do.** Our exchange with listing sites is **calendar-oriented** (iCal in; a dates-only .ics feed out with **no guest PII** — see `07-operational-security-runbook.md`), not a full bidirectional channel-manager guest-data sync. Our largest concrete cross-border vector is **hosting infrastructure** (Neon/Vercel, AWS `us-east-1`, USA). Both vectors are put to counsel in `03-instructions-to-counsel.md` §B3.

---

## 1. Scope

StayKnit (Pty) Ltd is a South African SaaS product for short-stay/self-catering property managers whose listings sit on channels including Airbnb, Booking.com, and LekkerSlaap. Because personal information is hosted outside South Africa and calendar data is exchanged with channels, more than one legal framework is potentially relevant. This overview summarises the three most likely — POPIA, GDPR, and PCI-DSS — plus channel-partner terms.

## 2. POPIA — Protection of Personal Information Act 4 of 2013 (South Africa)

Primary SA data-protection statute, fully enforceable since 1 July 2021, administered by the Information Regulator. Applies to any *responsible party* domiciled in South Africa (or using means within the Republic). Unlike GDPR, POPIA also protects **juristic persons** (companies), not only natural persons.

### 2.1 Eight conditions for lawful processing
Accountability · Processing limitation · Purpose specification · Further-processing limitation · Information quality · Openness · Security safeguards · Data-subject participation.

### 2.2 Information Officer
Every responsible party has an Information Officer by operation of law (the head of the company by default), who **must be registered with the Information Regulator** via its eServices portal before taking up duties. A **PAIA manual** has been compulsory for every private body since 1 January 2022.

### 2.3 Cross-border transfers (Section 72)
Sending personal information to a recipient in a foreign country is prohibited unless a gateway applies: an adequate-protection agreement (e.g. SCC-style binding contractual clauses), the data subject's consent, or contractual necessity. South Africa publishes **no adequacy whitelist**, so the adequacy assessment is a documented self-assessment. **Relevant to StayKnit via two vectors — hosting infrastructure (USA) and any listing-site data exchange** — see the reconciliation note above and `03-instructions-to-counsel.md` §B3.

### 2.4 Security compromises (Section 22)
On reasonable grounds to believe personal information was accessed/acquired by an unauthorised person, the responsible party must notify the Regulator and affected data subjects. **Operators must notify the responsible party immediately on suspicion** — this belongs in every vendor/operator contract.

### 2.5 Enforcement
Administrative fines up to **R10 million per infringement**; some offences carry up to 10 years' imprisonment. The Regulator has acted against government departments, Dis-Chem, FT Rams Consulting, and WhatsApp LLC (settled November 2025), with activity intensifying through FY2026–2027.

## 3. GDPR — General Data Protection Regulation (EU/UK guests)

Potentially applies **only if** bookings involve EU/UK travellers. Requires a lawful basis; grants access/correction/erasure/portability/objection rights; protects **natural persons only**. The EU has **no adequacy decision for South Africa**, so EU→SA transfers need a separate **Article 46** safeguard (typically SCCs). A GDPR programme is a starting point for POPIA but not a substitute — IO registration, PAIA manual, juristic-person coverage, and s72 triggers are POPIA-specific. *(For StayKnit this hinges on whether we knowingly serve EU/UK guests — see `03-instructions-to-counsel.md` §E1; if not, counsel may scope it out.)*

## 4. PCI-DSS considerations

Applies if card data is processed. **Scope is significantly reduced when card data is fully delegated to a PCI-DSS-compliant processor and never touches StayKnit servers or logs in raw form** — which is our position: **Paystack** handles card entry; we store only a payment reference/status and, for opted-in auto-renewal, an opaque Paystack authorisation token (not a card number). See `01-business-model.md` §4 and `02-data-and-privacy-popia.md`.

## 5. Channel-partner terms

Each integrated channel (Airbnb, Booking.com, LekkerSlaap) carries its own API/partner agreement with independent data-handling and usage clauses, separate from statutory obligations. These should be reviewed **alongside** POPIA/GDPR, not instead of them — and counsel should advise (per §B3) whether they place any s72 obligation on StayKnit or on the host.

## 6. Compliance checklist

Status key: ✅ done · ⚠️ in progress / partly done · ⛔ owner/counsel action outstanding. Statuses are self-assessed against the current pack and are **subject to counsel's confirmation**.

| Item | Framework | Status | Where / note |
|------|-----------|--------|--------------|
| Registered Information Officer with the Information Regulator | POPIA | ⛔ | Owner action — flagged in `03-instructions-to-counsel.md` §B5. |
| PAIA manual adopted and published | POPIA | ⛔ | Compulsory since 1 Jan 2022; owner/counsel action (§B5). |
| Written operator/processor agreements with all vendors (hosting, payments, etc.) | POPIA | ⚠️ | Paystack named as sub-operator; Neon/Vercel/SMTP DPAs to confirm — `02` + `03` §B1/B3. |
| Section 72 cross-border basis documented for each vector/channel | POPIA | ⚠️ | Hosting (USA) documented in `02`/`07`; listing-site vector put to counsel (§B3b). |
| Privacy policy discloses purpose, retention, and data-subject rights | POPIA / GDPR | ⚠️ | Draft in-app copy exists (`04-current-inapp-legal-copy.md`); counsel to make enforceable. |
| Lawful basis identified for processing EU/UK guest data | GDPR | ⛔ | Depends on whether we serve EU/UK guests — `03` §E1. |
| Article 46 safeguard for EU→SA data flows | GDPR | ⛔ | Only if GDPR applies (§E1). |
| Card/payment data delegated to a PCI-DSS-compliant processor | PCI-DSS | ✅ | Paystack; StayKnit stores no raw card data (§4 above, `01` §4). |
| Breach/incident response plan naming the Information Officer | POPIA §22 | ⚠️ | Runbook covers incident response (`07`); IO name pending registration. |
| Direct-marketing consent captured per POPIA §69 (opt-in) | POPIA | ⚠️ | Only relevant if we send marketing email; confirm consent is opt-in (counsel to advise). |

## 7. Recommended next step

A South African attorney with a dedicated data-protection/technology-law practice should review the points above against StayKnit's **real** privacy policy, terms of service, data flows, and channel-partner agreements. This overview is a scoping aid for that review — the actionable asks are in `03-instructions-to-counsel.md`.

---

### Related documents
- `01-business-model.md` — product, users, revenue, pricing.
- `02-data-and-privacy-popia.md` — personal-information inventory, hosting, retention, security.
- `03-instructions-to-counsel.md` — what we need drafted and advised (the actionable list).
- `04-current-inapp-legal-copy.md` — current in-app Terms/Privacy/Cookie copy to make enforceable.
- `05-security-and-safety-framework.md` · `06-audit-findings.md` · `07-operational-security-runbook.md`.
