// src/lib/api/analytics.ts
import { api } from './client.js';
import type {
  AssociationRule,
  DashboardMetrics,
  PredictiveMaintenanceAlgorithm,
  PredictiveMaintenanceResult,
  SparePartsModelAlgorithm,
  SparePartsModelResult
} from '@mms/shared';
import {
  buildAssessmentFromApi,
  type VehicleRiskAssessment
} from '../utils/predictive-maintenance';

// Fetch fleet-wide dashboard metrics (vehicle status counts + completed trips).
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  return api.get<DashboardMetrics>('/analytics/dashboard');
}

export type PredictiveMaintenanceDisplayResult = Omit<
  PredictiveMaintenanceResult,
  'data' | 'unscoredVehicles'
> & {
  data: VehicleRiskAssessment[];
  unscoredVehicles: NonNullable<
    PredictiveMaintenanceResult['unscoredVehicles']
  >;
};

// Keep model metadata alongside the assessments for the full results panel.
export async function getPredictiveMaintenanceResult(
  algorithm: PredictiveMaintenanceAlgorithm = 'random_forest'
): Promise<PredictiveMaintenanceDisplayResult> {
  const res = await api.get<PredictiveMaintenanceResult>(
    '/analytics/predictive-maintenance',
    algorithm === 'random_forest' ? undefined : { algorithm }
  );
  return {
    ...res,
    data: res.data.map((row) => buildAssessmentFromApi(row, algorithm)),
    unscoredVehicles: res.unscoredVehicles ?? []
  };
}

// Preserve the array API used by preventive maintenance and vehicle insights.
export async function getPredictiveMaintenanceData(
  algorithm: PredictiveMaintenanceAlgorithm = 'random_forest'
): Promise<VehicleRiskAssessment[]> {
  return (await getPredictiveMaintenanceResult(algorithm)).data;
}

// Fetch spare-parts co-replacement association rules.
export async function getSparePartsAssociations(): Promise<AssociationRule[]> {
  const res = await api.get<{ data: AssociationRule[]; count: number }>(
    '/analytics/association-rules'
  );
  return res.data;
}

export function getSparePartsModel(
  algorithm: SparePartsModelAlgorithm
): Promise<SparePartsModelResult> {
  return api.get<SparePartsModelResult>('/analytics/association-models', {
    algorithm
  });
}
