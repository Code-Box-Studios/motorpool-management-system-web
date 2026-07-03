import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Refresh tokens are opaque random values; only their SHA-256 lands in the DB.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
    }
  });
  return token;
}
