import type { AuthUser } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { signAccessToken } from '../../lib/jwt.js';
import { verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { findUserByEmail, findUserById, type UserWithRole } from './repository.js';
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

// Issues a fresh access + refresh pair for the user (used by login and refresh).
async function issuePair(user: UserWithRole, role: string): Promise<AuthResult> {
  return {
    accessToken: signAccessToken({ sub: user.id, email: user.email, role, branchId: user.branchId }),
    refreshToken: await issueRefreshToken(user.id),
    user: toAuthUser(user, role)
  };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
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

export async function refresh(presentedToken: string): Promise<AuthResult> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(presentedToken) },
    include: { user: { include: { userRole: { include: { role: true } } } } }
  });
  if (!stored) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
  }
  if (stored.revokedAt !== null) {
    // Reuse of a rotated/revoked token = possible theft: kill the family (spec §4.1).
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    throw new AppError(401, 'UNAUTHORIZED', 'Refresh token reuse detected');
  }
  if (stored.expiresAt < new Date()) {
    // Plain expiry is not reuse — this session ends, others stay alive.
    throw new AppError(401, 'UNAUTHORIZED', 'Refresh token expired');
  }
  // Atomically claim the token: only one concurrent presentation of the same
  // valid token can win this conditional update. The loser observes
  // count === 0 (someone else already revoked it) and is treated as reuse.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  if (claimed.count === 0) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    throw new AppError(401, 'UNAUTHORIZED', 'Refresh token reuse detected');
  }
  const role = assertUsable(stored.user);
  try {
    return await issuePair(stored.user, role);
  } catch (err) {
    // The claim already revoked the old token; if minting its replacement
    // fails, undo the claim so the caller isn't stranded without any valid
    // refresh token.
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: null }
    });
    throw err;
  }
}

export async function logout(presentedToken: string | undefined): Promise<void> {
  if (!presentedToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export { assertUsable, issuePair, toAuthUser };
