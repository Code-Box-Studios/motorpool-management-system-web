/**
 * Predictive Maintenance Display Helpers
 *
 * The Random Forest risk-scoring inference now runs server-side (the API's
 * GET /analytics/predictive-maintenance, backed by apps/api/src/lib/ml). This
 * module only adapts that API response into the FE's richer
 * VehicleRiskAssessment shape (the maintenance dashboard/insights components
 * display more than the API returns) and exposes small display helpers.
 */

import type { RiskAssessment } from '@mms/shared';

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
 * Adapt the API's RiskAssessment into the FE's VehicleRiskAssessment. The API
 * doesn't return raw maintenance history, so `lastMaintenanceDate` and
 * `predictedFailureDate` are estimates re-derived client-side from the same
 * daily-usage rate the API used to compute the risk score (not exact
 * historical/scheduled dates).
 */
export function buildAssessmentFromApi(
  apiRow: RiskAssessment
): VehicleRiskAssessment {
  const { kmSinceLastMaint, avgDailyKm, maintFreq12m } = apiRow;

  // These are usage-rate ESTIMATES (the API returns no raw dates). Clamp them to
  // a plausible service window so a very-low-usage vehicle (tiny avgDailyKm) can't
  // surface an absurd date like a ~20-year-old "Last Service".
  const daysSinceLastMaint =
    avgDailyKm > 0
      ? Math.min(Math.round(kmSinceLastMaint / avgDailyKm), 730)
      : null;
  const lastMaintenanceDate =
    daysSinceLastMaint !== null
      ? new Date(Date.now() - daysSinceLastMaint * MS_PER_DAY)
          .toISOString()
          .split('T')[0]
      : null;

  const remainingKm = Math.max(0, DEFAULT_MAINT_INTERVAL_KM - kmSinceLastMaint);
  const daysUntilDue =
    avgDailyKm > 0 ? Math.min(Math.ceil(remainingKm / avgDailyKm), 365) : 30;
  const predictedFailureDate = new Date(Date.now() + daysUntilDue * MS_PER_DAY)
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
    lastMaintenanceDate,
    predictedFailureDate,
    reason: buildReason(kmSinceLastMaint, avgDailyKm, maintFreq12m)
  };
}

/**
 * Get the next maintenance due mileage for a vehicle
 * based on standard intervals.
 */
export function getNextMaintenanceDueMileage(currentMileage: number): number {
  return (
    Math.ceil(currentMileage / DEFAULT_MAINT_INTERVAL_KM) *
    DEFAULT_MAINT_INTERVAL_KM
  );
}
