import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function loginAndGetCookie(): Promise<string> {
  await createTestUser({ email: 'admin@test.local' });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.local', password: 'Password123!' });
  const cookie = res.headers['set-cookie']?.[0];
  if (!cookie) throw new Error('login did not set a refresh cookie');
  return cookie;
}

describe('POST /api/auth/refresh', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('rotates the token: new access token, new cookie, old row revoked', async () => {
    const cookie = await loginAndGetCookie();
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    const newCookie = res.headers['set-cookie']?.[0] ?? '';
    expect(newCookie).toContain('mms_refresh=');
    expect(newCookie).not.toBe(cookie);
    // one revoked (rotated) + one live
    expect(await prisma.refreshToken.count()).toBe(2);
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const cookie = await loginAndGetCookie();
    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(first.status).toBe(200);

    // replay the OLD cookie
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);

    // the rotated-out replacement must now be dead too
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    const newCookie = first.headers['set-cookie']?.[0] ?? '';
    const retry = await request(app).post('/api/auth/refresh').set('Cookie', newCookie);
    expect(retry.status).toBe(401);
  });

  it('allows only one winner when the same token is refreshed concurrently', async () => {
    const cookie = await loginAndGetCookie();
    const [a, b] = await Promise.all([
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/auth/refresh').set('Cookie', cookie)
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);
  });

  it('rejects a missing cookie with 401', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects a garbage cookie with 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'mms_refresh=deadbeef');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  beforeEach(truncateAll);

  it('revokes the token, clears the cookie, and blocks later refresh', async () => {
    const cookie = await loginAndGetCookie();
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.[0]).toContain('mms_refresh=;');

    const after = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('is a no-op 204 without a cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});
