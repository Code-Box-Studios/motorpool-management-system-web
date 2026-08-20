import { describe, expect, it } from 'vitest';
import {
  DISPLAY_TIMEZONE,
  endOfDisplayDay,
  formatDisplayDate
} from './timezone.js';

// Fix round 1, item 5: this directory co-locates a unit test with every other
// lib module (access.test.ts, http.test.ts, jwt.test.ts, pagination.test.ts,
// password.test.ts, uploads.test.ts) — this one was missing it. Combined with
// vitest.config.ts pinning `TZ: 'UTC'` (fix round 1, item 1), this is what
// actually guards the Manila-boundary fix: without a fixed test-process
// timezone, a bug here could pass by accident on whatever host happens to run
// the suite.
describe('timezone', () => {
  it('DISPLAY_TIMEZONE is Asia/Manila', () => {
    expect(DISPLAY_TIMEZONE).toBe('Asia/Manila');
  });

  describe('endOfDisplayDay', () => {
    it('returns 23:59:59.999 Manila as a UTC instant, for a midday-Manila now', () => {
      // 2026-08-17T04:00:00Z == 12:00 Manila on the 17th.
      const now = new Date('2026-08-17T04:00:00.000Z');
      expect(endOfDisplayDay(now).toISOString()).toBe(
        '2026-08-17T15:59:59.999Z'
      );
    });

    it('resolves the correct Manila day when `now` is still the UTC-previous day', () => {
      // This is the exact regression: 2026-08-16T23:00:00Z == 07:00 Manila on
      // the 17th. The Manila calendar day is the 17th, not the 16th, so the
      // boundary must land on the 17th — the same instant as the midday case
      // above, despite `now` itself sitting on the UTC-previous day.
      const now = new Date('2026-08-16T23:00:00.000Z');
      expect(endOfDisplayDay(now).toISOString()).toBe(
        '2026-08-17T15:59:59.999Z'
      );
    });

    it('is the identity at the last instant of a Manila day', () => {
      // 2026-08-16T15:59:59.999Z == 23:59:59.999 Manila on the 16th — already
      // the last instant of that Manila day, so the function must return
      // exactly `now`, not roll forward or back a day.
      const now = new Date('2026-08-16T15:59:59.999Z');
      expect(endOfDisplayDay(now).toISOString()).toBe(now.toISOString());
    });

    it('rolls over at the first instant of the next Manila day', () => {
      // 2026-08-16T16:00:00.000Z == 00:00:00.000 Manila on the 17th — one ms
      // after the previous case's instant, and now the 17th's boundary.
      const now = new Date('2026-08-16T16:00:00.000Z');
      expect(endOfDisplayDay(now).toISOString()).toBe(
        '2026-08-17T15:59:59.999Z'
      );
    });

    it("is exact to the millisecond, unaffected by `now`'s own sub-second value", () => {
      // Fix round 1, item 5: omitting `now`'s milliseconds when fabricating
      // the offset used to leak them into the result — this same instant as
      // the midday case above, but with a .750 fraction, used to come back
      // 2026-08-17T16:00:00.749Z (750ms late) instead of the correct
      // 2026-08-17T15:59:59.999Z.
      const now = new Date('2026-08-17T04:00:00.750Z');
      expect(endOfDisplayDay(now).toISOString()).toBe(
        '2026-08-17T15:59:59.999Z'
      );
    });
  });

  describe('formatDisplayDate', () => {
    it('names the Manila calendar day, not the UTC one', () => {
      // 2026-08-16T23:00:00Z is still the 16th in UTC but already the 17th in
      // Manila — the whole reason this helper exists (booking clash messages
      // must name the day the fleet actually experiences).
      expect(formatDisplayDate(new Date('2026-08-16T23:00:00.000Z'))).toBe(
        '2026-08-17'
      );
    });
  });
});
