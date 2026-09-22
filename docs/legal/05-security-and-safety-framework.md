# StayKnit — Security & Safety Framework

**Purpose:** to give counsel (and, where appropriate, prospective customers) an accurate, non-overstated description of the technical and organisational measures StayKnit uses to protect personal information and keep the Service safe to use. It is the factual basis for the "how we protect your information" section of the Privacy Policy, for any security representations in the Terms of Service, and for POPIA's requirement (section 19) to take reasonable technical and organisational measures.

> Founder-prepared and grounded in the actual application, database schema, and independently verified live-domain configuration. Descriptions are of measures **already implemented** unless explicitly marked *planned* or *to formalise*. Counsel should phrase these as reasonable measures, not guarantees.

---

## 1. Scope and approach

StayKnit is a single web application with a managed PostgreSQL database. There is no separate mobile app, no self-hosted server estate, and no handling of card data. The security model therefore rests on four pillars: **strong authentication**, **strict per-tenant data isolation**, **hardened transport/platform configuration**, and **data minimisation with automatic deletion**. Each is described below with the residual gaps we know we still need to formalise (section 9).

## 2. Identity & access management

- **Email verification is mandatory.** A newly registered host account is not fully active until the email address is confirmed. This prevents drive-by account creation against other people's addresses. Verification and password-reset messages only report "sent" to the user when the mail server has actually accepted the message; a genuine send failure is surfaced honestly rather than sending the user to an empty inbox.
- **Passwords are hashed, never stored in plaintext.** Authentication is handled by Better Auth; password hashes are stored, and the plaintext is never persisted or logged.
- **Security-question answers are also hashed.** Because no email-delivery provider is relied upon for reset, identity-verification answers used for password recovery are stored hashed, not in clear text.
- **Two-factor authentication (TOTP).** A second factor uses a standard authenticator app (Google Authenticator, Authy, 1Password, etc.). It is **optional for all accounts — hosts and owners alike — but recommended by StayKnit**, and is offered and encouraged from Settings. When a user enables it, a correct password alone is no longer enough to sign in; a time-based one-time code is also required. This is a genuine second factor enforced at sign-in, not a cosmetic setting. Enrolment is confirmed with a live code before it takes effect, and each user is issued single-use **backup codes** for device loss. Anyone who loses both their device and their backup codes can recover by answering their **security questions** (which also clears 2FA so they can re-enrol).
- **Sessions use HttpOnly cookies** with secure attributes, reducing exposure to client-side script theft (XSS) and CSRF, and sessions are tracked with IP and user-agent for anomaly visibility.

## 3. Tenant isolation & authorisation

- **Per-user scoping on every record.** Every data row is tied to a `userId`, and queries are filtered by the authenticated user so that one host can never read or modify another host's data. This is enforced in application code on the Neon database (there is no shared multi-tenant table a host can escape).
- **Owner portals are cryptographically token-scoped and read-only.** An owner sees **only** the specific units assigned to them, via a scoped token, and cannot write to any record.
- **Owner-portal invitations are revocable and time-stamped.** Each invite carries explicit `acceptedAt` / `revokedAt` timestamps, so access can be withdrawn and the history is auditable.

## 4. Application & transport security

- **HTTPS is enforced with HSTS** on the live domain, so browsers refuse to downgrade to plaintext.
- **A strict Content-Security-Policy** and standard security response headers (e.g. `X-Content-Type-Options: nosniff`, `Referrer-Policy`, framing restrictions) are set on the live domain.
- **Single canonical host.** `www.stayknit.org` is the one canonical origin. The bare apex (`stayknit.org`) issues a permanent (308) redirect to it at the platform level, and the auto-generated `*.vercel.app` deployment URL is both redirected in production and marked `X-Robots-Tag: noindex, nofollow`, so the app is served and indexed under a single controlled domain. This keeps session cookies and all emailed links (verification, password-reset, receipts) on one origin.
- **Independently verified.** The above transport, redirect, and header configuration has been checked against the live domain rather than only asserted.

## 5. Payment security

- **StayKnit stores no card numbers.** Card entry and processing are handled entirely by **Paystack**, a PCI-DSS-compliant South African gateway. StayKnit persists only a payment/subscription reference and the resulting plan status.
- **No card data ever transits StayKnit's own servers**, which removes StayKnit from most of PCI-DSS scope. Counsel/compliance to confirm the correct SAQ level with the gateway.

## 6. Data protection, retention & deletion

- **Data minimisation.** StayKnit deliberately collects little: host account details, host-entered owner records, and guest **name + stay dates** only (no guest contact details, ID numbers, or payment data).
- **Automatic inactivity purge.** A host profile left untouched for **12 months** is deleted automatically; the last-active timestamp refreshes on every workspace load.
- **Cascade deletion.** When a user is deleted, linked sessions and accounts are removed automatically via foreign-key cascade.
- **Self-service export and deletion.** Hosts can export or permanently delete their data from Settings at any time; deletion is irreversible.

## 7. Infrastructure & sub-processors

| Layer | Provider | Security relevance |
|-------|----------|--------------------|
| Application hosting / CDN | Vercel | Managed platform; TLS termination, edge delivery. |
| Database | Neon (managed PostgreSQL) | Primary store; managed backups and encryption at rest are provider-managed *(exact posture to confirm with Neon)*. |
| Authentication | Better Auth (in-app, data in Neon) | Hashing, session management. |
| Payments | Paystack | PCI-DSS gateway; card data never reaches StayKnit. |
| Outbound email | Namecheap Private Email (SMTP, `mail.privateemail.com`) | Verification, password-reset & notification delivery from `stayknit.org` mailboxes. Deliverability: SPF, DKIM, and DMARC are all published for the domain and were verified live in DNS on 20 Sep 2026 (DKIM via the Namecheap Private Email `privateemail._domainkey` selector; DMARC currently `p=none`, i.e. monitoring only). A live SMTP self-test and a send test are available to the owner from the in-app Support → Email panel. |

> **Counsel note:** each of these is a candidate sub-operator under POPIA. See the POPIA briefing for the operator-agreement question.

## 8. Availability & operational safety

- **Calendar sync is best-effort by design.** StayKnit reads third-party iCal feeds on their publishers' schedules; it cannot guarantee real-time accuracy and is not the system of record for bookings. Hosts are told to reconcile statement/payout figures against channel payouts before paying owners. This is a **safety-by-disclosure** measure and is reflected in the Terms.
- **No handling of guest or owner money**, which removes an entire class of financial-fraud and settlement risk from the product.

## 9. Operational measures — now documented

The organisational (non-code) measures below were previously listed here as gaps. They are now written up in **`07-operational-security-runbook.md`**, which defines the procedure, the responsible person, and timelines for each. Several values in that runbook still need to be confirmed from provider dashboards (marked **[confirm]**) and filled in before launch:

- **Incident & data-breach response procedure** — including POPIA section 22 notification to the Information Regulator and affected data subjects, with severity triage, defined timelines, and a named Incident Lead. *(Runbook §1.)*
- **Backup / restore / disaster-recovery** — Neon point-in-time restore, restore procedure, and a required pre-launch test restore; exact retention window to confirm. *(Runbook §2.)*
- **Encryption-at-rest & cross-border data-location posture** — TLS in transit (verified), provider encryption at rest, and the POPIA section 72 basis via provider DPAs; exact regions to confirm. *(Runbook §3.)*
- **Access-review / secrets-rotation practice** — least-privilege dashboard access with a 6-monthly review, and a 12-monthly (or on-trigger) rotation schedule for `BETTER_AUTH_SECRET`, `PAYSTACK_SECRET_KEY`, `SMTP_PASSWORD`, and DB credentials. *(Runbook §4.)*
- **Data-subject-request workflow** — a documented DSAR process (access, correction, deletion) that routes host vs owner/guest requests correctly, beyond the existing self-service tools. *(Runbook §5.)*

> **Counsel note:** please advise which of the items in the runbook are legally required before launch versus advisable, and whether any security representations here should be softened or qualified in the customer-facing Terms and Privacy Policy.
