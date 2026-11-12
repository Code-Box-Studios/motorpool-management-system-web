import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import { issuePair } from './service.js';

const app = createApp();
const cookies = (response: request.Response) =>
  ((response.headers['set-cookie'] as unknown as string[]) ?? []).map(
    (value) => value.split(';')[0]!
  );

async function switchedSession() {
  const { user: origin } = await createTestUser({ email: 'admin@mms.local' });
  await createTestUser({ email: 'driver@mms.local', role: 'driver' });
  const { user: operator } = await createTestUser({
    email: 'operator@test.local'
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: origin.email, password: 'Password123!' });
  const listed = await request(app)
    .get('/api/auth/test-accounts')
    .set('Authorization', `Bearer ${login.body.accessToken as string}`)
    .set('Cookie', cookies(login));
  expect(listed.body.enabled).toBe(true);
  const switched = await request(app)
    .post('/api/auth/test-accounts/switch')
    .set('Authorization', `Bearer ${login.body.accessToken as string}`)
    .set('Cookie', [
      ...cookies(login).filter((cookie) => cookie.startsWith('mms_refresh=')),
      ...cookies(listed)
    ])
    .send({ role: 'driver' });
  expect(switched.status).toBe(200);
  return {
    origin,
    operatorHeader: authHeader(operator.id, operator.email, 'admin'),
    bearer: `Bearer ${switched.body.accessToken as string}`,
    cookies: cookies(switched)
  };
}

async function waitForBlockedUserQuery(pattern = '%UPDATE%users%') {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
      AND query LIKE ${pattern}
    `;
    if (Number(rows[0]!.count) > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

describe('revocation race and delegated test-account authority', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  for (const action of [
    'password-reset',
    'demote-restore',
    'deactivate-restore'
  ] as const) {
    it(`rejects an old switching grant after origin administrator ${action}`, async () => {
      const session = await switchedSession();
      if (action === 'password-reset') {
        expect(
          (
            await request(app)
              .patch(`/api/users/${session.origin.id}/password`)
              .set('Authorization', session.operatorHeader)
              .send({ newPassword: 'ResetPassword456!' })
          ).status
        ).toBe(204);
      } else if (action === 'deactivate-restore') {
        for (const status of ['inactive', 'active']) {
          expect(
            (
              await request(app)
                .patch(`/api/users/${session.origin.id}`)
                .set('Authorization', session.operatorHeader)
                .field('status', status)
            ).status
          ).toBe(200);
        }
      } else {
        const requester = await prisma.role.create({
          data: { name: 'requester' }
        });
        const admin = await prisma.role.findUniqueOrThrow({
          where: { name: 'admin' }
        });
        for (const roleId of [requester.id, admin.id]) {
          expect(
            (
              await request(app)
                .patch(`/api/users/${session.origin.id}`)
                .set('Authorization', session.operatorHeader)
                .field('roleId', roleId)
            ).status
          ).toBe(200);
        }
      }
      const listed = await request(app)
        .get('/api/auth/test-accounts')
        .set('Authorization', session.bearer)
        .set('Cookie', session.cookies);
      expect(listed.status).toBe(200);
      expect(listed.body).toEqual({ enabled: false });
      const switched = await request(app)
        .post('/api/auth/test-accounts/switch')
        .set('Authorization', session.bearer)
        .set('Cookie', session.cookies)
        .send({ role: 'admin' });
      expect(switched.status).toBe(403);
      expect(
        await prisma.refreshToken.count({
          where: { userId: session.origin.id, revokedAt: null }
        })
      ).toBe(0);
      // The ordinary driver refresh remains valid, but must not regain the grant.
      const refreshed = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', session.cookies);
      expect(refreshed.status).toBe(200);
      const replay = await request(app)
        .post('/api/auth/test-accounts/switch')
        .set('Authorization', `Bearer ${refreshed.body.accessToken as string}`)
        .set('Cookie', cookies(refreshed))
        .send({ role: 'admin' });
      expect(replay.status).toBe(403);
    });
  }

  it('does not let a blocked self-password change overwrite a newer administrator reset', async () => {
    const { user } = await createTestUser({ role: 'driver' });
    const resetHash = await hashPassword('AdministratorReset456!');
    let locked!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Hold the same lock a reset owns, then commit the reset after the stale
    // self-change has verified the previous password and reached its write.
    const administratorReset = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR NO KEY UPDATE`;
      locked();
      await gate;
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: resetHash,
          authVersion: { increment: 1 }
        }
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    });
    await acquired;
    const staleChange = request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', authHeader(user.id, user.email, 'driver'))
      .send({
        currentPassword: 'Password123!',
        newPassword: 'StaleSelfPassword789!'
      })
      .then((response) => response);
    try {
      expect(await waitForBlockedUserQuery()).toBe(true);
    } finally {
      release();
      await administratorReset;
    }
    const response = await staleChange;
    expect(response.status).toBe(401);
    const current = await prisma.user.findUniqueOrThrow({
      where: { id: user.id }
    });
    expect(current.authVersion).toBe(1);
    expect(
      await verifyPassword('AdministratorReset456!', current.passwordHash)
    ).toBe(true);
    expect(
      await verifyPassword('StaleSelfPassword789!', current.passwordHash)
    ).toBe(false);
  });

  it('rechecks the grant origin version inside the token issuance lock', async () => {
    const session = await switchedSession();
    const target = await prisma.user.findUniqueOrThrow({
      where: { email: 'driver@mms.local' },
      include: { userRole: { include: { role: true } } }
    });
    let acquired!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originReset = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.origin.id}::uuid FOR NO KEY UPDATE`;
      acquired();
      await gate;
      await tx.user.update({
        where: { id: session.origin.id },
        data: { authVersion: { increment: 1 } }
      });
    });
    await locked;
    const issuing = issuePair(target, 'driver', {
      id: session.origin.id,
      authVersion: 0
    }).then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ error, value: undefined })
    );
    let blocked = false;
    try {
      blocked = await waitForBlockedUserQuery('%FOR NO KEY UPDATE%');
    } finally {
      release();
      await originReset;
    }
    expect((await issuing).error).toMatchObject({
      statusCode: 403,
      code: 'TEST_ACCOUNT_FORBIDDEN'
    });
    expect(blocked).toBe(true);
  });
});
