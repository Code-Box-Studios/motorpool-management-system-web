import { describe, expect, it } from 'vitest';
import {
  predictiveMaintenanceQuerySchema,
  sparePartsModelQuerySchema
} from './analytics.js';

describe('analytics algorithm selection', () => {
  it.each(['random_forest', 'decision_tree', 'logistic_regression'])(
    'accepts predictive choice %s',
    (algorithm) => {
      expect(
        predictiveMaintenanceQuerySchema.parse({ algorithm }).algorithm
      ).toBe(algorithm);
    }
  );
  it.each(['usage_rules', 'apriori', 'unknown'])(
    'rejects unsupported predictive choice %s',
    (algorithm) => {
      expect(
        predictiveMaintenanceQuerySchema.safeParse({ algorithm }).success
      ).toBe(false);
    }
  );
  it.each(['fp_growth', 'eclat', 'apriori'])(
    'accepts parts choice %s',
    (algorithm) => {
      expect(sparePartsModelQuerySchema.parse({ algorithm }).algorithm).toBe(
        algorithm
      );
    }
  );
});
