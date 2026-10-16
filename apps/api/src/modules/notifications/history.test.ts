import { describe, expect, it } from 'vitest';
import { historicalNotificationText } from './history.js';

describe('historical notification copy', () => {
  it.each([
    {
      type: 'trip_approved',
      title: 'TT-9 approved by admin',
      body: 'Waiting on EVP for the fuel allocation.',
      expectedTitle: 'TT-9 was approved by admin',
      expectedBody:
        'Admin approval was recorded; fuel sign-off was still pending.'
    },
    {
      type: 'trip_awaiting_approval',
      title: 'TT-9 awaits your fuel sign-off',
      body: 'Somewhere — approved by an admin',
      expectedTitle: 'TT-9 was sent for your fuel sign-off',
      expectedBody: 'Somewhere — approved by an admin'
    },
    {
      type: 'trip_assigned',
      title: 'You are driving TT-9',
      body: 'Somewhere — 2 outings. Show your QR at the gate each time.',
      expectedTitle: 'You were assigned to drive TT-9',
      expectedBody:
        'Somewhere — 2 outings were assigned; a QR was required at the gate each time.'
    },
    {
      type: 'job_order_awaiting_action',
      title: 'JO-1 needs a mechanic',
      body: 'Original incident details',
      expectedTitle: 'JO-1 was submitted for mechanic assignment',
      expectedBody: 'Original incident details'
    },
    {
      type: 'job_order_awaiting_action',
      title: 'JO-1 awaits your sign-off',
      body: null,
      expectedTitle: 'JO-1 was sent for your sign-off',
      expectedBody: null
    },
    {
      type: 'job_order_awaiting_action',
      title: 'JO-1 is yours to repair',
      body: 'Original incident details',
      expectedTitle: 'JO-1 was assigned to you for repair',
      expectedBody: 'Original incident details'
    },
    {
      type: 'job_order_awaiting_action',
      title: 'JO-1 has a mechanic',
      body: 'The repair is assigned and awaiting sign-off.',
      expectedTitle: 'JO-1 was assigned a mechanic',
      expectedBody:
        'A mechanic was assigned; repair sign-off was still pending.'
    },
    {
      type: 'trip_checked_out',
      title: 'TT-9 left the gate',
      body: 'On the road to Somewhere (2026-08-28).',
      expectedTitle: 'TT-9 left the gate',
      expectedBody: 'Departed for Somewhere (2026-08-28).'
    },
    {
      type: 'trip_checked_in',
      title: 'TT-9 is back',
      body: 'Returned from Somewhere (2026-08-28). Other dates on this ticket are still scheduled.',
      expectedTitle: 'TT-9 returned to the gate',
      expectedBody:
        'Returned from Somewhere (2026-08-28). Other dates were still scheduled at check-in.'
    }
  ] as const)(
    'keeps $type in the past without losing the recorded event details',
    ({ expectedTitle, expectedBody, ...event }) => {
      const copy = historicalNotificationText(event);
      expect(copy).toEqual({ title: expectedTitle, body: expectedBody });
      // New rows pass through the same formatter again when read.
      expect(historicalNotificationText({ ...event, ...copy })).toEqual({
        title: expectedTitle,
        body: expectedBody
      });
    }
  );

  it('preserves cancellation reasons and custom history rather than rewriting user text', () => {
    const cancellation = {
      type: 'trip_cancelled' as const,
      title: 'TT-9 was cancelled',
      body: 'The original reason says: You are good to go.'
    };
    expect(historicalNotificationText(cancellation)).toEqual({
      title: cancellation.title,
      body: cancellation.body
    });
    expect(
      historicalNotificationText({
        type: 'trip_approved',
        title: 'An imported historical decision',
        body: 'An original note.'
      })
    ).toEqual({
      title: 'An imported historical decision',
      body: 'An original note.'
    });
  });
});
