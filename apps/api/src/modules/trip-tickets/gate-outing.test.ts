import { describe, expect, it } from 'vitest';
import { gateOuting } from '../../../../web/src/components/pages/trip-tickets/guard-confirmation/outings.js';

const dates = [
  {
    id: 'missed-yesterday',
    status: 'scheduled',
    start_ts: '2026-10-24T00:00:00Z',
    end_ts: '2026-10-24T10:00:00Z'
  },
  {
    id: 'today',
    status: 'scheduled',
    start_ts: '2026-10-25T00:00:00Z',
    end_ts: '2026-10-25T10:00:00Z'
  },
  {
    id: 'tomorrow',
    status: 'scheduled',
    start_ts: '2026-10-26T00:00:00Z',
    end_ts: '2026-10-26T10:00:00Z'
  }
];
describe('guard table outing selection matches gate API', () => {
  it('skips a missed outing and selects today across the UTC/Manila date boundary', () => {
    expect(
      gateOuting('approved', dates, new Date('2026-10-24T23:00:00Z'))?.id
    ).toBe('today');
  });
  it('keeps an overnight outing eligible while its return remains in the future', () => {
    expect(
      gateOuting(
        'approved',
        [{ ...dates[0]!, end_ts: '2026-10-25T10:00:00Z' }],
        new Date('2026-10-24T23:00:00Z')
      )?.id
    ).toBe('missed-yesterday');
  });
  it('shows the active outing for scan-in regardless of planned dates', () => {
    expect(
      gateOuting(
        'in_progress',
        [{ ...dates[0]!, status: 'in_progress' }, dates[1]!],
        new Date('2026-10-25T12:00:00Z')
      )?.id
    ).toBe('missed-yesterday');
  });
  it('does not advertise a future outing as currently eligible', () => {
    expect(
      gateOuting('approved', [dates[2]!], new Date('2026-10-25T00:00:00Z'))
    ).toBeUndefined();
  });
});
