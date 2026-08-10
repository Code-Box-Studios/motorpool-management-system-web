import { prisma } from '../../lib/prisma.js';

// User with their single role resolved — what every auth flow needs.
export function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: { userRole: { include: { role: true } } }
  });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { userRole: { include: { role: true } } }
  });
}

export type UserWithRole = NonNullable<
  Awaited<ReturnType<typeof findUserByEmail>>
>;
