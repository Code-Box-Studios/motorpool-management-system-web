"""Convert the supplied logistic-regression bundle for Python-free API inference.

Run only offline in an isolated, network-disabled environment with the pinned
requirements-logreg.txt dependencies. Pickles are executable formats; the
restricted readers narrow accepted globals but are not a general pickle sandbox.
The resulting JSON contains data only and preserves float64 inference precision.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import pickle
import re

from joblib.numpy_pickle import NumpyArrayWrapper, NumpyUnpickler
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler


FEATURES = [
    "KM_SINCE_LAST_MAINT", "AVG_DAILY_KM", "MAINT_FREQ_12M", "V_AGE",
    "downtime_hours", "last_failure_days_ago",
]
SKLEARN_VERSION = "1.8.0"
ARRAY_GLOBALS = {
    ("numpy", "ndarray"), ("numpy", "dtype"),
    ("numpy._core.multiarray", "_reconstruct"),
    ("numpy._core.multiarray", "scalar"),
    ("numpy.core.multiarray", "_reconstruct"),
    ("numpy.core.multiarray", "scalar"),
}
MODEL_GLOBALS = ARRAY_GLOBALS | {
    ("sklearn.linear_model._logistic", "LogisticRegression"),
    ("sklearn.preprocessing._data", "StandardScaler"),
    ("sklearn.preprocessing._function_transformer", "FunctionTransformer"),
    ("sklearn.pipeline", "Pipeline"),
    ("numpy", "clip"),
}


class RestrictedObjectArrayReader(pickle.Unpickler):
    """Protect the nested pickle payload used by joblib object-dtype arrays."""

    def find_class(self, module, name):
        if (module, name) not in ARRAY_GLOBALS:
            raise ValueError(f"Unsupported pickle global {module}.{name}")
        return super().find_class(module, name)


class RestrictedArrayWrapper(NumpyArrayWrapper):
    def read_array(self, unpickler, ensure_native_byte_order):
        if self.subclass is not np.ndarray:
            raise ValueError("Unsupported array subclass in pickle")
        if self.dtype.hasobject:
            # The upstream implementation uses unrestricted pickle.load here.
            return RestrictedObjectArrayReader(unpickler.file_handle).load()
        return super().read_array(unpickler, ensure_native_byte_order)


class RestrictedBundleReader(NumpyUnpickler):
    def find_class(self, module, name):
        if (module, name) == ("joblib.numpy_pickle", "NumpyArrayWrapper"):
            return RestrictedArrayWrapper
        if (module, name) not in MODEL_GLOBALS:
            raise ValueError(f"Unsupported pickle global {module}.{name}")
        return super().find_class(module, name)


def load_bundle(path: Path) -> dict:
    """Read the uncompressed joblib bundle with restricted outer/nested globals."""
    if sklearn.__version__ != SKLEARN_VERSION:
        raise ValueError(f"Use scikit-learn {SKLEARN_VERSION}; found {sklearn.__version__}")
    with Path(path).open("rb") as stream:
        return RestrictedBundleReader(
            str(path), stream, ensure_native_byte_order=True, mmap_mode=None,
        ).load()


def _array(value, shape: tuple[int, ...], name: str) -> np.ndarray:
    if (type(value) is not np.ndarray or value.shape != shape
            or value.dtype != np.dtype("float64") or not np.isfinite(value).all()):
        raise ValueError(f"{name} must be a finite float64 array of shape {shape}")
    return value


def _features(component, name: str, *, required: bool = True) -> None:
    if getattr(component, "n_features_in_", None) != len(FEATURES):
        raise ValueError(f"{name} feature count must be {len(FEATURES)}")
    names = getattr(component, "feature_names_in_", None)
    if names is None and not required:
        return
    if type(names) is not np.ndarray or names.tolist() != FEATURES:
        raise ValueError(f"{name} feature order must match the six supported features")


def _validate_model(model, name: str) -> None:
    if type(model) is not LogisticRegression:
        raise ValueError(f"{name} must be a fitted LogisticRegression")
    _features(model, name, required=False)
    classes = getattr(model, "classes_", None)
    if type(classes) is not np.ndarray or classes.tolist() != [0, 1]:
        raise ValueError(f"{name} classes must be exactly [0, 1]")
    _array(getattr(model, "coef_", None), (1, 6), f"{name} coefficients")
    _array(getattr(model, "intercept_", None), (1,), f"{name} intercept")


def _validate_scaler(scaler, name: str) -> None:
    if type(scaler) is not StandardScaler:
        raise ValueError(f"{name} must be a fitted StandardScaler")
    _features(scaler, name)
    if scaler.with_mean is not True or scaler.with_std is not True:
        raise ValueError(f"{name} must enable mean and standard-deviation scaling")
    _array(getattr(scaler, "mean_", None), (6,), f"{name} mean")
    scale = _array(getattr(scaler, "scale_", None), (6,), f"{name} scale")
    variance = _array(getattr(scaler, "var_", None), (6,), f"{name} variance")
    if np.any(scale <= 0) or np.any(variance < 0):
        raise ValueError(f"{name} scale must be positive and variance nonnegative")
    samples = getattr(scaler, "n_samples_seen_", None)
    if (isinstance(samples, (bool, np.bool_)) or not np.isscalar(samples)
            or not isinstance(samples, (int, float, np.integer, np.floating))
            or not math.isfinite(float(samples)) or samples <= 0 or int(samples) != samples):
        raise ValueError(f"{name} training sample count must be a positive integer")


def bundle_to_model(bundle: dict, *, source_file: str, source_sha256: str) -> dict:
    """Validate the complete pipeline and export equivalent standalone parameters."""
    if (type(bundle) is not dict
            or set(bundle) != {"model", "scaler", "pipeline", "features", "risk_threshold"}):
        raise ValueError("Bundle must contain exactly model, scaler, pipeline, features, risk_threshold")
    if type(bundle["features"]) is not list or bundle["features"] != FEATURES:
        raise ValueError("Bundle feature order must match the six supported features")
    if not isinstance(source_sha256, str) or re.fullmatch(r"[0-9a-f]{64}", source_sha256) is None:
        raise ValueError("Source SHA-256 must contain 64 lowercase hexadecimal characters")
    if not isinstance(source_file, str) or not source_file or Path(source_file).name != source_file:
        raise ValueError("Source file must be a nonempty basename")
    threshold = bundle["risk_threshold"]
    if (type(threshold) not in (int, float) or not math.isfinite(threshold)
            or not 0 < threshold <= 100):
        raise ValueError("risk_threshold must be a finite percentage greater than 0 and at most 100")
    pipeline = bundle["pipeline"]
    if (type(pipeline) is not Pipeline or type(pipeline.steps) is not list
            or len(pipeline.steps) != 3
            or any(type(step) is not tuple or len(step) != 2 for step in pipeline.steps)
            or [name for name, _ in pipeline.steps] != ["clip_non_negative", "scaler", "model"]):
        raise ValueError("Unsupported pipeline: expected clip_non_negative, scaler, model in that order")
    clip, pipeline_scaler, pipeline_model = [step for _, step in pipeline.steps]
    if (type(clip) is not FunctionTransformer or clip.func is not np.clip
            or clip.kw_args != {"a_min": 0, "a_max": None}
            or clip.validate is not False or clip.accept_sparse is not False
            or clip.inverse_func is not None or clip.inv_kw_args is not None
            or clip.feature_names_out != "one-to-one"):
        raise ValueError("Unsupported pipeline clip: expected np.clip with minimum 0 and no maximum")
    _features(clip, "pipeline clip")
    model, scaler = bundle["model"], bundle["scaler"]
    _validate_model(model, "model")
    _validate_model(pipeline_model, "pipeline model")
    _validate_scaler(scaler, "scaler")
    _validate_scaler(pipeline_scaler, "pipeline scaler")
    for name, standalone, member, attributes in [
        ("model", model, pipeline_model, ["coef_", "intercept_", "classes_"]),
        ("scaler", scaler, pipeline_scaler, ["mean_", "scale_", "var_", "n_samples_seen_"]),
    ]:
        if (standalone.get_params(deep=False) != member.get_params(deep=False)
                or any(not np.array_equal(getattr(standalone, key), getattr(member, key))
                       for key in attributes)):
            raise ValueError(f"Standalone {name} parameters must match pipeline {name} parameters")
    return {
        "formatVersion": 1,
        "algorithm": "logistic_regression",
        "features": list(FEATURES),
        "classes": [0, 1],
        "coefficients": model.coef_[0].tolist(),
        "intercept": float(model.intercept_[0]),
        "scaler": {"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()},
        "clipMin": 0,
        "riskThreshold": threshold / 100,
        "sourceFile": source_file,
        "sourceSha256": source_sha256,
        "sklearnVersion": sklearn.__version__,
        "trainingSamples": int(scaler.n_samples_seen_),
    }


def _predict_json(model: dict, row) -> float:
    """Mirror float64 clipping, scaling, accumulation and stable JS sigmoid."""
    logit = model["intercept"]
    for value, mean, scale, coefficient in zip(
        row, model["scaler"]["mean"], model["scaler"]["scale"], model["coefficients"],
    ):
        logit += ((max(model["clipMin"], float(value)) - mean) / scale) * coefficient
    if logit >= 0:
        return 1 / (1 + math.exp(-logit))
    exponent = math.exp(logit)
    return exponent / (1 + exponent)


def roundtrip_check(bundle: dict, model: dict, frame: pd.DataFrame, tolerance: float = 1e-12) -> float:
    """Compare JSON inference with the actual supplied pipeline.predict_proba."""
    reference = bundle["pipeline"].predict_proba(frame)[:, 1]
    computed = np.array([_predict_json(model, row) for row in frame.to_numpy()])
    error = float(np.max(np.abs(reference - computed)))
    if not math.isfinite(error) or error > tolerance:
        raise AssertionError(f"Round-trip FAILED: max probability error {error:.3e}; tolerance {tolerance:.3e}")
    return error


def create_parity_fixtures(bundle: dict, model: dict) -> dict:
    """Generate deterministic synthetic goldens from the actual original pipeline.

    These probes establish conversion parity only. They are not observations,
    model-accuracy estimates, feature definitions, or proof of class semantics.
    """
    mean = np.array(model["scaler"]["mean"], dtype=np.float64)
    scale = np.array(model["scaler"]["scale"], dtype=np.float64)
    rng = np.random.default_rng(42)
    rows = [np.zeros(6), -np.ones(6), mean, mean - scale, mean + scale,
            mean - 3 * scale, mean + 3 * scale, np.full(6, 1e10), np.full(6, -1e10)]
    for index in range(6):
        for factor in [-10, -1, -1e-9, 1e-9, 1, 10, 1e6]:
            row = mean.copy()
            row[index] += factor * scale[index]
            rows.append(row)
    rows.extend(rng.normal(mean, 2 * scale, size=(2048, 6)))
    rows.extend(rng.uniform(0, 1, size=(256, 6)) * (mean + 10 * scale))
    # Solve for attainable points on both sides of the API's medium/high cutoffs.
    for probability in [0.45 - 1e-8, 0.45, 0.45 + 1e-8,
                        model["riskThreshold"] - 1e-8, model["riskThreshold"],
                        model["riskThreshold"] + 1e-8]:
        if not 0 < probability < 1:
            continue
        logit = math.log(probability / (1 - probability))
        for index, coefficient in enumerate(model["coefficients"]):
            if coefficient == 0:
                continue
            row = mean.copy()
            row[index] = mean[index] + scale[index] * (logit - model["intercept"]) / coefficient
            if row[index] >= 0:
                rows.append(row)
                break
    frame = pd.DataFrame(rows, columns=FEATURES, dtype=np.float64)
    roundtrip_check(bundle, model, frame)
    probabilities = bundle["pipeline"].predict_proba(frame)[:, 1]
    return {
        "sourceSha256": model["sourceSha256"],
        "cases": [{"input": row.tolist(), "probability": float(probability)}
                  for row, probability in zip(frame.to_numpy(), probabilities)],
    }


def _write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def _cli() -> None:
    here = Path(__file__).resolve().parent
    repository = here.parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=here / "mms_logistic_regression_model.pkl")
    parser.add_argument("--out", type=Path, default=repository / "apps/api/src/assets/logistic_regression_model.json")
    parser.add_argument("--fixtures", type=Path, default=repository / "apps/api/src/lib/ml/fixtures/logistic-regression-parity.json")
    args = parser.parse_args()
    source_sha256 = hashlib.sha256(args.model.read_bytes()).hexdigest()
    bundle = load_bundle(args.model)
    model = bundle_to_model(bundle, source_file=args.model.name, source_sha256=source_sha256)
    # Serialize and deserialize before comparison: verify the values consumers read.
    model = json.loads(json.dumps(model, allow_nan=False))
    fixtures = create_parity_fixtures(bundle, model)
    frame = pd.DataFrame([case["input"] for case in fixtures["cases"]], columns=FEATURES)
    error = roundtrip_check(bundle, model, frame)
    _write_json(args.out, model)
    _write_json(args.fixtures, fixtures)
    print(f"Wrote {args.out} and {args.fixtures}")
    print(f"source SHA-256: {source_sha256}")
    print(f"Pipeline parity: {len(fixtures['cases'])} probes; max probability error {error:.3e}")


if __name__ == "__main__":
    _cli()
