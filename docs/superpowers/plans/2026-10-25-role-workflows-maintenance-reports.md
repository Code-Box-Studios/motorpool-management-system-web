# Role Workflows, Maintenance, CSV, and Reports Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. Independent subsystems may run in parallel under superpowers:dispatching-parallel-agents.

**Goal:** Deliver all approved role workflow, model selection, organization CSV, and reporting changes, including GPS-based fuel estimation.

**Architecture:** Extend the current shared Zod contracts, Express modules, Prisma records, and React pages. Trip dates remain the unit for odometer reporting; fuel allocation history remains ticket-based to avoid double-counting multi-outing allocations. Reports use server-side complete queries and consistent screen/export data.

**Tech Stack:** TypeScript, React, TanStack Query/Router, Express, Zod, Prisma, PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-role-workflows-maintenance-reports-design.md`

## Global Constraints

- Stay on `main`; no branches, worktrees, commits, or pushes.
- Preserve pre-existing Random Forest and feature-extraction changes.
- Guard QR transitions work without driver readings. Missing readings remain null.
- Never substitute rule-based scores for selected predictive models; preventive rules remain.
- Logistic Regression stays unavailable until its complete pipeline is supplied.
- API integration tests use `mms_test`; serialize all database test runs through the coordinator.
- Report dates use Asia/Manila. CSV, print, and screen share selected filters.
- Browser verification must cover desktop/mobile, Escape/cancel, focus restoration, and exports.

## Review Focus

- Multi-outing tickets: independent gate readings, one fuel allocation counted once.
- Late driver readings: preserve assignment authorization and monotonic vehicle mileage.
- Model identity: selected algorithm drives the score; unavailable models fail clearly.
- CSV identity: duplicate names remain distinct; invalid imports write nothing.
- GPS coverage: gaps and zero distances cannot create misleading fuel estimates.

## Task 1: Trip/requester/driver/guard workflows and schema

**Files:** trip-tickets page components, hooks/API mappings, shared trip contracts, API trip module, Prisma schema and additive migration, matching API/browser tests.

**Produces:** driver reading endpoint `POST /api/trip-tickets/:id/dates/:dateId/odometer` with `{phase:'before'|'after', mileage:number}`; nullable existing TripDate startMileage/endMileage plus startMileageRecordedById/startMileageRecordedAt/endMileageRecordedById/endMileageRecordedAt; QR-only gate actions. Also add nullable JobOrder `maintenanceType` using MaintenanceType and `serviceLocation` using a motorpool/outside enum for Task 4. This task owns Prisma schema/migrations to avoid concurrent edits.

- [x] Write failing trip tests for QR transitions with no readings, driver-only entry, late readings, decreasing/contradictory readings, and duplicate scans.
- [x] Restore separate departure/return calendar dates in every outing; validate and map overnight spans.
- [x] Convert requester waiting/history and guard Next at gate to existing EVP-style tables with filters, paging, and actions.
- [x] Implement audited driver entry and nullable guard transitions with existing locks and gate/branch rules.
- [x] Add the additive schema migration and generate the Prisma client. Coordinate local/test migration application with root.
- [x] Run focused API tests with coordinator permission and browser checks. Report files and test results.

## Task 2: Maintenance inference and association selection

**Files:** shared analytics contract; API analytics service/controller/router and ML inference; web maintenance model constants, controls, cards and queries; focused tests.

**Produces:** predictive choices random_forest/decision_tree/logistic_regression, with genuine DT scoring and unavailable LR; parts choices fp_growth/eclat/apriori in a normalized result shape. Preserve existing RF changes. No changes to unrelated routes, reports, CSV, or Prisma.

- [x] Write failing selection and model-identity tests; run focused RED tests in isolation with coordination.
- [x] Implement DT selected inference, model-unavailable errors, and removal of usage selection/silent fallback.
- [x] Add live Apriori to parts selection with source metadata and empty state; keep trained-model provenance and honest identical FP/Eclat results.
- [x] Update UI caches, algorithm labels, applied selection, loading/error states, and stale result handling.
- [x] Run focused tests and browser checks; report results and LR limitation.

## Task 3: Organization CSV

**Files:** shared `csv.ts`; organization shared contract/API controller/service/router; web Organization import dialog and resource toolbar; API/unit tests.

**Produces:** shared `encodeCsv(headers: string[], rows: (string|number|null|undefined)[][]): string` and parser; employee/head import preview and atomic write endpoints. Root owns `packages/shared/src/index.ts` exports. Task owns no Prisma/app.ts/navigation/report files.

- [x] Write failing CSV parsing/escaping/Unicode/formula and atomic import tests.
- [x] Implement size/row-bounded preview, ID-based create/update, validated active/unambiguous references, administrator-only writes, and transaction rollback.
- [x] Add preview/confirm dialog, templates, and complete filtered CSV export to Employees and Office Heads.
- [x] Run safe pure tests; request coordinator for DB tests. Verify real downloads, Escape/cancel, and mobile bounds.

## Task 4: Job-order metadata and reporting backend

**Files:** shared job-order contracts and new reports contract, API job-order mappings, new reports module and tests, app.ts; web job-order form/detail/API types.

**Consumes:** Task 1 JobOrder maintenanceType/serviceLocation columns; shared CSV helper.

**Produces:** administrator-only `GET /api/reports?type=trips|maintenance|preventive|job_orders|odometer|fuel` returning typed columns, full matching rows, summary, generatedAt and fuel calculation details. Fuel inputs include vehicleId/from/to/tripId/plannedDistanceKm/proposedLiters.

- [x] Write failing report tests for authorization, Manila bounds, multiple outings, missing readings, job metadata, complete datasets, and weighted fuel estimates.
- [x] Add job metadata to create/edit/read contracts, mappers, and forms without inferring historical values.
- [x] Implement server report queries, configured preventive schedules, and deterministic rendering data.
- [x] Implement GPS Haversine segment distance between actual gate stamps, reject insufficient/gapped traces, and count ticket fuel once. Default maximum sample gap 15 minutes and require GPS coverage within 15 minutes of both gate boundaries; disclose this quality criterion.
- [x] Test the image example (45/300, 40*0.15, 10-6), invalid/missing data, repeated outings, and no division by zero.

## Task 5: Reports UI and export/print

**Files:** web Reports page and fuel subview, API/query helpers, authenticated route, sidebar, shared export/print utilities and browser tests.

- [x] Add report selector and calendar/branch/vehicle/status filters with explicit Generate action.
- [x] Render the five requested report tables and GPS fuel report with totals, historical rows, calculation steps, planned trip input, difference, and exclusions.
- [x] Download CSV using shared encoder, print a clean report with title/filters/date, and expose Save as PDF through print. Add XLSX only if an appropriate library is already usable or safely justified.
- [x] Verify screen/print/download parity, mobile bounds, readable empty/error states, and stale filter handling.

## Task 6: Integration and final review

- [x] Review each agent result against spec and resolve issues without reverting others' changes.
- [x] Run targeted tests then complete API/shared tests, build, typecheck, lint, and relevant Playwright flows.
- [x] Have a fresh reviewer examine authorization, data integrity, missing data, report math, and cross-file mappings. Fix material findings.
- [x] Mark checklist and spec status accurately. Report completed behavior, checks, runtime URL, and LR dependency. Do not commit or push.
