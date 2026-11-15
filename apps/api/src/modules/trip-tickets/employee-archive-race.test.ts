import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';

const app = createApp();
const observer = new PrismaClient();
const locker = new PrismaClient();
type Case = {
  operation: 'create' | 'edit' | 'reassign';
  membership: 'participant' | 'guide';
};
const cases: Case[] = [
  { operation: 'create', membership: 'participant' },
  { operation: 'create', membership: 'guide' },
  { operation: 'edit', membership: 'participant' },
  { operation: 'edit', membership: 'guide' },
  { operation: 'reassign', membership: 'guide' }
];

async function fixture(testCase: Case) {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(branch.id);
  const target = await createTestEmployee(branch.id, 'Selected employee');
  const participant = await createTestEmployee(
    branch.id,
    'Existing participant'
  );
  const guide = await createTestEmployee(branch.id, 'Existing guide');
  const { user } = await createTestUser();
  const auth = authHeader(user.id, user.email, 'admin');
  const start = new Date(Date.now() + 86400000);
  const body = {
    branchId: branch.id,
    driverId: driver.id,
    vehicleId: vehicle.id,
    destination: 'Archive race fixture',
    purpose: 'Race regression',
    dateRequested: new Date().toISOString(),
    participantType: 'employees',
    participantEmployeeIds: [participant.id],
    guideIds: [guide.id],
    dates: [
      {
        startTs: start.toISOString(),
        endTs: new Date(+start + 3600000).toISOString()
      }
    ]
  };
  let ticketId: string | undefined;
  if (testCase.operation !== 'create') {
    const created = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', auth)
      .send(body);
    expect(created.status).toBe(201);
    ticketId = created.body.id;
    if (testCase.operation === 'reassign')
      await prisma.tripTicket.update({
        where: { id: ticketId },
        data: { status: 'approved' }
      });
  }
  const selected =
    testCase.membership === 'participant'
      ? { participantEmployeeIds: [target.id] }
      : { guideIds: [target.id] };
  const assign = () => {
    const req =
      testCase.operation === 'create'
        ? request(app)
            .post('/api/trip-tickets')
            .send({ ...body, ...selected })
        : testCase.operation === 'edit'
          ? request(app).patch(`/api/trip-tickets/${ticketId}`).send(selected)
          : request(app)
              .post(`/api/trip-tickets/${ticketId}/guides`)
              .send(selected);
    return req.set('Authorization', auth).then((response) => response);
  };
  const archive = () =>
    request(app)
      .post(`/api/employees/${target.id}/archive`)
      .set('Authorization', auth)
      .send({})
      .then((response) => response);
  return { target, assign, archive };
}

async function blockedEmployeeQueries() {
  const rows = await observer.$queryRaw<{ query: string }[]>`
    SELECT query FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND state = 'active' AND wait_event_type = 'Lock'
  `;
  return rows.filter(
    (row) =>
      row.query.includes('employees') ||
      row.query.includes('trip_ticket_participants')
  ).length;
}

async function waitUntil(check: () => Promise<boolean>) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error('Expected employee row-lock barrier was not reached');
}

describe('employee archival and live trip membership synchronize', () => {
  beforeEach(truncateAll);
  afterAll(() =>
    Promise.all([
      prisma.$disconnect(),
      observer.$disconnect(),
      locker.$disconnect()
    ])
  );

  it.each(cases)(
    'archive first rejects $operation of a new $membership after waiting',
    async (testCase) => {
      const s = await fixture(testCase);
      let release!: () => void;
      let acquired!: () => void;
      const ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const barrier = locker.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM employees WHERE id = ${s.target.id}::uuid FOR NO KEY UPDATE`;
          acquired();
          await hold;
        },
        { timeout: 12000 }
      );
      await ready;
      let archiveResult: Awaited<ReturnType<typeof s.archive>>;
      let assignResult: Awaited<ReturnType<typeof s.assign>>;
      let archive: ReturnType<typeof s.archive> | undefined;
      let assign: ReturnType<typeof s.assign> | undefined;
      try {
        archive = s.archive();
        await waitUntil(async () => (await blockedEmployeeQueries()) >= 1);
        let assigned = false;
        assign = s.assign().then((result) => {
          assigned = true;
          return result;
        });
        await waitUntil(
          async () => assigned || (await blockedEmployeeQueries()) >= 2
        );
        release();
        await barrier;
        [archiveResult, assignResult] = await Promise.all([archive, assign]);
      } finally {
        release();
        await Promise.allSettled([archive, assign]);
        await barrier;
      }
      expect(archiveResult.status).toBe(200);
      expect(assignResult.status).toBe(400);
      expect(assignResult.body.error.code).toBe(
        testCase.membership === 'guide'
          ? 'INVALID_GUIDES'
          : 'INVALID_PARTICIPANTS'
      );
      expect(
        await prisma.tripTicket.count({
          where: {
            OR: [
              { guides: { some: { employeeId: s.target.id } } },
              { participantEmployees: { some: { employeeId: s.target.id } } }
            ]
          }
        })
      ).toBe(0);
    },
    20000
  );

  it.each(cases)(
    'committed $operation of a $membership prevents archival',
    async (testCase) => {
      const s = await fixture(testCase);
      const assigned = await s.assign();
      expect(assigned.status).toBe(testCase.operation === 'create' ? 201 : 200);
      const archived = await s.archive();
      expect(archived.status).toBe(409);
      expect(archived.body.error.code).toBe('IN_USE');
      expect(
        (
          await prisma.employee.findUniqueOrThrow({
            where: { id: s.target.id }
          })
        ).archivedAt
      ).toBeNull();
    }
  );

  it.each(cases)(
    '$operation holding a new $membership makes archival recheck after waiting',
    async (testCase) => {
      const s = await fixture(testCase);
      let release!: () => void;
      let acquired!: () => void;
      const ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const barrier = locker.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM employees WHERE id = ${s.target.id}::uuid FOR UPDATE`;
          acquired();
          await hold;
        },
        { timeout: 12000 }
      );
      await ready;
      let assign: ReturnType<typeof s.assign> | undefined;
      let archive: ReturnType<typeof s.archive> | undefined;
      try {
        assign = s.assign();
        await waitUntil(async () => (await blockedEmployeeQueries()) >= 1);
        archive = s.archive();
        await waitUntil(async () => (await blockedEmployeeQueries()) >= 2);
        release();
        await barrier;
        const [assigned, archived] = await Promise.all([assign, archive]);
        expect(assigned.status).toBe(
          testCase.operation === 'create' ? 201 : 200
        );
        expect(archived.status).toBe(409);
        expect(archived.body.error.code).toBe('IN_USE');
        expect(
          (
            await prisma.employee.findUniqueOrThrow({
              where: { id: s.target.id }
            })
          ).archivedAt
        ).toBeNull();
      } finally {
        release();
        await Promise.allSettled([assign, archive]);
        await barrier;
      }
    },
    20000
  );
});
