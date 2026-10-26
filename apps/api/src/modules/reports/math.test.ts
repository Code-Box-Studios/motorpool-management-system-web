import { describe, expect, it } from 'vitest';
import { estimateFuel, gpsDistance, reportDateRange } from './math.js';

describe('report calculations', () => {
  it('uses Manila calendar midnight with an inclusive last date', () => {
    const range = reportDateRange('2026-10-01', '2026-10-25');
    expect(range.gte?.toISOString()).toBe('2026-09-30T16:00:00.000Z');
    expect(range.lt?.toISOString()).toBe('2026-10-25T16:00:00.000Z');
  });
  it('rejects impossible dates and reversed ranges', () => {
    expect(() => reportDateRange('2026-02-30')).toThrow();
    expect(() => reportDateRange('2026-10-25', '2026-10-01')).toThrow();
  });
  it('matches the image example using total allocations divided by total distance', () => {
    expect(estimateFuel(45, 300, 40, 10)).toEqual({
      rate: 0.15,
      estimatedLiters: 6,
      proposedLiters: 10,
      difference: 4
    });
    expect(estimateFuel(45, 300, 40, 4)?.difference).toBe(-2);
  });
  it('does not fabricate estimates from empty or invalid history', () => {
    expect(estimateFuel(45, 0, 40, 10)).toBeNull();
    expect(estimateFuel(0, 300, 40, 10)).toBeNull();
    expect(estimateFuel(45, 300, -1, 10)).toBeNull();
    expect(estimateFuel(45, 300, 40, NaN)).toBeNull();
  });
  const start = new Date('2026-10-25T00:00:00Z');
  const end = new Date('2026-10-25T00:10:00Z');
  const point = (createdAt: Date, longitude: number, latitude = 7) => ({
    createdAt,
    longitude,
    latitude
  });
  it('sums actual GPS segments in kilometers inside the gate interval', () => {
    const result = gpsDistance(
      [point(start, 125), point(end, 125.001)],
      start,
      end
    );
    expect(result.reason).toBeNull();
    expect(result.distanceKm).toBeGreaterThan(0.1);
    expect(result.distanceKm).toBeLessThan(0.12);
  });
  it('rejects missing, zero-distance, gapped and implausible GPS traces', () => {
    expect(gpsDistance([], start, end).reason).toMatch(/samples/i);
    expect(
      gpsDistance([point(start, 125), point(end, 125)], start, end).reason
    ).toMatch(/zero/i);
    const later = new Date(start.getTime() + 60 * 60 * 1000);
    expect(
      gpsDistance([point(start, 125), point(later, 125.001)], start, later)
        .reason
    ).toMatch(/gap/i);
    expect(
      gpsDistance([point(start, 125), point(end, 130)], start, end).reason
    ).toMatch(/speed/i);
    expect(
      gpsDistance([point(start, 125, 99), point(end, 125.001)], start, end)
        .reason
    ).toMatch(/samples/i);
  });
  it('rejects incomplete gate-boundary coverage and cannot count samples outside the outing', () => {
    const late = new Date(start.getTime() + 30 * 60 * 1000);
    const finish = new Date(late.getTime() + 5 * 60 * 1000);
    expect(
      gpsDistance([point(late, 125), point(finish, 125.001)], start, finish)
        .reason
    ).toMatch(/coverage/i);
    expect(
      gpsDistance(
        [point(new Date(start.getTime() - 60000), 125), point(end, 125.001)],
        start,
        end
      ).reason
    ).toMatch(/samples/i);
  });
});
