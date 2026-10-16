"""Export the supplied FP-Growth/Eclat rule bundles for the TypeScript API.

Only the known pandas/numpy objects in these saved models are accepted.
Python and pickle are used offline; the server loads validated JSON only.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import pickle


ALLOWED_GLOBALS = {
    ("pandas.core.frame", "DataFrame"),
    ("pandas.core.internals.managers", "BlockManager"),
    ("pandas._libs.internals", "_unpickle_block"),
    ("numpy._core.multiarray", "_reconstruct"),
    ("numpy", "ndarray"),
    ("numpy", "dtype"),
    ("builtins", "slice"),
    ("pandas.core.indexes.base", "_new_Index"),
    ("pandas.core.indexes.base", "Index"),
    ("pandas.core.indexes.range", "RangeIndex"),
}


class ModelReader(pickle.Unpickler):
    def find_class(self, module, name):
        if (module, name) not in ALLOWED_GLOBALS:
            raise pickle.UnpicklingError(f"Unsupported model object: {module}.{name}")
        return super().find_class(module, name)


def export_model(source: Path, algorithm: str) -> dict:
    with source.open("rb") as stream:
        bundle = ModelReader(stream).load()
    total = int(bundle["n_transactions"])
    minimum = float(bundle["min_support"])
    if total <= 0 or not 0 < minimum <= 1:
        raise ValueError("Invalid training metadata")
    rules = []
    for row in bundle["rules"].to_dict(orient="records"):
        support = float(row["support"])
        confidence = float(row["confidence"])
        lift = float(row["lift"])
        antecedent = str(row["antecedents_str"]).strip()
        consequent = str(row["consequents_str"]).strip()
        if (not antecedent or not consequent
                or not all(math.isfinite(n) for n in (support, confidence, lift))
                or not 0 <= support <= 1 or not 0 <= confidence <= 1 or lift < 0):
            raise ValueError("Invalid association rule")
        occurrences = round(support * total)
        if not math.isclose(occurrences, support * total, abs_tol=1e-8):
            raise ValueError("Support does not match the training transaction count")
        rules.append({
            "antecedent": antecedent, "consequent": consequent,
            "support": support, "confidence": confidence, "lift": lift,
            "coOccurrences": occurrences,
        })
    rules.sort(key=lambda rule: (-rule["confidence"], -rule["support"],
                                 rule["antecedent"], rule["consequent"]))
    return {
        "algorithm": algorithm,
        "modelName": {"fp_growth": "FP-Growth", "eclat": "Eclat"}[algorithm],
        "sourceFile": source.name,
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "trainingTransactions": total,
        "minSupport": minimum,
        "count": len(rules),
        "data": rules,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--algorithm", choices=("fp_growth", "eclat"), required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    model = export_model(args.model, args.algorithm)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(model, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Exported {model['modelName']}: {model['count']} rules, {model['trainingTransactions']} training transactions")


if __name__ == "__main__":
    main()
