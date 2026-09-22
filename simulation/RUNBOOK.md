# StayKnit — Full Simulation Runbook

Hand this file to Claude (or any agent/dev with repo access) to run a complete
functional, security, and compliance simulation of the StayKnit app.

The simulation is driven by one self-contained script:
`simulation/stayknit-protocol.mjs`. It documents what StayKnit **can** and
**cannot** do (the "protocol"), then probes a running instance to prove the
contract holds.

---

## Copy-paste prompt for Claude

> Run the StayKnit full simulation.
>
> 1. Make sure the app is running (dev server on `http://localhost:3000`, or use
>    a deployed URL with `--base`).
> 2. From the project root, run the commands in the "Commands" section below,
>    starting with the capabilities dump, then the full run with `--live-auth`.
> 3. Read the pass/fail summary. The run exits non-zero if any probe fails.
> 4. Report back: total passed/failed, any failing probe with its reason, and
>    whether the live-auth throwaway account was cleaned up.
> 5. Do NOT modify application code to make a probe pass. If a probe fails,
>    explain the real cause and propose a fix; wait for approval before changing
>    anything.
> 6. Never print real user emails or any secrets in your summary.

---

## Prerequisites

- Node 18+ and the project dependencies installed (`pnpm install`).
- The app running and reachable (local dev server, or a deployed URL).
- `DATABASE_URL` available. The script auto-loads it from
  `.env.development.local` if present; otherwise export it first. Without it,
  the database-integrity probes are skipped (everything else still runs).

---

## Commands

Run from the project root.

```bash
# 1. Print the CAN / CANNOT contract only — runs no probes, touches nothing.
node simulation/stayknit-protocol.mjs --capabilities

# 2. Safe run: read-only probes (routes, security headers, AI safety, DB integrity).
#    Writes nothing to the database.
node simulation/stayknit-protocol.mjs

# 3. FULL run: everything above PLUS live signup / enumeration checks.
#    Creates ONE throwaway @stayknit-sim.test account and deletes it before exit.
node simulation/stayknit-protocol.mjs --live-auth

# 4. Against a deployed domain (headers are only fully enforced in production):
node simulation/stayknit-protocol.mjs --base https://your-domain.example --live-auth

# 5. Machine-readable output for a downstream simulator / CI:
node simulation/stayknit-protocol.mjs --live-auth --json

# 6. Skip all direct-database assertions (HTTP-only environment):
node simulation/stayknit-protocol.mjs --no-db
```

Flags combine. Defaults are **safe**: no rows are written unless `--live-auth`
is passed, and any row the harness creates is deleted before it exits.

---

## What the simulation checks

**Functions (CAN) — reachability**
- All public routes serve: `/sign-in`, `/sign-up`, `/forgot-password`,
  `/reset-password`, `/terms`, `/privacy`, `/cookie-policy`.
- `/` redirects anonymous visitors to `/sign-in` (treated as reachable, not a
  failure).

**Security**
- No `X-Powered-By` header.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy` present.
- `Content-Security-Policy` is **enforcing** (not report-only) and allowlists
  Paystack.
- `X-Frame-Options: SAMEORIGIN`.
- Anonymous requests expose no workspace data.
- AI help assistant rejects empty input (400) and resists prompt injection
  (no system-prompt leak).

**Regulations / data integrity**
- `user.email` has a UNIQUE constraint; zero case-insensitive duplicate emails.
- Signup is session-less until email verification (no access while unverified).
- Signup and password-reset are **enumeration-safe** — a generic 200 whether or
  not the email exists (no account disclosure; POPIA-friendly).
- Exactly one user row results from repeated signups of the same email.

---

## Interpreting results

- **Exit code 0** and a line like `26 passed, 0 failed` — the contract holds.
- **Any `✗`** line names the probe and the reason it failed. Non-zero exit.
- A `~ skipped` line means a precondition was absent (e.g. no `DATABASE_URL`);
  it is not a failure.

### Known-good notes (not bugs)
- `GET /` returning `307 → /sign-in` is correct.
- The v0 chat preview strips framing/CSP headers so the app renders in the
  iframe; run against the **deployed** URL to confirm headers land in
  production.
- Signup requires an `Origin` header — the harness sends one to mimic a real
  browser (Better Auth rejects a missing/`null` origin with 403 by design).

---

## Safety guarantees

- Read-only by default; the only writes happen under `--live-auth` and are
  confined to a single `@stayknit-sim.test` account that is deleted before exit.
- No passwords are ever read or exported — they exist only as salted hashes and
  are unrecoverable by design.
- The script never prints real user data in its summary.
