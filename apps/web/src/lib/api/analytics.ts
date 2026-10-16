// src/lib/api/analytics.ts
import { api } from './client.js';
import type {
  AssociationRule,
  DashboardMetrics,
  PredictiveMaintenanceAlgorithm,
  RiskAssessment,
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

// Fetch predictive-maintenance risk assessments (server-sorted riskScore
// desc), reshaped into the FE's richer VehicleRiskAssessment display shape.
export async function getPredictiveMaintenanceData(
  algorithm: PredictiveMaintenanceAlgorithm = 'random_forest'
): Promise<VehicleRiskAssessment[]> {
  const res = await api.get<{ data: RiskAssessment[]; count: number }>(
    '/analytics/predictive-maintenance',
    algorithm === 'random_forest' ? undefined : { algorithm }
  );
  return res.data.map(buildAssessmentFromApi);
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
