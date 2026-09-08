import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { assertSeatsFit, replaceTripTicketGuides } from './guides.js';

describe('assertSeatsFit', () => {
  it('accepts a party that exactly fills the van', () => {
    expect(() => assertSeatsFit(5, 4, 1)).not.toThrow();
  });

  it('counts a guide as a seat, exactly like a participant', () => {
    // Five participants alone fit a five-seater; one guide is the seat too
    // many. This is design §5.1's "consequence to accept" made executable — a
    // trip previously bookable at exactly capacity now needs a bigger vehicle.
    expect(() => assertSeatsFit(5, 5, 0)).not.toThrow();
    expect(() => assertSeatsFit(5, 5, 1)).toThrow(AppError);
  });

  it('names BOTH figures in the message, or the error is unactionable', () => {
    // "That vehicle seats 12; the trip is for 13" tells a requester who can
    // see ten names typed in nothing at all about the three seats they cannot
    // account for.
    try {
      assertSeatsFit(12, 10, 3);
      throw new Error('unreachable: assertSeatsFit accepted 13 in a 12-seater');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.statusCode).toBe(409);
      expect(e.code).toBe('OVER_CAPACITY');
      expect(e.message).toBe(
        'That vehicle seats 12; the trip is for 10 participant(s) and 3 guide(s)'
      );
    }
  });
});

describe('replaceTripTicketGuides', () => {
  // Any property access on this explodes, so the assertion below proves the
  // refusal happens BEFORE the deleteMany. An empty replace that deleted the
  // rows it then declined to rebuild would leave a ticket with no guides at
  // all and no error anywhere — the same trap replaceTripDates documents.
  const explodingTx = new Proxy(
    {},
    {
      get() {
        throw new Error('replaceTripTicketGuides reached the database');
      }
    }
  ) as unknown as Prisma.TransactionClient;

  it('refuses an empty list with 400 NO_GUIDES, before touching the database', async () => {
    await expect(
      replaceTripTicketGuides(
        explodingTx,
        '00000000-0000-4000-8000-000000000000',
        []
      )
    ).rejects.toMatchObject({ statusCode: 400, code: 'NO_GUIDES' });
  });
});
