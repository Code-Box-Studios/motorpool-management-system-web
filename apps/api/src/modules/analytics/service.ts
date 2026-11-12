import type {
  AssociationRule,
  AssociationRulesQuery,
  DashboardMetrics,
  PredictiveMaintenanceAlgorithm,
  PredictiveMaintenanceResult,
  RiskAssessment,
  SparePartsModelAlgorithm,
  SparePartsModelResult
} from '@mms/shared';
import { computeAssociationRules } from '../../lib/ml/apriori.js';
import { loadAssociationModel } from '../../lib/ml/association-models.js';
import {
  clientCrossCheckScore,
  loadClientModel
} from '../../lib/ml/client-dt.js';
import { extractFeatures } from '../../lib/ml/features.js';
import { assertValidModel, loadModel } from '../../lib/ml/random-forest.js';
import { buildVehicleRisk, computeVehicleRisk } from '../../lib/ml/risk.js';
import {
  assertValidLogisticRegressionModel,
  loadLogisticRegressionModel,
  predictLogisticRegression
} from '../../lib/ml/logistic-regression.js';
import { AppError } from '../../lib/errors.js';
import * as repo from './repository.js';
import { preventiveStatus } from './preventive-status.js';

// The optional cross-check retains its identity when another model is selected.
const CLIENT_CROSS_CHECK_MODEL = 'client_decision_tree_v1';

export async function associationModel(
  algorithm: SparePartsModelAlgorithm
): Promise<SparePartsModelResult> {
  if (algorithm !== 'apriori') return loadAssociationModel(algorithm);
  const [jobOrders, parts] = await Promise.all([
    repo.jobOrdersWithSpareParts(),
    repo.allSpareParts()
  ]);
  const transactions = jobOrders.map((jo) => ({
    parts: [...new Set(jo.spareParts.map((part) => part.sparePartId))]
  }));
  // Match the existing pairs-only Apriori computation's eligible population.
  const transactionCount = transactions.filter(
    (row) => row.parts.length >= 2
  ).length;
  const rules = computeAssociationRules(
    transactions,
    new Map(parts.map((p) => [p.id, p.name]))
  );
  return {
    algorithm,
    modelName: 'Apriori',
    source: 'live_job_orders',
    sourceFile: null,
    sourceSha256: null,
    trainingTransactions: null,
    transactionCount,
    minSupport: 0.1,
    count: rules.length,
    data: rules.map((rule) => ({
      antecedent: rule.partA,
      consequent: rule.partB,
      support: rule.support / 100,
      confidence: rule.confidence / 100,
      lift: rule.lift,
      coOccurrences: rule.coOccurrences
    }))
  };
}

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
  now: Date,
  algorithm: PredictiveMaintenanceAlgorithm = 'random_forest'
): Promise<PredictiveMaintenanceResult> {
  const logistic =
    algorithm === 'logistic_regression' ? loadLogisticRegressionModel() : null;
  const trees =
    algorithm === 'logistic_regression'
      ? null
      : algorithm === 'decision_tree'
        ? loadClientModel()
        : loadModel();
  if (!logistic && !trees) {
    throw new AppError(
      503,
      'MODEL_UNAVAILABLE',
      'The selected vehicle risk model is unavailable. No substitute score was generated.'
    );
  }
  try {
    if (logistic) assertValidLogisticRegressionModel(logistic);
    else assertValidModel(trees!);
  } catch {
    throw new AppError(
      503,
      'MODEL_UNAVAILABLE',
      'The selected vehicle risk model is invalid. No substitute score was generated.'
    );
  }
  const [vehicles, downtimeHoursByVehicle, incidents] = await Promise.all([
    repo.vehiclesWithMaintenance(),
    repo.downtimeHoursByVehicle(now),
    logistic
      ? repo.latestIncidentDatesByVehicle(now)
      : Promise.resolve(new Map<string, Date>())
  ]);
  const data: RiskAssessment[] = [];
  const unscoredVehicles: NonNullable<
    PredictiveMaintenanceResult['unscoredVehicles']
  > = [];
  for (const v of vehicles) {
    const downtimeHours = downtimeHoursByVehicle.get(v.id) ?? 0;
    const features = extractFeatures(
      { mileage: v.mileage },
      v.maintenances.map((m) => ({ date: m.date, mileage: m.mileage })),
      now,
      downtimeHours
    );
    let risk;
    if (logistic) {
      const incident = incidents.get(v.id);
      let reason: string | undefined;
      if (!Number.isInteger(v.year) || v.year < 1886)
        reason = 'A valid vehicle model year is needed.';
      else if (
        !incident ||
        !Number.isFinite(incident.getTime()) ||
        incident > now
      )
        reason =
          'No usable dated incident is recorded. Verify the vehicle incident history before scoring.';
      else if (!Object.values(features).every(Number.isFinite))
        reason =
          'Recorded mileage or maintenance history cannot supply all model inputs.';
      if (reason) {
        unscoredVehicles.push({
          vehicleId: v.id,
          make: v.make,
          model: v.model,
          licensePlate: v.licensePlate,
          reason
        });
        continue;
      }
      // Application mappings: model year → age in years, recorded incident →
      // elapsed whole days. The creator has not supplied training definitions.
      const inputs = {
        KM_SINCE_LAST_MAINT: features.kmSinceLastMaint,
        AVG_DAILY_KM: features.avgDailyKm,
        MAINT_FREQ_12M: features.maintFreq12m,
        V_AGE: Math.max(0, now.getUTCFullYear() - v.year),
        downtime_hours: downtimeHours,
        last_failure_days_ago: Math.floor(
          (now.getTime() - incident!.getTime()) / 86_400_000
        )
      };
      try {
        risk = buildVehicleRisk(
          predictLogisticRegression(logistic, inputs),
          logistic.riskThreshold
        );
      } catch {
        throw new AppError(
          503,
          'MODEL_UNAVAILABLE',
          'The selected vehicle risk model could not be scored. No substitute score was generated.'
        );
      }
    } else {
      try {
        risk = computeVehicleRisk(trees, features);
        if (
          !Number.isFinite(risk.rawScore) ||
          risk.rawScore < 0 ||
          risk.rawScore > 1
        )
          throw new Error('Invalid model probability');
      } catch {
        throw new AppError(
          503,
          'MODEL_UNAVAILABLE',
          'The selected vehicle risk model could not be scored. No substitute score was generated.'
        );
      }
    }
    const crossCheckScore = clientCrossCheckScore({
      KM_SINCE_LAST_MAINT: features.kmSinceLastMaint,
      MAINT_FREQ_12M: features.maintFreq12m,
      downtime_hours: features.downtimeHours
    });
    data.push({
      vehicleId: v.id,
      make: v.make,
      model: v.model,
      licensePlate: v.licensePlate,
      mileage: v.mileage,
      ...preventiveStatus(v, v.maintenances, v.maintenanceTracking, now),
      kmSinceLastMaint: features.kmSinceLastMaint,
      avgDailyKm: features.avgDailyKm,
      maintFreq12m: features.maintFreq12m,
      riskScore: risk.riskScore,
      priority: risk.priority,
      usedFallback: risk.usedFallback,
      scoringMethod: algorithm,
      crossCheckScore,
      crossCheckModel: CLIENT_CROSS_CHECK_MODEL
    });
  }
  data.sort((a, b) => b.riskScore - a.riskScore);
  return logistic
    ? {
        data,
        count: data.length,
        unscoredVehicles,
        riskThreshold: logistic.riskThreshold * 100
      }
    : { data, count: data.length };
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
