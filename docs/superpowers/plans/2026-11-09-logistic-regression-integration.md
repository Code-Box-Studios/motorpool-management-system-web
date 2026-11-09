# Logistic Regression integration

**Goal:** Run the supplied fitted pipeline in MMS, preserve its numeric output,
allow model selection, and show incomplete input history honestly.

**Source:** `mms_logistic_regression_model.pkl`, SHA-256
`7c61e80ab26f3ca8fee9725db13e4b8ac240fa2a02687e4976fc397581f06cc2`.

## Decisions

- Work on `main`; do not deploy or change production data as part of integration.
- Export validated JSON offline. Runtime uses TypeScript, never pickle or Python.
- Reproduce nonnegative clipping, the fitted scaler, and binary Logistic Regression
  at full precision. The supplied 60% threshold determines high priority; the
  existing 45% medium-priority boundary remains the lower display band.
- Input order comes from the bundle. Mileage, daily usage, maintenance frequency,
  and recorded downtime retain their existing MMS definitions. Vehicle age uses
  the UTC reference year minus model year, clamped to zero. Last-failure age uses
  whole elapsed days since the most recent nonfuture job-order incident date.
- Vehicles without an incident date or valid model year are unscored. Do not
  substitute zero, another model, or a fleet mean for unknown inputs.
- These are application mappings, not confirmation of the creator's training
  definitions. Target class meaning and prediction horizon remain unconfirmed;
  show a model score and no model-derived failure date for Logistic Regression.
- Preserve Random Forest default, Decision Tree scoring, role access and parts
  recommendations. Existing array-returning client hooks remain compatible.

## Implementation and checks

- [x] Export original bundle, provenance and genuine Python probability fixtures;
      reject malformed scalers, mismatched components and unsafe pickle globals.
- [x] Add strict TypeScript loader/inference and golden probability checks,
      including clipping, order, finite inputs, overflow and 60% boundaries.
- [x] Read latest dated incidents without schema changes; integrate scoring and
      explicit unscored vehicles into the existing analytics response.
- [x] Enable selection; preserve shared query-cache shape; show threshold,
      missing history and the absence of a supplied failure date.
- [x] Verify dedicated test-database queries, contracts, existing model behavior,
      browser selection/results, builds and lint. Obtain independent review.

## Verification result

- `pnpm test`: 862 passed (715 API, 94 shared, 53 gateway).
- Offline Python suite: 19 passed, including 16 Logistic Regression checks.
- Browser checks: 9 passed for Logistic Regression and existing parts selection.
- API typecheck/build, web build/lint and formatting checks passed.
- Actual local API/browser: HTTP 200, one scored vehicle and seven explicitly
  unscored vehicles from existing data; no browser page errors. No fleet records
  were invented or changed to obtain a score.
- Independent review found no important or critical issues. Source pickle hash
  matches the supplied file. Deployment status is verified separately from these local checks.
