/**
 * ML API client for the Flask backend (motorpool_ml_api.py).
 *
 * Calls the Python backend that loads the trained .pkl models:
 * - motorpool_rf_model.pkl  → Random Forest maintenance prediction
 * - association_rules.pkl   → Apriori co-replaced parts rules
 *
 * Falls back gracefully when the API is unreachable.
 */

const ML_API_BASE = import.meta.env.VITE_ML_API_URL ?? 'http://localhost:5000';

// ─── Types ──────────────────────────────────────────────────────────

interface PredictMaintenanceRequest {
  km_since_last_maint: number;
  avg_daily_km: number;
  maint_freq_12m: number;
}

export interface PredictMaintenanceResponse {
  needs_maintenance: boolean;
  probability: number;
  risk_level: 'High' | 'Moderate' | 'Low';
  recommendation: string;
}

export interface CoReplacedPartsResponse {
  vehicle_type: string;
  spare_part: string;
  recommendations: Array<{
    part: string;
    confidence: number;
    lift: number;
    support: number;
    frequency_label: string;
  }>;
  message?: string;
}

export interface AllRulesResponse {
  vehicle_type: string;
  total_rules: number;
  rules: Array<{
    antecedents: string[];
    consequents: string[];
    confidence: number;
    lift: number;
    support: number;
  }>;
}

// ─── Health Check ───────────────────────────────────────────────────

let apiAvailable: boolean | null = null;

/** Check if the ML API is running. Caches the result for the session. */
export async function isMLApiAvailable(): Promise<boolean> {
  if (apiAvailable !== null) return apiAvailable;

  try {
    const res = await fetch(`${ML_API_BASE}/api/health`, {
      signal: AbortSignal.timeout(3000)
    });
    apiAvailable = res.ok;
  } catch {
    apiAvailable = false;
  }

  return apiAvailable;
}

/** Reset the cached availability (useful if user starts the API later). */
export function resetMLApiStatus(): void {
  apiAvailable = null;
}

// ─── Predict Maintenance (Random Forest) ────────────────────────────

/** Get failure probability for a single vehicle from the trained RF model. */
export async function predictMaintenance(
  features: PredictMaintenanceRequest
): Promise<PredictMaintenanceResponse> {
  const res = await fetch(`${ML_API_BASE}/api/predict-maintenance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(features)
  });

  if (!res.ok) throw new Error(`ML API error: ${res.status}`);
  return res.json() as Promise<PredictMaintenanceResponse>;
}

/** Batch-predict maintenance for multiple vehicles in parallel. */
export async function predictMaintenanceBatch(
  featuresList: PredictMaintenanceRequest[]
): Promise<PredictMaintenanceResponse[]> {
  return Promise.all(featuresList.map(predictMaintenance));
}

// ─── Association Rules ──────────────────────────────────────────────

/** List all vehicle types that have association rules in the model. */
export async function getAvailableVehicles(): Promise<string[]> {
  const res = await fetch(`${ML_API_BASE}/api/vehicles`);
  if (!res.ok) throw new Error(`ML API error: ${res.status}`);
  const data = (await res.json()) as { vehicles: string[] };
  return data.vehicles;
}

/** Get all association rules for a specific vehicle type. */
export async function getAllRulesForVehicle(
  vehicleType: string
): Promise<AllRulesResponse> {
  const encoded = vehicleType.replace(/ /g, '_');
  const res = await fetch(`${ML_API_BASE}/api/all-rules/${encoded}`);
  if (!res.ok) throw new Error(`ML API error: ${res.status}`);
  return res.json() as Promise<AllRulesResponse>;
}

/** Fetch all association rules across all vehicle types. */
export async function getAllAssociationRules(): Promise<
  Map<string, AllRulesResponse>
> {
  const vehicles = await getAvailableVehicles();
  const entries = await Promise.all(
    vehicles.map(async (v) => {
      const rules = await getAllRulesForVehicle(v);
      return [v, rules] as const;
    })
  );
  return new Map(entries);
}
