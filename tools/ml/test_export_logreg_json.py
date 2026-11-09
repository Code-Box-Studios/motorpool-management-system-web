"""Regression tests for the offline logistic-regression bundle boundary."""

from __future__ import annotations

import copy
import hashlib
import importlib
import json
from pathlib import Path
import pickle
import subprocess
import sys
import tempfile
import unittest

import joblib
import numpy as np
import pandas as pd


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "mms_logistic_regression_model.pkl"
SOURCE_SHA256 = "7c61e80ab26f3ca8fee9725db13e4b8ac240fa2a02687e4976fc397581f06cc2"
FEATURES = [
    "KM_SINCE_LAST_MAINT", "AVG_DAILY_KM", "MAINT_FREQ_12M", "V_AGE",
    "downtime_hours", "last_failure_days_ago",
]


class ForbiddenPayload:
    def __reduce__(self):
        return eval, ("0",)


class LogisticRegressionExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(HERE))
        cls.exporter = importlib.import_module("export_logreg_json")
        cls.bundle = cls.exporter.load_bundle(SOURCE)

    def export(self, bundle):
        return self.exporter.bundle_to_model(
            bundle, source_file=SOURCE.name, source_sha256=SOURCE_SHA256,
        )

    def test_original_pickle_is_preserved_and_export_keeps_full_precision(self):
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(), SOURCE_SHA256)
        model = self.export(self.bundle)
        self.assertEqual(model["formatVersion"], 1)
        self.assertEqual(model["algorithm"], "logistic_regression")
        self.assertEqual(model["features"], FEATURES)
        self.assertEqual(model["classes"], [0, 1])
        self.assertEqual(model["coefficients"][0], 0.17804015930608086)
        self.assertEqual(model["scaler"]["scale"][0], 48453.0455313737)
        self.assertEqual(model["intercept"], -0.0023306538403259237)
        self.assertEqual(model["sourceFile"], SOURCE.name)
        self.assertEqual(model["sourceSha256"], SOURCE_SHA256)
        self.assertEqual(model["sklearnVersion"], "1.8.0")
        self.assertEqual(model["trainingSamples"], 250)
        self.assertEqual(model["riskThreshold"], 0.6)
        self.assertEqual(model["clipMin"], 0)

    def test_equivalent_distinct_pipeline_components_are_supported(self):
        bundle = copy.deepcopy(self.bundle)
        bundle["model"] = copy.deepcopy(bundle["model"])
        bundle["scaler"] = copy.deepcopy(bundle["scaler"])
        self.assertIsNot(bundle["model"], bundle["pipeline"].steps[2][1])
        self.assertIsNot(bundle["scaler"], bundle["pipeline"].steps[1][1])
        self.assertEqual(self.export(bundle)["classes"], [0, 1])

    def test_rejects_incorrect_feature_order_even_when_dimensions_match(self):
        bundle = copy.deepcopy(self.bundle)
        bundle["features"][0], bundle["features"][1] = bundle["features"][1], bundle["features"][0]
        with self.assertRaisesRegex(ValueError, "feature"):
            self.export(bundle)

    def test_rejects_scaler_feature_order_disagreement(self):
        bundle = copy.deepcopy(self.bundle)
        bundle["scaler"].feature_names_in_ = np.array(FEATURES[::-1], dtype=object)
        with self.assertRaisesRegex(ValueError, "feature"):
            self.export(bundle)

    def test_rejects_invalid_scale_instead_of_emitting_invalid_json(self):
        for scale in [0, -1, np.nan, np.inf]:
            with self.subTest(scale=scale):
                bundle = copy.deepcopy(self.bundle)
                bundle["scaler"].scale_[0] = scale
                with self.assertRaisesRegex(ValueError, "scale"):
                    self.export(bundle)

    def test_rejects_disabled_scaling(self):
        for flag in ["with_mean", "with_std"]:
            with self.subTest(flag=flag):
                bundle = copy.deepcopy(self.bundle)
                setattr(bundle["scaler"], flag, False)
                with self.assertRaisesRegex(ValueError, "scal"):
                    self.export(bundle)

    def test_rejects_component_or_parameter_disagreement(self):
        for component, attribute in [("model", "coef_"), ("model", "intercept_"),
                                     ("scaler", "mean_"), ("scaler", "scale_")]:
            with self.subTest(component=component, attribute=attribute):
                bundle = copy.deepcopy(self.bundle)
                bundle[component] = copy.deepcopy(bundle[component])
                getattr(bundle[component], attribute).flat[0] += 1
                with self.assertRaisesRegex(ValueError, "match"):
                    self.export(bundle)

    def test_rejects_unsupported_preprocessing_and_step_order(self):
        for change in ["upper_clip", "negative_clip", "extra_step", "step_order", "func"]:
            with self.subTest(change=change):
                bundle = copy.deepcopy(self.bundle)
                pipeline = bundle["pipeline"]
                if change == "upper_clip":
                    pipeline.steps[0][1].kw_args["a_max"] = 100
                elif change == "negative_clip":
                    pipeline.steps[0][1].kw_args["a_min"] = -1
                elif change == "extra_step":
                    pipeline.steps.append(("extra", "passthrough"))
                elif change == "step_order":
                    pipeline.steps[0], pipeline.steps[1] = pipeline.steps[1], pipeline.steps[0]
                else:
                    pipeline.steps[0][1].func = np.abs
                with self.assertRaisesRegex(ValueError, "pipeline|clip"):
                    self.export(bundle)

    def test_rejects_malformed_dimensions_classes_and_nonfinite_weights(self):
        for change in ["shape", "classes", "infinite", "missing", "extra", "type"]:
            with self.subTest(change=change):
                bundle = copy.deepcopy(self.bundle)
                if change == "shape":
                    bundle["model"].coef_ = np.zeros((1, 5))
                elif change == "classes":
                    bundle["model"].classes_ = np.array([1, 0])
                elif change == "infinite":
                    bundle["model"].intercept_[0] = np.inf
                elif change == "missing":
                    del bundle["model"]
                elif change == "extra":
                    bundle["unknown"] = 1
                else:
                    bundle["model"] = bundle["scaler"]
                with self.assertRaises(ValueError):
                    self.export(bundle)
        with self.assertRaises(ValueError):
            self.export([])

    def test_rejects_invalid_percentage_threshold_and_provenance(self):
        for threshold in [True, 0, -1, 101, np.nan, np.inf, "60"]:
            with self.subTest(threshold=threshold):
                bundle = copy.deepcopy(self.bundle)
                bundle["risk_threshold"] = threshold
                with self.assertRaisesRegex(ValueError, "threshold"):
                    self.export(bundle)
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.exporter.bundle_to_model(self.bundle, source_file=SOURCE.name, source_sha256="bad")

    def test_restricted_reader_rejects_globals_in_outer_pickle(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "forbidden.pkl"
            path.write_bytes(pickle.dumps(ForbiddenPayload()))
            with self.assertRaisesRegex(ValueError, "global"):
                self.exporter.load_bundle(path)

    def test_restricted_reader_also_protects_nested_joblib_object_arrays(self):
        # joblib normally calls unrestricted pickle.load inside object-array data.
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "forbidden-array.pkl"
            joblib.dump(np.array([ForbiddenPayload()], dtype=object), path)
            with self.assertRaisesRegex(ValueError, "global"):
                self.exporter.load_bundle(path)

    def test_fixtures_use_actual_pipeline_and_cover_probability_boundaries(self):
        model = self.export(self.bundle)
        fixtures = self.exporter.create_parity_fixtures(self.bundle, model)
        frame = pd.DataFrame([case["input"] for case in fixtures["cases"]], columns=FEATURES)
        expected = self.bundle["pipeline"].predict_proba(frame)[:, 1]
        actual = np.array([case["probability"] for case in fixtures["cases"]])
        np.testing.assert_array_equal(actual, expected)
        self.assertGreater(len(actual), 2000)
        for boundary in [0.45, 0.6]:
            for side in [-1, 1]:
                self.assertTrue(np.any((side * (actual - boundary) > 0)
                                       & (np.abs(actual - boundary) < 1e-7)))
        self.assertTrue(np.any(frame.to_numpy() < 0))
        self.assertTrue(np.any(frame.to_numpy() > 1e9))
        self.assertLessEqual(self.exporter.roundtrip_check(self.bundle, model, frame), 1e-12)
        # Every feature has independent sensitivity probes around the same mean.
        mean = np.array(model["scaler"]["mean"])
        for index in range(6):
            delta = frame.to_numpy() - mean
            changed = np.any((delta[:, index] != 0) & (np.count_nonzero(delta, axis=1) == 1))
            self.assertTrue(changed, FEATURES[index])

    def test_roundtrip_rejects_broken_export_instead_of_hiding_divergence(self):
        model = self.export(self.bundle)
        model["coefficients"][0] += 1
        frame = pd.DataFrame([[0] * 6], columns=FEATURES)
        with self.assertRaisesRegex(AssertionError, "Round-trip"):
            self.exporter.roundtrip_check(self.bundle, model, frame)

    def test_committed_json_and_goldens_match_original_pickle(self):
        repository = HERE.parents[1]
        model = json.loads((repository / "apps/api/src/assets/logistic_regression_model.json").read_text())
        fixtures = json.loads((repository / "apps/api/src/lib/ml/fixtures/logistic-regression-parity.json").read_text())
        self.assertEqual(model, self.export(self.bundle))
        self.assertEqual(fixtures["sourceSha256"], SOURCE_SHA256)
        self.assertGreater(len(fixtures["cases"]), 2000)
        frame = pd.DataFrame([case["input"] for case in fixtures["cases"]], columns=FEATURES)
        actual = self.bundle["pipeline"].predict_proba(frame)[:, 1]
        np.testing.assert_allclose(
            [case["probability"] for case in fixtures["cases"]], actual,
            rtol=0, atol=1e-12,
        )
        self.assertLessEqual(self.exporter.roundtrip_check(self.bundle, model, frame), 1e-12)


class LogisticRegressionCliTests(unittest.TestCase):
    def test_cli_exports_verified_model_and_actual_pipeline_fixtures(self):
        # Removing preprocessing, omitting provenance, or writing formula-derived
        # fixture values breaks this end-to-end export contract.
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "model.json"
            fixtures = Path(temporary) / "parity.json"
            result = subprocess.run(
                [sys.executable, str(HERE / "export_logreg_json.py"),
                 "--model", str(SOURCE), "--out", str(output),
                 "--fixtures", str(fixtures)],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            model = json.loads(output.read_text())
            goldens = json.loads(fixtures.read_text())
            self.assertEqual(model["sourceSha256"], SOURCE_SHA256)
            self.assertEqual(model["features"], FEATURES)
            self.assertEqual(model["riskThreshold"], 0.6)
            self.assertEqual(goldens["sourceSha256"], SOURCE_SHA256)
            self.assertGreater(len(goldens["cases"]), 2000)
            self.assertAlmostEqual(
                goldens["cases"][0]["probability"], 0.24398856266532412,
                delta=1e-15,
            )


if __name__ == "__main__":
    unittest.main()
