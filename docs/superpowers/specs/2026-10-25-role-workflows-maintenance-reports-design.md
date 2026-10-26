# Role workflows, maintenance models, organization CSV, and reports

Date: 2026-10-25
Status: Implemented and verified locally on `main`. Logistic Regression remains unavailable pending its complete model pipeline.

## Intent and decisions

Implement the requested requester, driver, guard, and administrator changes in the existing React/Express/Prisma application, working directly on `main`.

The user explicitly confirmed that guards may scan a trip out or in even when driver odometer readings are missing. Guard actions must not require an odometer field. Missing readings remain null and appear as “Not recorded,” never as zero or an invented reading.

Other details below are proposed implementation decisions, not additional user requirements. Preserve the existing uncommitted Random Forest precision and feature-extraction changes. Do not commit or push without a request.

## Pre-implementation findings

- Requester waiting/history views use cards and list rows. The EVP History view provides the existing table, toolbar, status, and pagination styling to reuse.
- The request form replaced a start/end window with outing rows containing one date and two times. Its submit mapping uses the same date for both timestamps, preventing overnight or multi-day outings. The API already accepts separate timestamps per outing.
- Gate endpoints currently require `startMileage` or `endMileage`. Gate transitions write the outing readings and advance vehicle mileage. Merely removing the guard input would break these transitions.
- Driver Dashboard lists per-outing trips and displays a ticket QR, but has no odometer submission action.
- The shared contract and browser selector expose `random_forest` and `usage_rules`. Decision Tree only supplies an informational `crossCheckScore`. Logistic Regression is absent from the active inference pipeline.
- On the running local API, Random Forest returned eight assessments and eight Decision Tree cross-checks. Selecting Decision Tree or Logistic Regression returned HTTP 400 `VALIDATION_ERROR`.
- Parts selection exposes FP-Growth and Eclat. Both supplied models contain the same four directional rules from 21 training transactions; identical outputs are expected for these artifacts. The API returned four rules for each.
- Apriori exists at `/api/analytics/association-rules`, outside the model selector. The endpoint currently returned an empty result for the local database. Selecting Apriori at `/association-models` returned HTTP 400.
- Organization already has Employees and Office Heads tabs, create/edit dialogs, and administrator API routes. CSV import/export is missing.
- Job orders record repair complexity (`simple`, `complex`, `compound`) and remarks. They do not record an explicit motorpool/outside service location or preventive/corrective maintenance classification.

Evidence: `apps/web/src/components/pages/trip-tickets/add-trip-ticket/actions.ts`, `apps/api/src/modules/trip-tickets/transitions.ts`, `packages/shared/src/contracts/analytics.ts`, `apps/api/src/modules/analytics/service.ts`, `apps/api/src/assets/README.md`, `apps/web/src/components/pages/organization/resource-tab.tsx`, and `apps/api/prisma/schema.prisma`.

## Approach

Extend the current application, contracts, tables, and per-outing model. This preserves the existing booking checks, approval flow, organization records, maintenance schedules, and role permissions. A separate reporting application would duplicate authentication and data rules. Replacing the trip workflow would risk the existing multi-outing gate cycle. Neither is justified by the requested changes.

This is one coordinated project, delivered in this order: trip/requester/driver/guard flow, maintenance selection, organization CSV, then reports. Reports depend on the trip reading and job-order data changes.

## Requester and trip dates

Use the EVP History table styling for requester requests, with clear pending/history views, search, status filtering, and pagination. Columns: trip ticket, departure, return, destination, vehicle/plate, driver, status, and actions. Preserve request creation, details, cancellation permissions, and cancellation reasons. Render table overflow inside its container on mobile.

Each outing receives Departure date, Departure time, Return date, and Return time, using the existing calendar and time pickers. Default return date to departure date for same-day bookings. Require the return instant to follow departure and preserve the existing half-open overlap checks across outings. Keep “Add another date” for nonconsecutive outings. Review, detail, driver, guard, and calendar views must show the real return date when it differs.

## Driver readings and guard QR

Driver Dashboard adds Before trip and After trip odometer actions for the assigned outing. Only the driver account linked to the assigned driver may submit through the driver endpoint. An active, approved assignment is required; pending, cancelled, and disapproved trips cannot receive driver readings. An ending reading requires gate departure.

Reuse nullable `TripDate.startMileage` and `TripDate.endMileage`. Add recorder IDs and recorded-at timestamps to distinguish driver entry from guard gate stamps. Keep existing historical readings and gate stamps; do not attribute old readings to a driver without evidence.

Validate whole, nonnegative kilometers. When both values exist, ending mileage must be at least starting mileage. Serialize writes with the existing vehicle/driver locks. Validate historical entries against recorded neighboring gate events for the same vehicle; reject contradictions. Late readings may fill a missing reading after a gate scan, including a completed outing. Advance the vehicle's current mileage only to the maximum valid reading, so historical entry cannot reduce it. Freeze previously recorded values after a later outing departs; correction of an already recorded historical value remains outside this request.

Before an outing departs, the assigned driver may correct its starting reading. After departure, an existing starting reading is frozen. An ending reading may be corrected until the outing is checked in; after check-in only a missing reading may be filled. Gate timestamps continue to record guard actions separately.

Guard Next at gate becomes a table: trip ticket, outing window, driver, plate, destination, gate status, and QR action. Provide scan-out and scan-in flows with no odometer input. Existing QR ticket identity must be verified against the selected ticket, and the server resolves the eligible outing. Preserve branch restrictions, approval checks, available/on-trip status checks, and the single-active-outing rule. A repeated or stale scan must not create duplicate transitions.

The gate endpoint consumes a driver reading if available and otherwise completes the transition with null mileage. Neither missing reading blocks a scan. Odometer status may be shown as read-only context, but never becomes a guard task.

## Maintenance selection

Expose Random Forest, Decision Tree, and Logistic Regression as the three intended predictive choices. Running a model must change the main risk score, priority, and displayed model identity, using that model's own features and probabilities. Selection must reach the API and participate in query caching. Preserve score sorting and distinguish pending selection from the applied model.

Promote the existing Decision Tree from cross-check to a selectable scorer, using its actual split features: `KM_SINCE_LAST_MAINT`, `MAINT_FREQ_12M`, and `downtime_hours`. Use the application's existing downtime calculation, document the unconfirmed match with the model author's definition, and validate scores against the artifact. Preserve the Random Forest precision fixes.

Remove usage/rule-based risk selection and silent rule-based risk fallback. If the selected model is missing or invalid, return a model-unavailable state rather than label a different score as the selected model. This removal does not affect preventive maintenance rules and mileage/time schedules, which the user explicitly requested in reports.

### Logistic Regression dependency

`apps/api/src/assets/README.md` records that `motorpool_logreg_model.pkl` is archived outside the repository, has six inputs, lacks usable feature names, and was supplied without its `StandardScaler`. Correct inference needs the model artifact, exact feature order, and matching scaler or a complete fitted pipeline. These cannot be inferred reliably from Random Forest or Decision Tree.

Until those inputs are available, display Logistic Regression as unavailable with a concise explanation and do not permit it to produce fabricated or substituted scores. All other changes can proceed. Once supplied, export coefficients, intercept, scaler parameters, feature order, and class order, then verify probability parity against the fitted pipeline before enabling the option.

### Parts recommendation

Expose Apriori, Eclat, and FP-Growth in the same parts selector. Apriori uses the existing live job-order computation and reports its own source, transaction count, and empty state. Eclat and FP-Growth retain their supplied trained rules and provenance. Normalize the presentation of support/confidence/lift without inventing training hashes for live data.

Label the data source plainly. Do not force these algorithms to produce different rules: the supplied Eclat and FP-Growth artifacts are identical in content. Empty Apriori results should explain that the current job-order transactions do not yield qualifying associations.

## Organization CSV

Retain the existing Employee and Office Head forms. Add Import CSV, Export CSV, and Download template to those two tabs. Exports include every matching record across pages, with current status/branch/search filters reflected. Templates contain headers and a documented example.

- Employee columns: `id`, `name`, `position`, `phone`, `branch_id`, `branch_name`, `archived_at`.
- Office Head columns: `id`, `name`, `branch_id`, `branch_name`, `office_id`, `office_name`, `archived_at`.

Blank `id` creates a new record; an existing ID updates that resource. Names alone are not identity because duplicate person names are allowed. Resolve references by ID, or an unambiguous active name when the ID is absent. Reject ambiguous or inconsistent branch/office pairs. Existing archive/restore actions remain authoritative; imports must not silently archive or restore rows based on `archived_at`.

Parse quoted commas, escaped quotes, CRLF, Unicode, and optional UTF-8 BOM. Show a preview with create/update counts and row-numbered validation errors before a single confirmed import. Server validation and administrator authorization are mandatory. Apply the whole valid file in one transaction; invalid files write nothing. Use a documented file/row limit. Protect spreadsheet exports against formula injection while preserving round-trip text values. CSV import creates organization records, not login accounts.

## Reports

Add an administrator Reports navigation item and route with report type, calendar date range, branch, vehicle, and relevant status filters. Fetch all matching rows from server-side reporting queries, including rows beyond normal list pagination. Screen, print, and CSV download use the same filters and ordering.

Print uses a dedicated layout with report title, filters, generation timestamp, column headings, and rows; hide application navigation/actions. Provide Print / Save as PDF through the browser print dialog and Download CSV. CSV is the proposed downloadable format; a dedicated PDF-file generator is outside this design unless requested.

Use Asia/Manila for report date boundaries and printed timestamps. Store and query timestamps as instants. Inclusive date inputs become a half-open interval ending at the next Manila midnight. Display unknown historical values explicitly instead of guessing.

| Report | Grain and columns | Default inclusion/date basis |
| --- | --- | --- |
| Summary of trips | One row per outing: departure date, start time, return date/time, driver name, plate, trip ticket, destination, purpose, status. Actual gate times are additional columns. | Completed outings; scheduled departure date; status filter can include other outings. |
| Maintenance | One row per maintenance record: plate, maintenance type, service date, odometer, description, cost, next due date. | All recorded maintenance in the service-date range. |
| Preventive maintenance | One row per vehicle/schedule task: plate, task, interval in km/months, last completed date/km, current odometer, next due date/km, due status. Include the interval reason, such as oil change every 5,000 km, only when configured. | Current schedules as of generation; filter due/overdue/upcoming. Date range applies to dated next-due tasks; mileage-only tasks remain eligible and labelled. |
| Job order summary | One row per job order: reference, plate, maintenance type, request date, assigned mechanic, status, service location, notes. | All job orders in the request-date range. |
| Odometer | One row per outing: trip ticket, outing date, plate, assigned driver, starting odometer, ending odometer, distance, actual gate times. Missing values show “Not recorded”; distance is blank unless both exist. | Outings with gate activity; actual gate departure date. |

Preventive schedules remain rule-based and use configured vehicle standards and tracking. No predictive score should stand in for a maintenance interval. Missing standards must display as unconfigured, not imply every vehicle shares a 5,000 km interval.

Add optional Job Order `maintenanceType` (existing maintenance enum) and `serviceLocation` (`motorpool` or `outside`) fields, plus form controls and contract mappings. Use existing remarks for notes. Preserve repair complexity as a separate field. Historical unclassified rows remain “Not recorded”; do not infer service location from mechanic assignment or arbitrary text.

## Verification and acceptance

- Test overnight and multi-day booking, same-day return validation, overlapping outings, review mapping, and calendar/detail display.
- Test driver ownership, outing state, missing readings on both gate transitions, late entry, monotonic mileage, duplicate scans, multiple outings, and branch restrictions.
- Test selected-model inference identity, scores/priorities, unavailable artifacts, absence of usage selection/fallback, and shared-contract rejection of invalid algorithms.
- Compare Random Forest/Decision Tree results with their actual artifacts. Test Apriori empty and qualifying datasets; retain FP-Growth/Eclat source and rule parity checks.
- Test CSV quotation, Unicode, invalid references, duplicate IDs, unauthorized writes, transactional rollback, download filtering, and reimport behavior.
- Test report permissions, Manila midnight boundaries, repeated outings under one ticket, missing odometers, maintenance intervals, historical unknown job locations, and rows beyond one page.
- Verify the running requester, driver, guard, maintenance, Organization, and Reports pages on desktop and mobile. Cover dialog Escape/cancel, focus restoration, table overflow, CSV downloads, and print output.
- Run relevant tests first, then the repository's build, typecheck, and lint checks. Tests must target `mms_test`, never the populated development database.

## GPS-based fuel requirement report (additional user request)

The supplied image specifies an allocation estimator, not a fuel-consumption measurement. The user authorized redesign while preserving its meaning and functionality.

Select a vehicle and historical date range. Use completed trips with matching approved/issued allocations and adequate GPS traces between actual gate-out and gate-in timestamps. Show historical trip rows and the total issued liters and GPS distance. Compute the weighted historical allocation rate as total liters divided by total kilometers, not the unweighted average of individual trip rates. For a selected new trip, multiply the supplied planned route distance by this rate and compare the estimate against the proposed allocation. Show signed differences as above/below/equal to estimate. Example: 45 L / 300 km = 0.15 L/km; 40 km needs an estimated 6 L; proposed 10 L is 4 L above estimate.

Fuel allocations belong to tickets and can cover several outings. Count an allocation once, sum every included outing's actual GPS distance, and exclude incomplete ticket coverage rather than divide or duplicate an allocation without evidence. Zero distance, missing allocation, missing gate stamps, insufficient samples, and unacceptable GPS gaps must produce explicit exclusions and no invented estimate. Planned distance is an explicit route-distance input; do not substitute straight-line distance. Provide calculation details, data-quality notes, CSV download, and print/PDF output alongside the other reports. A real Excel `.xlsx` download may be added using an appropriate maintained export library if available in the project.

## Outstanding dependency

Logistic Regression artifact, scaler, and exact input order before enabling that model. This does not block the other requested changes.


## Final local verification

- Workspace tests: 690 passed (632 API, 30 shared, 28 GPS gateway).
- Browser tests: 25 passed, including model application/errors, organization CSV import/download, report calculations and CSV/XLSX/print parity, metadata clearing, calendar dates, driver entry, guard table, mobile bounds, and Escape/focus restoration.
- Python source-artifact export checks: 3 passed using scikit-learn 1.8.0 in an isolated temporary environment.
- Production build, typechecks, lint, and `git diff --check` passed.
- Additive migration applied to the local development and test databases. API and web remain running at http://localhost:3001 and http://localhost:5173.
- Independent reviews completed; all material findings addressed.
- Physical QR camera hardware was not tested. Numerical model checks do not establish predictive accuracy on real failures.
- No commit, push, or deployment performed. Pre-existing uncommitted RF precision and feature fixes preserved.
