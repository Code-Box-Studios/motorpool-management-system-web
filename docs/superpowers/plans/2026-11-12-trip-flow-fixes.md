# Trip Flow Fixes Implementation Plan

> **For agentic workers:** Use the independent domain briefs under `.lavish/trip-flow-fixes/`. The user approved the eight fixes in `.lavish/full-trip-flow-audit.md` by asking to fix them.

**Goal:** Close the eight reproduced audit defects without changing normal trip policy.

**Architecture:** Clear private browser state when authentication changes; keep trip claims and odometer chronology authoritative on the server; use safe employee response fields and Manila calendar dates. Keep completed-outing recovery reachable after cancellation.

**Tech Stack:** React, TanStack Query/Router, Express, Prisma, PostgreSQL, Vitest and Playwright.

**Spec:** `.lavish/full-trip-flow-audit.md`, findings F01–F08.

## Global Constraints

- Work directly on `main`. Preserve unrelated work and local data.
- No dependency upgrades, schema migration, production writes, commits or deployment required.
- Missing mileage must not block normal gate events.
- Students require guides; employees may omit guides.
- Preserve driver ownership, guard branch scope, locked gate events, and settled history.
- Only one database test process may use `mms_test` at a time.

## Review Focus

- A pending old-account request must not repopulate new-account private caches.
- Corrected provisional mileage must not lower later confirmed vehicle mileage.
- Manual vehicle edits must not permit a second open outing.
- Completed outings remain recoverable while cancelled outings reject mileage.
- Partial approval outages must remain visible without hiding successful sections.

## Tasks

1. **Backend lifecycle (F03/F04/F06):** add regression coverage in trip-ticket tests, fix open vehicle claims, provisional mileage correction and completed-outing authorization. Preserve current chronology and status guards. Parent runs database tests serially.
2. **Authentication cache (F01):** add browser regression; cancel and clear private requests/caches across logout, login identity changes and auth failure. Scope ticket/profile keys to identity or remount private providers reliably.
3. **Trip screen flow (F05/F07/F08):** add browser regression; format fuel dates in Manila, prioritize in-progress trips, render query errors and retry actions with successful partial data preserved. Expose completed-outing missing mileage on cancelled parent tickets in driver history.
4. **Guide response privacy (F02):** replace full employee guide embeds with a safe shared projection; test detail/list/create responses and retain guide rendering fields.
5. **Integration verification:** run the eight audit probes, complete API/workspace tests, trip-related browser tests, type checks, lint and production build. Review the full diff and address material findings.
6. **Handoff:** update the audit artifacts with fixed status and validation. Leave product changes local on `main`; report deployment status accurately.

## Progress

- [x] Root causes and all eight failing probes established during audit.
- [x] Backend lifecycle fixes and regression tests (29 targeted tests passed).
- [x] Authentication cache fix and regression tests (7 auth/login browser checks passed).
- [x] Trip screen fixes and regression tests (6 new flow checks and 6 history checks passed).
- [x] Guide response privacy fix and regression tests (23 guide tests passed).
- [x] Integrated verification and independent review: 904 workspace tests, 55 distinct browser checks, 8 original probes; build, types, lint and formatting pass. Both reviews clear.
