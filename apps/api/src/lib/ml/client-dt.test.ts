import { describe, expect, it } from 'vitest';
import { clientCrossCheckScore, loadClientModel } from './client-dt.js';
import { predictRandomForest } from './random-forest.js';

const model = loadClientModel();

// Golden values read straight off apps/api/src/assets/client_dt_model.json
// (converted from the client's motorpool_dt_model.pkl — see
// src/assets/README.md and client-dt-brief.md).
describe('client decision tree (motorpool_dt_model.pkl, converted)', () => {
  it('loads as a single-tree model declaring exactly the three features it splits on', () => {
    expect(model).not.toBeNull();
    expect(model?.n_estimators).toBe(1);
    expect(model?.trees.length).toBe(1);
    expect(model?.features).toEqual([
      'KM_SINCE_LAST_MAINT',
      'MAINT_FREQ_12M',
      'downtime_hours'
    ]);
  });

  // The tree path to the downtime_hours node: root MAINT_FREQ_12M > 0.5 (go
  // right) → KM_SINCE_LAST_MAINT <= 26557.935546875 (go left) → the
  // downtime_hours node itself, threshold 0.8223991990089417. This is THE
  // test that proves the tree is actually traversed on downtime_hours rather
  // than always returning the same constant: identical KM_SINCE_LAST_MAINT /
  // MAINT_FREQ_12M, only downtime_hours differs, and the two calls land on
  // different leaves with different probabilities.
  it('the downtime_hours split changes the predicted probability', () => {
    const base = { KM_SINCE_LAST_MAINT: 10000, MAINT_FREQ_12M: 1 };
    const below = predictRandomForest(model!, {
      ...base,
      downtime_hours: 0.5
    });
    const above = predictRandomForest(model!, {
      ...base,
      downtime_hours: 1
    });
    expect(below).toBeCloseTo(0.7419354838709677, 10);
    expect(above).toBe(1.0);
    expect(below).not.toBe(above);
  });

  // client-dt-brief.md §3: without this guard, omitting downtime_hours would
  // make it silently 0 (`?? 0` in predictTree), which sits BELOW the
  // 0.8223991990089417 threshold — the tree would always return 0.742 and
  // never 1.0, with no error at all. Verify the throw itself, not a score.
  it('throws naming the missing feature instead of silently defaulting it to 0', () => {
    const incomplete = { KM_SINCE_LAST_MAINT: 10000, MAINT_FREQ_12M: 1 };
    expect(() => predictRandomForest(model!, incomplete)).toThrow(
      /downtime_hours/
    );
  });

  it('clientCrossCheckScore never throws — a missing feature is reported as null', () => {
    const incomplete = { KM_SINCE_LAST_MAINT: 10000, MAINT_FREQ_12M: 1 };
    expect(clientCrossCheckScore(incomplete)).toBeNull();
  });

  it('clientCrossCheckScore scores a complete feature vector', () => {
    const score = clientCrossCheckScore({
      KM_SINCE_LAST_MAINT: 10000,
      MAINT_FREQ_12M: 1,
      downtime_hours: 1
    });
    expect(score).toBe(1.0);
  });
});
