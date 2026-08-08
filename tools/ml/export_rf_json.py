"""Export a fitted scikit-learn RandomForestClassifier to the exact JSON shape the
TypeScript runtime loads (`interface RFModel` in apps/api/src/lib/ml/random-forest.ts).

This is the piece the repo was missing: the committed rf_maintenance_model.json had
NO source in the tree (mms_randomforest.py only fits + prints metrics; the JSON was
produced out-of-band in Colab). Without a committed exporter the model is
irreproducible. This file makes a retrain a one-command, verifiable operation.

Correctness contract (must match random-forest.ts exactly, or predictions silently corrupt):
  1. Node feature keys are the literal strings in feature_spec.FEATURES. A wrong name
     resolves to 0 via `features[node.feature] ?? 0` (random-forest.ts:38) — no error.
  2. Split convention is `value <= threshold -> LEFT, else RIGHT`. This is also
     sklearn's own rule (tree_.threshold, `<=` goes left), so a direct dump is compatible.
  3. Leaf `probs` are the normalized class distribution; INDEX 1 = P(fail=class 1),
     because predictTree returns `node.probs[1]` (random-forest.ts:37). Requires classes == [0, 1].
  4. The forest score is the arithmetic MEAN of per-tree P(fail) (soft voting,
     random-forest.ts:44-47) — identical to sklearn's RandomForest.predict_proba.

The `roundtrip_check` below re-implements the TS traversal in Python and asserts it
equals rf.predict_proba within 1e-9 on real rows. If it passes, the JSON is correct
BY CONSTRUCTION — this is the safety net that lets you trust an export you (or a tool
that can't run Python) produced without eyeballing 200 trees.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import _tree  # for TREE_LEAF sentinel

from feature_spec import FEATURES


def _tree_to_dict(tree, feature_names: list[str]) -> dict:
    """Recursively serialize one fitted sklearn DecisionTree into nested
    {feature, threshold, left, right} internal nodes and {probs:[p0, p1]} leaves.
    """
    t = tree.tree_

    def recurse(node_id: int) -> dict:
        # Leaf: sklearn marks both children as TREE_LEAF (-1).
        if t.children_left[node_id] == _tree.TREE_LEAF:
            counts = t.value[node_id][0].astype(float)  # shape (n_classes,)
            total = counts.sum()
            probs = (counts / total) if total > 0 else np.full_like(counts, 1.0 / len(counts))
            return {"probs": [float(p) for p in probs]}
        feat_idx = int(t.feature[node_id])
        return {
            "feature": feature_names[feat_idx],
            "threshold": float(t.threshold[node_id]),
            "left": recurse(int(t.children_left[node_id])),
            "right": recurse(int(t.children_right[node_id])),
        }

    return recurse(0)


def forest_to_rfmodel(rf: RandomForestClassifier, feature_names: list[str]) -> dict:
    """Convert a fitted RandomForestClassifier into an RFModel dict."""
    classes = [int(c) for c in rf.classes_]
    if classes != [0, 1]:
        raise ValueError(
            f"Model classes must be exactly [0, 1] so probs[1] = P(fail); got {classes}. "
            f"Ensure the training label {LABEL!r} is 0/1 with both classes present."
        )
    model = {
        "features": list(feature_names),
        "n_estimators": int(rf.n_estimators),
        "classes": classes,
        # Loader ignores unknown keys; kept for provenance/debugging.
        "feature_importances": {
            name: float(imp) for name, imp in zip(feature_names, rf.feature_importances_)
        },
        "trees": [_tree_to_dict(est, feature_names) for est in rf.estimators_],
    }
    return model


# --- Reference re-implementation of the TS runtime, for the round-trip check ---

def _js_predict_tree(node: dict, feats: dict[str, float]) -> float:
    """Mirror of predictTree (random-forest.ts:36-40)."""
    if "probs" in node:
        probs = node["probs"]
        return probs[1] if len(probs) > 1 else 0.0
    value = feats.get(node["feature"], 0.0)
    branch = node["left"] if value <= node["threshold"] else node["right"]
    return _js_predict_tree(branch, feats)


def _js_predict_forest(model: dict, feats: dict[str, float]) -> float:
    """Mirror of predictRandomForest (random-forest.ts:44-47): mean P(fail)."""
    trees = model["trees"]
    return sum(_js_predict_tree(t, feats) for t in trees) / len(trees)


def roundtrip_check(rf: RandomForestClassifier, model: dict, X, feature_names: list[str], tol: float = 1e-9) -> float:
    """Assert the exported JSON, traversed the way the TS runtime does, reproduces
    rf.predict_proba(X)[:, 1]. Returns the max absolute difference.
    """
    # Score with the ORIGINAL X (a named DataFrame from the trainer avoids sklearn's
    # "X has no valid feature names" warning); use a bare array only for JS traversal.
    sk = rf.predict_proba(X)[:, 1]
    Xn = np.asarray(X, dtype=float)
    js = np.array(
        [_js_predict_forest(model, dict(zip(feature_names, row))) for row in Xn]
    )
    max_diff = float(np.max(np.abs(sk - js))) if len(sk) else 0.0
    if max_diff > tol:
        raise AssertionError(
            f"Round-trip FAILED: exported JSON diverges from sklearn by {max_diff:.3e} "
            f"(tol {tol:.0e}). The JSON would serve different scores than the trained model."
        )
    return max_diff


def write_model(model: dict, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(model), encoding="utf-8")


LABEL = "Failure_flag"


def _cli() -> None:
    here = Path(__file__).resolve().parent
    default_out = here.parent.parent / "apps" / "api" / "src" / "assets" / "rf_maintenance_model.json"

    ap = argparse.ArgumentParser(
        description="Re-export an EXISTING fitted RandomForest .pkl into the RFModel JSON the app loads. "
        "For a full retrain with the parity fix, use train_predictive_maintenance.py instead."
    )
    ap.add_argument("--model", default=str(here / "motorpool_rf_model.pkl"), help="Path to a joblib-dumped RandomForestClassifier.")
    ap.add_argument("--out", default=str(default_out), help="Where to write the RFModel JSON.")
    args = ap.parse_args()

    import joblib

    rf = joblib.load(args.model)
    if not isinstance(rf, RandomForestClassifier):
        raise SystemExit(f"{args.model} is not a RandomForestClassifier (got {type(rf).__name__}).")

    model = forest_to_rfmodel(rf, FEATURES)

    # Self-check on random points spanning the feature ranges (no CSV needed here).
    import pandas as pd

    rng = np.random.default_rng(42)
    probe = pd.DataFrame(
        {
            "KM_SINCE_LAST_MAINT": rng.uniform(0, 150_000, 500),
            "AVG_DAILY_KM": rng.uniform(0, 300, 500),
            "MAINT_FREQ_12M": rng.integers(0, 12, 500),
        },
        columns=FEATURES,
    )
    max_diff = roundtrip_check(rf, model, probe, FEATURES)

    write_model(model, Path(args.out))
    print(f"Wrote {args.out}")
    print(f"  trees={model['n_estimators']}  classes={model['classes']}  features={model['features']}")
    print(f"  round-trip max |sklearn - JSON| = {max_diff:.3e}  (OK)")
    print("NOTE: re-exporting the EXISTING model reproduces its distribution — including the")
    print("      train/serve mismatch. Run train_predictive_maintenance.py to fix that.")


if __name__ == "__main__":
    _cli()
