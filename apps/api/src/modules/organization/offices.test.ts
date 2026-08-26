import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestOffice,
  createTestOfficeHead,
  createTestUser
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

describe('organization — offices and office heads', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates an office under a branch', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const res = await request(app)
      .post('/api/offices')
      .set('Authorization', header)
      .send({ name: 'Operations', branchId: branch.id });
    expect(res.status).toBe(201);
    expect(res.body.branchId).toBe(branch.id);
  });

  it('scopes office name uniqueness to the branch', async () => {
    const header = await adminHeader();
    const a = await createTestBranch('Alpha');
    const b = await createTestBranch('Beta');
    await createTestOffice(a.id, 'Operations');

    // Same name, different branch — legitimate.
    const other = await request(app)
      .post('/api/offices')
      .set('Authorization', header)
      .send({ name: 'Operations', branchId: b.id });
    expect(other.status).toBe(201);

    // Same name, same branch, different case — rejected.
    const clash = await request(app)
      .post('/api/offices')
      .set('Authorization', header)
      .send({ name: 'OPERATIONS', branchId: a.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('refuses to rename an office to a name already used in its branch', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    await createTestOffice(branch.id, 'Operations');
    const other = await createTestOffice(branch.id, 'Support');

    // No branchId in the body at all — the PATCH is a pure rename, and the
    // check must still run against the branch the office is already in.
    const res = await request(app)
      .patch(`/api/offices/${other.id}`)
      .set('Authorization', header)
      .send({ name: 'OPERATIONS' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('lets an office keep its own name on an unrelated PATCH', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id, 'Operations');

    const res = await request(app)
      .patch(`/api/offices/${office.id}`)
      .set('Authorization', header)
      .send({ name: 'Operations' });
    expect(res.status).toBe(200);
  });

  it('refuses a branch-only PATCH that collides in the destination branch', async () => {
    const header = await adminHeader();
    const a = await createTestBranch('Alpha');
    const b = await createTestBranch('Beta');
    await createTestOffice(b.id, 'Operations');
    const office = await createTestOffice(a.id, 'Operations');

    // No name in the body — moving the office into Beta collides with the
    // "Operations" already sitting there, and must be caught as
    // DUPLICATE_NAME rather than surfacing as a generic Prisma P2002 conflict.
    const res = await request(app)
      .patch(`/api/offices/${office.id}`)
      .set('Authorization', header)
      .send({ branchId: b.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('refuses to clear an office branch into a collision with another branchless office', async () => {
    const header = await adminHeader();
    // Directly seeded, not via createTestOffice: that factory's branchId
    // parameter is a required string, and this case is specifically about
    // branchId: null, which the unique index cannot catch (NULL is distinct
    // from NULL in Postgres).
    await prisma.departmentOffice.create({
      data: { name: 'Solo', branchId: null }
    });
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id, 'Solo');

    // No name in the body — clearing the branch is what creates the clash.
    const res = await request(app)
      .patch(`/api/offices/${office.id}`)
      .set('Authorization', header)
      .send({ branchId: null });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('allows two office heads with the same name', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    await createTestOfficeHead(branch.id, null, 'Juan Cruz');
    // Office heads are people. Two employees named Juan Cruz is not an error.
    const res = await request(app)
      .post('/api/office-heads')
      .set('Authorization', header)
      .send({ name: 'Juan Cruz', branchId: branch.id });
    expect(res.status).toBe(201);
  });

  it('refuses to create an office under an archived branch', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Closed');
    await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);

    const res = await request(app)
      .post('/api/offices')
      .set('Authorization', header)
      .send({ name: 'Ghost Office', branchId: branch.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('refuses to reparent an office into an archived branch', async () => {
    const header = await adminHeader();
    const live = await createTestBranch('Live');
    const dead = await createTestBranch('Dead');
    const office = await createTestOffice(live.id);
    await request(app)
      .post(`/api/branches/${dead.id}/archive`)
      .set('Authorization', header);

    const res = await request(app)
      .patch(`/api/offices/${office.id}`)
      .set('Authorization', header)
      .send({ branchId: dead.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('refuses to restore an office whose branch is still archived', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Closing');
    const office = await createTestOffice(branch.id);

    // Empty the branch first — this is the ordering the guard forces.
    await request(app)
      .post(`/api/offices/${office.id}/archive`)
      .set('Authorization', header);
    await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);

    const res = await request(app)
      .post(`/api/offices/${office.id}/restore`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('archives an office only once its heads are archived', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id);

    const blocked = await request(app)
      .post(`/api/offices/${office.id}/archive`)
      .set('Authorization', header);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.blockers).toContainEqual({
      resource: 'officeHeads',
      count: 1
    });

    await request(app)
      .post(`/api/office-heads/${head.id}/archive`)
      .set('Authorization', header);
    const ok = await request(app)
      .post(`/api/offices/${office.id}/archive`)
      .set('Authorization', header);
    expect(ok.status).toBe(200);
  });

  it('archives an office head only once the office it heads lets go', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id);
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { headId: head.id }
    });

    const blocked = await request(app)
      .post(`/api/office-heads/${head.id}/archive`)
      .set('Authorization', header);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.blockers).toContainEqual({
      resource: 'departmentOffices',
      count: 1
    });

    await request(app)
      .patch(`/api/offices/${office.id}`)
      .set('Authorization', header)
      .send({ headId: null });
    const ok = await request(app)
      .post(`/api/office-heads/${head.id}/archive`)
      .set('Authorization', header);
    expect(ok.status).toBe(200);
  });

  it('hides archived offices and heads from the default lists', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, null, 'Solo');

    await request(app)
      .post(`/api/offices/${office.id}/archive`)
      .set('Authorization', header);
    await request(app)
      .post(`/api/office-heads/${head.id}/archive`)
      .set('Authorization', header);

    expect(
      (await request(app).get('/api/offices').set('Authorization', header)).body
        .count
    ).toBe(0);
    expect(
      (await request(app).get('/api/office-heads').set('Authorization', header))
        .body.count
    ).toBe(0);
    expect(
      (
        await request(app)
          .get('/api/offices?includeArchived=true')
          .set('Authorization', header)
      ).body.count
    ).toBe(1);
  });

  it('still embeds the office head on GET /api/offices', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id, 'Maria');
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { headId: head.id }
    });
    const res = await request(app)
      .get('/api/offices')
      .set('Authorization', header);
    expect(res.body.data[0].head.name).toBe('Maria');
  });

  it('rejects non-admin writes on both resources', async () => {
    const { user } = await createTestUser({
      email: 'req@test.local',
      role: 'requester'
    });
    const header = authHeader(user.id, user.email, 'requester');
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id);

    for (const call of [
      request(app)
        .post('/api/offices')
        .set('Authorization', header)
        .send({ name: 'X' }),
      request(app)
        .patch(`/api/offices/${office.id}`)
        .set('Authorization', header)
        .send({ name: 'Y' }),
      request(app)
        .post(`/api/offices/${office.id}/archive`)
        .set('Authorization', header),
      request(app)
        .post(`/api/offices/${office.id}/restore`)
        .set('Authorization', header),
      request(app)
        .post('/api/office-heads')
        .set('Authorization', header)
        .send({ name: 'X' }),
      request(app)
        .patch(`/api/office-heads/${head.id}`)
        .set('Authorization', header)
        .send({ name: 'Y' }),
      request(app)
        .post(`/api/office-heads/${head.id}/archive`)
        .set('Authorization', header),
      request(app)
        .post(`/api/office-heads/${head.id}/restore`)
        .set('Authorization', header)
    ]) {
      expect((await call).status).toBe(403);
    }
  });
});
