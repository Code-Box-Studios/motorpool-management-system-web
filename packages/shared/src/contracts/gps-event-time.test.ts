import { describe, expect, it } from 'vitest';
import { ingestGpsBodySchema } from './gps.js';
const base = {
  vehicleId: '00000000-0000-4000-8000-000000000001',
  latitude: 7.1,
  longitude: 125.6
};

describe('GPS event-time contract', () => {
  it('preserves event timestamps independently of receipt time', () => {
    expect(
      ingestGpsBodySchema.parse({
        ...base,
        fixTime: '2026-01-01T00:00:00Z',
        receivedAt: '2026-01-01T00:01:00Z'
      })
    ).toMatchObject({
      fixTime: new Date('2026-01-01T00:00:00Z'),
      receivedAt: new Date('2026-01-01T00:01:00Z')
    });
  });
  it.each(['garbage', '2099-01-01T00:00:00Z'])(
    'rejects invalid/future event time %s',
    (fixTime) => {
      expect(ingestGpsBodySchema.safeParse({ ...base, fixTime }).success).toBe(
        false
      );
    }
  );
});
