import { describe, expect, it } from 'vitest';
import { normaliseTripDates, tripDateInputSchema } from './trip-tickets.js';

describe('normaliseTripDates', () => {
  it('returns the dates array when one is given', () => {
    const a = {
      startTs: new Date('2026-04-17T08:00Z'),
      endTs: new Date('2026-04-17T17:00Z')
    };
    const b = {
      startTs: new Date('2026-04-21T08:00Z'),
      endTs: new Date('2026-04-21T17:00Z')
    };
    expect(normaliseTripDates({ dates: [a, b] })).toEqual([a, b]);
  });

  it('falls back to a single row built from legacy startTs/endTs', () => {
    const startTs = new Date('2026-04-17T08:00Z');
    const endTs = new Date('2026-04-17T17:00Z');
    expect(normaliseTripDates({ startTs, endTs })).toEqual([
      { startTs, endTs }
    ]);
  });

  it('prefers dates over the legacy pair when both are present', () => {
    const row = {
      startTs: new Date('2026-04-21T08:00Z'),
      endTs: new Date('2026-04-21T17:00Z')
    };
    const out = normaliseTripDates({
      dates: [row],
      startTs: new Date('2026-01-01T00:00Z'),
      endTs: new Date('2026-01-02T00:00Z')
    });
    expect(out).toEqual([row]);
  });

  it('returns an empty list when neither is given', () => {
    expect(normaliseTripDates({})).toEqual([]);
  });

  it('rejects a row whose end is not after its start', () => {
    const r = tripDateInputSchema.safeParse({
      startTs: '2026-04-17T17:00Z',
      endTs: '2026-04-17T08:00Z'
    });
    expect(r.success).toBe(false);
  });
});
