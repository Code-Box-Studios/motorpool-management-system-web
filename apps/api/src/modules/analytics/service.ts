import type {
  AssociationRule,
  AssociationRulesQuery,
  DashboardMetrics,
  RiskAssessment
} from '@mms/shared';
import { computeAssociationRules } from '../../lib/ml/apriori.js';
import { clientCrossCheckScore } from '../../lib/ml/client-dt.js';
import { extractFeatures } from '../../lib/ml/features.js';
import { loadModel } from '../../lib/ml/random-forest.js';
import { computeVehicleRisk } from '../../lib/ml/risk.js';
import * as repo from './repository.js';

// Identifies which model produced `crossCheckScore`, so nobody has to guess.
// See client-dt-brief.md — this is the client's own decision tree
// (motorpool_dt_model.pkl), wired in ALONGSIDE the incumbent RF purely as an
// informational cross-check. It drives no user-facing number.
const CLIENT_CROSS_CHECK_MODEL = 'client_decision_tree_v1';

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
  // On the current seeded database, zero vehicle_status_audit rows exist, so
  // downtimeHoursByVehicle returns an empty map and every vehicle falls back
  // to `?? 0` below — crossCheckScore will be the SAME constant for every
  // vehicle until real repair history accrues. That is correct behaviour,
  // not a bug (client-dt-brief.md, "Expectations").
  const [vehicles, downtimeHoursByVehicle] = await Promise.all([
    repo.vehiclesWithMaintenance(),
    repo.downtimeHoursByVehicle(now)
  ]);
  const data = vehicles.map((v) => {
    const downtimeHours = downtimeHoursByVehicle.get(v.id) ?? 0;
    const features = extractFeatures(
      { mileage: v.mileage },
      v.maintenances.map((m) => ({ date: m.date, mileage: m.mileage })),
      now,
      downtimeHours
    );
    const risk = computeVehicleRisk(model, features);
    // Cross-check ONLY: does not feed riskScore/priority/usedFallback above,
    // and any failure here (model absent, a feature missing) surfaces as
    // `null` rather than a wrong number. client-dt-brief.md §4.
    const crossCheckScore = clientCrossCheckScore({
      KM_SINCE_LAST_MAINT: features.kmSinceLastMaint,
      MAINT_FREQ_12M: features.maintFreq12m,
      downtime_hours: features.downtimeHours
    });
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
      usedFallback: risk.usedFallback,
      crossCheckScore,
      crossCheckModel: CLIENT_CROSS_CHECK_MODEL
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
