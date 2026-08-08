"""Canonical predictive-maintenance feature contract — the single source of truth
shared between TRAINING (this pipeline) and SERVING (apps/api).

Why this file exists
--------------------
The committed model (`rf_maintenance_model.json`) was trained on an external CSV
whose feature distribution does not match what the running app actually feeds the
model at request time. Measured over the committed model:

  * KM_SINCE_LAST_MAINT had NEGATIVE split thresholds (down to ~-91,875), because
    the training data contained negative "distance since last service" values.
    But the app CLAMPS this feature to >= 0 (apps/api/src/lib/ml/features.ts:29),
    so ~8% of the tree's splits can never fire — dead weight.
  * AVG_DAILY_KM splits lived entirely in [43, 223] km/day, while the app's own
    computation yields far smaller values (~33), so the model's second-most-
    important feature is effectively inert at inference.

A model can be trained on external/borrowed data (correct for a brand-new app with
no history yet) — but the features it learns from MUST be shaped the same way the
app computes them at serve time, or the model answers questions about a population
it will never see. This module encodes that shaping so train == serve BY CONTRACT.

Mirror of: apps/api/src/lib/ml/features.ts (extractFeatures) and
           apps/api/src/lib/ml/risk.ts    (fallbackScore, RISK_THRESHOLDS).
Keep the two in lockstep; the line references above are the anchor.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# The three feature names, in the exact order the TS runtime passes them and the
# order columns are fed to sklearn. These literal strings become the `feature`
# keys in every tree node; any other name silently resolves to 0 at serve time
# (random-forest.ts:38), so they must match EXACTLY.
FEATURES: list[str] = ["KM_SINCE_LAST_MAINT", "AVG_DAILY_KM", "MAINT_FREQ_12M"]

LABEL = "Failure_flag"

# Mirror of risk.ts.
DEFAULT_MAINT_INTERVAL_KM = 5000
RISK_THRESHOLDS = {"high": 0.70, "medium": 0.45}
_FALLBACK_WEIGHTS = {"km": 0.45, "daily": 0.30, "freq": 0.25}

# What the RUNNING APP actually produces for each feature, so we can flag a
# training set whose distribution the app will never reproduce. These are ranges
# the serve-time extractFeatures can realistically emit for this fleet, not hard
# limits — they drive a warning, not a rejection.
SERVE_PLAUSIBLE_RANGE = {
    "KM_SINCE_LAST_MAINT": (0, 200_000),
    "AVG_DAILY_KM": (0, 400),      # a service van; hundreds/day is already extreme
    "MAINT_FREQ_12M": (0, 24),     # count of services in the trailing year
}


def align_to_serve_contract(df: pd.DataFrame) -> pd.DataFrame:
    """Transform raw dataset feature columns so they match what apps/api emits.

    This is the crux of the parity fix. Every transform here is a literal mirror
    of a guarantee the serve-time extractor makes, so a value that survives here
    is one the app could actually produce:

      * KM_SINCE_LAST_MAINT: clamped to >= 0  -> features.ts:29 `Math.max(0, ...)`.
        Directly eliminates the negative-threshold dead splits.
      * AVG_DAILY_KM: >= 0 (it is |odometer delta| / days, never negative).
      * MAINT_FREQ_12M: a non-negative integer COUNT of maintenance rows.

    Returns a NEW frame; does not mutate the input.
    """
    out = df.copy()
    out["KM_SINCE_LAST_MAINT"] = np.maximum(0.0, out["KM_SINCE_LAST_MAINT"].astype(float))
    out["AVG_DAILY_KM"] = np.maximum(0.0, out["AVG_DAILY_KM"].astype(float))
    out["MAINT_FREQ_12M"] = np.maximum(0, out["MAINT_FREQ_12M"].round().astype(int))
    return out


def serve_range_report(df: pd.DataFrame) -> list[str]:
    """Return human-readable warnings where a feature's TRAINING distribution sits
    outside what the app can produce at serve time. An empty list means the
    training features look reproducible by the running app.

    This surfaces the AVG_DAILY_KM problem that clamping alone can't fix: if your
    borrowed dataset describes a fleet that drives 43-223 km/day but your vans do
    ~33, the model's daily-km feature is inert against your data — a distribution
    shift only you (who knows your fleet) can judge and reconcile.
    """
    warnings: list[str] = []
    for feat in FEATURES:
        lo, hi = SERVE_PLAUSIBLE_RANGE[feat]
        col = df[feat].astype(float)
        q_lo, q_hi = col.quantile(0.05), col.quantile(0.95)
        if q_hi < lo or q_lo > hi:
            warnings.append(
                f"[{feat}] training 5-95% range [{q_lo:.1f}, {q_hi:.1f}] barely "
                f"overlaps the app's plausible serve range [{lo}, {hi}]. The model "
                f"will learn splits your vehicles never reach — this feature will be "
                f"inert at inference. Reconcile units/definition before trusting it."
            )
        elif col.min() < lo or col.max() > hi:
            warnings.append(
                f"[{feat}] has training values outside [{lo}, {hi}] "
                f"(min {col.min():.1f}, max {col.max():.1f}); most mass is in range, "
                f"but the tails train splits the app can't reach."
            )
    return warnings


def fallback_score(km: float, daily: float, freq: float) -> float:
    """Exact mirror of risk.ts `fallbackScore` — the deterministic rule the app
    serves when no model is loaded. We compute it here so the trainer can report,
    honestly, whether the learned forest actually beats the free rule.
    """
    norm_km = min(km / DEFAULT_MAINT_INTERVAL_KM, 2.0) / 2.0
    norm_daily = min(daily / 100.0, 1.0)
    norm_freq = max(0.0, 1.0 - freq / 6.0)
    return (
        _FALLBACK_WEIGHTS["km"] * norm_km
        + _FALLBACK_WEIGHTS["daily"] * norm_daily
        + _FALLBACK_WEIGHTS["freq"] * norm_freq
    )


def fallback_scores(df: pd.DataFrame) -> np.ndarray:
    """Vectorized fallback_score over a feature frame (rows already serve-aligned)."""
    return np.array(
        [
            fallback_score(r.KM_SINCE_LAST_MAINT, r.AVG_DAILY_KM, r.MAINT_FREQ_12M)
            for r in df.itertuples(index=False)
        ]
    )
