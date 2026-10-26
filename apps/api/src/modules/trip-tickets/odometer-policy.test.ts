import { describe, expect, it } from 'vitest';
import {
  validateDriverReading,
  gateStartingMileage
} from './odometer-policy.js';

const outing = {
  status: 'scheduled',
  startMileage: null,
  endMileage: null,
  preTripCheckedAt: null,
  postTripCheckedAt: null
};
describe('assigned driver odometer rules', () => {
  it('allows a missing historical start after completion without reducing current mileage', () => {
    expect(() =>
      validateDriverReading(
        {
          ...outing,
          status: 'completed',
          preTripCheckedAt: new Date(),
          postTripCheckedAt: new Date(),
          endMileage: 1200
        },
        'before',
        1100,
        1300,
        1000,
        1250,
        true
      )
    ).not.toThrow();
  });
  it('freezes an existing starting reading after departure', () => {
    expect(() =>
      validateDriverReading(
        {
          ...outing,
          status: 'in_progress',
          startMileage: 1000,
          preTripCheckedAt: new Date()
        },
        'before',
        1100,
        1000,
        null,
        null,
        false
      )
    ).toThrow(/frozen/i);
  });
  it('requires gate departure before the ending reading', () => {
    expect(() =>
      validateDriverReading(outing, 'after', 1100, 1000, null, null, false)
    ).toThrow(/departure/i);
  });
  it.each([900, 1400])(
    'rejects historical mileage %s contradicting neighboring gate events',
    (mileage) => {
      expect(() =>
        validateDriverReading(
          { ...outing, status: 'completed', preTripCheckedAt: new Date() },
          'before',
          mileage,
          1400,
          1000,
          1300,
          true
        )
      ).toThrow(/neighboring/i);
    }
  );
  it('rejects an ending reading below the starting reading', () => {
    expect(() =>
      validateDriverReading(
        {
          ...outing,
          status: 'in_progress',
          startMileage: 1100,
          preTripCheckedAt: new Date()
        },
        'after',
        1099,
        1100,
        null,
        null,
        false
      )
    ).toThrow(/starting/i);
  });
  it('freezes existing ending readings when a later outing departed', () => {
    expect(() =>
      validateDriverReading(
        {
          ...outing,
          status: 'in_progress',
          endMileage: 1200,
          preTripCheckedAt: new Date()
        },
        'after',
        1250,
        1300,
        null,
        null,
        true
      )
    ).toThrow(/frozen/i);
  });
  it('rejects a first live ending reading below the known vehicle mileage even without a start', () => {
    expect(() =>
      validateDriverReading(
        { ...outing, status: 'in_progress', preTripCheckedAt: new Date() },
        'after',
        999,
        1000,
        null,
        null,
        false
      )
    ).toThrow(/current/i);
  });
  it('allows correction before departure while retaining monotonic vehicle mileage', () => {
    expect(() =>
      validateDriverReading(
        { ...outing, startMileage: 1100 },
        'before',
        1050,
        1100,
        1000,
        null,
        false
      )
    ).not.toThrow();
  });
  it('rejects a new departure reading below the current vehicle mileage', () => {
    expect(() =>
      validateDriverReading(outing, 'before', 999, 1000, null, null, false)
    ).toThrow(/current/i);
  });
});

describe('pre-entered reading at departure', () => {
  it('clears an outdated starting reading after another outing returned', () => {
    expect(gateStartingMileage(1000, 1150)).toBeNull();
  });
  it('preserves a valid reading and keeps missing mileage null', () => {
    expect(gateStartingMileage(1200, 1150)).toBe(1200);
    expect(gateStartingMileage(null, 1150)).toBeNull();
  });
});
