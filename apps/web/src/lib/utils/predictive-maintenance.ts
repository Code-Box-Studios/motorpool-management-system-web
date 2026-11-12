/**
 * Predictive Maintenance Display Helpers
 *
 * The Random Forest risk-scoring inference now runs server-side (the API's
 * GET /analytics/predictive-maintenance, backed by apps/api/src/lib/ml). This
 * module only adapts that API response into the FE's richer
 * VehicleRiskAssessment shape (the maintenance dashboard/insights components
 * display more than the API returns) and exposes small display helpers.
 */

import type {
  PredictiveMaintenanceAlgorithm,
  RiskAssessment
} from '@mms/shared';

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
  // True when the API scored this vehicle with the deterministic rule-based
  // fallback because the ML risk model wasn't loaded. Surfaced so the UI can
  // label a rule-based estimate honestly instead of passing it off as the model.
  usedFallback: boolean;
  lastMaintenanceDate: string | null;
  lastMaintenanceMileage: number | null;
  nextMaintenanceDueMileage: number | null;
  nextMaintenanceDueDate: string | null;
  preventiveStatus: NonNullable<RiskAssessment['preventiveStatus']>;
  preventiveSource: NonNullable<RiskAssessment['preventiveSource']>;
  predictedFailureDate: string | null;
  reason: string;
}

const DEFAULT_MAINT_INTERVAL_KM = 5000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Explain what's driving the risk score, from the same inputs the API scored on. */
function buildReason(
  kmSinceLastMaint: number,
  avgDailyKm: number,
  maintFreq12m: number
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
  if (avgDailyKm > 80) reasons.push('Heavy daily usage detected');
  else if (avgDailyKm > 50) reasons.push('Above-average daily usage');
  if (maintFreq12m === 0)
    reasons.push('No maintenance recorded in the last 12 months');
  else if (maintFreq12m <= 1) reasons.push('Infrequent maintenance history');

  return reasons.length > 0
    ? reasons.join('. ')
    : 'Routine maintenance monitoring';
}

/**
 * Adapt risk scores and recorded preventive deadlines for display. Historical
 * service dates come from the API. Only predictedFailureDate is a usage-based
 * estimate; Logistic Regression does not supply that prediction horizon.
 */
export function buildAssessmentFromApi(
  apiRow: RiskAssessment,
  algorithm: PredictiveMaintenanceAlgorithm = apiRow.scoringMethod ??
    'random_forest'
): VehicleRiskAssessment {
  const { kmSinceLastMaint, avgDailyKm, maintFreq12m } = apiRow;

  // A historical service date must come from a recorded service, not usage.
  const lastMaintenanceDate = apiRow.lastMaintenanceDate ?? null;

  const remainingKm = Math.max(0, DEFAULT_MAINT_INTERVAL_KM - kmSinceLastMaint);
  const daysUntilDue =
    avgDailyKm > 0 ? Math.min(Math.ceil(remainingKm / avgDailyKm), 365) : 30;
  const predictedFailureDate =
    algorithm === 'logistic_regression'
      ? null
      : new Date(Date.now() + daysUntilDue * MS_PER_DAY)
          .toISOString()
          .split('T')[0];

  return {
    vehicleId: apiRow.vehicleId,
    licensePlate: apiRow.licensePlate,
    vehicleName: `${apiRow.make} ${apiRow.model}`,
    mileage: apiRow.mileage,
    kmSinceLastMaint,
    avgDailyKm: Math.round(avgDailyKm * 10) / 10,
    maintFreq12m,
    riskScore: apiRow.riskScore,
    priority: apiRow.priority,
    usedFallback: apiRow.usedFallback,
    lastMaintenanceDate,
    lastMaintenanceMileage: apiRow.lastMaintenanceMileage ?? null,
    nextMaintenanceDueMileage: apiRow.nextMaintenanceDueMileage ?? null,
    nextMaintenanceDueDate: apiRow.nextMaintenanceDueDate ?? null,
    preventiveStatus: apiRow.preventiveStatus ?? 'unknown',
    preventiveSource: apiRow.preventiveSource ?? 'unknown',
    predictedFailureDate,
    reason:
      algorithm === 'logistic_regression'
        ? 'Model score from available vehicle history. Review records before planning maintenance.'
        : buildReason(kmSinceLastMaint, avgDailyKm, maintFreq12m)
  };
}

export const PREVENTIVE_STATUS = {
  overdue: { label: 'Overdue', badge: 'stop' },
  due_soon: { label: 'Due Soon', badge: 'wait' },
  on_schedule: { label: 'On Schedule', badge: 'neutral' },
  unknown: { label: 'Unknown', badge: 'neutral' }
} as const;

/** Shared presentation of recorded preventive deadlines, independent of ML risk. */
export function preventiveSummary(assessment: VehicleRiskAssessment) {
  const due = assessment.nextMaintenanceDueMileage;
  const remaining = due === null ? null : due - assessment.mileage;
  const status = assessment.preventiveStatus;
  const priority =
    status === 'overdue' ? 'high' : status === 'due_soon' ? 'medium' : 'low';
  const reason =
    status === 'unknown'
      ? 'A recorded service mileage or configured deadline is needed.'
      : remaining !== null && remaining <= 0
        ? `Overdue for ${due!.toLocaleString()} km service`
        : status === 'overdue' && assessment.nextMaintenanceDueDate
          ? `Service date ${assessment.nextMaintenanceDueDate} is overdue`
          : remaining !== null
            ? remaining <= 500
              ? `Approaching ${due!.toLocaleString()} km service interval`
              : `${remaining.toLocaleString()} km until next scheduled service`
            : `Next service date: ${assessment.nextMaintenanceDueDate}`;
  const baseline = assessment.lastMaintenanceMileage;
  const progress =
    assessment.preventiveSource === 'service_history' &&
    baseline !== null &&
    due !== null &&
    due > baseline
      ? Math.max(
          0,
          Math.min(
            100,
            ((assessment.mileage - baseline) / (due - baseline)) * 100
          )
        )
      : null;
  return {
    due,
    remaining,
    status,
    priority: priority as 'high' | 'medium' | 'low',
    reason,
    progress
  };
}
