import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import { findUserById } from './repository.js';
import { issuePair } from './service.js';

const app = createApp();

async function signedInAdministrator() {
  const { user: operator } = await createTestUser({
    email: 'operator@test.local'
  });
  const { user: target } = await createTestUser({ email: 'target@test.local' });
  const login = await request(app).post('/api/auth/login').send({
    email: target.email,
    password: 'Password123!'
  });
  expect(login.status).toBe(200);
  return {
    operatorHeader: authHeader(operator.id, operator.email, 'admin'),
    target,
    bearer: `Bearer ${login.body.accessToken as string}`,
    cookie: (login.headers['set-cookie'] as unknown as string[])[0]!.split(
      ';'
    )[0]!
  };
}

const privilegedRead = (bearer: string) =>
  request(app).get('/api/tracker-devices').set('Authorization', bearer);

describe('account authority revocation', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  for (const action of [
    'deactivate',
    'demote',
    'branch-change',
    'password-reset'
  ] as const) {
    it(`immediately rejects old access and refresh tokens after ${action}`, async () => {
      const session = await signedInAdministrator();
      expect((await privilegedRead(session.bearer)).status).toBe(200);
      let changed;
      if (action === 'password-reset') {
        changed = await request(app)
          .patch(`/api/users/${session.target.id}/password`)
          .set('Authorization', session.operatorHeader)
          .send({ newPassword: 'ChangedPassword456!' });
      } else {
        const edit = request(app)
          .patch(`/api/users/${session.target.id}`)
          .set('Authorization', session.operatorHeader);
        if (action === 'deactivate')
          changed = await edit.field('status', 'inactive');
        else if (action === 'branch-change') {
          changed = await edit.field('branchId', (await createTestBranch()).id);
        } else {
          const role = await prisma.role.create({
            data: { name: 'requester' }
          });
          changed = await edit.field('roleId', role.id);
        }
      }
      expect(changed.status).toBe(action === 'password-reset' ? 204 : 200);
      const replay = await privilegedRead(session.bearer);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('UNAUTHORIZED');
      const refreshed = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', session.cookie);
      expect(refreshed.status).toBe(401);
      expect(
        await prisma.refreshToken.count({
          where: { userId: session.target.id, revokedAt: null }
        })
      ).toBe(0);
    });
  }

  it('does not revive old credentials when an inactive account is reactivated', async () => {
    const session = await signedInAdministrator();
    for (const status of ['inactive', 'active']) {
      expect(
        (
          await request(app)
            .patch(`/api/users/${session.target.id}`)
            .set('Authorization', session.operatorHeader)
            .field('status', status)
        ).status
      ).toBe(200);
    }
    expect((await privilegedRead(session.bearer)).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/refresh')
          .set('Cookie', session.cookie)
      ).status
    ).toBe(401);
    const login = await request(app).post('/api/auth/login').send({
      email: session.target.email,
      password: 'Password123!'
    });
    expect(login.status).toBe(200);
    expect(
      (await privilegedRead(`Bearer ${login.body.accessToken as string}`))
        .status
    ).toBe(200);
  });

  it('preserves access and refresh credentials for metadata and unchanged authority fields', async () => {
    const session = await signedInAdministrator();
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'admin' }
    });
    const changed = await request(app)
      .patch(`/api/users/${session.target.id}`)
      .set('Authorization', session.operatorHeader)
      .field('fullName', 'Updated profile')
      .field('phone', '555-0100')
      .field('status', 'active')
      .field('roleId', role.id);
    expect(changed.status).toBe(200);
    expect((await privilegedRead(session.bearer)).status).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/auth/refresh')
          .set('Cookie', session.cookie)
      ).status
    ).toBe(200);
  });

  it('authorizes the current stored role rather than a forged role claim', async () => {
    const { user } = await createTestUser({ role: 'requester' });
    const bearer = authHeader(user.id, user.email, 'admin');
    expect((await privilegedRead(bearer)).status).toBe(403);
  });

  it('refuses token issuance from an account snapshot predating a password reset', async () => {
    const session = await signedInAdministrator();
    const snapshot = await findUserById(session.target.id);
    expect(snapshot).not.toBeNull();
    const changed = await request(app)
      .patch(`/api/users/${session.target.id}/password`)
      .set('Authorization', session.operatorHeader)
      .send({ newPassword: 'ChangedPassword456!' });
    expect(changed.status).toBe(204);
    await expect(issuePair(snapshot!, 'admin')).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED'
    });
    expect(
      await prisma.refreshToken.count({
        where: { userId: session.target.id, revokedAt: null }
      })
    ).toBe(0);
  });

  for (const state of ['inactive', 'role-less', 'deleted'] as const) {
    it(`rejects a previously signed bearer for a currently ${state} identity`, async () => {
      const session = await signedInAdministrator();
      if (state === 'inactive') {
        await prisma.user.update({
          where: { id: session.target.id },
          data: { status: 'inactive' }
        });
      } else if (state === 'role-less') {
        await prisma.userRole.delete({ where: { userId: session.target.id } });
      } else {
        await prisma.user.delete({ where: { id: session.target.id } });
      }
      expect((await privilegedRead(session.bearer)).status).toBe(401);
    });
  }
});
