import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

// One row per recipient per event — see the Notification model's note.
export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  linkTo?: string | null;
}

// Written with createMany because every caller fans one event out to a set of
// people, and skipDuplicates keeps a retried transition from doubling the bell.
export async function createNotifications(
  rows: NewNotification[],
  tx: Prisma.TransactionClient = prisma
): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await tx.notification.createMany({ data: rows });
  return result.count;
}

export async function listForUser(
  userId: string,
  opts: { unreadOnly: boolean; limit: number }
) {
  const rows = await prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.limit
  });

  // Resolve only the records linked by this recipient's recent notifications.
  // Batch by resource so the bell does not issue one query per history row.
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const tripLink = new RegExp(`^/trip-tickets/(${uuid})$`, 'i');
  const jobLink = new RegExp(`^/job-order/(${uuid})$`, 'i');
  const idsFor = (pattern: RegExp) => [
    ...new Set(
      rows.flatMap((row) => {
        const id = pattern.exec(row.linkTo ?? '')?.[1];
        return id ? [id.toLowerCase()] : [];
      })
    )
  ];
  const tripIds = idsFor(tripLink);
  const jobIds = idsFor(jobLink);
  const [trips, orders] = await Promise.all([
    tripIds.length > 0
      ? prisma.tripTicket.findMany({
          where: { id: { in: tripIds } },
          select: { id: true, status: true }
        })
      : [],
    jobIds.length > 0
      ? prisma.jobOrder.findMany({
          where: { id: { in: jobIds } },
          select: { id: true, status: true }
        })
      : []
  ]);
  const currentStatuses = new Map<string, string>([
    ...trips.map((trip) => [`/trip-tickets/${trip.id}`, trip.status] as const),
    ...orders.map((order) => [`/job-order/${order.id}`, order.status] as const)
  ]);
  return rows.map((row) => ({
    ...row,
    currentStatus: currentStatuses.get(row.linkTo?.toLowerCase() ?? '') ?? null
  }));
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

// Scoped by userId as well as id: without it, any authenticated caller could
// mark somebody else's notification read by guessing a uuid.
export async function markRead(
  userId: string,
  ids: string[],
  now: Date
): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, id: { in: ids }, readAt: null },
    data: { readAt: now }
  });
  return result.count;
}

export async function markAllRead(userId: string, now: Date): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: now }
  });
  return result.count;
}
