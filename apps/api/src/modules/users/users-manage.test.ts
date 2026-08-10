import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({
    email: 'boss@test.local',
    role: 'admin'
  });
  return { admin: user, header: authHeader(user.id, user.email, 'admin') };
}

describe('PATCH /api/users/:id', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('updates fields and role (admin)', async () => {
    const { header } = await adminHeader();
    const { user } = await createTestUser({
      email: 'u@test.local',
      role: 'requester'
    });
    const guardRole = await prisma.role.upsert({
      where: { name: 'security_guard' },
      update: {},
      create: { name: 'security_guard' }
    });
    const res = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', header)
      .field('fullName', 'Renamed')
      .field('status', 'inactive')
      .field('roleId', guardRole.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fullName: 'Renamed',
      status: 'inactive',
      role: 'security_guard'
    });
  });

  it('404s on a missing user and 403s for non-admins', async () => {
    const { header } = await adminHeader();
    const miss = await request(app)
      .patch('/api/users/00000000-0000-4000-8000-00000000dead')
      .set('Authorization', header)
      .field('fullName', 'X');
    expect(miss.status).toBe(404);

    const { user } = await createTestUser({
      email: 'pleb@test.local',
      role: 'driver'
    });
    const forbidden = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', authHeader(user.id, user.email, 'driver'))
      .field('fullName', 'Nope');
    expect(forbidden.status).toBe(403);
  });
});

describe('PATCH /api/users/:id/password', () => {
  beforeEach(truncateAll);

  it('lets a user change their own password with the current one, revoking refresh tokens', async () => {
    const { user, password } = await createTestUser({
      email: 'me@test.local',
      role: 'driver'
    });
    // create a live refresh token via a real login
    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password });
    expect(
      await prisma.refreshToken.count({ where: { revokedAt: null } })
    ).toBe(1);

    const res = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', authHeader(user.id, user.email, 'driver'))
      .send({ currentPassword: password, newPassword: 'NewPassword123!' });
    expect(res.status).toBe(204);
    expect(
      await prisma.refreshToken.count({ where: { revokedAt: null } })
    ).toBe(0);

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'NewPassword123!' });
    expect(relogin.status).toBe(200);
  });

  it('rejects a wrong current password with 400 INVALID_CURRENT_PASSWORD', async () => {
    const { user } = await createTestUser({
      email: 'me@test.local',
      role: 'driver'
    });
    const res = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', authHeader(user.id, user.email, 'driver'))
      .send({
        currentPassword: 'wrong-password',
        newPassword: 'NewPassword123!'
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it("lets an admin set another user's password without the current one, but not other non-admins", async () => {
    const { header } = await adminHeader();
    const { user } = await createTestUser({
      email: 'target@test.local',
      role: 'driver'
    });
    const ok = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', header)
      .send({ newPassword: 'AdminSet123!' });
    expect(ok.status).toBe(204);

    const { user: other } = await createTestUser({
      email: 'other@test.local',
      role: 'requester'
    });
    const forbidden = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', authHeader(other.id, other.email, 'requester'))
      .send({ newPassword: 'Sneaky123!' });
    expect(forbidden.status).toBe(403);
  });

  it('requires the current password even for an admin changing their OWN password', async () => {
    const { admin, header } = await adminHeader();
    const res = await request(app)
      .patch(`/api/users/${admin.id}/password`)
      .set('Authorization', header)
      .send({ newPassword: 'SneakyRotate123!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });
});

describe('DELETE /api/users/:id', () => {
  beforeEach(truncateAll);

  it('deletes a user (admin) and refuses self-deletion', async () => {
    const { admin, header } = await adminHeader();
    const { user } = await createTestUser({
      email: 'bye@test.local',
      role: 'requester'
    });

    const res = await request(app)
      .delete(`/api/users/${user.id}`)
      .set('Authorization', header);
    expect(res.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();

    const self = await request(app)
      .delete(`/api/users/${admin.id}`)
      .set('Authorization', header);
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('CANNOT_DELETE_SELF');
  });
});
