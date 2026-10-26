import type { CookieOptions, Request, Response } from 'express';
import type { LoginBody } from '@mms/shared';
import { config } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import * as authService from './service.js';
import {
  clearTestAccountGrant,
  rotateTestAccountGrant,
  validatedTestAccountGrant,
  TEST_ACCOUNTS_COOKIE
} from './test-accounts.js';

export const REFRESH_COOKIE = 'mms_refresh';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Cookie flags per spec §5: httpOnly, scoped to /api/auth, secure iff SameSite=None.
export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSameSite === 'none',
    path: '/api/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS
  };
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginBody;
  const { accessToken, refreshToken, user } = await authService.login(
    email,
    password
  );
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  clearTestAccountGrant(res);
  res.json({ accessToken, user });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user)
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json(await authService.me(req.user.id));
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const presented = (req.cookies as Record<string, string | undefined>)[
    REFRESH_COOKIE
  ];
  if (!presented)
    throw new AppError(401, 'UNAUTHORIZED', 'Missing refresh token');
  const grant = await validatedTestAccountGrant(
    presented,
    (req.cookies as Record<string, string | undefined>)[TEST_ACCOUNTS_COOKIE]
  );
  const { accessToken, refreshToken, user } =
    await authService.refresh(presented);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  rotateTestAccountGrant(res, grant, user.id, refreshToken);
  res.json({ accessToken, user });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const presented = (req.cookies as Record<string, string | undefined>)[
    REFRESH_COOKIE
  ];
  await authService.logout(presented);
  // Clear with the SAME attributes used to set (minus maxAge) — a cross-site
  // SameSite=None cookie can only be deleted by a matching SameSite=None header.
  const { maxAge: _maxAge, ...clearOptions } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, clearOptions);
  clearTestAccountGrant(res);
  res.status(204).end();
}
