"""
Motorpool Predictive Maintenance - ML API Backend
--------------------------------------------------
Exposes two ML endpoints:
  POST /api/predict-maintenance  → Random Forest (next maintenance prediction)
  POST /api/co-replaced-parts    → Association Rules (frequently co-replaced parts)

Run with: python motorpool_ml_api.py
Requires: flask, pandas, scikit-learn, joblib, numpy
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd
import os

app = Flask(__name__)
CORS(app)  # Allow frontend to call the API

# ── Load Models ────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

rf_model = joblib.load(os.path.join(BASE_DIR, "motorpool_rf_model.pkl"))
association_rules = joblib.load(os.path.join(BASE_DIR, "association_rules.pkl"))

print("[✓] Random Forest model loaded")
print(f"    Features : {list(rf_model.feature_names_in_)}")
print(f"    Classes  : {list(rf_model.classes_)}")
print("[✓] Association rules loaded")
print(f"    Vehicles : {list(association_rules.keys())}")


# ── Health Check ───────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "models": ["rf_classifier", "association_rules"]})


# ── Endpoint 1: Predictive Maintenance (Random Forest) ────────────────────────
@app.route("/api/predict-maintenance", methods=["POST"])
def predict_maintenance():
    """
    Request body (JSON):
    {
        "km_since_last_maint": 15000,   # KM driven since last maintenance
        "avg_daily_km": 80,             # Average KM driven per day
        "maint_freq_12m": 2             # Number of maintenances in last 12 months
    }

    Response:
    {
        "needs_maintenance": true/false,
        "probability": 0.82,            # Probability of needing maintenance
        "risk_level": "High",           # Low / Moderate / High
        "recommendation": "..."
    }
    """
    data = request.get_json(force=True)

    required_fields = ["km_since_last_maint", "avg_daily_km", "maint_freq_12m"]
    for field in required_fields:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    try:
        X = pd.DataFrame([{
            "KM_SINCE_LAST_MAINT": float(data["km_since_last_maint"]),
            "AVG_DAILY_KM":        float(data["avg_daily_km"]),
            "MAINT_FREQ_12M":      float(data["maint_freq_12m"]),
        }])

        prediction   = rf_model.predict(X)[0]
        probabilities = rf_model.predict_proba(X)[0]
        prob_needs_maint = float(probabilities[1])

        # Risk level thresholds
        if prob_needs_maint >= 0.70:
            risk_level = "High"
            recommendation = (
                "Immediate maintenance required. Schedule service within 3 days "
                "to avoid unexpected breakdowns."
            )
        elif prob_needs_maint >= 0.45:
            risk_level = "Moderate"
            recommendation = (
                "Maintenance recommended soon. Schedule service within 2 weeks "
                "to maintain vehicle reliability."
            )
        else:
            risk_level = "Low"
            recommendation = (
                "Vehicle is in good condition. Continue regular monitoring and "
                "schedule next preventive maintenance as planned."
            )

        return jsonify({
            "needs_maintenance": bool(int(prediction) == 1),
            "probability":       round(prob_needs_maint, 4),
            "risk_level":        risk_level,
            "recommendation":    recommendation,
            "input_summary": {
                "km_since_last_maint": data["km_since_last_maint"],
                "avg_daily_km":        data["avg_daily_km"],
                "maint_freq_12m":      data["maint_freq_12m"],
            }
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Endpoint 2: Co-Replaced Parts (Association Rules) ─────────────────────────
@app.route("/api/co-replaced-parts", methods=["POST"])
def co_replaced_parts():
    """
    Request body (JSON):
    {
        "vehicle_type": "Toyota Hiace",   # Must match a vehicle in the model
        "spare_part":   "Oil Filter"       # The part you are replacing
    }

    Response:
    {
        "vehicle_type": "Toyota Hiace",
        "spare_part": "Oil Filter",
        "recommendations": [
            {
                "part": "Engine Oil",
                "confidence": 1.0,
                "lift": 3.17,
                "frequency_label": "92%"
            }
        ]
    }
    """
    data = request.get_json(force=True)

    if "vehicle_type" not in data:
        return jsonify({"error": "Missing field: vehicle_type"}), 400
    if "spare_part" not in data:
        return jsonify({"error": "Missing field: spare_part"}), 400

    vehicle_type = data["vehicle_type"]
    spare_part   = data["spare_part"].strip()

    if vehicle_type not in association_rules:
        available = list(association_rules.keys())
        return jsonify({
            "error": f"Vehicle '{vehicle_type}' not found.",
            "available_vehicles": available
        }), 404

    rules_df = association_rules[vehicle_type]

    # Filter rules where antecedent contains the requested part
    matched = rules_df[
        rules_df["antecedents_str"].apply(
            lambda parts: spare_part in parts
        )
    ].copy()

    if matched.empty:
        return jsonify({
            "vehicle_type":    vehicle_type,
            "spare_part":      spare_part,
            "recommendations": [],
            "message":         f"No co-replacement rules found for '{spare_part}' on {vehicle_type}."
        })

    matched = matched.sort_values("confidence", ascending=False)

    recommendations = []
    for _, row in matched.iterrows():
        consequent_parts = row["consequents_str"]
        for part in consequent_parts:
            recommendations.append({
                "part":            part,
                "confidence":      round(float(row["confidence"]), 4),
                "lift":            round(float(row["lift"]), 4),
                "support":         round(float(row["support"]), 4),
                "frequency_label": f"{int(row['confidence'] * 100)}%",
            })

    return jsonify({
        "vehicle_type":    vehicle_type,
        "spare_part":      spare_part,
        "recommendations": recommendations,
    })


# ── Endpoint 3: All Rules for a Vehicle (Helper) ──────────────────────────────
@app.route("/api/all-rules/<vehicle_type>", methods=["GET"])
def all_rules(vehicle_type):
    """Returns all association rules for a given vehicle."""
    vehicle_type = vehicle_type.replace("_", " ")

    if vehicle_type not in association_rules:
        return jsonify({
            "error": f"Vehicle '{vehicle_type}' not found.",
            "available_vehicles": list(association_rules.keys())
        }), 404

    df = association_rules[vehicle_type]
    rows = []
    for _, row in df.iterrows():
        rows.append({
            "antecedents":  row["antecedents_str"],
            "consequents":  row["consequents_str"],
            "confidence":   round(float(row["confidence"]), 4),
            "lift":         round(float(row["lift"]), 4),
            "support":      round(float(row["support"]), 4),
        })

    return jsonify({
        "vehicle_type": vehicle_type,
        "total_rules":  len(rows),
        "rules":        rows,
    })


# ── Endpoint 4: List available vehicles ───────────────────────────────────────
@app.route("/api/vehicles", methods=["GET"])
def list_vehicles():
    return jsonify({"vehicles": list(association_rules.keys())})


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n" + "="*55)
    print("  Motorpool ML API  —  http://localhost:5000")
    print("  Endpoints:")
    print("    GET  /api/health")
    print("    GET  /api/vehicles")
    print("    POST /api/predict-maintenance")
    print("    POST /api/co-replaced-parts")
    print("    GET  /api/all-rules/<vehicle_type>")
    print("="*55 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=True)
