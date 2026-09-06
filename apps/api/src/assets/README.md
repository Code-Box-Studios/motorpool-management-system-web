# ML assets

## `rf_maintenance_model.json`

The incumbent predictive-maintenance model. Random forest, 200 trees, trained
on this app's own `KM_SINCE_LAST_MAINT` / `AVG_DAILY_KM` / `MAINT_FREQ_12M`
features (see `lib/ml/features.ts`). Drives `riskScore` / `priority` /
`usedFallback` in `GET /analytics/predictive-maintenance`. Do not touch
without re-reading `lib/ml/random-forest.ts` and `lib/ml/risk.ts` — it has a
separately-tracked, out-of-scope issue (784 of 3830 `KM_SINCE_LAST_MAINT`
thresholds are negative and unreachable behind `Math.max(0, …)`).

## `client_dt_model.json`

The client's own model, sent as `motorpool_dt_model.pkl`
(sklearn 1.6.1 `DecisionTreeClassifier`). It was decoded offline in an
isolated container and converted to this repo's own `RFModel` JSON shape —
**no code in this repo ever unpickles anything, and the original `.pkl` is
NOT committed here.**

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

## Not here

Three other `.pkl` files the client sent are archived outside this repo, not
converted, and not wired in anywhere:

- `motorpool_logreg_model.pkl` — shipped with no `StandardScaler` and an empty
  `feature_names_in_` (`n_features_in_` is 6), so the column order needed to
  use it is unrecorded. Unusable until the client supplies both.
- `mms_eclat_model.pkl` / `mms_fpgrowth_model.pkl` — byte-identical to each
  other, mined from 21 transactions over 4 distinct parts, resting on 2
  co-occurrences. Statistically worthless next to `lib/ml/apriori.ts`, which
  computes the same kind of rule live from the real database.
