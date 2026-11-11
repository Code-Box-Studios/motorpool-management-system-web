import { describe, expect, it } from 'vitest';
import {
  checkOutBodySchema,
  checkInBodySchema,
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

// Existing callers default to student trips. PATCH preserves absent fields and
// lets the service apply the guide rule using the stored participant type.
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

  it('requires at least one guide on student create', () => {
    expect(createTripTicketBodySchema.safeParse(ok).success).toBe(true);

    const noGuides: Record<string, unknown> = { ...ok };
    delete noGuides.guideIds;
    expect(createTripTicketBodySchema.safeParse(noGuides).success).toBe(false);

    expect(
      createTripTicketBodySchema.safeParse({ ...ok, guideIds: [] }).success
    ).toBe(false);
  });

  it('PATCH: absent leaves guides alone and empty reaches type-aware service validation', () => {
    const absent = updateTripTicketBodySchema.safeParse({
      destination: 'Site B'
    });
    expect(absent.success).toBe(true);
    // Optional PATCH fields must not materialize their create defaults.
    expect(absent.success && 'guideIds' in absent.data).toBe(false);

    expect(updateTripTicketBodySchema.parse({ guideIds: [] })).toEqual({
      guideIds: []
    });
    expect(
      updateTripTicketBodySchema.safeParse({
        guideIds: ['44444444-4444-4444-8444-444444444444']
      }).success
    ).toBe(true);
  });
});

describe('QR-only gate contracts', () => {
  const dateId = '44444444-4444-4444-8444-444444444444';
  it('requires the selected outing UUID for both gate scans', () => {
    for (const schema of [checkOutBodySchema, checkInBodySchema]) {
      expect(schema.safeParse({ dateId }).success).toBe(true);
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ dateId: 'not-a-uuid' }).success).toBe(false);
    }
  });
  it('does not accept guard mileage as a driver reading', () => {
    expect(checkOutBodySchema.parse({ dateId, startMileage: 1234 })).toEqual({
      dateId
    });
    expect(checkInBodySchema.parse({ dateId, endMileage: 1250 })).toEqual({
      dateId
    });
  });
});
