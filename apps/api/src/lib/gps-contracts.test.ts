import { describe, expect, it } from 'vitest';
import { gpsHistoryQuerySchema, ingestGpsBodySchema } from '@mms/shared';

describe('gps contracts', () => {
  it('accepts a valid ingest payload and coerces numbers', () => {
    const parsed = ingestGpsBodySchema.parse({
      vehicleId: '00000000-0000-4000-8000-000000000001',
      latitude: '7.0731',
      longitude: '125.6128',
      speed: '45.2',
      heading: '90',
      engineStatus: 'on'
    });
    expect(parsed.latitude).toBeCloseTo(7.0731);
    expect(parsed.speed).toBeCloseTo(45.2);
  });

  it('rejects out-of-range coordinates', () => {
    expect(() =>
      ingestGpsBodySchema.parse({
        vehicleId: '00000000-0000-4000-8000-000000000001',
        latitude: 91,
        longitude: 0
      })
    ).toThrow();
    expect(() =>
      ingestGpsBodySchema.parse({
        vehicleId: '00000000-0000-4000-8000-000000000001',
        latitude: 0,
        longitude: 181
      })
    ).toThrow();
  });

  it('history query: vehicleId required, limit defaults 500 / caps at 5000', () => {
    expect(() => gpsHistoryQuerySchema.parse({})).toThrow(); // vehicleId required
    const d = gpsHistoryQuerySchema.parse({
      vehicleId: '00000000-0000-4000-8000-000000000001'
    });
    expect(d.limit).toBe(500);
    expect(() =>
      gpsHistoryQuerySchema.parse({
        vehicleId: '00000000-0000-4000-8000-000000000001',
        limit: '6000'
      })
    ).toThrow();
  });
});
