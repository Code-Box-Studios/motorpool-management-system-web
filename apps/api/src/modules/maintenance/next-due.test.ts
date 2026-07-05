import { describe, expect, it } from 'vitest';
import { addMonths, computeNextDue, deriveTrackingStatus } from './next-due.js';

describe('computeNextDue (interval_type is ignored — truthiness only)', () => {
  it('computes both date and mileage when both intervals are set', () => {
    const r = computeNextDue(new Date('2026-01-15'), 50000, 12, 10000);
    expect(r.nextDueMileage).toBe(60000);
    expect(r.nextDueDate?.toISOString().slice(0, 10)).toBe('2027-01-15');
  });

  it('leaves date null for a mileage-only interval and vice versa', () => {
    expect(computeNextDue(new Date('2026-01-15'), 50000, null, 10000).nextDueDate).toBeNull();
    expect(computeNextDue(new Date('2026-01-15'), 50000, 6, null).nextDueMileage).toBeNull();
  });

  it('adds calendar months with JS Date.setMonth semantics (Jan 31 + 1mo overflows)', () => {
    expect(addMonths(new Date('2026-01-31'), 1).getMonth()).toBe(2); // March (overflow), preserving FE behavior
  });
});

describe('deriveTrackingStatus (spec-faithful port of computeTrackingStatus)', () => {
  const now = new Date('2026-06-01');

  it('completed + past due date OR mileage reached -> overdue', () => {
    expect(deriveTrackingStatus({ status: 'completed', nextDueDate: new Date('2026-05-01'), nextDueMileage: null }, now, 0)).toBe('overdue');
    expect(deriveTrackingStatus({ status: 'completed', nextDueDate: null, nextDueMileage: 60000 }, now, 60000)).toBe('overdue');
  });

  it('completed + within 30 days OR within 500km -> due_soon', () => {
    expect(deriveTrackingStatus({ status: 'completed', nextDueDate: new Date('2026-06-20'), nextDueMileage: null }, now, 0)).toBe('due_soon');
    expect(deriveTrackingStatus({ status: 'completed', nextDueDate: null, nextDueMileage: 60000 }, now, 59600)).toBe('due_soon');
  });

  it('completed + comfortably ahead -> completed', () => {
    expect(deriveTrackingStatus({ status: 'completed', nextDueDate: new Date('2027-01-01'), nextDueMileage: 90000 }, now, 40000)).toBe('completed');
  });

  it('never-completed row -> pending, or overdue if a due threshold is already passed', () => {
    expect(deriveTrackingStatus({ status: 'pending', nextDueDate: new Date('2027-01-01'), nextDueMileage: null }, now, 0)).toBe('pending');
    expect(deriveTrackingStatus({ status: 'pending', nextDueDate: new Date('2026-05-01'), nextDueMileage: null }, now, 0)).toBe('overdue');
  });
});
