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
  return prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.limit
  });
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
