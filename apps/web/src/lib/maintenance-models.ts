import type {
  PredictiveMaintenanceAlgorithm,
  SparePartsModelAlgorithm
} from '@mms/shared';

export interface MaintenanceModels {
  risk: PredictiveMaintenanceAlgorithm;
  parts: SparePartsModelAlgorithm;
}

export const DEFAULT_MAINTENANCE_MODELS: MaintenanceModels = {
  risk: 'random_forest',
  parts: 'fp_growth'
};

export const RISK_MODEL_NAMES = {
  random_forest: 'Random Forest',
  decision_tree: 'Decision Tree',
  logistic_regression: 'Logistic Regression'
} as const;

export const PARTS_MODEL_NAMES = {
  fp_growth: 'FP-Growth',
  eclat: 'Eclat',
  apriori: 'Apriori'
} as const;
