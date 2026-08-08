# Predictive-maintenance ML pipeline

Trains the vehicle failure-risk model the API serves at
`GET /api/analytics/predictive-maintenance`, and exports it to the exact JSON the
TypeScript runtime loads (`apps/api/src/assets/rf_maintenance_model.json`).

## Why this exists

For a brand-new app with no operating history, training on an **external/borrowed
dataset is the right call** — you can't learn from data you don't have yet. The
problem with the model committed today isn't that it used external data; it's that
the external data's features were shaped differently from how the running app
computes the same features at request time. The result is a model that answers
questions about a population it will never see:

- **`KM_SINCE_LAST_MAINT`** had negative values in training, so the forest learned
  splits like `<= -19,705`. The app clamps this feature to `>= 0`
  ([features.ts](../../apps/api/src/lib/ml/features.ts) line 29), so ~8% of the
  tree's splits can never fire — dead weight.
- **`AVG_DAILY_KM`** splits live in `[43, 223]` km/day; the app computes ~33, so the
  model's second-most-important feature is effectively inert at inference.

The fix is not "get your own data" — it's **shape the training features exactly like
the serve-time features**, then retrain and re-export. `feature_spec.py` encodes that
contract so train == serve by construction.

## Files

| File | Role |
|------|------|
| `feature_spec.py` | Canonical feature contract — mirrors `apps/api/src/lib/ml/features.ts` + `risk.ts`. Holds the serve-alignment transform, the distribution-shift warnings, and the deterministic `fallback_score` baseline. |
| `train_predictive_maintenance.py` | The reproducible trainer: align → split (time-based) → train → **compare against the free rule baseline** → export → print new golden values. |
| `export_rf_json.py` | sklearn `RandomForestClassifier` → `RFModel` JSON. **Self-verifying**: re-implements the TS traversal in Python and asserts it reproduces `predict_proba` to 1e-9. |
| `requirements.txt` | Python deps. |
| `mms_randomforest.py` | ⚠️ Legacy Colab export (random split, no exporter). Superseded by the trainer above; kept for reference. |
| `motorpool_ml_api.py`, `*.pkl` | ⚠️ Legacy Flask prototype + fitted artifacts. Not used by the running app (the API reimplements inference in TS). |

## Setup

```bash
cd tools/ml
python -m venv .venv
# Windows:        .venv\Scripts\activate
# macOS / Linux:  source .venv/bin/activate
pip install -r requirements.txt
```

## Retrain from the dataset (the parity fix)

The dataset (`final_datasets_CLEAN.csv`) is **not committed** — it lives on your
machine. Point `--data` at it.

```bash
# Dry run: reports metrics, distribution warnings, and new golden values. Writes nothing.
python train_predictive_maintenance.py --data path/to/final_datasets_CLEAN.csv

# When the numbers look right, actually overwrite the app's model:
python train_predictive_maintenance.py --data path/to/final_datasets_CLEAN.csv --write
```

Then:

1. Copy the new golden values the script prints into
   [predictive.test.ts](../../apps/api/src/lib/ml/predictive.test.ts) (retraining
   changes the pinned scores, so the tests fail until you do).
2. `pnpm --filter @mms/api build` — the build's `copy-assets` step mirrors
   `src/assets` → `dist/assets`.
3. **Restart the API** — the model is cached for the process lifetime, so a new file
   on disk does nothing until restart.

## Re-export the existing model without retraining

Produces a correct-format JSON from the committed `.pkl`. Useful to confirm the
exporter works, but note it **reproduces the current distribution mismatch** — it
does not fix anything.

```bash
python export_rf_json.py            # reads motorpool_rf_model.pkl, writes the app JSON
```

## Reading the output

- **`WARNING: [AVG_DAILY_KM] ... barely overlaps ...`** — the parity problem clamping
  can't fix. Your borrowed dataset describes a fleet with different usage than yours.
  Only you can judge whether the units match or the feature should be rescaled/dropped.
- **`VERDICT: RF does NOT clearly beat the free rule`** — expected at this data scale,
  and not a failure. The deterministic fallback is a legitimate thing to serve; ship
  the forest only when it earns its place on held-out real failures.
- **`round-trip ... OK`** — the exported JSON provably serves the same scores as the
  trained model.

## When you have your own data

This pipeline reads a CSV; nothing stops that CSV from being an export of the app's
own Postgres once real breakdowns accumulate. The path to a genuinely
self-learned model:

1. Start capturing labels now: make `job_orders.incidentDate` reliably recorded.
2. Later, build training rows as `(vehicle × monthly-snapshot)` with features from
   `feature_spec` and a label = "a breakdown occurred within N days", exported to CSV.
3. Feed that CSV to this same trainer. The parity contract already holds, because the
   features come from the same definitions the app serves.
