import { readFileSync } from 'node:fs';
import { z } from 'zod';

const featureNames = [
  'KM_SINCE_LAST_MAINT',
  'AVG_DAILY_KM',
  'MAINT_FREQ_12M',
  'V_AGE',
  'downtime_hours',
  'last_failure_days_ago'
] as const;
const finiteVector = z.array(z.number().finite()).length(6);
const modelSchema = z.object({
  formatVersion: z.literal(1),
  algorithm: z.literal('logistic_regression'),
  features: z
    .array(z.enum(featureNames))
    .length(6)
    .refine((names) => new Set(names).size === 6),
  classes: z.tuple([z.literal(0), z.literal(1)]),
  coefficients: finiteVector,
  intercept: z.number().finite(),
  scaler: z.object({
    mean: finiteVector,
    scale: z.array(z.number().finite().positive()).length(6)
  }),
  clipMin: z.literal(0),
  riskThreshold: z.number().finite().gt(0).lt(1),
  sourceFile: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sklearnVersion: z.string().min(1),
  trainingSamples: z.number().int().positive()
});
export type LogisticRegressionModel = z.infer<typeof modelSchema>;
let cachedModel: LogisticRegressionModel | null | undefined;

export function assertValidLogisticRegressionModel(
  model: LogisticRegressionModel
): void {
  modelSchema.parse(model);
}

/** Runtime reads validated JSON only; the original pickle is an offline source. */
export function loadLogisticRegressionModel(): LogisticRegressionModel | null {
  if (cachedModel !== undefined) return cachedModel;
  try {
    cachedModel = modelSchema.parse(
      JSON.parse(
        readFileSync(
          new URL(
            '../../assets/logistic_regression_model.json',
            import.meta.url
          ),
          'utf8'
        )
      )
    );
  } catch {
    cachedModel = null;
  }
  return cachedModel;
}

/** Mirror clip → fitted StandardScaler → binary predict_proba, using float64. */
export function predictLogisticRegression(
  model: LogisticRegressionModel,
  features: Record<string, number>
): number {
  assertValidLogisticRegressionModel(model);
  let logit = model.intercept;
  for (let index = 0; index < model.features.length; index++) {
    const name = model.features[index]!;
    const value = features[name];
    if (!Object.hasOwn(features, name) || !Number.isFinite(value)) {
      throw new Error(`Logistic Regression requires a finite ${name}`);
    }
    const normalized =
      (Math.max(model.clipMin, value!) - model.scaler.mean[index]!) /
      model.scaler.scale[index]!;
    logit += normalized * model.coefficients[index]!;
  }
  if (Number.isNaN(logit))
    throw new Error('Logistic Regression produced an invalid logit');
  // Separate branches avoid exp() overflow for large negative logits.
  if (logit >= 0) return 1 / (1 + Math.exp(-logit));
  const exp = Math.exp(logit);
  return exp / (1 + exp);
}
