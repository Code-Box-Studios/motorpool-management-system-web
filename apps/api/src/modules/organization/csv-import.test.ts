import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestEmployee,
  createTestUser
} from '../../test/factories.js';

const app = createApp();
const headers = 'id,name,position,phone,branch_id,branch_name,archived_at\n';
async function actor(role = 'admin') {
  const { user } = await createTestUser({ role });
  return authHeader(user.id, user.email, role);
}

describe('organization CSV import', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('previews without writes, then atomically creates duplicate people and updates by ID', async () => {
    const auth = await actor();
    const branch = await createTestBranch();
    const existing = await createTestEmployee(branch.id, 'Original');
    const csv =
      headers +
      `${existing.id},Ana,,+63912,${branch.id},,\n,Ana,,,${branch.id},,`;
    const preview = await request(app)
      .post('/api/employees/import/preview')
      .set('Authorization', auth)
      .send({ csv });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ created: 1, updated: 1, errors: [] });
    expect(await prisma.employee.count()).toBe(1);
    const imported = await request(app)
      .post('/api/employees/import')
      .set('Authorization', auth)
      .send({ csv, previewToken: preview.body.previewToken });
    expect(imported.status).toBe(200);
    const rows = await prisma.employee.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.name === 'Ana')).toBe(true);
    expect(rows.find((row) => row.id === existing.id)?.phone).toBe('+63912');
  });

  it('rejects an invalid file without writing any valid preceding row', async () => {
    const auth = await actor();
    const branch = await createTestBranch();
    const csv = headers + `,Valid,,,${branch.id},,\n,Invalid,,,,Missing,`;
    const res = await request(app)
      .post('/api/employees/import')
      .set('Authorization', auth)
      .send({ csv, previewToken: 'invalid' });
    expect(res.status).toBe(400);
    expect(await prisma.employee.count()).toBe(0);
  });

  it('requires a fresh preview after the target record changes', async () => {
    const auth = await actor();
    const branch = await createTestBranch();
    const employee = await createTestEmployee(branch.id);
    const csv = headers + `${employee.id},Replacement,,,${branch.id},,`;
    const preview = await request(app)
      .post('/api/employees/import/preview')
      .set('Authorization', auth)
      .send({ csv });
    await prisma.employee.update({
      where: { id: employee.id },
      data: { name: 'Concurrent edit' }
    });
    const res = await request(app)
      .post('/api/employees/import')
      .set('Authorization', auth)
      .send({ csv, previewToken: preview.body.previewToken });
    expect(res.status).toBe(409);
    expect(
      (await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } }))
        .name
    ).toBe('Concurrent edit');
  });

  it('requires administrator permission for preview and confirmation', async () => {
    const auth = await actor('requester');
    for (const path of [
      '/api/employees/import/preview',
      '/api/employees/import',
      '/api/office-heads/import/preview',
      '/api/office-heads/import'
    ]) {
      expect(
        (
          await request(app)
            .post(path)
            .set('Authorization', auth)
            .send({ csv: headers })
        ).status
      ).toBe(403);
    }
  });
});

describe('organization CSV office heads and rollback', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('resolves office head branch and office names without merging duplicate people', async () => {
    const auth = await actor();
    const branch = await createTestBranch('Main');
    const office = await prisma.departmentOffice.create({
      data: { name: 'Ops', branchId: branch.id }
    });
    const csv =
      'id,name,branch_id,branch_name,office_id,office_name,archived_at\n,Same Person,,Main,,Ops,\n,Same Person,,Main,,Ops,';
    const preview = await request(app)
      .post('/api/office-heads/import/preview')
      .set('Authorization', auth)
      .send({ csv });
    expect(preview.body).toMatchObject({ created: 2, updated: 0, errors: [] });
    const response = await request(app)
      .post('/api/office-heads/import')
      .set('Authorization', auth)
      .send({ csv, previewToken: preview.body.previewToken });
    expect(response.status).toBe(200);
    const heads = await prisma.officeHead.findMany();
    expect(heads).toHaveLength(2);
    expect(
      heads.every(
        (head) => head.branchId === branch.id && head.officeId === office.id
      )
    ).toBe(true);
  });

  it('rolls back earlier writes when the database rejects a later row', async () => {
    const auth = await actor();
    const branch = await createTestBranch();
    const csv =
      headers +
      `,Accepted,,,${branch.id},,\n,Reject import test,,,${branch.id},,`;
    const preview = await request(app)
      .post('/api/employees/import/preview')
      .set('Authorization', auth)
      .send({ csv });
    expect(preview.body.errors).toEqual([]);
    // A test-only database trigger fails after validation, proving actual rollback.
    // It exists only in mms_test and is removed even when an assertion fails.
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION csv_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = 'Reject import test' THEN RAISE EXCEPTION 'test import rejection'; END IF; RETURN NEW; END $$`
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER csv_test_reject BEFORE INSERT ON employees FOR EACH ROW EXECUTE FUNCTION csv_test_reject()`
    );
    try {
      const response = await request(app)
        .post('/api/employees/import')
        .set('Authorization', auth)
        .send({ csv, previewToken: preview.body.previewToken });
      expect(response.status).toBe(500);
      expect(await prisma.employee.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS csv_test_reject ON employees'
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS csv_test_reject()'
      );
    }
  });
});
