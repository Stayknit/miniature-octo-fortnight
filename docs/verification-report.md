# StayKnit — Fix Verification Report

**Prepared by:** v0
**Date:** 16 September 2026
**Re:** Verification of the open items in `StayKnit-Fix-Report-for-v0` (P0 duplicate signup, P2 calendar year)

---

## Summary

Both open items in the fix report were verified against the running application and the live database. **Both are resolved.** No code changes were required to fix them; the only change made was removing a stale, unused demo-data file that was the likely source of the "2025" date seen in the report.

| Item | Report severity | Status | Evidence |
| --- | --- | --- | --- |
| Duplicate account signup | P0 | Resolved | DB `UNIQUE (email)` constraint + empirical sequential and concurrent tests |
| Calendar header wrong year (2025) | P2 | Resolved | Header derives from live `todayParts()`; reads 2026 |
| Dead `lib/demo-data.ts` (hardcoded 2025) | (found during review) | Removed | File deleted; confirmed zero imports |

---

## P0 — Duplicate account signup

### Acceptance criteria (from fix report)
Signing up twice with the same email must not create a second account, verified at the database level.

### Root cause of original issue
No uniqueness guarantee on `user.email`, allowing a second row for the same email.

### Current state — verified
- The `public.user` table has a `UNIQUE (email)` constraint.
- There are **0** duplicate emails in the database at time of testing.

### Test 1 — Sequential duplicate signup
Two sign-up requests submitted with the same email, one after the other.

- Request 1 → HTTP 200
- Request 2 → HTTP 200 (generic response, no email-enumeration leak)
- **Database result: exactly 1 row persisted** (the first signup only).

### Test 2 — Concurrent signup (race condition)
Five sign-up requests fired simultaneously with the same email, to prove the guarantee holds under a race rather than only in application logic.

- Exactly **1** request returned HTTP 200
- The other **4** were rejected with HTTP 422
- **Database result: exactly 1 row persisted** (in `public.user`; 0 in `neon_auth.user`).

### Conclusion
The uniqueness guarantee is enforced at the database level and holds under concurrent load. **P0 resolved.**

*(All throwaway `dup-test-*` and `race-test-*` accounts created during testing were deleted afterward.)*

---

## P2 — Calendar header showing the wrong year (2025)

### Current state — verified
The Calendar header derives its date from `todayParts()` in `lib/today.ts`, which computes the real current date in the `Africa/Johannesburg` timezone. The heading now reads the correct current year (2026), matching the system clock. The screenshot in the fix report was taken against an earlier deploy.

### Related cleanup
While tracing the "2025" value, `lib/demo-data.ts` was found to hardcode September 2025 bookings. It was **dead code** — nothing in the application imported it (verified by a project-wide search). Live account seeding uses the dynamic `todayParts()` anchor, so real accounts were never affected. The file has been deleted to prevent future confusion; a follow-up search confirmed zero remaining references and the project still type-checks.

### Conclusion
**P2 resolved.** No user-facing change was needed; the stale file was removed as housekeeping.

---

## Test methodology notes
- Signup tests hit the live Better Auth endpoint (`/api/auth/sign-up/email`) on the running app.
- Row counts were queried directly against the connected Neon Postgres database in both the `public` and `neon_auth` schemas.
- Constraint and duplicate checks were run against `pg_constraint` / `pg_indexes` and a `GROUP BY lower(email) HAVING count(*) > 1` query.
