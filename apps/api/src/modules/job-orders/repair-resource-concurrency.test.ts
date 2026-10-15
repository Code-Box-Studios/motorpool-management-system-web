import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function fixture() {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const mechanic = await createTestDriver(branch.id);
  const guide = await createTestEmployee(branch.id);
  const { user } = await createTestUser({ role: 'admin' });
  const header = authHeader(user.id, user.email, 'admin');
  const order = await prisma.jobOrder.create({
    data: { vehicleId: vehicle.id, branchId: branch.id, status: 'pending' }
  });
  return { branch, vehicle, mechanic, guide, header, order };
}

// Observe actual PostgreSQL waiters instead of sleeping and hoping the HTTP
// transactions reached the intended interleaving. The first waiter gets the
// vehicle before the second, whose driver lock is already held at that point.
async function waitForWaiter(blockerPid: number, excludePid = 0) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const waiters = await prisma.$queryRaw<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND pid <> ${excludePid}
        AND (${blockerPid} = ANY(pg_blocking_pids(pid))
          OR ${excludePid} = ANY(pg_blocking_pids(pid)))
    `;
    if (waiters[0]) return waiters[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    'HTTP transaction did not reach the expected PostgreSQL lock wait'
  );
}

async function queueBehindVehicle(
  vehicleId: string,
  note: () => Promise<request.Response>,
  tripAction: () => Promise<request.Response>
) {
  let release!: () => void;
  let held!: (pid: number) => void;
  const ready = new Promise<number>((resolve) => {
    held = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicleId}::uuid FOR UPDATE`;
      const [backend] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      held(backend!.pid);
      await proceed;
    },
    { timeout: 10000 }
  );
  const requests: Promise<request.Response>[] = [];
  try {
    const blockerPid = await ready;
    requests.push(note());
    const notePid = await waitForWaiter(blockerPid);
    requests.push(tripAction());
    await waitForWaiter(blockerPid, notePid);
  } finally {
    release();
    await holder;
    await Promise.allSettled(requests);
  }
  return Promise.all(requests);
}

describe('repair note and trip resource concurrency', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('notes a repair and books its mechanic for a future trip without a database abort', async () => {
    const s = await fixture();
    const tomorrow = new Date(Date.now() + 86400000);
    const end = new Date(tomorrow.getTime() + 3600000);
    const [noted, booked] = await queueBehindVehicle(
      s.vehicle.id,
      () =>
        request(app)
          .post(`/api/job-orders/${s.order.id}/note`)
          .set('Authorization', s.header)
          .send({ assignedMechanicId: s.mechanic.id, spareParts: [] })
          .then((r) => r),
      () =>
        request(app)
          .post('/api/trip-tickets')
          .set('Authorization', s.header)
          .send({
            branchId: s.branch.id,
            vehicleId: s.vehicle.id,
            driverId: s.mechanic.id,
            destination: 'Site',
            purpose: 'Work',
            dateRequested: tomorrow.toISOString(),
            guideIds: [s.guide.id],
            participants: ['Alice'],
            dates: [
              { startTs: tomorrow.toISOString(), endTs: end.toISOString() }
            ]
          })
          .then((r) => r)
    );
    expect(noted!.status).toBe(200);
    expect(booked!.status).toBe(201);
    expect(
      await prisma.jobOrder.findUniqueOrThrow({ where: { id: s.order.id } })
    ).toMatchObject({
      status: 'assigned_mechanic',
      assignedMechanicId: s.mechanic.id
    });
    expect(await prisma.tripTicket.count()).toBe(1);
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } })
    ).toMatchObject({ status: 'under_maintenance' });
  }, 15000);

  it('notes a repair before a competing gate departure and returns a domain conflict without a database abort', async () => {
    const s = await fixture();
    const ticket = await createTestTicket({
      branchId: s.branch.id,
      driverId: s.mechanic.id,
      vehicleId: s.vehicle.id
    });
    const date = await prisma.tripDate.create({
      data: {
        tripTicketId: ticket.id,
        startTs: new Date(Date.now() - 3600000),
        endTs: new Date(Date.now() + 3600000)
      }
    });
    const [noted, departed] = await queueBehindVehicle(
      s.vehicle.id,
      () =>
        request(app)
          .post(`/api/job-orders/${s.order.id}/note`)
          .set('Authorization', s.header)
          .send({ assignedMechanicId: s.mechanic.id, spareParts: [] })
          .then((r) => r),
      () =>
        request(app)
          .post(`/api/trip-tickets/${ticket.id}/check-out`)
          .set('Authorization', s.header)
          .send({ startMileage: 1000 })
          .then((r) => r)
    );
    expect(noted!.status).toBe(200);
    expect(departed!.status).toBe(409);
    expect(departed!.body.error.code).toBe('VEHICLE_NOT_AVAILABLE');
    expect(
      await prisma.tripDate.findUniqueOrThrow({ where: { id: date.id } })
    ).toMatchObject({ status: 'scheduled', startMileage: null });
    expect(
      await prisma.tripTicket.findUniqueOrThrow({ where: { id: ticket.id } })
    ).toMatchObject({ status: 'approved' });
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } })
    ).toMatchObject({ status: 'under_maintenance' });
    expect(
      await prisma.vehicleStatusAudit.count({
        where: { vehicleId: s.vehicle.id }
      })
    ).toBe(1);
  }, 15000);
});
