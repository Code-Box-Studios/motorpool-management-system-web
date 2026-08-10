import type {
  AssociationRule,
  AssociationRulesQuery,
  DashboardMetrics,
  RiskAssessment
} from '@mms/shared';
import { computeAssociationRules } from '../../lib/ml/apriori.js';
import { extractFeatures } from '../../lib/ml/features.js';
import { loadModel } from '../../lib/ml/random-forest.js';
import { computeVehicleRisk } from '../../lib/ml/risk.js';
import * as repo from './repository.js';

export async function dashboard(): Promise<DashboardMetrics> {
  const [{ groups, total }, completedTrips] = await Promise.all([
    repo.vehicleStatusCounts(),
    repo.completedTripsCount()
  ]);
  const by = (s: string) =>
    groups.find((g) => g.status === s)?._count._all ?? 0;
  return {
    available: by('available'),
    underMaintenance: by('under_maintenance'),
    onTrip: by('on_trip'),
    outOfService: by('out_of_service'),
    total,
    completedTrips
  };
}

export async function predictiveMaintenance(
  now: Date
): Promise<{ data: RiskAssessment[]; count: number }> {
  const model = loadModel();
  const vehicles = await repo.vehiclesWithMaintenance();
  const data = vehicles.map((v) => {
    const features = extractFeatures(
      { mileage: v.mileage },
      v.maintenances.map((m) => ({ date: m.date, mileage: m.mileage })),
      now
    );
    const risk = computeVehicleRisk(model, features);
    return {
      vehicleId: v.id,
      make: v.make,
      model: v.model,
      licensePlate: v.licensePlate,
      mileage: v.mileage,
      kmSinceLastMaint: features.kmSinceLastMaint,
      avgDailyKm: features.avgDailyKm,
      maintFreq12m: features.maintFreq12m,
      riskScore: risk.riskScore,
      priority: risk.priority,
      usedFallback: risk.usedFallback
    };
  });
  // Highest-risk first, matching the FE's computeFleetRiskAssessments (spec §11
  // — the dashboard's high-risk list depends on this ordering).
  data.sort((a, b) => b.riskScore - a.riskScore);
  return { data, count: data.length };
}

export async function associationRules(
  query: AssociationRulesQuery
): Promise<{ data: AssociationRule[]; count: number }> {
  const [jobOrders, parts] = await Promise.all([
    repo.jobOrdersWithSpareParts(),
    repo.allSpareParts()
  ]);
  const partLookup = new Map(parts.map((p) => [p.id, p.name]));
  const filtered = query.vehicleType
    ? jobOrders.filter(
        (jo) =>
          jo.vehicle.make.toLowerCase() === query.vehicleType!.toLowerCase()
      )
    : jobOrders;
  const transactions = filtered.map((jo) => ({
    parts: jo.spareParts.map((s) => s.sparePartId)
  }));
  const data = computeAssociationRules(transactions, partLookup);
  return { data, count: data.length };
}
