# StayKnit — Data Processing & POPIA Briefing

**Purpose:** to give counsel a precise inventory of the personal information StayKnit collects, why, where it lives, and who else touches it — the raw material for a POPIA-compliant Privacy Policy and for deciding what data agreements are needed.

> Prepared by the founder from the actual database schema and code. Descriptions are factual; the legal characterisation (responsible party vs operator, lawful basis, etc.) is for counsel.

---

## 1. The three data subjects

StayKnit handles personal information about three different kinds of people, and they are **not** all our customers:

1. **Hosts** — our direct customers. They give us their data by signing up.
2. **Owners** — the host's clients. Their details are entered **by the host**, and they may be invited to a read-only portal.
3. **Guests** — travellers. Their names and stay dates are **imported from third-party listing sites** (via calendar feeds) or entered by the host. Guests have **no relationship with StayKnit** and do not know StayKnit exists.

> **Key POPIA question for counsel:** For host account data, StayKnit is plainly the responsible party. But for **owner and guest** data — which the host puts into the system to run *their* business — is StayKnit an **operator** (processor) acting on the host's behalf, with the **host** as responsible party? This determines whether we need an **operator agreement** baked into the Terms, and who owes the data-subject notifications.

## 2. Personal information inventory

### 2a. Host (account holder) data
| Data | Purpose | Source |
|------|---------|--------|
| Name | Account identity, statements | Host at signup |
| Email address | Login, account comms, verification | Host at signup |
| Password (hashed) | Authentication | Host; stored hashed (never plain text) |
| Security-question answers (hashed) | Additional identity check for password reset | Host; stored hashed |
| Session data — IP address, user-agent | Session management, security | Captured automatically on login |
| Last-active timestamp | Inactivity cleanup (see retention) | Automatic |
| Business name, business email, business phone | Printed on owner statements | Host in settings |
| Subscription & payment reference | Billing, plan status | Payment gateway + host |

### 2b. Owner (host's client) data
| Data | Purpose | Source |
|------|---------|--------|
| Name | Identify the owner on statements & portal | Entered by host |
| Email address | Owner-portal invitations | Entered by host |
| Which units they own, financial figures (gross, commission, cleaning, net) | Generate owner statements | Entered/derived by host |

### 2c. Guest data
| Data | Purpose | Source |
|------|---------|--------|
| Guest name | Show who is booked in a reservation | Imported from listing-site iCal feeds, or entered by host |
| Stay dates, channel, amount, paid status | Calendar sync, booking records, statements | Imported / entered by host |

> Note: StayKnit does **not** collect guest contact details, ID numbers, or payment details. Guest data is limited to what a calendar feed carries (typically a name and dates). Counsel should confirm whether even this limited guest data triggers notification duties, given guests are unaware of StayKnit.

### 2d. Purpose limitation — internal support use only
All personal information above is used **only internally, to operate the service and provide account support** to the host (authentication, billing, generating statements, responding to help requests, and security). StayKnit does **not** sell personal information, and does **not** share or use it for marketing, advertising, or profiling. This purpose limitation is surfaced to hosts at signup ("Your personal details are used internally for account support only — never sold or shared for marketing") and should be reflected in the Privacy Policy so the stated purpose matches actual practice.

## 3. Special personal information / children
- StayKnit does **not** intentionally collect any **special personal information** under POPIA (race, health, religion, biometrics, etc.).
- StayKnit is a **business tool** not directed at children and does not knowingly collect children's data.
- Counsel to confirm the Privacy Policy states both clearly.

## 4. Where the data lives (hosting & data flows)

| Component | Provider | Location | Notes |
|-----------|----------|----------|-------|
| Application hosting | **Vercel** | Global edge / US regions | Serves the web app. |
| Database (all app + account data) | **Neon** (managed PostgreSQL) | **AWS us-east-1 (USA)** | Primary store of all personal information above. |
| Staging database copy | **Neon** (same project, branched from production) | **AWS us-east-1 (USA)** | A pre-production **staging** branch holds a copy of real personal data for safe testing. Same provider and region as production (no new cross-border transfer, no new sub-processor). Access-restricted to the operator; outbound email disabled and payments TEST-only in staging so the copy can never reach data subjects. See `07-operational-security-runbook.md` §7. |
| Authentication | **Better Auth** (self-hosted in our app, data in the Neon DB) | With the database | Passwords hashed; sessions stored. |
| Payments | **Paystack** (live) | South Africa | Card data handled by gateway; we store only a reference. |
| Outbound email | **Namecheap Private Email** (SMTP) | USA / global | Used for verification and notifications (primary + support mailboxes). |
| Calendar feeds | Third-party listing sites (Airbnb, Booking.com, LekkerSlaap, etc.) | External | **Inbound** iCal — we read their feeds; we do not send them data. |

> **Cross-border transfer flag for counsel:** the database (Neon, **AWS us-east-1, USA**), app hosting (Vercel), and outbound email (Namecheap Private Email) are **outside South Africa**. POPIA section 72 restricts transferring personal information outside the Republic. Counsel must advise whether our hosting arrangement satisfies section 72 (e.g. the recipient is subject to comparable protection / binding contractual terms) and how to word this in the Privacy Policy.

## 5. Data retention & deletion (already built)

- **Automatic inactivity purge:** a host profile untouched for **12 months** is automatically deleted (the code sweeps inactive profiles). The last-active timestamp refreshes on every workspace load.
- **Cascade deletion:** sessions and linked accounts are deleted automatically when a user is deleted (foreign-key cascade).
- **Owner-portal invites** carry explicit `revokedAt` / `acceptedAt` timestamps and are scoped to named units only.
- **Staging copy.** A pre-production staging database branch holds a copy of production personal data for testing (see §4 and runbook §7). It is refreshed by re-branching from production rather than kept as an indefinite parallel store, is access-restricted to the operator, and inherits the same deletion posture (a purge or on-request deletion on production is reflected in staging at the next re-branch). Counsel to advise whether a test-data copy of this kind needs any additional treatment (e.g. sanitisation) beyond the equivalent access controls we apply.
- Counsel to advise: does 12-month auto-purge, plus an on-request deletion route, satisfy POPIA's retention and data-subject-request obligations? Do we need a documented **data-subject request** process (access, correction, deletion) in the Privacy Policy?

## 6. Security measures (already built) — for accurate description in the policy

- Passwords and security-question answers are **hashed**, never stored in plain text.
- **Email verification** is required before an account is active.
- Per-user data scoping: every record is tied to a `userId`; queries are filtered so one host can never read another's data. Owner portals are cryptographically scoped by token to named units only.
- Enforced **HTTPS with HSTS**, a strict Content-Security-Policy, and standard security response headers on the live domain (independently verified).

> These are provided so the Privacy Policy's "how we protect your information" section is accurate and not overstated. Counsel should phrase them as reasonable measures, not guarantees.

## 7. Third-party processors (sub-operators) to disclose
Vercel (hosting), Neon (database), Paystack (payments), Namecheap Private Email (outbound email), and the listing sites whose calendar feeds we read. Counsel to confirm which must be named in the Privacy Policy and whether operator agreements with each are needed.

## 8. Open questions are consolidated in `03-instructions-to-counsel.md`.
