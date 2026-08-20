import { z } from 'zod';

// Kept in step with the Prisma enum of the same name. The message text lives on
// the row; this is what the bell groups and picks an icon by.
export const NOTIFICATION_TYPE = {
  TRIP_SUBMITTED: 'trip_submitted',
  TRIP_AWAITING_APPROVAL: 'trip_awaiting_approval',
  TRIP_APPROVED: 'trip_approved',
  TRIP_DISAPPROVED: 'trip_disapproved',
  TRIP_CANCELLED: 'trip_cancelled',
  TRIP_ASSIGNED: 'trip_assigned',
  TRIP_CHECKED_OUT: 'trip_checked_out',
  TRIP_CHECKED_IN: 'trip_checked_in',
  JOB_ORDER_AWAITING_ACTION: 'job_order_awaiting_action',
  JOB_ORDER_APPROVED: 'job_order_approved',
  JOB_ORDER_COMPLETED: 'job_order_completed'
} as const;

export type NotificationTypeValue =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

// The bell's list. `unreadOnly` backs the dropdown; the full list backs "see
// all". Capped at 50 — the bell is a recent-activity view, not an archive.
export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;

// Marking a specific set read — what the dropdown sends when it is opened.
// Empty is rejected: "mark all" is its own endpoint, and an empty array here
// almost always means a bug at the call site rather than a deliberate no-op.
export const markNotificationsReadBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
});
export type MarkNotificationsReadBody = z.infer<
  typeof markNotificationsReadBodySchema
>;
