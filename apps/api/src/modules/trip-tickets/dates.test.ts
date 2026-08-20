import { describe, expect, it } from 'vitest';
import type { TripDateStatus, TripTicketStatus } from '@prisma/client';
import { deriveTicketStatus } from './dates.js';

// Fix round 1, item 4: `deriveTicketStatus` is a pure exported function that
// needs no database — the integration tests in trip-ticket-guard.test.ts only
// ever exercise it from `approved` with a non-empty `dates` array, so three of
// its six decision points (the pre-approval passthrough, the empty-dates
// guard, and "all settled, none completed") were never hit by anything. Both
// guards exist to prevent status corruption, and the "none completed →
// cancelled" branch is what a later task's per-date cancellation leans on.
describe('deriveTicketStatus', () => {
  const statuses = (...s: TripDateStatus[]) => s.map((status) => ({ status }));

  it('leaves a pre-approval status untouched, whatever the dates say', () => {
    // Guard #1 (dates.ts:79): before approval the approval chain owns the
    // status outright — a date row completing (or existing at all) must never
    // promote a ticket that hasn't been approved yet.
    const preApproval: TripTicketStatus[] = [
      'pending_admin_approval',
      'pending_fuel_allocation_approval',
      'disapproved',
      'cancelled',
      'completed'
    ];
    for (const current of preApproval) {
      expect(deriveTicketStatus(current, statuses('completed'))).toBe(current);
      expect(deriveTicketStatus(current, statuses('in_progress'))).toBe(
        current
      );
      expect(deriveTicketStatus(current, [])).toBe(current);
    }
  });

  it('leaves approved/in_progress untouched when there are no dates at all', () => {
    // Guard #2 (dates.ts:80): an empty `dates` array is not evidence of
    // anything — a ticket with no rows yet (e.g. mid-create, before
    // replaceTripDates runs) must not be derived down to some default.
    expect(deriveTicketStatus('approved', [])).toBe('approved');
    expect(deriveTicketStatus('in_progress', [])).toBe('in_progress');
  });

  it('spec §6.2 rule: ANY date in_progress -> ticket in_progress', () => {
    expect(
      deriveTicketStatus('approved', statuses('scheduled', 'in_progress'))
    ).toBe('in_progress');
    // First-match-wins: in_progress beats a completed date sitting alongside it.
    expect(
      deriveTicketStatus('in_progress', statuses('completed', 'in_progress'))
    ).toBe('in_progress');
  });

  it('spec §6.2 rule: at least one date still unsettled (not completed/cancelled) -> approved', () => {
    expect(deriveTicketStatus('approved', statuses('scheduled'))).toBe(
      'approved'
    );
    expect(
      deriveTicketStatus('in_progress', statuses('completed', 'scheduled'))
    ).toBe('approved');
  });

  it('spec §6.2 rule: every date settled, at least one completed -> completed', () => {
    expect(deriveTicketStatus('approved', statuses('completed'))).toBe(
      'completed'
    );
    expect(
      deriveTicketStatus(
        'in_progress',
        statuses('completed', 'cancelled', 'completed')
      )
    ).toBe('completed');
  });

  it('spec §6.2 rule: every date settled, NONE completed (all cancelled) -> cancelled', () => {
    expect(deriveTicketStatus('approved', statuses('cancelled'))).toBe(
      'cancelled'
    );
    expect(
      deriveTicketStatus('in_progress', statuses('cancelled', 'cancelled'))
    ).toBe('cancelled');
  });
});
