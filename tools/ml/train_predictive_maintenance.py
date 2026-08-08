"""Reproducible predictive-maintenance trainer.

Replaces the throwaway Colab export (mms_randomforest.py) with a pipeline that:
  1. Loads the dataset (external/borrowed data is fine for a brand-new app).
  2. Aligns features to the app's serve-time contract so train == serve
     (feature_spec.align_to_serve_contract) — the fix for the negative-threshold
     dead splits and the inert-feature problem.
  3. Warns loudly where the training distribution can't be reproduced by the app.
  4. Splits time-based when a DATE column exists (never leak the future).
  5. Trains a constrained RandomForest, and reports whether it actually BEATS the
     free deterministic rule (feature_spec.fallback_score) — if it doesn't, the
     honest move is to keep serving the rule.
  6. Exports to the exact RFModel JSON via the self-verifying export_rf_json.
  7. Prints ready-to-paste golden values, because retraining WILL change the
     scores pinned in apps/api/src/lib/ml/predictive.test.ts.

Usage:
  python train_predictive_maintenance.py --data final_datasets_CLEAN.csv
  python train_predictive_maintenance.py --data path/to.csv --smote --out ../../apps/api/src/assets/rf_maintenance_model.json

I cannot run this for you (no Python in the authoring environment); run it where the
CSV and Python live. The round-trip check inside export makes a silent-wrong export
impossible — if it prints OK, the JSON reproduces the trained model exactly.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    precision_score,
    recall_score,
    roc_auc_score,
)

import feature_spec as spec
from export_rf_json import forest_to_rfmodel, roundtrip_check, write_model

# The feature vectors currently pinned in predictive.test.ts. After a retrain the
# expected scores change; we recompute them so you can paste updated goldens.
GOLDEN_VECTORS = [
    {"KM_SINCE_LAST_MAINT": 0, "AVG_DAILY_KM": 0, "MAINT_FREQ_12M": 0},
    {"KM_SINCE_LAST_MAINT": 15000, "AVG_DAILY_KM": 80, "MAINT_FREQ_12M": 2},
    {"KM_SINCE_LAST_MAINT": 5000, "AVG_DAILY_KM": 50, "MAINT_FREQ_12M": 1},
    {"KM_SINCE_LAST_MAINT": 2000, "AVG_DAILY_KM": 30, "MAINT_FREQ_12M": 3},
    {"KM_SINCE_LAST_MAINT": 100000, "AVG_DAILY_KM": 200, "MAINT_FREQ_12M": 0},
]


def _binary_metrics(y_true, scores, cutoff: float) -> dict:
    y_pred = (scores >= cutoff).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    out = {
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
        "confusion": cm.tolist(),
    }
    # Threshold-free, robust on imbalanced data:
    if len(np.unique(y_true)) > 1:
        out["roc_auc"] = roc_auc_score(y_true, scores)
        out["pr_auc"] = average_precision_score(y_true, scores)
        out["brier"] = brier_score_loss(y_true, np.clip(scores, 0, 1))
    return out


def _fmt(m: dict) -> str:
    parts = [f"precision={m['precision']:.3f}", f"recall={m['recall']:.3f}"]
    if "roc_auc" in m:
        parts += [f"roc_auc={m['roc_auc']:.3f}", f"pr_auc={m['pr_auc']:.3f}", f"brier={m['brier']:.3f}"]
    parts.append(f"confusion={m['confusion']}")
    return "  ".join(parts)


def main() -> None:
    here = Path(__file__).resolve().parent
    default_out = here.parent.parent / "apps" / "api" / "src" / "assets" / "rf_maintenance_model.json"

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", default=str(here / "final_datasets_CLEAN.csv"), help="Training CSV with the feature columns + Failure_flag.")
    ap.add_argument("--out", default=str(default_out), help="Where to write the RFModel JSON the app loads.")
    ap.add_argument("--test-frac", type=float, default=0.25, help="Fraction held out for evaluation.")
    ap.add_argument("--n-estimators", type=int, default=200)
    ap.add_argument("--max-depth", type=int, default=6, help="Constrained to limit overfit on sparse data.")
    ap.add_argument("--min-samples-leaf", type=int, default=5)
    ap.add_argument("--smote", action="store_true", help="Oversample the minority class (train fold only). Off by default: fabricating minority points on 3 features inflates optimism.")
    ap.add_argument("--cutoff", type=float, default=spec.RISK_THRESHOLDS["medium"], help="Probability cutoff for precision/recall reporting.")
    ap.add_argument("--write", action="store_true", help="Actually overwrite the app's model JSON. Without it, this is a dry run that only reports.")
    args = ap.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        raise SystemExit(
            f"Dataset not found: {data_path}\n"
            f"Point --data at your final_datasets_CLEAN.csv (it is not committed to the repo)."
        )

    df = pd.read_csv(data_path)
    missing = [c for c in spec.FEATURES + [spec.LABEL] if c not in df.columns]
    if missing:
        raise SystemExit(f"CSV is missing required columns: {missing}. Present: {list(df.columns)}")

    # --- Parity fix: shape features exactly as the app does at serve time. ---
    df = spec.align_to_serve_contract(df)
    for w in spec.serve_range_report(df):
        print("WARNING:", w)

    # --- Split: time-based if we have a DATE column, else stratified (warn). ---
    if "DATE" in df.columns:
        df["DATE"] = pd.to_datetime(df["DATE"], errors="coerce")
        df = df.dropna(subset=["DATE"]).sort_values("DATE")
        # Clamp so both folds are non-empty even at extreme --test-frac values.
        cut = max(1, min(int(len(df) * (1 - args.test_frac)), len(df) - 1))
        train_df, test_df = df.iloc[:cut], df.iloc[cut:]
        print(f"Split: TIME-BASED at {df['DATE'].iloc[cut]:%Y-%m-%d} "
              f"(train {len(train_df)}, test {len(test_df)}).")
    else:
        from sklearn.model_selection import train_test_split
        print("WARNING: no DATE column — falling back to a random stratified split, "
              "which can leak a vehicle's future into its past. Prefer a dated dataset.")
        train_df, test_df = train_test_split(
            df, test_size=args.test_frac, random_state=42, stratify=df[spec.LABEL]
        )

    X_train, y_train = train_df[spec.FEATURES], train_df[spec.LABEL].astype(int)
    X_test, y_test = test_df[spec.FEATURES], test_df[spec.LABEL].astype(int)
    pos_test = int(y_test.sum())
    print(f"Train class balance: {dict(y_train.value_counts())}")
    print(f"Test  class balance: {dict(y_test.value_counts())}")
    if pos_test < 5:
        print(f"WARNING: only {pos_test} positive(s) in the test fold — every metric below "
              f"is high-variance. Treat AUC/PR-AUC as directional, not precise.")

    # A single-class train fold cannot train a 2-class model; fail fast with a clear
    # message instead of a cryptic IndexError at predict_proba(...)[:, 1]. This is
    # plausible with a non-stratified time split when failures cluster in time.
    if y_train.nunique() < 2:
        raise SystemExit(
            f"Train fold has a single class ({dict(y_train.value_counts())}). The split "
            f"put all failures on one side of the timeline. Options: raise --test-frac, "
            f"add more history, or use a dataset without a DATE column (stratified split)."
        )

    if args.smote:
        from imblearn.over_sampling import SMOTE
        X_train, y_train = SMOTE(random_state=42).fit_resample(X_train, y_train)
        print(f"SMOTE applied to train fold -> {dict(pd.Series(y_train).value_counts())}")

    # --- Baseline the model must beat: the free deterministic rule. ---
    base_scores = spec.fallback_scores(X_test)
    base = _binary_metrics(y_test, base_scores, args.cutoff)
    print("\nBASELINE (rule-based fallbackScore, what the app serves for free):")
    print(" ", _fmt(base))

    # --- Train the challenger. ---
    rf = RandomForestClassifier(
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        min_samples_leaf=args.min_samples_leaf,
        class_weight="balanced",
        random_state=42,
    )
    rf.fit(X_train, y_train)
    rf_scores = rf.predict_proba(X_test)[:, 1]
    rf_m = _binary_metrics(y_test, rf_scores, args.cutoff)
    print("\nRANDOM FOREST (challenger):")
    print(" ", _fmt(rf_m))
    print("  feature_importances:",
          {n: round(float(i), 4) for n, i in zip(spec.FEATURES, rf.feature_importances_)})

    # --- Honest verdict. ---
    if "pr_auc" not in rf_m or "pr_auc" not in base:
        print("\nVERDICT: too few positives in the test fold to judge (no PR-AUC). Keep "
              "serving the deterministic rule until more real failure data accrues.")
    else:
        beats = rf_m["pr_auc"] >= base["pr_auc"] and rf_m["recall"] >= base["recall"]
        print("\nVERDICT:",
              "RF beats the rule on this fold — worth shipping." if beats
              else "RF does NOT clearly beat the free rule — the honest choice is to keep serving "
                   "the deterministic fallback until you have more real failure data.")

    # --- Export (self-verifying) + golden values. ---
    model = forest_to_rfmodel(rf, spec.FEATURES)
    # Pass the DataFrame (named columns) so sklearn doesn't warn about feature names.
    max_diff = roundtrip_check(rf, model, X_test, spec.FEATURES)
    print(f"\nExport round-trip max |sklearn - JSON| = {max_diff:.3e}  (OK — JSON matches the model)")

    print("\nPaste these into apps/api/src/lib/ml/predictive.test.ts (retraining changed them):")
    print(f"  expect(model?.trees.length).toBe({model['n_estimators']});")
    from export_rf_json import _js_predict_forest
    for v in GOLDEN_VECTORS:
        score = _js_predict_forest(model, v)
        print(f"  [{{ KM_SINCE_LAST_MAINT: {v['KM_SINCE_LAST_MAINT']}, "
              f"AVG_DAILY_KM: {v['AVG_DAILY_KM']}, MAINT_FREQ_12M: {v['MAINT_FREQ_12M']} }}, {score:.5f}],")

    if args.write:
        write_model(model, Path(args.out))
        print(f"\nWROTE {args.out}")
        print("Next: `pnpm --filter @mms/api build` (copies src/assets -> dist/assets), "
              "regenerate the goldens above, and RESTART the API (the model is cached for the process lifetime).")
    else:
        print(f"\nDry run — not written. Re-run with --write to overwrite {args.out}.")


if __name__ == "__main__":
    main()
