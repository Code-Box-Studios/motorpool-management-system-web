import type { NotificationType } from '@prisma/client';

/** Keep event copy historical, including notifications stored before this rule. */
export function historicalNotificationText(notification: {
  type: NotificationType;
  title: string;
  body?: string | null;
}): { title: string; body: string | null } {
  let { title } = notification;
  let body = notification.body ?? null;

  switch (notification.type) {
    case 'trip_approved':
      title = title
        .replace(/^(TT(?:-\d+)?) is approved$/, '$1 was approved')
        .replace(
          /^(TT(?:-\d+)?) approved by admin$/,
          '$1 was approved by admin'
        );
      body =
        body?.replace(
          / — fuel allocated\. You are good to go\.$/,
          ' — fuel allocation was approved.'
        ) ?? null;
      if (body === 'Waiting on EVP for the fuel allocation.') {
        body = 'Admin approval was recorded; fuel sign-off was still pending.';
      }
      break;
    case 'trip_awaiting_approval':
      title = title
        .replace(
          /^(TT(?:-\d+)?) needs your approval$/,
          '$1 was submitted for your approval'
        )
        .replace(
          /^(TT(?:-\d+)?) awaits your fuel sign-off$/,
          '$1 was sent for your fuel sign-off'
        );
      break;
    case 'trip_assigned':
      title = title.replace(
        /^You are driving (TT(?:-\d+)?)$/,
        'You were assigned to drive $1'
      );
      body =
        body
          ?.replace(
            / — show your QR at the gate\.$/,
            ' — a QR was required at the gate for this assignment.'
          )
          .replace(
            / — (\d+) outings\. Show your QR at the gate each time\.$/,
            ' — $1 outings were assigned; a QR was required at the gate each time.'
          ) ?? null;
      break;
    case 'job_order_awaiting_action':
      title = title
        .replace(
          /^(JO(?:-\d+)?) needs a mechanic$/,
          '$1 was submitted for mechanic assignment'
        )
        .replace(
          /^(JO(?:-\d+)?) awaits your sign-off$/,
          '$1 was sent for your sign-off'
        )
        .replace(
          /^(JO(?:-\d+)?) is yours to repair$/,
          '$1 was assigned to you for repair'
        )
        .replace(
          /^(JO(?:-\d+)?) has a mechanic$/,
          '$1 was assigned a mechanic'
        );
      if (body === 'The repair is assigned and awaiting sign-off.') {
        body = 'A mechanic was assigned; repair sign-off was still pending.';
      }
      break;
    case 'job_order_approved':
      if (body === 'The repair is signed off and can proceed.') {
        body = 'The repair was signed off.';
      }
      break;
    case 'trip_checked_out':
      body = body?.replace(/^On the road to /, 'Departed for ') ?? null;
      break;
    case 'trip_checked_in':
      title = title.replace(
        /^(TT(?:-\d+)?) is back$/,
        '$1 returned to the gate'
      );
      body =
        body?.replace(
          /Other dates on this ticket are still scheduled\.$/,
          'Other dates were still scheduled at check-in.'
        ) ?? null;
      break;
  }

  return { title, body };
}
