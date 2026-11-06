# GPS Main View and Tracker Configuration Implementation Plan

> **For agentic workers:** Use native execution for the GPS view and parallel isolated file ownership for the independent tracker configuration task. Keep this checkout on main.

**Goal:** Put position, reported speed/ignition, connection, update age, and real route history in the main GPS view, and show the last confirmed hardware configuration in tracker details.

**Architecture:** Reuse latest GPS polling and Leaflet. Add a persistent selected-vehicle overview, explicit Live/Route history modes, bounded history date filters, stable cursor pagination, recorded route lines with gaps, and a private sanitized RCONF snapshot on TrackerDevice.

**Design:** Extend the existing GPS workspace using its theme and fullscreen support. Default history is the last hour; offer 15-minute, 1-hour, 6-hour, and 24-hour windows plus custom start/end times, capped at 24 hours per view. Older windows remain selectable. Route lines connect recorded points and break over missing intervals. Live telemetry is always identified separately from the recorded route. Select the first available vehicle by default and preserve deliberate map navigation during polling. Configuration is a dated last-saved SMS reply, not an automatic hardware read.

## Global Constraints

- Work directly on main; preserve user work and secrets. Never fabricate readings or interpolate vehicle movement.
- Show zero measurements as zero and missing fields as Unknown. Show stale reading age and recorded timestamps.
- Retain existing Admin/EVP GPS access and Admin-only tracker management. Do not broaden permissions.
- History requests are bounded, abortable, scoped to the selected vehicle/range, and cursor-paginated without truncating 5-second reports.
- Store only parsed non-secret RCONF fields; never store UP/passwords, control numbers, APN passwords, or the raw reply. Confirm that its ID matches the registered device.
- Schema migration is additive and preserves existing tracker records. Current config starts empty until a genuine reply is saved.

## Review Focus

- Changing vehicle or date range cannot display the previous route as the new selection.
- Failed history reads must not look like an empty route; incomplete pagination must not look complete.
- Invalid coordinates and gaps must not be joined into a fabricated continuous path.
- Initial/cached tracker reads must not contradict proof from a recent valid GPS receipt.
- RCONF mismatches and malformed replies leave the previous configuration intact, and secrets never appear in persisted configuration or returned JSON.

### Task 1: GPS overview and route history (root)

**Files:** GPS contracts/service/repository/tests; web API/query GPS history; GPS page and new overview/history components; shared VehicleMap route overlay; route utility and browser regression tests.

- [x] Write failing history paging/selection/overview browser and API tests.
- [x] Add stable cursor history reads and a bounded frontend history query.
- [x] Add main telemetry overview, live/history controls and recorded route drawing with gap handling.
- [x] Verify missing data, zeros, selection changes, pagination, error recovery, fullscreen and mobile layout.

### Task 2: Tracker configuration (configuration agent)

**Files:** TrackerDevice schema/additive migration; shared RCONF parser/contract; Admin API handler/tests; tracker API type/mutation; details configuration card/import dialog and optional list summary; browser tests.

- [x] Write regression tests before implementation.
- [x] Add sanitized dated configuration storage and matching-ID validation.
- [x] Add readable settings and a paste-RCONF update flow with explicit snapshot wording.
- [x] Verify persistence, validation, authorization and secret exclusion.

### Task 3: Integrate and verify (root)

- [x] Run scoped API and browser regressions plus builds/lint.
- [x] Inspect real desktop/mobile output and get a fresh read-only review.
- [x] Resolve material findings and report implementation/deployment state accurately.

## Execution record

- Added stable timestamp/ID cursor ordering, scoped history paging, abortable requests, completeness checks, date presets and custom windows up to 24 hours.
- Main GPS workspace shows position, reported speed/ignition, inferred connection, update age, and Live map/Route history modes. Recorded gaps stay disconnected; isolated fixes remain visible. Missing readings remain Unknown; zero remains zero.
- Added an additive nullable configuration JSONB column, a sanitized RCONF parser, Admin-only configuration import, ID matching, dated snapshot wording, and readable hardware settings. Settings remain empty until a real reply is saved. No hardware commands are sent by this flow.
- Added ordinary-update identifier checks after review found a concurrent-edit race. The regression failed with HTTP 200 before the fix and now passes with HTTP 409 without replacing the newer unit's snapshot.
- Review also found hidden singleton route reports. The browser regression failed before the fix and now confirms those reports remain visible. Fresh read-only review found no remaining material issues.
- Verification: 34 GPS/tracker API tests and 7 Admin Docs access tests passed; all 88 shared contract tests passed, including 15 RCONF parser tests. All 21 GPS/configuration browser tests passed, including mobile layout, fullscreen, incomplete history, loading races, persistence and privacy checks. API typecheck, scoped web ESLint and production web/API builds passed.
- One initial browser run encountered Failed to fetch while the local API restarted. After the server stabilized, the full browser run passed. No product retry or validation rules were weakened.
- Visually inspected desktop/mobile previews. A read-only production-data preview showed the real registered tracker and 501 recorded positions in the requested hour, without writing GPS data. Screenshots are in /tmp/mms-gps-main-real-dark-desktop.png and /tmp/mms-gps-route-real-dark-desktop.png; automated browser fixtures are never stored as GPS history.
- Updated the Admin Docs guide and repository setup guide with route-history and configuration-import instructions.
- At implementation handoff, work was local and uncommitted. The user subsequently authorized deployment of both this feature and the concurrent packet-log/gateway feature.
- Combined release checks passed: 699 isolated API tests, 94 shared tests, 53 gateway tests, 29 browser regressions, all production builds, repository typechecks, web lint and diff whitespace checks. The portable gateway imports successfully and contains no local environment file.
- Local VM access was rejected with Permission denied (publickey). Added and independently reviewed a pinned-commit Cloud Shell updater that preserves the existing configuration/source, validates the deployed packet API without saving a test packet, installs persistent spool settings and rolls back failed starts. Syntax and successful/preflight-failure/listener-failure scenarios passed. The VM update and a new real-packet check remain required after the app release is live.
