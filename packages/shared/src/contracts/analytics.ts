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

export const predictiveMaintenanceAlgorithmSchema = z.enum([
  'random_forest',
  'decision_tree',
  'logistic_regression'
]);
export type PredictiveMaintenanceAlgorithm = z.infer<
  typeof predictiveMaintenanceAlgorithmSchema
>;
export const predictiveMaintenanceQuerySchema = z.object({
  algorithm: predictiveMaintenanceAlgorithmSchema.default('random_forest')
});

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
  scoringMethod: predictiveMaintenanceAlgorithmSchema.optional(),
  // Informational Decision Tree probability; main score uses scoringMethod.
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

export const sparePartsModelAlgorithmSchema = z.enum([
  'fp_growth',
  'eclat',
  'apriori'
]);
export type SparePartsModelAlgorithm = z.infer<
  typeof sparePartsModelAlgorithmSchema
>;

export const DEFAULT_SPARE_PARTS_MODEL = 'apriori' as const;

export const sparePartsModelQuerySchema = z.object({
  algorithm: sparePartsModelAlgorithmSchema.default(DEFAULT_SPARE_PARTS_MODEL)
});

const sparePartsModelBaseSchema = z.object({
  modelName: z.string().min(1),
  transactionCount: z.number().int().nonnegative(),
  minSupport: z.number().finite().gt(0).max(1),
  count: z.number().int().nonnegative(),
  data: z.array(
    z.object({
      antecedent: z.string().min(1),
      consequent: z.string().min(1),
      support: z.number().finite().min(0).max(1),
      confidence: z.number().finite().min(0).max(1),
      lift: z.number().finite().nonnegative(),
      coOccurrences: z.number().int().nonnegative()
    })
  )
});
export const sparePartsModelResultSchema = z.discriminatedUnion('source', [
  sparePartsModelBaseSchema.extend({
    algorithm: z.enum(['fp_growth', 'eclat']),
    source: z.literal('trained_artifact'),
    sourceFile: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    trainingTransactions: z.number().int().positive()
  }),
  sparePartsModelBaseSchema.extend({
    algorithm: z.literal('apriori'),
    source: z.literal('live_job_orders'),
    sourceFile: z.null(),
    sourceSha256: z.null(),
    trainingTransactions: z.null()
  })
]);
export type SparePartsModelResult = z.infer<typeof sparePartsModelResultSchema>;
