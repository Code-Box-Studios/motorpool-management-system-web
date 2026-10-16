"""Verify the saved models retain their original metrics after export."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent


class ExportAssociationModelsTest(unittest.TestCase):
    def test_both_models_preserve_directional_rules_and_provenance(self):
        for algorithm, filename in (
            ("fp_growth", "mms_fpgrowth_model.pkl"),
            ("eclat", "mms_eclat_model.pkl"),
        ):
            with self.subTest(algorithm=algorithm), tempfile.TemporaryDirectory() as folder:
                output = Path(folder) / "model.json"
                source = HERE / filename
                result = subprocess.run(
                    [sys.executable, str(HERE / "export_association_json.py"),
                     "--algorithm", algorithm, "--model", str(source), "--out", str(output)],
                    capture_output=True, text=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                model = json.loads(output.read_text())
                self.assertEqual(model["algorithm"], algorithm)
                self.assertEqual(model["trainingTransactions"], 21)
                self.assertEqual(model["sourceSha256"], hashlib.sha256(source.read_bytes()).hexdigest())
                self.assertEqual(model["count"], 4)
                self.assertEqual(len(model["data"]), 4)
                by_pair = {(r["antecedent"], r["consequent"]): r for r in model["data"]}
                self.assertEqual(by_pair[("Fuel Filter", "Oil Filter")], {
                    "antecedent": "Fuel Filter", "consequent": "Oil Filter",
                    "support": 4 / 21, "confidence": 1.0, "lift": 3.0, "coOccurrences": 4,
                })
                self.assertAlmostEqual(by_pair[("Oil Filter", "Fuel Filter")]["confidence"], 4 / 7)
                self.assertEqual(by_pair[("Air Cleaner Element", "Oil Filter")]["coOccurrences"], 2)
                self.assertEqual(by_pair[("Valve Cover Gasket", "Oil Filter")]["coOccurrences"], 2)


if __name__ == "__main__":
    unittest.main()
