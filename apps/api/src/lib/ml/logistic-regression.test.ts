import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  loadLogisticRegressionModel,
  predictLogisticRegression,
  assertValidLogisticRegressionModel
} from './logistic-regression.js';
import { buildVehicleRisk } from './risk.js';

const model = () => structuredClone(loadLogisticRegressionModel()!);

describe('supplied Logistic Regression pipeline', () => {
  it('matches genuine Python pipeline probabilities, including clipping and feature order', () => {
    const fitted = model();
    expect(fitted).not.toBeNull();
    const fixture = JSON.parse(
      readFileSync(
        new URL('./fixtures/logistic-regression-parity.json', import.meta.url),
        'utf8'
      )
    ) as {
      sourceSha256: string;
      cases: { input: number[]; probability: number }[];
    };
    expect(fitted.sourceSha256).toBe(fixture.sourceSha256);
    expect(fixture.cases.length).toBeGreaterThan(2000);
    for (const test of fixture.cases) {
      const input = Object.fromEntries(
        fitted.features.map((name, i) => [name, test.input[i]!])
      );
      expect(
        Math.abs(predictLogisticRegression(fitted, input) - test.probability)
      ).toBeLessThan(1e-12);
    }
  });

  it.each(['missing', 'nan', 'infinity'])(
    'rejects %s inputs instead of treating them as zero',
    (kind) => {
      const fitted = model();
      const input: Record<string, number> = Object.fromEntries(
        fitted.features.map((name) => [name, 0])
      );
      if (kind === 'missing') delete input.last_failure_days_ago;
      else input.last_failure_days_ago = kind === 'nan' ? NaN : Infinity;
      expect(() => predictLogisticRegression(fitted, input)).toThrow();
    }
  );

  it.each([
    'scale',
    'coefficient',
    'class-order',
    'duplicate-feature',
    'threshold'
  ])('rejects malformed %s metadata', (kind) => {
    const fitted = model();
    if (kind === 'scale') fitted.scaler.scale[0] = 0;
    if (kind === 'coefficient') fitted.coefficients.pop();
    if (kind === 'class-order') fitted.classes.reverse();
    if (kind === 'duplicate-feature') fitted.features[1] = fitted.features[0]!;
    if (kind === 'threshold') fitted.riskThreshold = 60;
    expect(() => assertValidLogisticRegressionModel(fitted)).toThrow();
  });

  it('uses the uploaded 60% threshold before rounding the displayed score', () => {
    expect(buildVehicleRisk(0.59999, 0.6)).toMatchObject({
      riskScore: 60,
      priority: 'medium',
      usedFallback: false
    });
    expect(buildVehicleRisk(0.6, 0.6)).toMatchObject({
      riskScore: 60,
      priority: 'high'
    });
    expect(buildVehicleRisk(0.44999, 0.6).priority).toBe('low');
    expect(buildVehicleRisk(0.45, 0.6).priority).toBe('medium');
    expect(buildVehicleRisk(0.65).priority).toBe('medium');
  });
});
