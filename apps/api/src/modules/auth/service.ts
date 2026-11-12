import type { AuthUser } from '@mms/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { signAccessToken } from '../../lib/jwt.js';
import { verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import {
  findUserByEmail,
  findUserById,
  type UserWithRole
} from './repository.js';
import { hashToken, issueRefreshToken } from './tokens.js';

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// Shared gate: account must be active and have a role; returns the role name.
function assertUsable(user: UserWithRole): string {
  if (user.status !== 'active') {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is inactive');
  }
  const role = user.userRole?.role.name;
  if (!role) {
    throw new AppError(403, 'NO_ROLE', 'User has no assigned role');
  }
  return role;
}

function toAuthUser(user: UserWithRole, role: string): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    role,
    branchId: user.branchId
  };
}

// The caller owns the user row lock for the lifetime of token issuance.
async function issuePairUnderLock(
  tx: Prisma.TransactionClient,
  user: UserWithRole,
  role: string
): Promise<AuthResult> {
  const current = await tx.user.findUnique({
    where: { id: user.id },
    include: { userRole: { include: { role: true } } }
  });
  if (
    !current ||
    current.authVersion !== user.authVersion ||
    current.status !== 'active' ||
    current.userRole?.role.name !== role
  ) {
    throw new AppError(
      401,
      'UNAUTHORIZED',
      'Session is no longer valid; sign in again'
    );
  }
  return {
    accessToken: signAccessToken({
      sub: current.id,
      email: current.email,
      role,
      branchId: current.branchId,
      authVersion: current.authVersion
    }),
    refreshToken: await issueRefreshToken(current.id, tx),
    user: toAuthUser(current, role)
  };
}

// Issues a fresh access + refresh pair for login and delegated switching.
async function issuePair(
  user: UserWithRole,
  role: string,
  grantOrigin?: Pick<UserWithRole, 'id' | 'authVersion'>
): Promise<AuthResult> {
  return prisma.$transaction(async (tx) => {
    // Stable lock order also covers delegated test-account authority. Locking
    // only the destination would let an origin reset race with issuance.
    const ids = [
      ...new Set([user.id, ...(grantOrigin ? [grantOrigin.id] : [])])
    ].sort();
    for (const id of ids) {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
    }
    if (grantOrigin) {
      const origin = await tx.user.findUnique({
        where: { id: grantOrigin.id },
        select: {
          status: true,
          authVersion: true,
          userRole: { select: { role: { select: { name: true } } } }
        }
      });
      if (
        !origin ||
        origin.status !== 'active' ||
        origin.userRole?.role.name !== 'admin' ||
        origin.authVersion !== grantOrigin.authVersion
      ) {
        throw new AppError(
          403,
          'TEST_ACCOUNT_FORBIDDEN',
          'Test account switching is unavailable'
        );
      }
    }
    // A login/refresh may have read this account before an admin changed it.
    // Reject stale issuance rather than resurrecting a revoked refresh session.
    return issuePairUnderLock(tx, user, role);
  });
}

// A valid bcrypt hash of a throwaway string; used so unknown emails still
// cost one bcrypt compare (timing-side-channel hardening).
const DUMMY_PASSWORD_HASH =
  '$2a$12$4Ep/qTHS1MLtUTIPsu9NDe0vF99wuwmYd2qnCaeEmoWfBkc2KM/Ty';

export async function login(
  email: string,
  password: string
): Promise<AuthResult> {
  const user = await findUserByEmail(email);
  if (!user) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const role = assertUsable(user);
  return issuePair(user, role);
}

export async function me(userId: string): Promise<AuthUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User no longer exists');
  }
  const role = assertUsable(user);
  return toAuthUser(user, role);
}

async function revokeRefreshFamily(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  // The shared user lock excludes issuance; the version also kills pending
  // login/switch snapshots and access/delegation authority from this family.
  await tx.user.update({
    where: { id: userId },
    data: { authVersion: { increment: 1 } }
  });
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function refresh(presentedToken: string): Promise<AuthResult> {
  const tokenHash = hashToken(presentedToken);
  const identity = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { userId: true }
  });
  if (!identity)
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');

  type Outcome = { result: AuthResult } | { error: AppError };
  const outcome = await prisma.$transaction<Outcome>(async (tx) => {
    // Claim, replacement issuance, and reuse revocation share one lock. Reuse
    // cannot revoke an empty family before a pending replacement is inserted.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${identity.userId}::uuid FOR NO KEY UPDATE`;
    const stored = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { userRole: { include: { role: true } } } } }
    });
    if (!stored)
      return {
        error: new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token')
      };
    if (stored.revokedAt !== null) {
      await revokeRefreshFamily(tx, stored.userId);
      // Return the error so the transaction commits family revocation first.
      return {
        error: new AppError(401, 'UNAUTHORIZED', 'Refresh token reuse detected')
      };
    }
    if (stored.expiresAt < new Date()) {
      // Plain expiry ends only this session, without changing the family.
      return {
        error: new AppError(401, 'UNAUTHORIZED', 'Refresh token expired')
      };
    }
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    if (claimed.count === 0) {
      await revokeRefreshFamily(tx, stored.userId);
      return {
        error: new AppError(401, 'UNAUTHORIZED', 'Refresh token reuse detected')
      };
    }
    return {
      result: await issuePairUnderLock(
        tx,
        stored.user,
        assertUsable(stored.user)
      )
    };
  });
  if ('error' in outcome) throw outcome.error;
  return outcome.result;
}

export async function logout(
  presentedToken: string | undefined
): Promise<void> {
  if (!presentedToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export { assertUsable, issuePair, toAuthUser };
