import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export const userInclude = { userRole: { include: { role: true } } } as const;

export type UserRow = NonNullable<Awaited<ReturnType<typeof findUserById>>>;

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, include: userInclude });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, include: userInclude });
}

export async function listUsers(
  roleName: string | undefined,
  skipTake: { skip: number; take: number } | Record<string, never>,
  orderBy: Prisma.UserOrderByWithRelationInput = { updatedAt: 'desc' }
) {
  const where = roleName
    ? { userRole: { role: { name: roleName } } }
    : undefined;
  const [data, count] = await Promise.all([
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy,
      ...skipTake
    }),
    prisma.user.count({ where })
  ]);
  return { data, count };
}
