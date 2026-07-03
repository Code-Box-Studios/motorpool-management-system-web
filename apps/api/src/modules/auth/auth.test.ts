import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

describe('POST /api/auth/login', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('returns an access token, the user, and sets the refresh cookie', async () => {
    await createTestUser({ email: 'admin@test.local', role: 'admin' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'admin@test.local', role: 'admin' });
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('mms_refresh=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(await prisma.refreshToken.count()).toBe(1);
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    await createTestUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'Password123!' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an inactive account with 403 ACCOUNT_INACTIVE', async () => {
    await createTestUser({ status: 'inactive' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'Password123!' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('rejects a malformed body with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(truncateAll);

  it('returns the fresh user for a valid token', async () => {
    await createTestUser({ email: 'driver@test.local', role: 'driver' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'driver@test.local', password: 'Password123!' });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'driver@test.local', role: 'driver' });
  });

  it('rejects a missing token with 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a tampered token with 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer nonsense');
    expect(res.status).toBe(401);
  });
});
