import type { RFModel } from './random-forest.js';
import { predictRandomForest } from './random-forest.js';

// Canonical thresholds (spec §11 adopts the Flask values over the FE's 0.65/0.40).
export const RISK_THRESHOLDS = { high: 0.7, medium: 0.45 } as const;

const FALLBACK_WEIGHTS = { kmSinceLastMaint: 0.45, avgDailyKm: 0.3, maintFreq12m: 0.25 };
const DEFAULT_MAINT_INTERVAL_KM = 5000;

interface Features {
  kmSinceLastMaint: number;
  avgDailyKm: number;
  maintFreq12m: number;
}

// Rule-based fallback (model absent/invalid). Ported verbatim.
export function fallbackScore(f: Features): number {
  const normKm = Math.min(f.kmSinceLastMaint / DEFAULT_MAINT_INTERVAL_KM, 2.0) / 2.0;
  const normDaily = Math.min(f.avgDailyKm / 100, 1.0);
  const normFreq = Math.max(0, 1 - f.maintFreq12m / 6);
  return FALLBACK_WEIGHTS.kmSinceLastMaint * normKm + FALLBACK_WEIGHTS.avgDailyKm * normDaily + FALLBACK_WEIGHTS.maintFreq12m * normFreq;
}

function priorityFor(rawScore: number): 'high' | 'medium' | 'low' {
  if (rawScore >= RISK_THRESHOLDS.high) return 'high';
  if (rawScore >= RISK_THRESHOLDS.medium) return 'medium';
  return 'low';
}

export function computeVehicleRisk(
  model: RFModel | null,
  f: Features
): { rawScore: number; riskScore: number; priority: 'high' | 'medium' | 'low'; usedFallback: boolean } {
  const rawScore = model
    ? predictRandomForest(model, {
        KM_SINCE_LAST_MAINT: f.kmSinceLastMaint,
        AVG_DAILY_KM: f.avgDailyKm,
        MAINT_FREQ_12M: f.maintFreq12m
      })
    : fallbackScore(f);
  const clamped = Math.min(Math.max(rawScore, 0), 1);
  return {
    rawScore,
    riskScore: Math.round(clamped * 100),
    priority: priorityFor(rawScore),
    usedFallback: model === null
  };
}
