import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();
const cookie = (response: request.Response) =>
  (response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

async function userLockWaiters() {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) AS count FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock'
    AND query LIKE '%FOR NO KEY UPDATE%'
  `;
  return Number(rows[0]!.count);
}

async function until(predicate: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

describe('serialized refresh reuse revocation', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  for (const replay of [
    'previous-rotated-token',
    'same-current-token'
  ] as const) {
    it(`leaves no live replacement when ${replay} reuse races a blocked rotation`, async () => {
      const { user } = await createTestUser();
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Password123!' });
      expect(login.status).toBe(200);
      const initial = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookie(login));
      expect(initial.status).toBe(200);
      const replayCookie =
        replay === 'previous-rotated-token' ? cookie(login) : cookie(initial);
      let acquired!: () => void;
      let release!: () => void;
      const locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const holder = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR NO KEY UPDATE`;
        acquired();
        await gate;
      });
      await locked;
      const rotating = request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookie(initial))
        .then((response) => response);
      let replaying: Promise<request.Response> | undefined;
      try {
        expect(await until(async () => (await userLockWaiters()) >= 1)).toBe(
          true
        );
        let reuseFinished = false;
        replaying = request(app)
          .post('/api/auth/refresh')
          .set('Cookie', replayCookie)
          .then((response) => {
            reuseFinished = true;
            return response;
          });
        // Broken code revokes the family and finishes before pending issuance.
        // Fixed code queues reuse behind the same user lock as the rotation.
        expect(
          await until(
            async () => reuseFinished || (await userLockWaiters()) >= 2
          )
        ).toBe(true);
      } finally {
        release();
        await holder;
      }
      const [rotated, reused] = await Promise.all([rotating, replaying!]);
      expect(rotated.status).toBe(200);
      expect(reused.status).toBe(401);
      expect(
        await prisma.refreshToken.count({
          where: { userId: user.id, revokedAt: null }
        })
      ).toBe(0);
      // Revocation must also reject the access token issued by the rotation.
      expect(
        (
          await request(app)
            .get('/api/auth/me')
            .set(
              'Authorization',
              `Bearer ${rotated.body.accessToken as string}`
            )
        ).status
      ).toBe(401);
      const relogin = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Password123!' });
      expect(relogin.status).toBe(200);
      expect(
        (
          await request(app)
            .post('/api/auth/refresh')
            .set('Cookie', cookie(relogin))
        ).status
      ).toBe(200);
    });
  }
});
