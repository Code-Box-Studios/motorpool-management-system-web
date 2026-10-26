import { describe, expect, it } from 'vitest';
import { extractFeatures } from './features.js';
import {
  loadModel,
  predictRandomForest,
  type RFModel
} from './random-forest.js';
import { computeVehicleRisk } from './risk.js';

const model = loadModel();

describe('random forest (golden values from the committed model)', () => {
  it('loads the 200-tree model', () => {
    expect(model).not.toBeNull();
    expect(model?.trees.length).toBe(200);
  });

  // Golden rawScores computed by replicating the traversal over the committed model.
  const cases: [Record<string, number>, number][] = [
    [{ KM_SINCE_LAST_MAINT: 0, AVG_DAILY_KM: 0, MAINT_FREQ_12M: 0 }, 0.18],
    [{ KM_SINCE_LAST_MAINT: 15000, AVG_DAILY_KM: 80, MAINT_FREQ_12M: 2 }, 0.3],
    [{ KM_SINCE_LAST_MAINT: 5000, AVG_DAILY_KM: 50, MAINT_FREQ_12M: 1 }, 0.33],
    [{ KM_SINCE_LAST_MAINT: 2000, AVG_DAILY_KM: 30, MAINT_FREQ_12M: 3 }, 0.38],
    [
      { KM_SINCE_LAST_MAINT: 100000, AVG_DAILY_KM: 200, MAINT_FREQ_12M: 0 },
      0.915
    ]
  ];
  it.each(cases)('scores %o → %f', (features, expected) => {
    expect(predictRandomForest(model!, features)).toBeCloseTo(expected, 5);
  });

  it('preserves the saved model prediction at an attainable daily-usage split', () => {
    const features = extractFeatures(
      { mileage: 200000 },
      [
        { date: new Date('2025-10-01T00:00:00Z'), mileage: 200000 },
        { date: new Date('2023-01-05T00:00:00Z'), mileage: 60869 }
      ],
      new Date('2026-10-18T00:00:00Z'),
      0
    );
    expect(features.avgDailyKm).toBe(139.131);
    // Independently scored with motorpool_rf_model.pkl under sklearn 1.8.0.
    expect(
      predictRandomForest(model!, {
        KM_SINCE_LAST_MAINT: features.kmSinceLastMaint,
        AVG_DAILY_KM: features.avgDailyKm,
        MAINT_FREQ_12M: features.maintFreq12m
      })
    ).toBeCloseTo(0.9058333333333333, 12);
    expect(computeVehicleRisk(model, features)).toMatchObject({
      riskScore: 91,
      priority: 'high',
      usedFallback: false
    });
  });

  it('uses sklearn float32 input precision when traversing a split', () => {
    // A sklearn tree fitted to x=[0,2], y=[0,1] splits at 1. Its predict
    // input is float32, so 1+1e-8 belongs to the left leaf, like exactly 1.
    const singleSplit: RFModel = {
      features: ['x'],
      n_estimators: 1,
      classes: [0, 1],
      trees: [
        {
          feature: 'x',
          threshold: 1,
          left: { probs: [1, 0] },
          right: { probs: [0, 1] }
        }
      ]
    };
    expect(predictRandomForest(singleSplit, { x: 1 + 1e-8 })).toBe(0);
    expect(predictRandomForest(singleSplit, { x: 1 + 1e-6 })).toBe(1);
  });

  // client-dt-brief.md §3: the missing-feature guard must never fire for the
  // incumbent model. It can't, because the model declares exactly the three
  // features extractFeatures already produces — pinned here so a future
  // change to either side trips a test instead of silently drifting apart.
  it("declares exactly extractFeatures' three feature names — the missing-feature guard can never fire on it", () => {
    expect([...model!.features].sort()).toEqual(
      ['AVG_DAILY_KM', 'KM_SINCE_LAST_MAINT', 'MAINT_FREQ_12M'].sort()
    );
  });

  it('computeVehicleRisk applies canonical 0.70/0.45 thresholds and rounds riskScore', () => {
    const high = computeVehicleRisk(model, {
      kmSinceLastMaint: 100000,
      avgDailyKm: 200,
      maintFreq12m: 0
    });
    expect(high.riskScore).toBe(92); // round(0.915*100)
    expect(high.priority).toBe('high');
    expect(high.usedFallback).toBe(false);
    const low = computeVehicleRisk(model, {
      kmSinceLastMaint: 0,
      avgDailyKm: 0,
      maintFreq12m: 0
    });
    expect(low.riskScore).toBe(18);
    expect(low.priority).toBe('low');
  });
});

describe('feature extraction (frozen clock for determinism)', () => {
  const now = new Date('2026-07-01T00:00:00.000Z');

  it('no maintenance → kmSinceLastMaint = mileage, avgDailyKm 0, freq 0', () => {
    expect(extractFeatures({ mileage: 12000 }, [], now, 0)).toEqual({
      kmSinceLastMaint: 12000,
      avgDailyKm: 0,
      maintFreq12m: 0,
      downtimeHours: 0
    });
  });

  it.each([12000, null])(
    'does not credit a future service with mileage %s before it happens',
    (mileage) => {
      const features = extractFeatures(
        { mileage: 12000 },
        [{ date: new Date('2026-08-01T00:00:00Z'), mileage }],
        now,
        0
      );
      expect(features).toEqual({
        kmSinceLastMaint: 12000,
        avgDailyKm: 0,
        maintFreq12m: 0,
        downtimeHours: 0
      });
      expect(() => computeVehicleRisk(null, features)).toThrow(/unavailable/);
    }
  );

  it('derives usage from completed history when a newer service is in the future', () => {
    const features = extractFeatures(
      { mileage: 12000 },
      [
        { date: new Date('2026-08-01T00:00:00Z'), mileage: 12000 },
        { date: new Date('2026-06-01T00:00:00Z'), mileage: 11000 },
        { date: new Date('2026-05-02T00:00:00Z'), mileage: 10000 }
      ],
      now,
      0
    );
    expect(features.kmSinceLastMaint).toBe(1000);
    expect(features.avgDailyKm).toBeCloseTo(33.333333333333336, 12);
    expect(features.maintFreq12m).toBe(2);
  });

  // downtimeHours is a pure pass-through (computed elsewhere, in
  // analytics/repository.ts, from vehicle_status_audit) — this is the one
  // test that pins it flowing into the returned record unchanged.
  it('downtimeHours passes through unchanged into the returned feature record', () => {
    const f = extractFeatures({ mileage: 12000 }, [], now, 7.5);
    expect(f.downtimeHours).toBe(7.5);
  });

  it('two maintenances → km between newest/oldest over days between; freq counts last 12m', () => {
    const maints = [
      { date: new Date('2026-06-01T00:00:00.000Z'), mileage: 11000 }, // newest
      { date: new Date('2026-05-02T00:00:00.000Z'), mileage: 10000 } // oldest (30 days earlier)
    ];
    const f = extractFeatures({ mileage: 12000 }, maints, now, 0);
    expect(f.kmSinceLastMaint).toBe(1000); // 12000 - 11000 (newest)
    expect(f.avgDailyKm).toBeCloseTo(1000 / 30, 4); // |11000-10000| / 30 days
    expect(f.maintFreq12m).toBe(2);
  });

  it('single maintenance → avgDailyKm = kmSinceLast / days since that maintenance', () => {
    const maints = [
      { date: new Date('2026-06-01T00:00:00.000Z'), mileage: 11000 }
    ]; // 30 days before now
    const f = extractFeatures({ mileage: 12000 }, maints, now, 0);
    expect(f.avgDailyKm).toBeCloseTo(1000 / 30, 4);
  });

  // The bug this guards: `lastMaint?.mileage ?? 0` read a service with no
  // recorded odometer as a service at 0 km, so "distance since last service"
  // became the vehicle's ENTIRE odometer. complete-repair wrote exactly such a
  // row — so repairing a van was what made it look like it was about to break
  // (a clean repair drove one vehicle from 36/100 to 95/100).
  it('a service with an UNKNOWN odometer does not read as a service at 0 km', () => {
    const maints = [
      { date: new Date('2026-06-01T00:00:00.000Z'), mileage: null }
    ];
    const f = extractFeatures({ mileage: 33000 }, maints, now, 0);
    expect(f.kmSinceLastMaint).toBe(0); // NOT 33000
    expect(f.maintFreq12m).toBe(1); // it still counts as a service
  });

  it('falls back to the newest service whose odometer IS known', () => {
    const maints = [
      { date: new Date('2026-06-01T00:00:00.000Z'), mileage: null }, // newest: a repair, odometer not recorded
      { date: new Date('2026-05-02T00:00:00.000Z'), mileage: 30000 } // the last one we actually know
    ];
    const f = extractFeatures({ mileage: 33000 }, maints, now, 0);
    expect(f.kmSinceLastMaint).toBe(3000); // 33000 - 30000, not 33000 - 0
    // That distance spans May 2 to July 1 (60 days), not June 1 to July 1.
    expect(f.avgDailyKm).toBe(50);
  });

  it('never serviced still means every kilometre is distance since service', () => {
    const f = extractFeatures({ mileage: 33000 }, [], now, 0);
    expect(f.kmSinceLastMaint).toBe(33000);
  });
});
