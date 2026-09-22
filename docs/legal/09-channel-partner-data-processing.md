# StayKnit — Channel-Partner Data-Processing & API Terms

**Purpose:** counsel (and StayKnit's own reviewing attorney) asked for *"data-processing arrangements with the channel partners, including the API terms."* This memo answers that request directly. Its most important message is a factual correction, because the honest answer changes what there is to review.

> Founder-prepared, factual — **not** legal advice. Prepared 2026-09-22 to accompany `03-instructions-to-counsel.md`. Read alongside `01-business-model.md` §1–§3, `02-data-and-privacy-popia.md` §4/§7, and `08-compliance-frameworks-overview.md` §5.

---

## 1. The headline: there are no channel-partner API agreements or DPAs to hand over

StayKnit does **not** hold — and has never signed — an API agreement, partner/connectivity agreement, or data-processing agreement (DPA) with Airbnb, Booking.com, LekkerSlaap, or any other listing site. **None exist**, so none can be attached.

This is not an oversight; it is a consequence of how the product actually works. StayKnit does **not** connect to any channel's private/partner API. It exchanges only **iCal calendar data** using links the **host** supplies:

- **Inbound (read-only):** the host pastes the **public iCal export URL** that their own channel account exposes (Airbnb "Export calendar", Booking.com "Sync calendars", LekkerSlaap's equivalent). StayKnit periodically fetches that URL over HTTPS and reads the busy/available dates. StayKnit sends the channel **nothing** and authenticates to the channel with **nothing** — no API key, no OAuth token, no partner credential, no host password. It is the same public link any calendar app could read.
- **Outbound (dates only, no guest PII):** StayKnit publishes a **.ics feed** the host can paste back into a channel to block dates. That feed carries **availability/dates only and no guest personal information** (see `07-operational-security-runbook.md` and `08-compliance-frameworks-overview.md` §5).

So the integration is a one-way-per-direction **iCal file exchange over public links**, not an API partnership with a data-sharing contract behind it.

## 2. Why this matters legally (please confirm)

Because there is no API partnership:

1. **StayKnit is not a party to any channel agreement.** The entity that holds the Airbnb / Booking.com / LekkerSlaap account, agrees to that channel's terms, and is bound by its data rules is the **host**, not StayKnit. StayKnit never sees or accepts those terms.
2. **The only data StayKnit receives from a channel is what a public iCal feed carries** — principally dates/availability, and depending on the platform a guest display-name or booking reference. StayKnit does not receive guest contact details, ID numbers, or payment data from any channel (`02-data-and-privacy-popia.md` §2c).
3. **We believe no DPA between StayKnit and the channels is required**, precisely because there is no controller-to-processor or processor-to-sub-processor relationship between StayKnit and the channels — but we ask counsel to confirm this characterisation rather than assume it.

This also corrects the framing in the external research brief folded into `08` (and flagged there in its reconciliation note): StayKnit is **not** a full "channel manager" moving bidirectional guest data through partner APIs. Counsel should advise on the narrower iCal reality, not the broader assumption.

## 3. What counsel may actually want to review

The reviewable material is **not** StayKnit-to-channel contracts (there are none). It is:

- **(a) Each channel's own public terms**, which bind the **host** and govern whether the host may export their calendar to a third-party tool like StayKnit. These are the documents to check for any restriction on third-party iCal use:
  - **Airbnb** — Terms of Service and Privacy Policy; calendar sync via the account's public iCal export link.
  - **Booking.com** — partner/Extranet terms and Privacy Statement; calendar sync via the "Sync calendars" iCal link.
  - **LekkerSlaap** — site terms and privacy notice; calendar sync via its iCal export.
  > We have deliberately **not** pasted deep-link URLs here, because these terms change and each host reaches the current version from inside their own channel account. If counsel wants the exact current text of any one, we will retrieve it from a live host account on request.
- **(b) StayKnit's own Terms §7 ("Third-party listing sites")** and §1 ("What StayKnit does") in `04-current-inapp-legal-copy.md`, which already state that these sites are independent, that StayKnit only reads host-provided feeds, and that the host must have the right to sync the listings they connect. Counsel is asked (Terms §7 counsel-note) to confirm that disclaimer is adequate.
- **(c) The s72 cross-border question** for the listing-site vector, already put to counsel in `03-instructions-to-counsel.md` §B3(b).

## 4. What StayKnit *can* provide if counsel needs more

- A live demonstration or screenshots of the host "connect a calendar" flow showing that only a public iCal URL is entered (no login to the channel, no API key).
- The exact fields our sync stores per booking (`02-data-and-privacy-popia.md` §2c).
- A sample of the outbound `.ics` feed to confirm it contains dates only and no guest PII.
- The current public terms text of any specific channel, retrieved from a live host account.

## 5. The three items requested by the reviewing lawyers — where each lives

| Requested item | Status | Where |
|----------------|--------|-------|
| 1. Current **Privacy Policy** | ✅ Draft exists, review-ready | `04-current-inapp-legal-copy.md` → "PRIVACY POLICY" (live at `/privacy`) |
| 2. **Terms of Service** | ✅ Draft exists, review-ready | `04-current-inapp-legal-copy.md` → "TERMS OF SERVICE" (live at `/terms`) |
| 3. **Data-processing arrangements with channel partners, incl. API terms** | ⚠️ **None exist** — see this memo | This document (`09`); factual basis in `01` §1, `02` §4/§7, `08` §5 |

---

### Related documents
- `01-business-model.md` §1–§3 — what StayKnit is; the host/owner/guest structure; no money or guest data touched.
- `02-data-and-privacy-popia.md` §2c, §4, §7 — guest-data inventory, hosting/data flows, sub-processors.
- `03-instructions-to-counsel.md` §B3(b) — the s72 listing-site cross-border question.
- `08-compliance-frameworks-overview.md` §5 — channel-partner terms in the compliance overview.
