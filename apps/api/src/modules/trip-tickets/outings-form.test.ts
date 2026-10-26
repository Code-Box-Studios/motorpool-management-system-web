import { describe, expect, it } from 'vitest';
import {
  datesFieldSchema,
  outingPayload
} from '../../../../web/src/components/pages/trip-tickets/add-trip-ticket/outings.js';

describe('outing departure and return dates', () => {
  it('maps an overnight return to the following Manila calendar date', () => {
    expect(
      outingPayload({
        date: '2026-11-01',
        returnDate: '2026-11-02',
        start: '22:00',
        end: '06:00'
      })
    ).toEqual({
      startTs: '2026-11-01T14:00:00.000Z',
      endTs: '2026-11-01T22:00:00.000Z'
    });
  });
  it('accepts a multi-day outing and adjacent half-open windows', () => {
    expect(
      datesFieldSchema.safeParse([
        {
          date: '2026-11-01',
          returnDate: '2026-11-03',
          start: '22:00',
          end: '06:00'
        },
        {
          date: '2026-11-03',
          returnDate: '2026-11-03',
          start: '06:00',
          end: '09:00'
        }
      ]).success
    ).toBe(true);
  });
  it('rejects a same-day return before departure', () => {
    expect(
      datesFieldSchema.safeParse([
        {
          date: '2026-11-01',
          returnDate: '2026-11-01',
          start: '22:00',
          end: '06:00'
        }
      ]).success
    ).toBe(false);
  });
  it('rejects overlaps across overnight boundaries', () => {
    expect(
      datesFieldSchema.safeParse([
        {
          date: '2026-11-01',
          returnDate: '2026-11-02',
          start: '22:00',
          end: '06:00'
        },
        {
          date: '2026-11-02',
          returnDate: '2026-11-02',
          start: '05:00',
          end: '09:00'
        }
      ]).success
    ).toBe(false);
  });
});
