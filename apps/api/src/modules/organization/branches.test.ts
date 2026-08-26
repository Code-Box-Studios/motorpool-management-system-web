import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({
    email: 'boss@test.local',
    role: 'admin'
  });
  return authHeader(user.id, user.email, 'admin');
}

describe('organization — branches', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates a branch (admin)', async () => {
    const header = await adminHeader();
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', header)
      .send({ name: 'South Branch', location: 'South Depot' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('South Branch');
    expect(res.body.archivedAt).toBeNull();
  });

  it('rejects a duplicate name regardless of case', async () => {
    const header = await adminHeader();
    await createTestBranch('South Branch');
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', header)
      .send({ name: 'south branch' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('renames a branch but refuses to collide with another', async () => {
    const header = await adminHeader();
    const a = await createTestBranch('Alpha');
    await createTestBranch('Beta');

    const ok = await request(app)
      .patch(`/api/branches/${a.id}`)
      .set('Authorization', header)
      .send({ name: 'Alpha Prime' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Alpha Prime');

    const clash = await request(app)
      .patch(`/api/branches/${a.id}`)
      .set('Authorization', header)
      .send({ name: 'BETA' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('lets a branch keep its own name on an unrelated PATCH', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Alpha');
    // Would fail if the duplicate check did not exclude the row being updated.
    const res = await request(app)
      .patch(`/api/branches/${branch.id}`)
      .set('Authorization', header)
      .send({ name: 'Alpha', location: 'Moved' });
    expect(res.status).toBe(200);
    expect(res.body.location).toBe('Moved');
  });

  it('archives a clean branch and hides it from the default list', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Doomed');

    const archived = await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).not.toBeNull();

    const list = await request(app)
      .get('/api/branches')
      .set('Authorization', header);
    expect(list.body.count).toBe(0);
    expect(list.body.data).toHaveLength(0);

    const all = await request(app)
      .get('/api/branches?includeArchived=true')
      .set('Authorization', header);
    expect(all.body.count).toBe(1);
    expect(all.body.data[0].name).toBe('Doomed');
  });

  it('refuses to archive a branch that still owns a vehicle, and says so', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Busy');
    await createTestVehicle(branch.id);

    const res = await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
    expect(res.body.error.details.blockers).toContainEqual({
      resource: 'vehicles',
      count: 1
    });

    // And it really did not archive.
    const still = await prisma.branch.findUnique({ where: { id: branch.id } });
    expect(still?.archivedAt).toBeNull();
  });

  it('restores an archived branch, and refuses to restore an active one', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Back');
    await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);

    const restored = await request(app)
      .post(`/api/branches/${branch.id}/restore`)
      .set('Authorization', header);
    expect(restored.status).toBe(200);
    expect(restored.body.archivedAt).toBeNull();

    const again = await request(app)
      .post(`/api/branches/${branch.id}/restore`)
      .set('Authorization', header);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_ARCHIVED');
  });

  it('refuses to archive an already-archived branch', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Twice');
    await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);
    const res = await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_ARCHIVED');
  });

  it('404s on an unknown id', async () => {
    const header = await adminHeader();
    const res = await request(app)
      .patch('/api/branches/00000000-0000-4000-8000-0000000000ff')
      .set('Authorization', header)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('lets any authenticated role READ but only admin WRITE', async () => {
    const { user } = await createTestUser({
      email: 'guard@test.local',
      role: 'security_guard'
    });
    const header = authHeader(user.id, user.email, 'security_guard');
    const branch = await createTestBranch('ReadOnly');

    expect(
      (await request(app).get('/api/branches').set('Authorization', header))
        .status
    ).toBe(200);

    for (const call of [
      request(app)
        .post('/api/branches')
        .set('Authorization', header)
        .send({ name: 'X' }),
      request(app)
        .patch(`/api/branches/${branch.id}`)
        .set('Authorization', header)
        .send({ name: 'Y' }),
      request(app)
        .post(`/api/branches/${branch.id}/archive`)
        .set('Authorization', header),
      request(app)
        .post(`/api/branches/${branch.id}/restore`)
        .set('Authorization', header)
    ]) {
      expect((await call).status).toBe(403);
    }
  });
});
