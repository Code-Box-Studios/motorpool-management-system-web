# ML assets

## `rf_maintenance_model.json`

The incumbent predictive-maintenance model. Random forest, 200 trees, trained
on this app's own `KM_SINCE_LAST_MAINT` / `AVG_DAILY_KM` / `MAINT_FREQ_12M`
features (see `lib/ml/features.ts`). Drives `riskScore` / `priority` /
`usedFallback` in `GET /analytics/predictive-maintenance`. Do not touch
without re-reading `lib/ml/random-forest.ts` and `lib/ml/risk.ts` — it has a
separately-tracked, out-of-scope issue (784 of 3830 `KM_SINCE_LAST_MAINT`
thresholds are negative and unreachable behind `Math.max(0, …)`).

The endpoint accepts `algorithm=random_forest` (default) or `usage_rules`.
The latter explicitly selects the existing mileage/usage/service-frequency
estimate. Each row identifies its actual `scoringMethod`; rule-based results
retain `usedFallback=true` for existing clients and are labelled as estimates
in the model controls. Association algorithms are rejected by this endpoint.

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
  model** — five of its six leaves predict class 1. It was wired in anyway at
  the client's explicit request, as an optional, informational
  `crossCheckScore` alongside the incumbent RF's `riskScore`
  (`modules/analytics/service.ts`). It drives no user-facing number and
  cannot change `riskScore`, `priority`, or `usedFallback`.
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
Apriori endpoint remains available separately. See `tools/ml/README.md`
for regeneration and provenance checks.

## Not here

The remaining `.pkl` file is archived outside this repo and not wired in:

- `motorpool_logreg_model.pkl` — shipped with no `StandardScaler` and an empty
  `feature_names_in_` (`n_features_in_` is 6), so the column order needed to
  use it is unrecorded. Unusable until the client supplies both.
