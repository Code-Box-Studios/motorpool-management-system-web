import { describe, expect, it } from 'vitest';
import {
  createTripTicketBodySchema,
  normaliseTripDates,
  tripDateInputSchema,
  updateTripTicketBodySchema
} from './trip-tickets.js';

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

// A guide is a real row with an id, unlike a participant, and every ticket
// needs at least one. The interesting half is what `.partial()` does with the
// `.min(1)`: it wraps the field in ZodOptional and does NOT reach inside to
// strip the refinement, so ABSENT and EMPTY stay genuinely different cases on
// PATCH — absent leaves the guides alone, empty is refused. An empty list must
// never be mistaken for "no change".
describe('guideIds on the trip-ticket bodies', () => {
  const ok = {
    branchId: '11111111-1111-4111-8111-111111111111',
    driverId: '22222222-2222-4222-8222-222222222222',
    vehicleId: '33333333-3333-4333-8333-333333333333',
    destination: 'Site A',
    purpose: 'Delivery',
    dateRequested: '2026-09-10',
    guideIds: ['44444444-4444-4444-8444-444444444444']
  };

  it('requires at least one guide on create', () => {
    expect(createTripTicketBodySchema.safeParse(ok).success).toBe(true);

    const noGuides: Record<string, unknown> = { ...ok };
    delete noGuides.guideIds;
    expect(createTripTicketBodySchema.safeParse(noGuides).success).toBe(false);

    expect(
      createTripTicketBodySchema.safeParse({ ...ok, guideIds: [] }).success
    ).toBe(false);
  });

  it('PATCH: absent means leave the guides alone, empty is refused', () => {
    const absent = updateTripTicketBodySchema.safeParse({
      destination: 'Site B'
    });
    expect(absent.success).toBe(true);
    // Not merely undefined — the key is ABSENT from the parsed body, which is
    // what lets service.update() tell "not editing guides" from "set guides to
    // nothing". (No `.default([])` here, deliberately: that is what makes
    // `dates` behave differently — see the NO_TRIP_DATES gate in service.ts.)
    expect(absent.success && 'guideIds' in absent.data).toBe(false);

    expect(updateTripTicketBodySchema.safeParse({ guideIds: [] }).success).toBe(
      false
    );
    expect(
      updateTripTicketBodySchema.safeParse({
        guideIds: ['44444444-4444-4444-8444-444444444444']
      }).success
    ).toBe(true);
  });
});
