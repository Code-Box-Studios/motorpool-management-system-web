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

const app = createApp();

describe('reference module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('GET /api/roles returns { data, count } sorted by name', async () => {
    const { user } = await createTestUser({ role: 'driver' });
    const res = await request(app)
      .get('/api/roles')
      .set('Authorization', authHeader(user.id, user.email, 'driver'));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1); // only the factory-created role exists
    expect(res.body.data[0].name).toBe('driver');
  });

  it('GET /api/branches works for any authenticated role and paginates', async () => {
    const { user } = await createTestUser({ role: 'security_guard' });
    await createTestBranch('Alpha');
    await createTestBranch('Beta');
    const header = authHeader(user.id, user.email, 'security_guard');

    const res = await request(app)
      .get('/api/branches')
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.data.map((b: { name: string }) => b.name)).toEqual([
      'Alpha',
      'Beta'
    ]);

    const page2 = await request(app)
      .get('/api/branches?page=2&limit=1')
      .set('Authorization', header);
    expect(page2.body.count).toBe(2); // total, not page size
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.data[0].name).toBe('Beta');
  });

  it('GET /api/offices embeds the office head', async () => {
    const { user } = await createTestUser();
    const branch = await createTestBranch();
    const office = await prisma.departmentOffice.create({
      data: { name: 'Ops', branchId: branch.id }
    });
    const head = await prisma.officeHead.create({
      data: { name: 'Maria', branchId: branch.id, officeId: office.id }
    });
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { headId: head.id }
    });

    const res = await request(app)
      .get('/api/offices')
      .set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(res.status).toBe(200);
    expect(res.body.data[0].head.name).toBe('Maria');

    const heads = await request(app)
      .get('/api/office-heads')
      .set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(heads.body.count).toBe(1);
  });

  it('rejects unauthenticated requests with 401', async () => {
    for (const path of [
      '/api/roles',
      '/api/branches',
      '/api/offices',
      '/api/office-heads'
    ]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('does NOT hijack unknown /api routes (unauthenticated 404 stays 404)', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
