"""Guard saved-model parity at splits, including sklearn input precision."""

import json
from pathlib import Path
import sys
import unittest

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from export_rf_json import forest_to_rfmodel, roundtrip_check
from feature_spec import FEATURES


class RandomForestExportTests(unittest.TestCase):
    def test_roundtrip_matches_sklearn_float32_input_at_a_split(self):
        training = pd.DataFrame({"x": [0.0, 2.0]})
        forest = RandomForestClassifier(
            n_estimators=1, bootstrap=False, max_depth=1, random_state=0
        ).fit(training, [0, 1])
        probes = pd.DataFrame({"x": [1 - 1e-8, 1 + 1e-8, 1 + 1e-6]})
        self.assertEqual(forest.predict_proba(probes)[:, 1].tolist(), [0, 0, 1])
        model = forest_to_rfmodel(forest, ["x"])
        self.assertEqual(roundtrip_check(forest, model, probes, ["x"]), 0)

    def test_committed_asset_matches_original_forest_at_usage_boundaries(self):
        forest = joblib.load(HERE / "motorpool_rf_model.pkl")
        model = json.loads(
            (HERE.parents[1] / "apps/api/src/assets/rf_maintenance_model.json").read_text()
        )
        probes = pd.DataFrame(
            [[0, 139.1309, 0], [0, 139.131, 0], [0, 139.13101, 0],
             [0, 0, 0], [5000, 50, 1], [100000, 200, 0]],
            columns=FEATURES,
        )
        self.assertLessEqual(roundtrip_check(forest, model, probes, FEATURES), 1e-12)


if __name__ == "__main__":
    unittest.main()
