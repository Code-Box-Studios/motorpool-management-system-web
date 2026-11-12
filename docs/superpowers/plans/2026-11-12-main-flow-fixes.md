# Main Flow Fixes Implementation Plan

> **For agentic workers:** Implement the bounded tasks below using systematic debugging and test-first verification. The user approved all five reproduced problem areas by asking to fix them. Work directly on main; no confirmation, branch, worktree, commit, push or deployment is needed.

**Goal:** Close FLOW-01 through FLOW-05 while preserving every prior uncommitted fix.

**Architecture:** Atomically claim repair approvals, retain failed modal submissions, refresh dependent maintenance caches, align booking choices with server scheduling policy, and make tool return intent produce a coherent condition.

**Tech Stack:** React, TanStack Query/Router, Express, Prisma/PostgreSQL, Vitest, Playwright.

**Spec:** `.lavish/flow-reaudit/main-flow-review.json` and the retained reproduction evidence beside it.

## Global Constraints

- Keep main and preserve all existing source changes, environment files and data.
- Use only mms_test for API tests, one DB test process at a time.
- Browser probes may write only task-owned records in the existing mms_fix clone; prefer intercepted business mutations for recovery tests.
- Keep gate branch/driver ownership checks, missing-reading behavior, completed/cancelled history, archive policies and actual dispatch repair holds.
- No schema change or dependency is expected. Do not apply migrations to the original development or production database.
- Freeze product edits before final browser verification; builds and hot reloads must finish before the browser run.

## Review Focus

- A stale or repeated repair approval must never reopen a repaired/deleted order or emit a duplicate approval event.
- Failed repair retries must preserve dates, mechanic, part quantities, odometer, maintenance type, service location and remarks; successful submits close once.
- Maintenance create/update/delete must refresh every cached scoring algorithm and the changed detail record, without hiding mutation errors.
- Future vehicle choices must honor existing reservation checks and out-of-service exclusions; gate safety holds remain authoritative.
- Returning a borrowed tool must clear its loan/dates and show a non-borrowed condition. A chosen maintenance/out-of-service condition must survive.

## Tasks

- [x] FLOW-01: maintained delayed-approval/concurrent-approval regressions; conditional state claim and coordinated deletion/completion behavior.
- [x] FLOW-02: maintained browser retry regressions; asynchronous success/failure ownership for Note and Complete Repair modals, preserving Cancel behavior.
- [x] FLOW-04: maintained create/edit picker regressions; date-aware bookable choices consistent with API scheduling policy.
- [x] FLOW-03: maintained create/update/delete cache regressions; list/detail and analytics invalidation.
- [x] FLOW-05: maintained normal/damaged/out-of-service return regressions; coherent return intent with explicit condition feedback.
- [x] Independent code review, targeted checks, complete workspace/browser verification, types, lint, formatting, build and updated evidence report.
