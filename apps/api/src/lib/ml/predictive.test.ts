import { describe, expect, it } from 'vitest';
import { extractFeatures } from './features.js';
import { loadModel, predictRandomForest } from './random-forest.js';
import { computeVehicleRisk, fallbackScore } from './risk.js';

const model = loadModel();

describe('random forest (golden values from the committed model)', () => {
  it('loads the 200-tree model', () => {
    expect(model).not.toBeNull();
    expect(model?.trees.length).toBe(200);
  });

  // Golden rawScores computed by replicating the traversal over the committed model.
  const cases: [Record<string, number>, number][] = [
    [{ KM_SINCE_LAST_MAINT: 0, AVG_DAILY_KM: 0, MAINT_FREQ_12M: 0 }, 0.18],
    [{ KM_SINCE_LAST_MAINT: 15000, AVG_DAILY_KM: 80, MAINT_FREQ_12M: 2 }, 0.30],
    [{ KM_SINCE_LAST_MAINT: 5000, AVG_DAILY_KM: 50, MAINT_FREQ_12M: 1 }, 0.33],
    [{ KM_SINCE_LAST_MAINT: 2000, AVG_DAILY_KM: 30, MAINT_FREQ_12M: 3 }, 0.38],
    [{ KM_SINCE_LAST_MAINT: 100000, AVG_DAILY_KM: 200, MAINT_FREQ_12M: 0 }, 0.915]
  ];
  it.each(cases)('scores %o → %f', (features, expected) => {
    expect(predictRandomForest(model!, features)).toBeCloseTo(expected, 5);
  });

  it('computeVehicleRisk applies canonical 0.70/0.45 thresholds and rounds riskScore', () => {
    const high = computeVehicleRisk(model, { kmSinceLastMaint: 100000, avgDailyKm: 200, maintFreq12m: 0 });
    expect(high.riskScore).toBe(92); // round(0.915*100)
    expect(high.priority).toBe('high');
    expect(high.usedFallback).toBe(false);
    const low = computeVehicleRisk(model, { kmSinceLastMaint: 0, avgDailyKm: 0, maintFreq12m: 0 });
    expect(low.riskScore).toBe(18);
    expect(low.priority).toBe('low');
  });
});

describe('fallback scoring (golden values)', () => {
  const cases: [{ kmSinceLastMaint: number; avgDailyKm: number; maintFreq12m: number }, number][] = [
    [{ kmSinceLastMaint: 0, avgDailyKm: 0, maintFreq12m: 0 }, 0.25],
    [{ kmSinceLastMaint: 5000, avgDailyKm: 50, maintFreq12m: 1 }, 0.58333],
    [{ kmSinceLastMaint: 15000, avgDailyKm: 80, maintFreq12m: 2 }, 0.85667],
    [{ kmSinceLastMaint: 100000, avgDailyKm: 200, maintFreq12m: 0 }, 1.0]
  ];
  it.each(cases)('fallbackScore %o ≈ %f', (f, expected) => {
    expect(fallbackScore(f)).toBeCloseTo(expected, 4);
  });

  it('computeVehicleRisk(null model, …) uses the fallback and reports usedFallback', () => {
    const r = computeVehicleRisk(null, { kmSinceLastMaint: 5000, avgDailyKm: 50, maintFreq12m: 1 });
    expect(r.usedFallback).toBe(true);
    expect(r.riskScore).toBe(58); // round(0.58333*100)
    expect(r.priority).toBe('medium'); // 0.583 >= 0.45
  });
});

describe('feature extraction (frozen clock for determinism)', () => {
  const now = new Date('2026-07-01T00:00:00.000Z');

  it('no maintenance → kmSinceLastMaint = mileage, avgDailyKm 0, freq 0', () => {
    expect(extractFeatures({ mileage: 12000 }, [], now)).toEqual({ kmSinceLastMaint: 12000, avgDailyKm: 0, maintFreq12m: 0 });
  });

  it('two maintenances → km between newest/oldest over days between; freq counts last 12m', () => {
    const maints = [
      { date: new Date('2026-06-01T00:00:00.000Z'), mileage: 11000 }, // newest
      { date: new Date('2026-05-02T00:00:00.000Z'), mileage: 10000 } // oldest (30 days earlier)
    ];
    const f = extractFeatures({ mileage: 12000 }, maints, now);
    expect(f.kmSinceLastMaint).toBe(1000); // 12000 - 11000 (newest)
    expect(f.avgDailyKm).toBeCloseTo(1000 / 30, 4); // |11000-10000| / 30 days
    expect(f.maintFreq12m).toBe(2);
  });

  it('single maintenance → avgDailyKm = kmSinceLast / days since that maintenance', () => {
    const maints = [{ date: new Date('2026-06-01T00:00:00.000Z'), mileage: 11000 }]; // 30 days before now
    const f = extractFeatures({ mileage: 12000 }, maints, now);
    expect(f.avgDailyKm).toBeCloseTo(1000 / 30, 4);
  });
});
