import request from 'supertest';
import { Prisma } from '@prisma/client';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../../test/factories.js';
const app = createApp();
beforeEach(truncateAll);
afterAll(() => prisma.$disconnect());
async function setup() {
  const a = await createTestBranch('A'),
    b = await createTestBranch('B');
  const office = await prisma.departmentOffice.create({
    data: { name: 'Office A', branchId: a.id }
  });
  const { user } = await createTestUser({ role: 'admin' });
  return { a, b, office, header: authHeader(user.id, user.email, 'admin') };
}

async function waitForBlockedWrites(blockerPid: number, count: number) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      WITH RECURSIVE blocked AS (
        SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND ${blockerPid} = ANY(pg_blocking_pids(pid))
        UNION
        SELECT activity.pid FROM pg_stat_activity activity
        JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
        WHERE activity.datname = current_database()
          AND activity.wait_event_type = 'Lock'
      )
      SELECT count(*) AS count FROM blocked
    `;
    if (Number(rows[0]!.count) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `${count} organization writes did not reach their database lock wait`
  );
}

// Both HTTP transactions finish their relationship reads before the holder
// releases their writes. This makes stale-pair and cross-table write skew real
// PostgreSQL schedules rather than timing-dependent Promise.all calls.
async function queueOrganizationWrites(
  table: 'office_heads' | 'department_offices',
  id: string,
  actions: (() => Promise<request.Response>)[]
) {
  let release!: () => void;
  let acquired!: (pid: number) => void;
  const ready = new Promise<number>((resolve) => {
    acquired = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`
      SELECT id FROM ${Prisma.raw(table)} WHERE id = ${id}::uuid FOR UPDATE
    `);
      const [backend] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      acquired(backend!.pid);
      await gate;
    },
    { timeout: 10000 }
  );
  const requests: Promise<request.Response>[] = [];
  try {
    const blockerPid = await ready;
    for (const action of actions) {
      requests.push(action());
      await waitForBlockedWrites(blockerPid, requests.length);
    }
  } finally {
    release();
    await holder;
    await Promise.allSettled(requests);
  }
  return Promise.all(requests);
}
it('rejects an office head whose selected office belongs to another branch', async () => {
  const s = await setup();
  const r = await request(app)
    .post('/api/office-heads')
    .set('Authorization', s.header)
    .send({ name: 'Head', branchId: s.b.id, officeId: s.office.id });
  expect(r.status).toBe(400);
  expect(await prisma.officeHead.count()).toBe(0);
});
it('validates the effective branch when only office is patched', async () => {
  const s = await setup();
  const head = await prisma.officeHead.create({
    data: { name: 'Head', branchId: s.b.id }
  });
  const r = await request(app)
    .patch(`/api/office-heads/${head.id}`)
    .set('Authorization', s.header)
    .send({ officeId: s.office.id });
  expect(r.status).toBe(400);
  expect(
    (await prisma.officeHead.findUniqueOrThrow({ where: { id: head.id } }))
      .officeId
  ).toBeNull();
});
it('validates the effective office when only branch is patched', async () => {
  const s = await setup();
  const head = await prisma.officeHead.create({
    data: { name: 'Head', branchId: s.a.id, officeId: s.office.id }
  });
  const r = await request(app)
    .patch(`/api/office-heads/${head.id}`)
    .set('Authorization', s.header)
    .send({ branchId: s.b.id });
  expect(r.status).toBe(400);
  expect(
    (await prisma.officeHead.findUniqueOrThrow({ where: { id: head.id } }))
      .branchId
  ).toBe(s.a.id);
});
it('allows clearing the office while changing branch, and preserves unrelated archived references', async () => {
  const s = await setup();
  const head = await prisma.officeHead.create({
    data: { name: 'Head', branchId: s.a.id, officeId: s.office.id }
  });
  expect(
    (
      await request(app)
        .patch(`/api/office-heads/${head.id}`)
        .set('Authorization', s.header)
        .send({ branchId: s.b.id, officeId: null })
    ).status
  ).toBe(200);
  await prisma.branch.update({
    where: { id: s.b.id },
    data: { archivedAt: new Date() }
  });
  expect(
    (
      await request(app)
        .patch(`/api/office-heads/${head.id}`)
        .set('Authorization', s.header)
        .send({ name: 'Renamed' })
    ).status
  ).toBe(200);
});
it('creates a matching office head whose unchanged row passes CSV preview', async () => {
  const s = await setup();
  const created = await request(app)
    .post('/api/office-heads')
    .set('Authorization', s.header)
    .send({ name: 'Head', branchId: s.a.id, officeId: s.office.id });
  expect(created.status).toBe(201);
  const csv = `id,name,branch_id,branch_name,office_id,office_name,archived_at\n${created.body.id},Head,${s.a.id},,${s.office.id},,`;
  const preview = await request(app)
    .post('/api/office-heads/import/preview')
    .set('Authorization', s.header)
    .send({ csv });
  expect(preview.status).toBe(200);
  expect(preview.body.errors).toEqual([]);
});

it('rejects a stale effective office-head pair after a concurrent branch change', async () => {
  const s = await setup();
  const head = await prisma.officeHead.create({
    data: { name: 'Head', branchId: s.a.id, officeId: s.office.id }
  });
  const [moved, stale] = await queueOrganizationWrites(
    'office_heads',
    head.id,
    [
      () =>
        request(app)
          .patch(`/api/office-heads/${head.id}`)
          .set('Authorization', s.header)
          .send({ branchId: s.b.id, officeId: null })
          .then((response) => response),
      () =>
        request(app)
          .patch(`/api/office-heads/${head.id}`)
          .set('Authorization', s.header)
          .send({ officeId: s.office.id })
          .then((response) => response)
    ]
  );
  expect(moved!.status).toBe(200);
  expect(stale!.status).toBe(409);
  expect(stale!.body.error.code).toBe('ORGANIZATION_CHANGED');
  expect(
    await prisma.officeHead.findUniqueOrThrow({ where: { id: head.id } })
  ).toMatchObject({ branchId: s.b.id, officeId: null });
}, 15000);

it.each(['other branch', 'no branch'] as const)(
  'rejects moving an office to %s while its attached head would mismatch',
  async (destination) => {
    const s = await setup();
    const head = await prisma.officeHead.create({
      data: { name: 'Head', branchId: s.a.id, officeId: s.office.id }
    });
    const moved = await request(app)
      .patch(`/api/offices/${s.office.id}`)
      .set('Authorization', s.header)
      .send({ branchId: destination === 'other branch' ? s.b.id : null });
    expect(moved.status).toBe(400);
    expect(moved.body.error.code).toBe('OFFICE_BRANCH_MISMATCH');
    expect(
      await prisma.departmentOffice.findUniqueOrThrow({
        where: { id: s.office.id }
      })
    ).toMatchObject({ branchId: s.a.id });
    expect(
      (
        await request(app)
          .patch(`/api/office-heads/${head.id}`)
          .set('Authorization', s.header)
          .send({ officeId: null })
      ).status
    ).toBe(200);
    const retried = await request(app)
      .patch(`/api/offices/${s.office.id}`)
      .set('Authorization', s.header)
      .send({ branchId: destination === 'other branch' ? s.b.id : null });
    expect(retried.status).toBe(200);
  }
);

it('rejects a branch assignment that would strand a branchless attached head', async () => {
  const s = await setup();
  await prisma.departmentOffice.update({
    where: { id: s.office.id },
    data: { branchId: null }
  });
  await prisma.officeHead.create({
    data: { name: 'Branchless head', officeId: s.office.id }
  });
  const moved = await request(app)
    .patch(`/api/offices/${s.office.id}`)
    .set('Authorization', s.header)
    .send({ branchId: s.b.id });
  expect(moved.status).toBe(400);
  expect(moved.body.error.code).toBe('OFFICE_BRANCH_MISMATCH');
  expect(
    await prisma.departmentOffice.findUniqueOrThrow({
      where: { id: s.office.id }
    })
  ).toMatchObject({ branchId: null });
});

it('serializes a new office-head assignment against a concurrent office move', async () => {
  const s = await setup();
  const responses = await queueOrganizationWrites(
    'department_offices',
    s.office.id,
    [
      () =>
        request(app)
          .post('/api/office-heads')
          .set('Authorization', s.header)
          .send({ name: 'Head', branchId: s.a.id, officeId: s.office.id })
          .then((response) => response),
      () =>
        request(app)
          .patch(`/api/offices/${s.office.id}`)
          .set('Authorization', s.header)
          .send({ branchId: s.b.id })
          .then((response) => response)
    ]
  );
  expect(responses.filter((response) => response.status === 409)).toHaveLength(
    1
  );
  expect(
    responses.filter((response) => [200, 201].includes(response.status))
  ).toHaveLength(1);
  expect(
    responses.find((response) => response.status === 409)!.body.error.code
  ).toBe('ORGANIZATION_CHANGED');
  const office = await prisma.departmentOffice.findUniqueOrThrow({
    where: { id: s.office.id }
  });
  const heads = await prisma.officeHead.findMany({
    where: { officeId: office.id }
  });
  expect(heads.every((head) => head.branchId === office.branchId)).toBe(true);
}, 15000);

it('serializes a CSV office-head import against a concurrent office move', async () => {
  const s = await setup();
  const csv = `id,name,branch_id,branch_name,office_id,office_name,archived_at\n,Head,${s.a.id},,${s.office.id},,`;
  const preview = await request(app)
    .post('/api/office-heads/import/preview')
    .set('Authorization', s.header)
    .send({ csv });
  expect(preview.status).toBe(200);
  expect(preview.body.errors).toEqual([]);
  const responses = await queueOrganizationWrites(
    'department_offices',
    s.office.id,
    [
      () =>
        request(app)
          .post('/api/office-heads/import')
          .set('Authorization', s.header)
          .send({ csv, previewToken: preview.body.previewToken })
          .then((response) => response),
      () =>
        request(app)
          .patch(`/api/offices/${s.office.id}`)
          .set('Authorization', s.header)
          .send({ branchId: s.b.id })
          .then((response) => response)
    ]
  );
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409
  ]);
  expect(['CSV_PREVIEW_STALE', 'ORGANIZATION_CHANGED']).toContain(
    responses.find((response) => response.status === 409)!.body.error.code
  );
  const office = await prisma.departmentOffice.findUniqueOrThrow({
    where: { id: s.office.id }
  });
  const heads = await prisma.officeHead.findMany({
    where: { officeId: office.id }
  });
  expect(heads.every((head) => head.branchId === office.branchId)).toBe(true);
}, 15000);

it('keeps office metadata editable when its existing branch is archived', async () => {
  const s = await setup();
  await prisma.branch.update({
    where: { id: s.a.id },
    data: { archivedAt: new Date() }
  });
  const renamed = await request(app)
    .patch(`/api/offices/${s.office.id}`)
    .set('Authorization', s.header)
    .send({ name: 'Renamed office' });
  expect(renamed.status).toBe(200);
  expect(renamed.body).toMatchObject({
    name: 'Renamed office',
    branchId: s.a.id
  });
});
