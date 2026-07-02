import { useQuery } from '@tanstack/react-query';
import {
  getVehiclesWithMaintenanceHistory,
  getJobOrdersWithSpareParts,
  getVehicleStatusCounts,
  getCompletedTripsCount
} from '../supabase/analytics';
import {
  computeFleetRiskAssessments,
  type VehicleRiskAssessment
} from '../utils/predictive-maintenance';
import {
  computeAssociationRules,
  buildTransactions,
  type AssociationRule
} from '../utils/spare-parts-association';
import {
  isMLApiAvailable,
  predictMaintenanceBatch,
  getAllAssociationRules
} from '../services/ml-api';
import type { Vehicle, Maintenance } from '../types';

// ─── Feature Extraction (shared with predictive-maintenance.ts) ────

const DEFAULT_MAINT_INTERVAL_KM = 5000;

/** Extract the 3 RF features for a single vehicle. */
function extractVehicleFeatures(
  vehicle: Vehicle,
  maintenances: Maintenance[]
) {
  const vehicleMaintenances = maintenances
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

  return {
    kmSinceLastMaint,
    avgDailyKm,
    maintFreq12m,
    lastMaintenanceDate: lastMaint?.date ?? null
  };
}

// ─── Risk Assessment Builder ────────────────────────────────────────

const RISK_THRESHOLDS = { high: 0.65, medium: 0.40 };

/** Build a VehicleRiskAssessment from API probability + extracted features. */
function buildAssessmentFromApi(
  vehicle: Vehicle,
  probability: number,
  features: ReturnType<typeof extractVehicleFeatures>
): VehicleRiskAssessment {
  const riskScore = Math.round(Math.min(Math.max(probability, 0), 1) * 100);

  let priority: 'high' | 'medium' | 'low';
  if (probability >= RISK_THRESHOLDS.high) priority = 'high';
  else if (probability >= RISK_THRESHOLDS.medium) priority = 'medium';
  else priority = 'low';

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

  const reasons: string[] = [];
  if (features.kmSinceLastMaint >= DEFAULT_MAINT_INTERVAL_KM) {
    reasons.push(
      `Overdue by ${(features.kmSinceLastMaint - DEFAULT_MAINT_INTERVAL_KM).toLocaleString()} km`
    );
  } else if (features.kmSinceLastMaint >= DEFAULT_MAINT_INTERVAL_KM * 0.8) {
    reasons.push(
      `Approaching ${DEFAULT_MAINT_INTERVAL_KM.toLocaleString()} km service interval`
    );
  }
  if (features.avgDailyKm > 80) reasons.push('Heavy daily usage detected');
  else if (features.avgDailyKm > 50) reasons.push('Above-average daily usage');
  if (features.maintFreq12m === 0)
    reasons.push('No maintenance recorded in the last 12 months');
  else if (features.maintFreq12m <= 1)
    reasons.push('Infrequent maintenance history');

  return {
    vehicleId: vehicle.id,
    licensePlate: vehicle.license_plate,
    vehicleName: `${vehicle.make} ${vehicle.model}`,
    mileage: vehicle.mileage,
    kmSinceLastMaint: features.kmSinceLastMaint,
    avgDailyKm: Math.round(features.avgDailyKm * 10) / 10,
    maintFreq12m: features.maintFreq12m,
    riskScore,
    priority,
    lastMaintenanceDate: features.lastMaintenanceDate,
    predictedFailureDate: predictedDate.toISOString().split('T')[0],
    reason: reasons.length > 0 ? reasons.join('. ') : 'Routine maintenance monitoring'
  };
}

// ─── Hooks ──────────────────────────────────────────────────────────

/**
 * Fetch vehicles + maintenance history, then compute predictive risk scores.
 * Uses the Flask ML API (trained .pkl model) when available, otherwise
 * falls back to client-side JSON model / rule-based scoring.
 */
export const usePredictiveMaintenanceData = () => {
  return useQuery({
    queryKey: ['analytics', 'predictive-maintenance'],
    queryFn: async (): Promise<VehicleRiskAssessment[]> => {
      const { vehicles, maintenances } =
        await getVehiclesWithMaintenanceHistory();

      const apiUp = await isMLApiAvailable();

      if (apiUp) {
        const featuresList = vehicles.map((v) =>
          extractVehicleFeatures(v, maintenances)
        );

        const apiResults = await predictMaintenanceBatch(
          featuresList.map((f) => ({
            km_since_last_maint: f.kmSinceLastMaint,
            avg_daily_km: f.avgDailyKm,
            maint_freq_12m: f.maintFreq12m
          }))
        );

        return vehicles
          .map((v, i) =>
            buildAssessmentFromApi(v, apiResults[i].probability, featuresList[i])
          )
          .sort((a, b) => b.riskScore - a.riskScore);
      }

      // Fallback: client-side inference (JSON model or rule-based)
      return computeFleetRiskAssessments(vehicles, maintenances);
    },
    staleTime: 5 * 60 * 1000
  });
};

/**
 * Fetch association rules for co-replaced spare parts.
 * Uses the Flask ML API (trained .pkl rules) when available, otherwise
 * falls back to client-side Apriori computation from Supabase data.
 */
export const useSparePartsAssociations = () => {
  return useQuery({
    queryKey: ['analytics', 'spare-parts-associations'],
    queryFn: async (): Promise<AssociationRule[]> => {
      const apiUp = await isMLApiAvailable();

      if (apiUp) {
        const rulesMap = await getAllAssociationRules();
        const allRules: AssociationRule[] = [];

        for (const [, response] of rulesMap) {
          for (const rule of response.rules) {
            const antecedent = rule.antecedents.join(', ');
            const consequent = rule.consequents.join(', ');
            allRules.push({
              partA: antecedent,
              partAId: antecedent,
              partB: consequent,
              partBId: consequent,
              support: Math.round(rule.support * 100),
              confidence: Math.round(rule.confidence * 100),
              lift: Math.round(rule.lift * 100) / 100,
              frequency: Math.round(rule.confidence * 100),
              coOccurrences: 0
            });
          }
        }

        // Deduplicate by keeping highest confidence per pair
        const seen = new Map<string, AssociationRule>();
        for (const rule of allRules) {
          const key =
            rule.partA < rule.partB
              ? `${rule.partA}|${rule.partB}`
              : `${rule.partB}|${rule.partA}`;
          const existing = seen.get(key);
          if (!existing || rule.confidence > existing.confidence) {
            seen.set(key, rule);
          }
        }

        return [...seen.values()].sort(
          (a, b) => b.confidence - a.confidence || b.support - a.support
        );
      }

      // Fallback: client-side association rule mining
      const { jobOrders, spareParts } = await getJobOrdersWithSpareParts();
      const partLookup = new Map(spareParts.map((p) => [p.id, p.name]));
      const transactions = buildTransactions(jobOrders);

      return computeAssociationRules(transactions, partLookup, 0.1, 0.3);
    },
    staleTime: 5 * 60 * 1000
  });
};

/**
 * Fetch real-time vehicle status counts for dashboard metrics.
 */
export const useVehicleStatusCounts = () => {
  return useQuery({
    queryKey: ['analytics', 'vehicle-status-counts'],
    queryFn: getVehicleStatusCounts,
    staleTime: 30 * 1000
  });
};

/**
 * Fetch completed trips count.
 */
export const useCompletedTripsCount = () => {
  return useQuery({
    queryKey: ['analytics', 'completed-trips-count'],
    queryFn: getCompletedTripsCount,
    staleTime: 30 * 1000
  });
};
