# Model Correctness Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Make runtime predictions match the supplied models and exclude services that have not happened.

**Architecture:** Re-export the existing Random Forest without rounding learned thresholds or leaf probabilities. Match sklearn's float32 input handling in TypeScript and the offline parity checker. Filter future maintenance before computing all history-derived features, and match usage intervals to their known odometer dates.

**Tech Stack:** TypeScript, Vitest, Python, sklearn 1.8.0, Playwright.

**Spec:** The user's model audit request and the independently reproduced failures below.

## Global constraints

- Work directly on main. Do not retrain, change the selected default, or overwrite the user's source pickles.
- Preserve FP-Growth/Eclat rules, existing model selection behavior, and the informational client decision tree.
- Keep the known training/serving distribution mismatch explicit; faithful inference does not establish predictive accuracy.
- Commit and push only when requested.

## Review focus

- An attainable daily usage of 139.131 km must reproduce the saved RF's 91/high result, rather than 34/low.
- Values within float32 rounding distance of a split must follow sklearn's branch.
- Future services, including unknown odometers, must not lower current risk.
- An unknown latest odometer must not shorten the interval measured from an older known odometer; the eight live fleet scores must remain stable.
- Original association rule hashes, directions, metrics, model switching, and error recovery must stay correct.

## Tasks

- [x] Add regression tests for original RF parity, float32 boundaries, and future history; verify the tests fail for the reproduced reasons.
- [x] Re-export `rf_maintenance_model.json` from `motorpool_rf_model.pkl` using the existing full-precision exporter. Align runtime and parity-check input precision.
- [x] Exclude future service rows before deriving mileage, daily usage, and annual frequency in `extractFeatures`.
- [x] Address the review finding: use the known-odometer date for the single-baseline usage interval; verify 100 versus 50 km/day RED/GREEN.
- [x] Update model documentation and verify Python parity, the full workspace suite/build/type checks, and browser model selection/error recovery.
- [x] Review the diff, keep the local app running at port 5174, and report remaining accuracy limitations.

## Evidence

- Five TypeScript regression cases and two Python cases failed for the reproduced precision/future-history bugs before the fixes; 50 focused API/ML tests and three Python tests then passed.
- Fresh review found the single-odometer interval mismatch. The existing unknown-odometer test was strengthened, failed at 100 versus 50 km/day, and passed after aligning the date; all 42 focused predictor/client-tree/API tests passed.
- Every exported RF parameter matches the existing saved pickle. Root checked 2,458 random/live/split-boundary inputs against sklearn with maximum error `2.22e-16`; independent review checked 4,144 split-boundary inputs with maximum error `3.33e-16`.
- Both association assets exactly match their original Downloads pickles and preserve all four directional rules from 21 transactions. Their matching output is expected.
- Nine browser checks passed after the final source edits, including risk/parts switching, scoped search, filtering, and failure recovery.
- Full workspace tests passed: 600 total (562 API, 10 shared, 28 GPS gateway). Final build and type checks passed; web lint passed with no frontend source edits.

## Remaining accuracy limits

The saved RF still has a training/serving distribution mismatch and no held-out labeled failures were available for calibration or accuracy validation. Re-exporting preserves its learned parameters; it does not retrain it. The client decision tree remains informational. No commits or pushes are part of this audit request.
