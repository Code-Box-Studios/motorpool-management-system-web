import { fixtureGateDateId } from '../../test/trip-gate.js';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestGuide,
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
  const guide = await createTestGuide(branch.id);
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

  it('rejects a deletion whose preflight vehicle changed while waiting for its lock', async () => {
    const s = await fixture();
    const other = await createTestVehicle(s.branch.id);
    const part = await prisma.sparePart.create({
      data: { name: 'Pad', quantity: 10 }
    });
    const [moved, deleted] = await queueBehindVehicle(
      s.vehicle.id,
      () =>
        request(app)
          .patch(`/api/job-orders/${s.order.id}`)
          .set('Authorization', s.header)
          .send({ vehicleId: other.id })
          .then((response) => response),
      () =>
        request(app)
          .delete(`/api/job-orders/${s.order.id}`)
          .set('Authorization', s.header)
          .then((response) => response)
    );
    expect(moved!.status).toBe(200);
    expect(deleted!.status).toBe(409);
    expect(deleted!.body.error.code).toBe('INVALID_TRANSITION');
    expect(
      await prisma.jobOrder.findUniqueOrThrow({ where: { id: s.order.id } })
    ).toMatchObject({ vehicleId: other.id, status: 'pending' });
    // A new request takes the current vehicle lock, preserving issued stock.
    const noted = await request(app)
      .post(`/api/job-orders/${s.order.id}/note`)
      .set('Authorization', s.header)
      .send({
        assignedMechanicId: s.mechanic.id,
        spareParts: [{ sparePartId: part.id, quantity: 2 }]
      });
    expect(noted.status).toBe(200);
    expect(
      await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } })
    ).toMatchObject({ quantity: 8 });
    expect(
      (
        await request(app)
          .delete(`/api/job-orders/${s.order.id}`)
          .set('Authorization', s.header)
      ).status
    ).toBe(204);
    expect(
      await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } })
    ).toMatchObject({ quantity: 10 });
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: other.id } })
    ).toMatchObject({ status: 'available' });
  }, 15000);

  it('does not let a stale pending edit move a repair after its note commits', async () => {
    const s = await fixture();
    const other = await createTestVehicle(s.branch.id);
    const [noted, edited] = await queueBehindVehicle(
      s.vehicle.id,
      () =>
        request(app)
          .post(`/api/job-orders/${s.order.id}/note`)
          .set('Authorization', s.header)
          .send({ assignedMechanicId: s.mechanic.id, spareParts: [] })
          .then((response) => response),
      () =>
        request(app)
          .patch(`/api/job-orders/${s.order.id}`)
          .set('Authorization', s.header)
          .send({ vehicleId: other.id })
          .then((response) => response)
    );
    expect(noted!.status).toBe(200);
    expect(edited!.status).toBe(409);
    expect(edited!.body.error.code).toBe('INVALID_TRANSITION');
    expect(
      await prisma.jobOrder.findUniqueOrThrow({ where: { id: s.order.id } })
    ).toMatchObject({ vehicleId: s.vehicle.id });
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: other.id } })
    ).toMatchObject({ status: 'available' });
  }, 15000);

  it('claims the same pending repair once before issuing parts', async () => {
    const s = await fixture();
    const part = await prisma.sparePart.create({
      data: { name: 'Pad', quantity: 10 }
    });
    const note = () =>
      request(app)
        .post(`/api/job-orders/${s.order.id}/note`)
        .set('Authorization', s.header)
        .send({
          assignedMechanicId: s.mechanic.id,
          spareParts: [{ sparePartId: part.id, quantity: 2 }]
        })
        .then((response) => response);
    const responses = await queueBehindVehicle(s.vehicle.id, note, note);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409
    ]);
    expect(
      responses.find((response) => response.status === 409)!.body.error.code
    ).toBe('INVALID_TRANSITION');
    expect(
      await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } })
    ).toMatchObject({ quantity: 8 });
    expect(
      await prisma.jobOrderSparePart.findMany({
        where: { jobOrderId: s.order.id }
      })
    ).toHaveLength(1);
    expect(
      (
        await request(app)
          .delete(`/api/job-orders/${s.order.id}`)
          .set('Authorization', s.header)
      ).status
    ).toBe(204);
    expect(
      await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } })
    ).toMatchObject({ quantity: 10 });
  }, 15000);

  it.each(['assigned_mechanic', 'ongoing_repair'] as const)(
    'manual availability and departure honor a live %s repair even after a legacy status override',
    async (status) => {
      const s = await fixture();
      await prisma.jobOrder.update({
        where: { id: s.order.id },
        data: { status, assignedMechanicId: s.mechanic.id }
      });
      await prisma.vehicle.update({
        where: { id: s.vehicle.id },
        data: { status: 'under_maintenance' }
      });
      const manual = await request(app)
        .patch(`/api/vehicles/${s.vehicle.id}`)
        .set('Authorization', s.header)
        .send({ status: 'available' });
      expect(manual.status).toBe(409);
      expect(manual.body.error.code).toBe('VEHICLE_UNDER_REPAIR');
      // Imported legacy data may already contradict the live repair hold.
      await prisma.vehicle.update({
        where: { id: s.vehicle.id },
        data: { status: 'available' }
      });
      const ticket = await createTestTicket({
        branchId: s.branch.id,
        vehicleId: s.vehicle.id,
        driverId: s.mechanic.id
      });
      await prisma.tripDate.create({
        data: {
          tripTicketId: ticket.id,
          startTs: new Date(Date.now() - 3600000),
          endTs: new Date(Date.now() + 3600000)
        }
      });
      const departed = await request(app)
        .post(`/api/trip-tickets/${ticket.id}/check-out`)
        .set('Authorization', s.header)
        .send({ dateId: await fixtureGateDateId(ticket.id) });
      expect(departed.status).toBe(409);
      expect(departed.body.error.code).toBe('VEHICLE_NOT_AVAILABLE');
      expect(
        await prisma.tripDate.count({
          where: { tripTicketId: ticket.id, status: 'in_progress' }
        })
      ).toBe(0);
      expect(
        await prisma.vehicleStatusAudit.count({
          where: { vehicleId: s.vehicle.id }
        })
      ).toBe(0);
    }
  );

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
      async () =>
        request(app)
          .post(`/api/trip-tickets/${ticket.id}/check-out`)
          .set('Authorization', s.header)
          .send({
            dateId: await fixtureGateDateId(ticket.id),
            startMileage: 1000
          })
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
