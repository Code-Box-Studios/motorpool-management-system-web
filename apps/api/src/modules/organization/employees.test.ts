import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestEmployee,
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

describe('organization — employees', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates an employee under a branch', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', header)
      .send({
        name: 'Ana Bautista',
        position: 'Tour Guide',
        phone: '0917-000-0000',
        branchId: branch.id
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Ana Bautista');
    expect(res.body.position).toBe('Tour Guide');
    expect(res.body.branchId).toBe(branch.id);
    expect(res.body.archivedAt).toBeNull();
  });

  it('creates an employee with position and phone omitted', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', header)
      .send({ name: 'Ana Bautista', branchId: branch.id });
    expect(res.status).toBe(201);
    expect(res.body.position).toBeNull();
    expect(res.body.phone).toBeNull();
  });

  // §4.3: branchId is REQUIRED here, diverging from OfficeHead.branchId. The
  // guide picker is branch-locked, so an employee with no branch would appear
  // in no branch's picker anywhere, with no error and no way to notice.
  it('refuses to create an employee with no branch', async () => {
    const header = await adminHeader();
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', header)
      .send({ name: 'Ana Bautista' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('allows two employees with the same name', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    await createTestEmployee(branch.id, 'Juan Cruz');
    // Employees are people, like office heads. Two Juan Cruzes at one branch
    // is not an error — which is why no unique index exists (§4.3).
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', header)
      .send({ name: 'Juan Cruz', branchId: branch.id });
    expect(res.status).toBe(201);
  });

  it('renames an employee and moves them between branches', async () => {
    const header = await adminHeader();
    const from = await createTestBranch('From');
    const to = await createTestBranch('To');
    const employee = await createTestEmployee(from.id, 'Ana Bautista');

    const res = await request(app)
      .patch(`/api/employees/${employee.id}`)
      .set('Authorization', header)
      .send({ name: 'Ana Bautista-Cruz', branchId: to.id });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ana Bautista-Cruz');
    expect(res.body.branchId).toBe(to.id);
  });

  // The picker calls GET /api/employees?branchId=<ticket branch> (§5.2). Zod
  // STRIPS unknown keys, so parsing organizationListQuerySchema on this route
  // instead of employeesListQuerySchema drops the filter with no error at all
  // and every branch's roster leaks into every other branch's picker.
  it('filters the list to one branch with ?branchId=', async () => {
    const header = await adminHeader();
    const mine = await createTestBranch('Mine');
    const theirs = await createTestBranch('Theirs');
    await createTestEmployee(mine.id, 'Ours');
    await createTestEmployee(theirs.id, 'Sibling');

    const all = await request(app)
      .get('/api/employees')
      .set('Authorization', header);
    expect(all.body.count).toBe(2);

    const res = await request(app)
      .get(`/api/employees?branchId=${mine.id}`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Ours');
  });

  it('hides archived employees from the default list', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const employee = await createTestEmployee(branch.id);

    const archived = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).not.toBeNull();

    expect(
      (await request(app).get('/api/employees').set('Authorization', header))
        .body.count
    ).toBe(0);
    expect(
      (
        await request(app)
          .get('/api/employees?includeArchived=true')
          .set('Authorization', header)
      ).body.count
    ).toBe(1);
  });

  // Both filters at once. A repository that returned `branchId ? {branchId} :
  // archiveWhere(...)` passes every test above and fails only here.
  it('applies ?branchId= and ?includeArchived= together', async () => {
    const header = await adminHeader();
    const mine = await createTestBranch('Mine');
    const theirs = await createTestBranch('Theirs');
    await createTestEmployee(mine.id, 'Ours');
    await createTestEmployee(theirs.id, 'Theirs');
    await prisma.employee.updateMany({ data: { archivedAt: new Date() } });

    const res = await request(app)
      .get(`/api/employees?branchId=${mine.id}&includeArchived=true`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].name).toBe('Ours');
  });

  it('restores an archived employee, and refuses to restore an active one', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const employee = await createTestEmployee(branch.id);
    await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);

    const restored = await request(app)
      .post(`/api/employees/${employee.id}/restore`)
      .set('Authorization', header);
    expect(restored.status).toBe(200);
    expect(restored.body.archivedAt).toBeNull();

    const again = await request(app)
      .post(`/api/employees/${employee.id}/restore`)
      .set('Authorization', header);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_ARCHIVED');
  });

  it('refuses to archive an already-archived employee', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const employee = await createTestEmployee(branch.id);
    await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    const res = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_ARCHIVED');
  });

  // restoreOfficeHead's twin. Restoring under an archived branch recreates
  // the exact state the branch guard exists to prevent. Unlike restoreOffice
  // there is no reference cycle here — nothing points a branch at an employee
  // — so checking branchId cannot deadlock a pair.
  it('refuses to restore an employee whose branch is still archived', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Closing');
    const employee = await createTestEmployee(branch.id);

    // Empty the branch first — this is the ordering branchBlockers forces.
    await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    const branchArchived = await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);
    expect(branchArchived.status).toBe(200);

    const res = await request(app)
      .post(`/api/employees/${employee.id}/restore`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('404s on an unknown id', async () => {
    const header = await adminHeader();
    const res = await request(app)
      .patch('/api/employees/00000000-0000-4000-8000-0000000000ff')
      .set('Authorization', header)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('lets any authenticated role READ but only admin WRITE', async () => {
    const { user } = await createTestUser({
      email: 'req@test.local',
      role: 'requester'
    });
    const header = authHeader(user.id, user.email, 'requester');
    const branch = await createTestBranch();
    const employee = await createTestEmployee(branch.id);

    // The booking form's guide picker is requester-facing, so the READ has to
    // stay open — the same reasoning as GET /api/branches.
    expect(
      (await request(app).get('/api/employees').set('Authorization', header))
        .status
    ).toBe(200);

    for (const call of [
      request(app)
        .post('/api/employees')
        .set('Authorization', header)
        .send({ name: 'X', branchId: branch.id }),
      request(app)
        .patch(`/api/employees/${employee.id}`)
        .set('Authorization', header)
        .send({ name: 'Y' }),
      request(app)
        .post(`/api/employees/${employee.id}/archive`)
        .set('Authorization', header),
      request(app)
        .post(`/api/employees/${employee.id}/restore`)
        .set('Authorization', header)
    ]) {
      expect((await call).status).toBe(403);
    }
  });
});
