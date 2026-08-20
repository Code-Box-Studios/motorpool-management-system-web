import type { NotificationType, Prisma } from '@prisma/client';
import { USER_ROLES } from '@mms/shared';
import { prisma } from '../../lib/prisma.js';
import * as repository from './repository.js';

// ---------- Reading (the bell) ----------

export async function list(
  userId: string,
  opts: { unreadOnly: boolean; limit: number }
) {
  const [data, unread] = await Promise.all([
    repository.listForUser(userId, opts),
    repository.countUnread(userId)
  ]);
  return { data, unread };
}

export async function markRead(userId: string, ids: string[]) {
  const count = await repository.markRead(userId, ids, new Date());
  return { count, unread: await repository.countUnread(userId) };
}

export async function markAllRead(userId: string) {
  const count = await repository.markAllRead(userId, new Date());
  return { count, unread: 0 };
}

// ---------- Writing (raised by the workflow) ----------

// Everyone holding a role. Used for the "someone must act on this" fan-outs,
// where the recipient is a desk rather than a person.
export async function usersWithRole(
  role: string,
  tx: Prisma.TransactionClient = prisma
): Promise<string[]> {
  const rows = await tx.user.findMany({
    where: { status: 'active', userRole: { role: { name: role } } },
    select: { id: true }
  });
  return rows.map((r) => r.id);
}

export const adminIds = (tx?: Prisma.TransactionClient) =>
  usersWithRole(USER_ROLES.admin, tx);
export const evpIds = (tx?: Prisma.TransactionClient) =>
  usersWithRole(USER_ROLES.evp_operations, tx);

// The user account behind a driver record, when there is one — a driver row can
// exist before anybody has signed in as them.
export async function userIdForDriver(
  driverId: string | null | undefined,
  tx: Prisma.TransactionClient = prisma
): Promise<string | null> {
  if (!driverId) return null;
  const driver = await tx.driver.findUnique({
    where: { id: driverId },
    select: { userId: true }
  });
  return driver?.userId ?? null;
}

export interface NotifyInput {
  /** Who should see it. Nulls and duplicates are dropped, so callers can pass
   *  "the requester, every admin, and maybe a driver" without pre-cleaning. */
  userIds: (string | null | undefined)[];
  type: NotificationType;
  title: string;
  body?: string | null;
  linkTo?: string | null;
  /** Never notify the person who performed the action — they were there. */
  exceptUserId?: string | null;
}

/**
 * Raise one event for a set of people.
 *
 * Deliberately swallows its own failures when called outside a transaction: a
 * trip must not fail to be approved because the bell could not be written. Pass
 * `tx` when the notification genuinely belongs to the same atomic unit.
 */
export async function notify(
  input: NotifyInput,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const recipients = [
    ...new Set(
      input.userIds.filter(
        (id): id is string => !!id && id !== input.exceptUserId
      )
    )
  ];
  if (recipients.length === 0) return 0;

  const rows = recipients.map((userId) => ({
    userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    linkTo: input.linkTo ?? null
  }));

  if (tx) return repository.createNotifications(rows, tx);

  try {
    return await repository.createNotifications(rows);
  } catch (error) {
    // The workflow already succeeded; losing the bell is not worth failing it.
    console.error('[notifications] failed to write', error);
    return 0;
  }
}
