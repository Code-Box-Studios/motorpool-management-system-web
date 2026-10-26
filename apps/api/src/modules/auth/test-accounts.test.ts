import request from 'supertest';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import { createTestUser } from '../../test/factories.js';
import { hashToken } from './tokens.js';

const app = createApp();

const accounts = [
  ['admin', 'admin@mms.local'],
  ['requester', 'requester@mms.local'],
  ['driver', 'driver@mms.local'],
  ['evp_operations', 'evp_operations@mms.local'],
  ['security_guard', 'security_guard@mms.local']
] as const;
const cookies = (res: request.Response) =>
  ((res.headers['set-cookie'] as unknown as string[]) ?? []).map(
    (c) => c.split(';')[0]!
  );
const cookieValue = (res: request.Response, name: string) =>
  cookies(res)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
async function login(email = 'admin@mms.local') {
  return request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Password123!' });
}
async function grant() {
  const signedIn = await login();
  const listed = await request(app)
    .get('/api/auth/test-accounts')
    .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
    .set('Cookie', cookies(signedIn));
  return {
    accessToken: signedIn.body.accessToken as string,
    cookies: [
      ...cookies(signedIn).filter((c) => c.startsWith('mms_refresh=')),
      ...cookies(listed)
    ]
  };
}

describe('dedicated test account switching', () => {
  beforeEach(async () => {
    await truncateAll();
    for (const [role, email] of accounts) await createTestUser({ role, email });
  });

  it('requires a bearer token for listing and switching', async () => {
    expect((await request(app).get('/api/auth/test-accounts')).status).toBe(
      401
    );
    expect(
      (
        await request(app)
          .post('/api/auth/test-accounts/switch')
          .send({ role: 'driver' })
      ).status
    ).toBe(401);
  });

  it.each([
    'other-admin@test.local',
    'requester@mms.local',
    'driver@mms.local',
    'evp_operations@mms.local',
    'security_guard@mms.local'
  ])('hides and denies switching for direct login %s', async (email) => {
    if (email.startsWith('other')) await createTestUser({ email });
    const signedIn = await login(email);
    const listed = await request(app)
      .get('/api/auth/test-accounts')
      .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      .set('Cookie', cookies(signedIn));
    expect(listed.body).toEqual({ enabled: false });
    expect(
      (
        await request(app)
          .post('/api/auth/test-accounts/switch')
          .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
          .set('Cookie', cookies(signedIn))
          .send({ role: 'admin' })
      ).status
    ).toBe(403);
  });

  it('lists only five fixed accounts and sets a scoped, HTTP-only, short-lived grant', async () => {
    const signedIn = await login();
    const res = await request(app)
      .get('/api/auth/test-accounts')
      .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      .set('Cookie', cookies(signedIn));
    expect(res.body.enabled).toBe(true);
    expect(res.body.accounts.map((a: { email: string }) => a.email)).toEqual(
      accounts.map(([, email]) => email)
    );
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toContain('mms_test_accounts=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(Number(cookie.match(/Max-Age=(\d+)/)?.[1])).toBeLessThanOrEqual(
      3600
    );
    expect(Number(cookie.match(/Max-Age=(\d+)/)?.[1])).toBeGreaterThan(3500);
    const badAccess = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${cookieValue(res, 'mms_test_accounts')}`);
    expect(badAccess.status).toBe(401);
  });

  it('switches through every role, rotates refresh tokens, survives refresh, and returns to admin', async () => {
    let session = await grant();
    for (const [role, email] of [...accounts.slice(1), accounts[0]]) {
      const oldRefresh = session.cookies
        .find((c) => c.startsWith('mms_refresh='))!
        .slice('mms_refresh='.length);
      const switched = await request(app)
        .post('/api/auth/test-accounts/switch')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', session.cookies)
        .send({ role });
      expect(switched.status).toBe(200);
      expect(switched.body.user).toMatchObject({ role, email });
      expect(
        (
          await prisma.refreshToken.findUnique({
            where: { tokenHash: hashToken(oldRefresh) }
          })
        )?.revokedAt
      ).not.toBeNull();
      const refreshed = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookies(switched));
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.user.role).toBe(role);
      session = {
        accessToken: refreshed.body.accessToken,
        cookies: cookies(refreshed)
      };
      const listed = await request(app)
        .get('/api/auth/test-accounts')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', session.cookies);
      expect(listed.body.enabled).toBe(true);
    }
  });

  it('rejects a missing, tampered, or unrelated-session grant', async () => {
    const session = await grant();
    for (const cookie of [
      session.cookies.filter((c) => c.startsWith('mms_refresh=')),
      session.cookies.map((c) =>
        c.startsWith('mms_test_accounts=') ? `${c}tampered` : c
      )
    ]) {
      expect(
        (
          await request(app)
            .post('/api/auth/test-accounts/switch')
            .set('Authorization', `Bearer ${session.accessToken}`)
            .set('Cookie', cookie)
            .send({ role: 'driver' })
        ).status
      ).toBe(403);
    }
    const otherSession = await login();
    const mismatched = [
      ...cookies(otherSession).filter((c) => c.startsWith('mms_refresh=')),
      ...session.cookies.filter((c) => c.startsWith('mms_test_accounts='))
    ];
    expect(
      (
        await request(app)
          .post('/api/auth/test-accounts/switch')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .set('Cookie', mismatched)
          .send({ role: 'driver' })
      ).status
    ).toBe(403);
  });

  it('rejects arbitrary role or user id targets', async () => {
    const session = await grant();
    for (const body of [
      { role: 'superadmin' },
      { userId: 'someone' },
      { role: 'driver', userId: 'someone' }
    ]) {
      expect(
        (
          await request(app)
            .post('/api/auth/test-accounts/switch')
            .set('Authorization', `Bearer ${session.accessToken}`)
            .set('Cookie', session.cookies)
            .send(body)
        ).status
      ).toBe(400);
    }
  });

  it.each(['inactive', 'wrong-role', 'missing'])(
    'omits and denies %s target accounts',
    async (state) => {
      const session = await grant();
      if (state === 'missing')
        await prisma.user.delete({ where: { email: 'driver@mms.local' } });
      else if (state === 'inactive')
        await prisma.user.update({
          where: { email: 'driver@mms.local' },
          data: { status: 'inactive' }
        });
      else {
        const user = await prisma.user.findUniqueOrThrow({
          where: { email: 'driver@mms.local' }
        });
        await prisma.userRole.delete({ where: { userId: user.id } });
      }
      const listed = await request(app)
        .get('/api/auth/test-accounts')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', session.cookies);
      expect(
        listed.body.accounts.some((a: { role: string }) => a.role === 'driver')
      ).toBe(false);
      expect(
        (
          await request(app)
            .post('/api/auth/test-accounts/switch')
            .set('Authorization', `Bearer ${session.accessToken}`)
            .set('Cookie', session.cookies)
            .send({ role: 'driver' })
        ).status
      ).toBe(403);
    }
  );

  it.each(['inactive', 'wrong-role'])(
    'disables an existing grant when original admin becomes %s',
    async (state) => {
      const session = await grant();
      const switched = await request(app)
        .post('/api/auth/test-accounts/switch')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', session.cookies)
        .send({ role: 'driver' });
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@mms.local' }
      });
      if (state === 'inactive')
        await prisma.user.update({
          where: { id: user.id },
          data: { status: 'inactive' }
        });
      else await prisma.userRole.delete({ where: { userId: user.id } });
      expect(
        (
          await request(app)
            .get('/api/auth/test-accounts')
            .set('Authorization', `Bearer ${switched.body.accessToken}`)
            .set('Cookie', cookies(switched))
        ).body
      ).toEqual({ enabled: false });
      expect(
        (
          await request(app)
            .post('/api/auth/test-accounts/switch')
            .set('Authorization', `Bearer ${switched.body.accessToken}`)
            .set('Cookie', cookies(switched))
            .send({ role: 'admin' })
        ).status
      ).toBe(403);
    }
  );

  it('clears the grant on logout and normal login; revoked refresh cannot restore it', async () => {
    const session = await grant();
    const loggedOut = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', session.cookies);
    expect(cookieValue(loggedOut, 'mms_test_accounts')).toBe('');
    expect(
      (
        await request(app)
          .post('/api/auth/test-accounts/switch')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .set('Cookie', session.cookies)
          .send({ role: 'driver' })
      ).status
    ).toBe(403);
    const signedIn = await login('driver@mms.local');
    expect(cookieValue(signedIn, 'mms_test_accounts')).toBe('');
  });
  it('does not clear a newer shared grant when another tab has the old bearer', async () => {
    const session = await grant();
    const switched = await request(app)
      .post('/api/auth/test-accounts/switch')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('Cookie', session.cookies)
      .send({ role: 'driver' });
    const staleTab = await request(app)
      .get('/api/auth/test-accounts')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('Cookie', cookies(switched));
    expect(staleTab.body).toEqual({ enabled: false });
    expect(staleTab.headers['set-cookie']).toBeUndefined();
    const staleCookies = await request(app)
      .get('/api/auth/test-accounts')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('Cookie', session.cookies);
    expect(staleCookies.body).toEqual({ enabled: false });
    expect(staleCookies.headers['set-cookie']).toBeUndefined();
    expect(
      (
        await request(app)
          .post('/api/auth/test-accounts/switch')
          .set('Authorization', `Bearer ${switched.body.accessToken}`)
          .set('Cookie', cookies(switched))
          .send({ role: 'admin' })
      ).status
    ).toBe(200);
  });

  it('rejects an expired grant even while the current session is valid', async () => {
    const session = await grant();
    const encoded = session.cookies
      .find((c) => c.startsWith('mms_test_accounts='))!
      .slice('mms_test_accounts='.length);
    const payload = jwt.decode(encoded) as jwt.JwtPayload;
    const key = createHmac('sha256', config.jwtSecret)
      .update('mms:test-account-switch')
      .digest();
    const expired = jwt.sign(
      { ...payload, exp: Math.floor(Date.now() / 1000) - 1 },
      key
    );
    const presented = session.cookies.map((c) =>
      c.startsWith('mms_test_accounts=') ? `mms_test_accounts=${expired}` : c
    );
    expect(
      (
        await request(app)
          .post('/api/auth/test-accounts/switch')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .set('Cookie', presented)
          .send({ role: 'driver' })
      ).status
    ).toBe(403);
  });

  it('sets and clears production cross-site grant cookies with matching secure flags', async () => {
    const previous = config.cookieSameSite;
    config.cookieSameSite = 'none';
    try {
      const session = await grant();
      const switched = await request(app)
        .post('/api/auth/test-accounts/switch')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', session.cookies)
        .send({ role: 'driver' });
      for (const cookie of switched.headers[
        'set-cookie'
      ] as unknown as string[]) {
        expect(cookie).toContain('SameSite=None');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Path=/api/auth');
      }
      const loggedOut = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookies(switched));
      const cleared = (
        loggedOut.headers['set-cookie'] as unknown as string[]
      ).find((cookie) => cookie.startsWith('mms_test_accounts='))!;
      expect(cleared).toContain('SameSite=None');
      expect(cleared).toContain('Secure');
      expect(cleared).toContain('Path=/api/auth');
    } finally {
      config.cookieSameSite = previous;
    }
  });
});
