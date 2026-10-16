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
  usage_rules: 'Usage-based estimate'
} as const;

export const PARTS_MODEL_NAMES = {
  fp_growth: 'FP-Growth',
  eclat: 'Eclat'
} as const;
