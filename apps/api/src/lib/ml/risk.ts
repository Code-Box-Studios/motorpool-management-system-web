import type { RFModel } from './random-forest.js';
import { assertValidModel, predictRandomForest } from './random-forest.js';

// Canonical thresholds (spec §11 adopts the Flask values over the FE's 0.65/0.40).
export const RISK_THRESHOLDS = { high: 0.7, medium: 0.45 } as const;

interface Features {
  kmSinceLastMaint: number;
  avgDailyKm: number;
  maintFreq12m: number;
  downtimeHours?: number;
}

function priorityFor(rawScore: number): 'high' | 'medium' | 'low' {
  if (rawScore >= RISK_THRESHOLDS.high) return 'high';
  if (rawScore >= RISK_THRESHOLDS.medium) return 'medium';
  return 'low';
}

export function computeVehicleRisk(
  model: RFModel | null,
  f: Features
): {
  rawScore: number;
  riskScore: number;
  priority: 'high' | 'medium' | 'low';
  usedFallback: boolean;
} {
  if (!model) throw new Error('Selected predictive model is unavailable');
  assertValidModel(model);
  const rawScore = predictRandomForest(model, {
    KM_SINCE_LAST_MAINT: f.kmSinceLastMaint,
    AVG_DAILY_KM: f.avgDailyKm,
    MAINT_FREQ_12M: f.maintFreq12m,
    downtime_hours: f.downtimeHours ?? 0
  });
  const clamped = Math.min(Math.max(rawScore, 0), 1);
  return {
    rawScore,
    riskScore: Math.round(clamped * 100),
    priority: priorityFor(rawScore),
    usedFallback: false
  };
}
