import { describe, expect, it } from 'vitest';
import { manilaDateString } from './dates.js';

describe('Manila calendar dates', () => {
  it.each([
    ['2026-11-12T15:59:59Z', '2026-11-12'],
    ['2026-11-12T16:00:00Z', '2026-11-13'],
    ['2026-12-31T16:30:00Z', '2027-01-01']
  ])(
    'formats %s as %s independently of the host timezone',
    (instant, expected) => {
      expect(manilaDateString(new Date(instant))).toBe(expected);
    }
  );
});
