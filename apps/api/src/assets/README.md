# ML assets

## `rf_maintenance_model.json`

The vehicle failure-risk model: a 200-tree Random Forest with
`KM_SINCE_LAST_MAINT` / `AVG_DAILY_KM` / `MAINT_FREQ_12M` inputs
(see `lib/ml/features.ts`). Drives `riskScore` / `priority` / `usedFallback`
in `GET /analytics/predictive-maintenance`.

The JSON is exported at full precision from `tools/ml/motorpool_rf_model.pkl`
(sklearn 1.8.0). Runtime inputs use sklearn's float32 precision; learned
thresholds and leaf probabilities must not be rounded. The former four-decimal
export changed an attainable 139.131 km/day input from the saved model's
91/high to 34/low. Python parity tests and the TypeScript regression now guard
that boundary. Future-dated services are excluded from current feature values.
When recent services have no odometer, usage pairs distance and elapsed time
with the same older known-odometer baseline.

Numerical parity does not establish predictive accuracy. The original training
distribution mismatch remains: 784 of 3830 `KM_SINCE_LAST_MAINT` thresholds
are negative and unreachable behind `Math.max(0, …)`. Several live usage
values also fall below every daily-usage split. Retraining and held-out
validation require the training dataset and reliable failure labels; this
re-export does not retrain or recalibrate the model.

The endpoint accepts `algorithm=random_forest` (default), `decision_tree`, or
`logistic_regression`. The selected available model drives the main `riskScore`
and `priority`; `scoringMethod` records that selection and `usedFallback` is
always false. Missing or invalid selected models return `503 MODEL_UNAVAILABLE`
without substituting rules or another model. Logistic Regression now loads its
supplied fitted pipeline export; vehicles with incomplete inputs are listed
separately without a score. Usage-based selection
and association algorithms are rejected by this endpoint. Preventive mileage
and time schedules remain independent of predictive inference.

## `client_dt_model.json`

The client's own model, sent as `motorpool_dt_model.pkl`
(sklearn 1.6.1 `DecisionTreeClassifier`). It was decoded offline in an
isolated container and converted to this repo's own `RFModel` JSON shape.
The original decision-tree `.pkl` is not committed here, and runtime inference
loads JSON only. Offline tools may decode the separately supplied association
bundles as described below.

- Declared six training features: `KM_SINCE_LAST_MAINT`, `AVG_DAILY_KM`,
  `MAINT_FREQ_12M`, `V_AGE`, `downtime_hours`, `last_failure_days_ago`.
- Actually **splits on only three**: `KM_SINCE_LAST_MAINT`, `MAINT_FREQ_12M`,
  `downtime_hours` — the other three are inert (never referenced by any
  node), and only those three appear in this file's own `features` array.
- `max_depth=3`, 11 nodes, 6 leaves, trained on 250 rows. **This is a weak
  model** — five of its six leaves predict class 1. Selecting Decision Tree
  uses its actual leaf probabilities for the main `riskScore` and `priority`.
  The legacy informational `crossCheckScore` remains available alongside
  Random Forest results (`modules/analytics/service.ts`).
- `downtime_hours` is computed in `modules/analytics/repository.ts` from
  `vehicle_status_audit` as "hours spent in `under_maintenance`". The
  client's own definition of `downtime_hours` is unknown; if theirs differs,
  this tree's thresholds are not comparable to our numbers. Outstanding
  question for the client.

Full story: `.superpowers/sdd/2026-08-28-approval-history-and-tool-borrow-tracking/client-dt-brief.md`
and `client-dt-report.md`.

## Spare-parts association models

`association_fpgrowth_model.json` and `association_eclat_model.json` preserve
the four directional rules from the supplied `mms_fpgrowth_model.pkl` and
`mms_eclat_model.pkl`. Both bundles use 21 training transactions and contain
the same rules, although their files and SHA-256 hashes differ. The original
files and restricted offline exporter live in `tools/ml`.

These models drive related-parts recommendations only; their confidence,
support, and lift are not vehicle failure-risk scores. The existing live
Apriori endpoint remains available and also participates in the common model
selector. Apriori mines current job orders, reports `source=live_job_orders`,
and carries null artifact/training fields. Its transaction count includes the
eligible job orders with at least two distinct parts; at least two such
transactions are required. Support/confidence are normalized from the existing
live computation's integer percentages. Saved results retain their original
rules and hashes with `source=trained_artifact`. See `tools/ml/README.md` for
regeneration and provenance checks.

## `logistic_regression_model.json`

Exported from `tools/ml/mms_logistic_regression_model.pkl` (scikit-learn 1.8.0),
SHA-256 `7c61e80ab26f3ca8fee9725db13e4b8ac240fa2a02687e4976fc397581f06cc2`.
This new bundle supplies the classifier, matching fitted StandardScaler,
preprocessing pipeline, ordered feature names, and a 60% score threshold.
The older `motorpool_logreg_model.pkl` was only a classifier and remains unused.

Runtime inference applies nonnegative clipping, subtracts the saved scaler
means, divides by its saved scales, then applies the learned binary logistic
function. All coefficients and scaler parameters retain float64 precision;
do not apply the Random Forest predictor's float32 conversion here.
`logistic-regression-parity.json` contains 2,361 reference probabilities from
actual Python `pipeline.predict_proba`, including clipping and threshold cases.
Those probes verify numeric equivalence, not predictive accuracy.

Input mappings in MMS are:

| Training input | Application value |
| --- | --- |
| `KM_SINCE_LAST_MAINT` | Existing distance-since-service calculation and odometer handling |
| `AVG_DAILY_KM` | Existing daily-usage calculation from dated service odometers |
| `MAINT_FREQ_12M` | Count of nonfuture service records in the trailing year |
| `V_AGE` | UTC reference year minus vehicle model year, clamped to zero |
| `downtime_hours` | Existing cumulative hours recorded under maintenance in the status audit trail; no recorded hours means zero |
| `last_failure_days_ago` | Whole elapsed days since the latest nonfuture job-order incident date |

An incident date is a recorded-incident proxy, not confirmation of a mechanical
failure. The creator has not confirmed these feature definitions/units, target
class meanings, or the prediction horizon. Class-1 probability is displayed as
**Model score**, not a dated failure prediction. Validate these definitions with
the creator before treating scores as validated maintenance predictions.

Vehicles without a usable incident date or model year, or with invalid numeric
inputs, appear in `unscoredVehicles`. No zero/default incident date, fleet mean,
or other model replaces unknown history. Available vehicles remain scored when
other vehicles are unscored. The API includes `riskThreshold: 60`; high score
starts at the saved 0.60 probability, medium starts at the existing 0.45 display
boundary. Bands are computed before score rounding. Random Forest and Decision
Tree retain their existing boundaries and response shapes.

The runtime reads JSON only; loading/exporting pickle is an offline operation.
The normal build copies this JSON into `dist/assets`. Use the pinned dependency
set and exporter documented in `tools/ml/README.md` to regenerate it.
