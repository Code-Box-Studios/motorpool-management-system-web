import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestGuide,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import {
  holdRow,
  waitForLockWaiter,
  waitForWriterOrWaiter
} from '../../test/lock-barrier.js';

const app = createApp();
async function setup() {
  const branch = await createTestBranch('Closing');
  const other = await createTestBranch('Open');
  const { user } = await createTestUser();
  const auth = authHeader(user.id, user.email, 'admin');
  return { branch, other, auth };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
type Writer = (s: Fixture) => Promise<() => Promise<request.Response>>;
const cases: [string, Writer][] = [
  [
    'vehicle creation',
    async (s) => () =>
      request(app)
        .post('/api/vehicles')
        .set('Authorization', s.auth)
        .send({
          branchId: s.branch.id,
          make: 'Toyota',
          model: 'Hiace',
          year: 2026,
          vin: 'CONCURRENT',
          licensePlate: 'CONCURRENT',
          capacity: 10,
          fuelType: 'diesel',
          mileage: 0,
          insuranceExpiry: '2027-01-01',
          registrationExpiry: '2027-01-01'
        })
        .then((r) => r)
  ],
  [
    'vehicle move',
    async (s) => {
      const row = await createTestVehicle(s.other.id);
      return () =>
        request(app)
          .patch(`/api/vehicles/${row.id}`)
          .set('Authorization', s.auth)
          .field('branchId', s.branch.id)
          .then((r) => r);
    }
  ],
  [
    'driver creation',
    async (s) => () =>
      request(app)
        .post('/api/drivers')
        .set('Authorization', s.auth)
        .send({
          branchId: s.branch.id,
          email: 'new-driver@test.local',
          fullName: 'New Driver'
        })
        .then((r) => r)
  ],
  [
    'driver move',
    async (s) => {
      const row = await createTestDriver(s.other.id);
      return () =>
        request(app)
          .patch(`/api/drivers/${row.id}`)
          .set('Authorization', s.auth)
          .field('branchId', s.branch.id)
          .then((r) => r);
    }
  ],
  [
    'driver reactivation',
    async (s) => {
      const row = await createTestDriver(s.branch.id, 'inactive');
      return () =>
        request(app)
          .patch(`/api/drivers/${row.id}`)
          .set('Authorization', s.auth)
          .field('status', 'active')
          .then((r) => r);
    }
  ],
  [
    'driver on-trip activation',
    async (s) => {
      const row = await createTestDriver(s.branch.id, 'inactive');
      return () =>
        request(app)
          .patch(`/api/drivers/${row.id}`)
          .set('Authorization', s.auth)
          .field('status', 'on_trip')
          .then((r) => r);
    }
  ],
  [
    'user creation',
    async (s) => {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: 'admin' }
      });
      return () =>
        request(app)
          .post('/api/users')
          .set('Authorization', s.auth)
          .send({
            branchId: s.branch.id,
            roleId: role.id,
            email: 'new-user@test.local',
            fullName: 'New User',
            password: 'Password123!'
          })
          .then((r) => r);
    }
  ],
  [
    'user move',
    async (s) => {
      const { user } = await createTestUser({
        email: 'moved@test.local',
        branchId: s.other.id
      });
      return () =>
        request(app)
          .patch(`/api/users/${user.id}`)
          .set('Authorization', s.auth)
          .field('branchId', s.branch.id)
          .then((r) => r);
    }
  ],
  [
    'user reactivation',
    async (s) => {
      const { user } = await createTestUser({
        email: 'inactive@test.local',
        branchId: s.branch.id,
        status: 'inactive'
      });
      return () =>
        request(app)
          .patch(`/api/users/${user.id}`)
          .set('Authorization', s.auth)
          .field('status', 'active')
          .then((r) => r);
    }
  ],
  [
    'driver identity from role edit',
    async (s) => {
      const { user } = await createTestUser({
        email: 'identity@test.local',
        branchId: s.branch.id,
        status: 'inactive',
        role: 'requester'
      });
      const role = await prisma.role.create({ data: { name: 'driver' } });
      return () =>
        request(app)
          .patch(`/api/users/${user.id}`)
          .set('Authorization', s.auth)
          .field('roleId', role.id)
          .then((r) => r);
    }
  ],
  [
    'job-order creation',
    async (s) => {
      const vehicle = await createTestVehicle(s.other.id);
      return () =>
        request(app)
          .post('/api/job-orders')
          .set('Authorization', s.auth)
          .send({
            branchId: s.branch.id,
            vehicleId: vehicle.id,
            incidentDate: new Date().toISOString(),
            incidentDetails: 'Test incident'
          })
          .then((r) => r);
    }
  ],
  [
    'job-order move',
    async (s) => {
      const vehicle = await createTestVehicle(s.other.id);
      const row = await prisma.jobOrder.create({
        data: { branchId: s.other.id, vehicleId: vehicle.id }
      });
      return () =>
        request(app)
          .patch(`/api/job-orders/${row.id}`)
          .set('Authorization', s.auth)
          .send({ branchId: s.branch.id })
          .then((r) => r);
    }
  ]
];
for (const move of [false, true]) {
  cases.push([
    `trip ${move ? 'move' : 'creation'}`,
    async (s) => {
      const vehicle = await createTestVehicle(s.other.id);
      const driver = await createTestDriver(s.other.id);
      const guide = await createTestGuide(s.other.id);
      const body = {
        branchId: move ? s.other.id : s.branch.id,
        vehicleId: vehicle.id,
        driverId: driver.id,
        guideIds: [guide.id],
        destination: 'Site',
        purpose: 'Testing',
        dateRequested: new Date().toISOString(),
        participants: ['Passenger'],
        participantsCount: 1,
        startTs: new Date(Date.now() + 86400000).toISOString(),
        endTs: new Date(Date.now() + 90000000).toISOString()
      };
      if (!move)
        return () =>
          request(app)
            .post('/api/trip-tickets')
            .set('Authorization', s.auth)
            .send(body)
            .then((r) => r);
      const created = await request(app)
        .post('/api/trip-tickets')
        .set('Authorization', s.auth)
        .send(body);
      expect(created.status).toBe(201);
      return () =>
        request(app)
          .patch(`/api/trip-tickets/${created.body.id}`)
          .set('Authorization', s.auth)
          .send({ branchId: s.branch.id })
          .then((r) => r);
    }
  ]);
}
for (const resource of ['employees', 'office-heads'] as const) {
  cases.push([
    `${resource} CSV confirmation`,
    async (s) => {
      const headers =
        resource === 'employees'
          ? 'id,name,position,phone,branch_id,branch_name,archived_at\n'
          : 'id,name,branch_id,branch_name,office_id,office_name,archived_at\n';
      const csv =
        headers +
        (resource === 'employees'
          ? `,Imported,,,${s.branch.id},,`
          : `,Imported,${s.branch.id},,,,`);
      const preview = await request(app)
        .post(`/api/${resource}/import/preview`)
        .set('Authorization', s.auth)
        .send({ csv });
      expect(preview.status).toBe(200);
      expect(preview.body.errors).toEqual([]);
      return () =>
        request(app)
          .post(`/api/${resource}/import`)
          .set('Authorization', s.auth)
          .send({ csv, previewToken: preview.body.previewToken })
          .then((r) => r);
    }
  ]);
}
for (const [resource, model] of [
  ['offices', 'departmentOffice'],
  ['office-heads', 'officeHead'],
  ['employees', 'employee']
] as const) {
  const createChild = (data: {
    name: string;
    branchId: string;
    archivedAt?: Date;
  }) =>
    model === 'departmentOffice'
      ? prisma.departmentOffice.create({ data })
      : model === 'officeHead'
        ? prisma.officeHead.create({ data })
        : prisma.employee.create({ data });
  cases.push([
    `${resource} creation`,
    async (s) => () =>
      request(app)
        .post(`/api/${resource}`)
        .set('Authorization', s.auth)
        .send({ name: 'New Child', branchId: s.branch.id })
        .then((r) => r)
  ]);
  cases.push([
    `${resource} move`,
    async (s) => {
      const row = await createChild({
        name: 'Moving Child',
        branchId: s.other.id
      });
      return () =>
        request(app)
          .patch(`/api/${resource}/${row.id}`)
          .set('Authorization', s.auth)
          .send({ branchId: s.branch.id })
          .then((r) => r);
    }
  ]);
  cases.push([
    `${resource} restore`,
    async (s) => {
      const row = await createChild({
        name: 'Archived Child',
        branchId: s.branch.id,
        archivedAt: new Date()
      });
      return () =>
        request(app)
          .post(`/api/${resource}/${row.id}/restore`)
          .set('Authorization', s.auth)
          .send({})
          .then((r) => r);
    }
  ]);
}

describe('branch archival and relationship writes', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  // The archive is already waiting before the writer starts. Omitting either
  // transaction's shared branch synchronization recreates an archived parent
  // with an active child, although both requests reported success.
  it.each(cases)(
    'refuses %s after an earlier archive wins',
    async (_name, prepare) => {
      const s = await setup();
      const write = await prepare(s);
      const barrier = await holdRow(
        (tx) =>
          tx.$queryRaw`SELECT id FROM branches WHERE id = ${s.branch.id}::uuid FOR NO KEY UPDATE`
      );
      const archive = request(app)
        .post(`/api/branches/${s.branch.id}/archive`)
        .set('Authorization', s.auth)
        .send({})
        .then((r) => r);
      let writer: Promise<request.Response> | undefined;
      try {
        const archivePid = await waitForLockWaiter(barrier.pid);
        writer = write();
        await waitForWriterOrWaiter(writer, barrier.pid, archivePid);
      } finally {
        barrier.release();
        await barrier.task;
        await Promise.allSettled([archive, ...(writer ? [writer] : [])]);
      }
      expect((await archive).status).toBe(200);
      expect((await writer!).status).toBe(409);
      expect(
        (await prisma.branch.findUniqueOrThrow({ where: { id: s.branch.id } }))
          .archivedAt
      ).not.toBeNull();
    }
  );

  it('rechecks blockers after an earlier vehicle move commits', async () => {
    const s = await setup();
    const vehicle = await createTestVehicle(s.other.id);
    const barrier = await holdRow(
      (tx) =>
        tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicle.id}::uuid FOR NO KEY UPDATE`
    );
    const writer = request(app)
      .patch(`/api/vehicles/${vehicle.id}`)
      .set('Authorization', s.auth)
      .field('branchId', s.branch.id)
      .then((r) => r);
    let archive: Promise<request.Response> | undefined;
    try {
      const writerPid = await waitForLockWaiter(barrier.pid);
      archive = request(app)
        .post(`/api/branches/${s.branch.id}/archive`)
        .set('Authorization', s.auth)
        .send({})
        .then((r) => r);
      await waitForWriterOrWaiter(archive, barrier.pid, writerPid);
    } finally {
      barrier.release();
      await barrier.task;
      await Promise.allSettled([writer, ...(archive ? [archive] : [])]);
    }
    expect((await writer).status).toBe(200);
    expect((await archive!).status).toBe(409);
    expect((await archive!).body.error.code).toBe('IN_USE');
    expect(
      (await prisma.branch.findUniqueOrThrow({ where: { id: s.branch.id } }))
        .archivedAt
    ).toBeNull();
  });

  it('keeps parent-before-driver lock order when archive queues behind another writer', async () => {
    const s = await setup();
    const vehicle = await createTestVehicle(s.other.id);
    const driver = await createTestDriver(s.other.id);
    const guide = await createTestGuide(s.other.id);
    const barrier = await holdRow(
      (tx) =>
        tx.$queryRaw`SELECT id FROM drivers WHERE id = ${driver.id}::uuid FOR NO KEY UPDATE`
    );
    const move = request(app)
      .patch(`/api/drivers/${driver.id}`)
      .set('Authorization', s.auth)
      .field('branchId', s.branch.id)
      .then((r) => r);
    let trip: Promise<request.Response> | undefined;
    let archive: Promise<request.Response> | undefined;
    try {
      const movePid = await waitForLockWaiter(barrier.pid);
      trip = request(app)
        .post('/api/trip-tickets')
        .set('Authorization', s.auth)
        .send({
          branchId: s.branch.id,
          vehicleId: vehicle.id,
          driverId: driver.id,
          guideIds: [guide.id],
          destination: 'Site',
          purpose: 'Testing',
          dateRequested: new Date().toISOString(),
          participants: ['Passenger'],
          participantsCount: 1,
          startTs: new Date(Date.now() + 86400000).toISOString(),
          endTs: new Date(Date.now() + 90000000).toISOString()
        })
        .then((r) => r);
      const tripPid = await waitForLockWaiter(barrier.pid, movePid);
      archive = request(app)
        .post(`/api/branches/${s.branch.id}/archive`)
        .set('Authorization', s.auth)
        .send({})
        .then((r) => r);
      // Both writers hold SHARE on the branch. PostgreSQL may report either
      // member of that multitransaction as the archive's first blocker.
      await waitForLockWaiter(movePid, tripPid);
    } finally {
      barrier.release();
      await barrier.task;
      await Promise.allSettled([
        move,
        ...(trip ? [trip] : []),
        ...(archive ? [archive] : [])
      ]);
    }
    expect((await move).status).toBe(200);
    expect((await trip!).status).toBe(201);
    expect((await archive!).status).toBe(409);
    expect((await archive!).body.error.code).toBe('IN_USE');
  });
});
