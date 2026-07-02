/**
 * Predictive Maintenance Risk Scoring Algorithm
 *
 * Loads a trained Random Forest model from public/ml/rf_maintenance_model.json
 * and runs real inference in the browser. Falls back to a rule-based
 * approximation if the model file is not available.
 *
 * Features (same as mms_randomforest.py):
 * - KM_SINCE_LAST_MAINT: kilometers driven since last maintenance
 * - AVG_DAILY_KM: average daily kilometers driven
 * - MAINT_FREQ_12M: maintenance frequency in the last 12 months
 */

import type { Vehicle, Maintenance } from '../types';

export interface VehicleRiskAssessment {
  vehicleId: string;
  licensePlate: string;
  vehicleName: string;
  mileage: number;
  kmSinceLastMaint: number;
  avgDailyKm: number;
  maintFreq12m: number;
  riskScore: number;
  priority: 'high' | 'medium' | 'low';
  lastMaintenanceDate: string | null;
  predictedFailureDate: string;
  reason: string;
}

// ─── Random Forest JSON Model Types ─────────────────────────────────

interface TreeLeaf {
  probs: number[]; // [P(no_fail), P(fail)]
}

interface TreeNode {
  feature: string;
  threshold: number;
  left: TreeNode | TreeLeaf;
  right: TreeNode | TreeLeaf;
}

interface RFModel {
  features: string[];
  n_estimators: number;
  classes: number[];
  feature_importances: Record<string, number>;
  trees: (TreeNode | TreeLeaf)[];
}

// ─── Model Loading ──────────────────────────────────────────────────

let cachedModel: RFModel | null = null;
let modelLoadAttempted = false;

async function loadModel(): Promise<RFModel | null> {
  if (cachedModel) return cachedModel;
  if (modelLoadAttempted) return null;

  modelLoadAttempted = true;
  try {
    const response = await fetch('/ml/rf_maintenance_model.json');
    if (!response.ok) return null;
    cachedModel = (await response.json()) as RFModel;
    return cachedModel;
  } catch {
    return null;
  }
}

/**
 * Traverse a single decision tree to get failure probability.
 */
function predictTree(
  node: TreeNode | TreeLeaf,
  features: Record<string, number>
): number {
  if ('probs' in node) {
    return node.probs[1] ?? 0;
  }
  const value = features[node.feature] ?? 0;
  return value <= node.threshold
    ? predictTree(node.left, features)
    : predictTree(node.right, features);
}

/**
 * Run the full Random Forest: average failure probability across all trees.
 */
function predictRandomForest(
  model: RFModel,
  features: Record<string, number>
): number {
  const probabilities = model.trees.map((tree) => predictTree(tree, features));
  return probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length;
}

// ─── Fallback Weights (used when model JSON is not available) ───────

const FALLBACK_WEIGHTS = {
  kmSinceLastMaint: 0.45,
  avgDailyKm: 0.30,
  maintFreq12m: 0.25
};

const RISK_THRESHOLDS = {
  high: 0.65,
  medium: 0.40
};

const DEFAULT_MAINT_INTERVAL_KM = 5000;

// ─── Feature Extraction ────────────────────────────────────────────

interface ExtractedFeatures {
  kmSinceLastMaint: number;
  avgDailyKm: number;
  maintFreq12m: number;
  lastMaint: Maintenance | undefined;
}

function extractFeatures(
  vehicle: Vehicle,
  maintenanceRecords: Maintenance[]
): ExtractedFeatures {
  const vehicleMaintenances = maintenanceRecords
    .filter((m) => m.vehicle_id === vehicle.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const lastMaint = vehicleMaintenances[0];
  const lastMaintMileage = lastMaint?.mileage ?? 0;
  const kmSinceLastMaint = Math.max(0, vehicle.mileage - lastMaintMileage);

  let avgDailyKm = 0;
  if (vehicleMaintenances.length >= 2) {
    const oldest = vehicleMaintenances[vehicleMaintenances.length - 1];
    const newest = vehicleMaintenances[0];
    const daysBetween = Math.max(
      1,
      (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const kmBetween = Math.abs(
      (newest.mileage ?? 0) - (oldest.mileage ?? 0)
    );
    avgDailyKm = kmBetween / daysBetween;
  } else if (lastMaint) {
    const daysSinceLast = Math.max(
      1,
      (now.getTime() - new Date(lastMaint.date).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    avgDailyKm = kmSinceLastMaint / daysSinceLast;
  }

  const maintFreq12m = vehicleMaintenances.filter(
    (m) => new Date(m.date) >= oneYearAgo
  ).length;

  return { kmSinceLastMaint, avgDailyKm, maintFreq12m, lastMaint };
}

// ─── Scoring ────────────────────────────────────────────────────────

function fallbackScore(features: ExtractedFeatures): number {
  const normKm =
    Math.min(features.kmSinceLastMaint / DEFAULT_MAINT_INTERVAL_KM, 2.0) / 2.0;
  const normDaily = Math.min(features.avgDailyKm / 100, 1.0);
  const normFreq = Math.max(0, 1 - features.maintFreq12m / 6);

  return (
    FALLBACK_WEIGHTS.kmSinceLastMaint * normKm +
    FALLBACK_WEIGHTS.avgDailyKm * normDaily +
    FALLBACK_WEIGHTS.maintFreq12m * normFreq
  );
}

/**
 * Compute predictive maintenance risk for a vehicle.
 * Uses the trained RF model if available, otherwise falls back to rule-based scoring.
 */
export function computeVehicleRisk(
  vehicle: Vehicle,
  maintenanceRecords: Maintenance[],
  model?: RFModel | null
): VehicleRiskAssessment {
  const features = extractFeatures(vehicle, maintenanceRecords);

  let riskScore: number;

  if (model) {
    riskScore = predictRandomForest(model, {
      KM_SINCE_LAST_MAINT: features.kmSinceLastMaint,
      AVG_DAILY_KM: features.avgDailyKm,
      MAINT_FREQ_12M: features.maintFreq12m
    });
  } else {
    riskScore = fallbackScore(features);
  }

  const clampedScore = Math.min(Math.max(riskScore, 0), 1);

  let priority: 'high' | 'medium' | 'low';
  if (clampedScore >= RISK_THRESHOLDS.high) {
    priority = 'high';
  } else if (clampedScore >= RISK_THRESHOLDS.medium) {
    priority = 'medium';
  } else {
    priority = 'low';
  }

  const remainingKm = Math.max(
    0,
    DEFAULT_MAINT_INTERVAL_KM - features.kmSinceLastMaint
  );
  const daysUntilDue =
    features.avgDailyKm > 0
      ? Math.ceil(remainingKm / features.avgDailyKm)
      : 30;
  const predictedDate = new Date();
  predictedDate.setDate(predictedDate.getDate() + daysUntilDue);

  const reason = generateReason(
    features.kmSinceLastMaint,
    features.avgDailyKm,
    features.maintFreq12m,
    vehicle.mileage
  );

  return {
    vehicleId: vehicle.id,
    licensePlate: vehicle.license_plate,
    vehicleName: `${vehicle.make} ${vehicle.model}`,
    mileage: vehicle.mileage,
    kmSinceLastMaint: features.kmSinceLastMaint,
    avgDailyKm: Math.round(features.avgDailyKm * 10) / 10,
    maintFreq12m: features.maintFreq12m,
    riskScore: Math.round(clampedScore * 100),
    priority,
    lastMaintenanceDate: features.lastMaint?.date ?? null,
    predictedFailureDate: predictedDate.toISOString().split('T')[0],
    reason
  };
}

function generateReason(
  kmSinceLastMaint: number,
  avgDailyKm: number,
  maintFreq12m: number,
  currentMileage: number
): string {
  const reasons: string[] = [];

  if (kmSinceLastMaint >= DEFAULT_MAINT_INTERVAL_KM) {
    reasons.push(
      `Overdue by ${(kmSinceLastMaint - DEFAULT_MAINT_INTERVAL_KM).toLocaleString()} km`
    );
  } else if (kmSinceLastMaint >= DEFAULT_MAINT_INTERVAL_KM * 0.8) {
    reasons.push(
      `Approaching ${DEFAULT_MAINT_INTERVAL_KM.toLocaleString()} km service interval`
    );
  }

  if (avgDailyKm > 80) {
    reasons.push('Heavy daily usage detected');
  } else if (avgDailyKm > 50) {
    reasons.push('Above-average daily usage');
  }

  if (maintFreq12m === 0) {
    reasons.push('No maintenance recorded in the last 12 months');
  } else if (maintFreq12m <= 1) {
    reasons.push('Infrequent maintenance history');
  }

  // Mileage-based component predictions
  const mileageIntervals = [
    { km: 5000, task: 'Oil change & filter replacement' },
    { km: 10000, task: 'Brake inspection & tire rotation' },
    { km: 20000, task: 'Belt replacement & coolant flush' },
    { km: 30000, task: 'Transmission fluid change' },
    { km: 50000, task: 'Major service inspection' }
  ];

  for (const interval of mileageIntervals) {
    const kmToNext =
      interval.km - (currentMileage % interval.km);
    if (kmToNext <= 1000) {
      reasons.push(`Predicted next: ${interval.task}`);
      break;
    }
  }

  return reasons.length > 0
    ? reasons.join('. ')
    : 'Routine maintenance monitoring';
}

/**
 * Compute risk assessments for all vehicles and return sorted by risk.
 * Loads the trained RF model if available in public/ml/rf_maintenance_model.json.
 */
export async function computeFleetRiskAssessments(
  vehicles: Vehicle[],
  maintenanceRecords: Maintenance[]
): Promise<VehicleRiskAssessment[]> {
  const model = await loadModel();
  return vehicles
    .map((v) => computeVehicleRisk(v, maintenanceRecords, model))
    .sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Get the next maintenance due mileage for a vehicle
 * based on standard intervals.
 */
export function getNextMaintenanceDueMileage(currentMileage: number): number {
  const interval = DEFAULT_MAINT_INTERVAL_KM;
  return Math.ceil(currentMileage / interval) * interval;
}
