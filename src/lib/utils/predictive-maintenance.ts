/**
 * Predictive Maintenance Risk Scoring Algorithm
 *
 * Implements a rule-based risk scoring system inspired by the Random Forest
 * classifier from mms_randomforest.py. Uses the same features:
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

// Feature weights derived from typical Random Forest feature importances
// for vehicle maintenance prediction
const WEIGHTS = {
  kmSinceLastMaint: 0.45,
  avgDailyKm: 0.30,
  maintFreq12m: 0.25
};

// Thresholds for risk classification
const RISK_THRESHOLDS = {
  high: 0.65,
  medium: 0.40
};

// Default maintenance interval in km if no schedule exists
const DEFAULT_MAINT_INTERVAL_KM = 5000;

/**
 * Compute predictive maintenance risk for a vehicle based on its maintenance history.
 */
export function computeVehicleRisk(
  vehicle: Vehicle,
  maintenanceRecords: Maintenance[]
): VehicleRiskAssessment {
  const vehicleMaintenances = maintenanceRecords
    .filter((m) => m.vehicle_id === vehicle.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Feature 1: KM since last maintenance
  const lastMaint = vehicleMaintenances[0];
  const lastMaintMileage = lastMaint?.mileage ?? 0;
  const kmSinceLastMaint = Math.max(0, vehicle.mileage - lastMaintMileage);

  // Feature 2: Average daily KM (estimated from maintenance history)
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

  // Feature 3: Maintenance frequency in last 12 months
  const maintFreq12m = vehicleMaintenances.filter(
    (m) => new Date(m.date) >= oneYearAgo
  ).length;

  // Normalize features to 0–1 scale
  const normKmSinceLastMaint = Math.min(
    kmSinceLastMaint / DEFAULT_MAINT_INTERVAL_KM,
    2.0
  ) / 2.0;

  // Avg daily km: 0–100+ km/day → 0–1
  const normAvgDailyKm = Math.min(avgDailyKm / 100, 1.0);

  // Maintenance frequency: inverse — fewer maintenances = higher risk
  // 0 maintenances → 1.0 risk, 6+ → 0.0
  const normMaintFreq = Math.max(0, 1 - maintFreq12m / 6);

  // Weighted risk score
  const riskScore =
    WEIGHTS.kmSinceLastMaint * normKmSinceLastMaint +
    WEIGHTS.avgDailyKm * normAvgDailyKm +
    WEIGHTS.maintFreq12m * normMaintFreq;

  const clampedScore = Math.min(Math.max(riskScore, 0), 1);

  // Classify priority
  let priority: 'high' | 'medium' | 'low';
  if (clampedScore >= RISK_THRESHOLDS.high) {
    priority = 'high';
  } else if (clampedScore >= RISK_THRESHOLDS.medium) {
    priority = 'medium';
  } else {
    priority = 'low';
  }

  // Predict failure date based on remaining KM at current rate
  const remainingKm = Math.max(0, DEFAULT_MAINT_INTERVAL_KM - kmSinceLastMaint);
  const daysUntilDue =
    avgDailyKm > 0 ? Math.ceil(remainingKm / avgDailyKm) : 30;
  const predictedDate = new Date();
  predictedDate.setDate(predictedDate.getDate() + daysUntilDue);

  // Generate reason based on dominant risk factor
  const reason = generateReason(
    kmSinceLastMaint,
    avgDailyKm,
    maintFreq12m,
    vehicle.mileage
  );

  return {
    vehicleId: vehicle.id,
    licensePlate: vehicle.license_plate,
    vehicleName: `${vehicle.make} ${vehicle.model}`,
    mileage: vehicle.mileage,
    kmSinceLastMaint,
    avgDailyKm: Math.round(avgDailyKm * 10) / 10,
    maintFreq12m,
    riskScore: Math.round(clampedScore * 100),
    priority,
    lastMaintenanceDate: lastMaint?.date ?? null,
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
 */
export function computeFleetRiskAssessments(
  vehicles: Vehicle[],
  maintenanceRecords: Maintenance[]
): VehicleRiskAssessment[] {
  return vehicles
    .map((v) => computeVehicleRisk(v, maintenanceRecords))
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
