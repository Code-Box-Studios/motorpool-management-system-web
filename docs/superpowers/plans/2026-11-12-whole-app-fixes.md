# Whole-App Audit Fixes Implementation Plan

> **For agentic workers:** Execute the independent domain briefs under `.lavish/app-fixes/`. The user approved the audit's twelve recommended fixes by asking to fix them.

**Goal:** Close APP-01 through APP-12 without regressing the previous trip, participant, history and account-cache fixes.

**Architecture:** Protect authority and private response fields on the server; serialize physical vehicle/stock claims; attribute identified tracker packets using current assignment; derive maintenance deadlines from recorded service/configuration; preserve form intent and show recoverable errors.

**Tech Stack:** React, TanStack Query/Router, Express, Prisma/PostgreSQL, GPS gateway, Vitest, Playwright.

**Spec:** `.lavish/app-audit/whole-app-flow-audit.md` and `audit-findings.json`.

## Global Constraints

- Work directly on main. Preserve all prior uncommitted changes and existing data.
- No deployment, push or commit is requested in this fix pass.
- Database tests use mms_test, one process at a time. Browser/gateway writes use only the task-owned clone in app-audit/runtime-lab.json.
- Never write production or original mms data. Apply new migrations only to dedicated test and task-owned clone databases.
- Keep guard branch scope, driver ownership, missing-reading gate behavior, archive history and default Apriori semantics.
- No new dependencies are required.

## Review Focus

- Old credentials cannot retain authority after disable, demotion, branch change or password reset; ordinary profile edits preserve valid sessions.
- Private driver fields never escape through a list, detail or embedded response.
- Repeated repair requests issue stock once; conflicting physical vehicle claims serialize.
- Metadata-only stock updates never reset quantity. Explicit quantity changes must compare an expected revision.
- Tracker reassignment/deactivation is authoritative at ingest, even with a stale gateway cache.
- Due dates do not improve without recorded service; missing service data stays unknown.
- Cancel discards edits, failed saves explain recovery, and cleared optional inputs remain unknown.

## Tasks

- [x] APP-01/02: safe driver projections; current account authority and credential-version revocation; regression coverage.
- [x] APP-03/04/05/08: atomic repair noting/part aggregation, workshop dispatch hold, authoritative tracker attribution; regressions and real gateway replay.
- [x] APP-06: dirty-field stock saves plus expectedUpdatedAt revision checks and detail cache invalidation.
- [x] APP-07: actual service/configured deadline data and non-rolling preventive status.
- [x] APP-09: shared effective office/branch validation and compatible organization form choices.
- [x] APP-10/11/12: blank optional number normalization, visible save errors and true form cancellation.
- [x] Promote the five corrected stale browser cases into maintained tests without weakening behavioral coverage.
- [x] Run focused regressions, complete workspace/browser checks, type checks, lint, formatting and build; independent reviews and final evidence.
