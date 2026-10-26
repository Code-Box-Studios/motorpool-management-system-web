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
without substituting rules or another model. Logistic Regression returns that
state until its complete fitted pipeline is supplied. Usage-based selection
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

## Not here

The remaining `.pkl` file is archived outside this repo and not wired in:

- `motorpool_logreg_model.pkl` — shipped with no `StandardScaler` and an empty
  `feature_names_in_` (`n_features_in_` is 6), so the column order needed to
  use it is unrecorded. Unusable until the client supplies both.
