import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { findUserByEmail, type UserWithRole } from './repository.js';
import { issuePair } from './service.js';
import { hashToken } from './tokens.js';

export const TEST_ACCOUNTS_COOKIE = 'mms_test_accounts';
const AUDIENCE = 'mms:test-account-switch';
const TTL_SECONDS = 60 * 60;
// A distinct signing key prevents a grant from ever being an access token.
const grantKey = createHmac('sha256', config.jwtSecret)
  .update(AUDIENCE)
  .digest();
const ACCOUNTS = [
  { role: 'admin', email: 'admin@mms.local', label: 'Admin' },
  { role: 'requester', email: 'requester@mms.local', label: 'Requester' },
  { role: 'driver', email: 'driver@mms.local', label: 'Driver' },
  {
    role: 'evp_operations',
    email: 'evp_operations@mms.local',
    label: 'EVP Operations'
  },
  {
    role: 'security_guard',
    email: 'security_guard@mms.local',
    label: 'Security Guard'
  }
] as const;
export const switchTestAccountSchema = z
  .object({
    role: z.enum([
      'admin',
      'requester',
      'driver',
      'evp_operations',
      'security_guard'
    ])
  })
  .strict();

interface Grant {
  originId: string;
  currentId: string;
  refreshHash: string;
  exp: number;
}

function cookieOptions(expiresAt?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSameSite === 'none',
    path: '/api/auth',
    ...(expiresAt ? { maxAge: Math.max(0, expiresAt * 1000 - Date.now()) } : {})
  };
}

export function clearTestAccountGrant(res: Response): void {
  res.clearCookie(TEST_ACCOUNTS_COOKIE, cookieOptions());
}

function writeGrant(res: Response, grant: Grant): void {
  res.cookie(
    TEST_ACCOUNTS_COOKIE,
    jwt.sign({ ...grant, purpose: AUDIENCE }, grantKey, {
      algorithm: 'HS256',
      audience: AUDIENCE
    }),
    cookieOptions(grant.exp)
  );
}

function readGrant(token: string | undefined): Grant | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, grantKey, {
      algorithms: ['HS256'],
      audience: AUDIENCE
    });
    if (
      typeof decoded === 'string' ||
      decoded.purpose !== AUDIENCE ||
      typeof decoded.originId !== 'string' ||
      typeof decoded.currentId !== 'string' ||
      typeof decoded.refreshHash !== 'string' ||
      typeof decoded.exp !== 'number'
    )
      return null;
    return {
      originId: decoded.originId,
      currentId: decoded.currentId,
      refreshHash: decoded.refreshHash,
      exp: decoded.exp
    };
  } catch {
    return null;
  }
}

function allowedAccount(user: UserWithRole): boolean {
  return (
    user.status === 'active' &&
    ACCOUNTS.some(
      (account) =>
        account.email === user.email &&
        account.role === user.userRole?.role.name
    )
  );
}

async function refreshSession(refreshToken: string | undefined) {
  if (!refreshToken) return null;
  const session = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: { include: { userRole: { include: { role: true } } } } }
  });
  return session &&
    !session.revokedAt &&
    session.expiresAt > new Date() &&
    allowedAccount(session.user)
    ? session
    : null;
}

async function originAdmin() {
  const user = await findUserByEmail(ACCOUNTS[0].email);
  return user &&
    user.status === 'active' &&
    user.userRole?.role.name === 'admin'
    ? user
    : null;
}

// Both the signed grant and its live refresh session must agree. A directly
// logged-in demo user never receives the originating admin's authority.
export async function validatedTestAccountGrant(
  refreshToken: string | undefined,
  token: string | undefined
): Promise<Grant | null> {
  const grant = readGrant(token);
  if (!grant || !refreshToken || grant.refreshHash !== hashToken(refreshToken))
    return null;
  const [session, admin] = await Promise.all([
    refreshSession(refreshToken),
    originAdmin()
  ]);
  return session &&
    admin &&
    admin.id === grant.originId &&
    session.userId === grant.currentId
    ? grant
    : null;
}

export function rotateTestAccountGrant(
  res: Response,
  grant: Grant | null,
  userId: string,
  refreshToken: string
): void {
  if (grant && grant.currentId === userId)
    writeGrant(res, { ...grant, refreshHash: hashToken(refreshToken) });
  else clearTestAccountGrant(res);
}

export async function listTestAccounts(
  req: Request,
  res: Response
): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const refreshToken = (req.cookies as Record<string, string | undefined>)
    .mms_refresh;
  const token = (req.cookies as Record<string, string | undefined>)[
    TEST_ACCOUNTS_COOKIE
  ];
  let grant = await validatedTestAccountGrant(refreshToken, token);
  if (!grant) {
    const [session, admin] = await Promise.all([
      refreshSession(refreshToken),
      originAdmin()
    ]);
    if (
      session &&
      admin &&
      req.user?.id === admin.id &&
      session.userId === admin.id
    ) {
      grant = {
        originId: admin.id,
        currentId: admin.id,
        refreshHash: session.tokenHash,
        exp: Math.floor(Date.now() / 1000) + TTL_SECONDS
      };
      writeGrant(res, grant);
    }
  }
  if (!grant || req.user?.id !== grant.currentId) {
    // A stale tab or in-flight poll may carry the previous identity's token
    // or cookies. Denied reads must never overwrite a newer shared grant.
    res.json({ enabled: false });
    return;
  }
  const users = await prisma.user.findMany({
    where: { email: { in: ACCOUNTS.map((account) => account.email) } },
    include: { userRole: { include: { role: true } } }
  });
  res.json({
    enabled: true,
    accounts: ACCOUNTS.filter((account) =>
      users.some((user) => user.email === account.email && allowedAccount(user))
    ),
    expiresAt: new Date(grant.exp * 1000).toISOString()
  });
}

export async function switchTestAccount(
  req: Request,
  res: Response
): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const refreshToken = (req.cookies as Record<string, string | undefined>)
    .mms_refresh;
  const grant = await validatedTestAccountGrant(
    refreshToken,
    (req.cookies as Record<string, string | undefined>)[TEST_ACCOUNTS_COOKIE]
  );
  if (!grant || req.user?.id !== grant.currentId)
    throw new AppError(
      403,
      'TEST_ACCOUNT_FORBIDDEN',
      'Test account switching is unavailable'
    );
  const account = ACCOUNTS.find(
    (entry) =>
      entry.role === (req.body as z.infer<typeof switchTestAccountSchema>).role
  )!;
  const user = await findUserByEmail(account.email);
  if (!user || !allowedAccount(user))
    throw new AppError(
      403,
      'TEST_ACCOUNT_UNAVAILABLE',
      'This test account is unavailable'
    );
  // Claim the old refresh token before issuing the next identity. A stale or
  // concurrently used session must never mint another account's credentials.
  const claimed = await prisma.refreshToken.updateMany({
    where: {
      tokenHash: grant.refreshHash,
      userId: grant.currentId,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    data: { revokedAt: new Date() }
  });
  if (claimed.count !== 1)
    throw new AppError(
      403,
      'TEST_ACCOUNT_FORBIDDEN',
      'Test account session has ended'
    );
  const result = await issuePair(user, account.role);
  // Refresh cookie uses the same cross-site settings as regular login.
  res.cookie('mms_refresh', result.refreshToken, {
    ...cookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  writeGrant(res, {
    ...grant,
    currentId: user.id,
    refreshHash: hashToken(result.refreshToken)
  });
  res.json({ accessToken: result.accessToken, user: result.user });
}
