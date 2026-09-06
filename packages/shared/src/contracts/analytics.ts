import { z } from 'zod';

export const dashboardMetricsSchema = z.object({
  available: z.number(),
  underMaintenance: z.number(),
  onTrip: z.number(),
  outOfService: z.number(),
  total: z.number(),
  completedTrips: z.number()
});
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;

export const riskAssessmentSchema = z.object({
  vehicleId: z.string().uuid(),
  make: z.string(),
  model: z.string(),
  licensePlate: z.string(),
  mileage: z.number(),
  kmSinceLastMaint: z.number(),
  avgDailyKm: z.number(),
  maintFreq12m: z.number(),
  riskScore: z.number(), // 0-100
  priority: z.enum(['high', 'medium', 'low']),
  usedFallback: z.boolean(),
  // The client's own decision-tree model, run ALONGSIDE the incumbent RF
  // above as an informational cross-check only — it never changes riskScore,
  // priority, or usedFallback. null when the client model failed to load or
  // could not be scored (see apps/api's client-dt-brief.md).
  crossCheckScore: z.number().nullable(),
  crossCheckModel: z.string()
});
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;

export const associationRuleSchema = z.object({
  partA: z.string(),
  partAId: z.string(),
  partB: z.string(),
  partBId: z.string(),
  support: z.number(), // integer percent
  confidence: z.number(), // integer percent
  lift: z.number(), // 2dp
  frequency: z.number(), // == confidence
  coOccurrences: z.number()
});
export type AssociationRule = z.infer<typeof associationRuleSchema>;

export const associationRulesQuerySchema = z.object({
  vehicleType: z.string().optional()
});
export type AssociationRulesQuery = z.infer<typeof associationRulesQuerySchema>;
