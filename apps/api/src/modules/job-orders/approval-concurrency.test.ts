import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();
const originalFindUnique = prisma.jobOrder.findUnique;

async function fixture() {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const mechanic = await createTestDriver(branch.id);
  const { user: admin } = await createTestUser();
  const { user: evp } = await createTestUser({
    email: 'evp.approval@test.local',
    role: 'evp_operations'
  });
  const { user: requester } = await createTestUser({
    email: 'requester.approval@test.local',
    role: 'driver'
  });
  const header = authHeader(admin.id, admin.email, 'admin');
  const evpHeader = authHeader(evp.id, evp.email, 'evp_operations');
  const part = await prisma.sparePart.create({
    data: { name: 'Approval regression pad', quantity: 10 }
  });
  const order = await prisma.jobOrder.create({
    data: {
      vehicleId: vehicle.id,
      branchId: branch.id,
      requestedById: requester.id
    }
  });
  const post = (action: string, authorization = header, body = {}) =>
    request(app)
      .post(`/api/job-orders/${order.id}/${action}`)
      .set('Authorization', authorization)
      .send(body)
      .then((response) => response);
  const noted = await post('note', header, {
    assignedMechanicId: mechanic.id,
    spareParts: [{ sparePartId: part.id, quantity: 2 }]
  });
  expect(noted.status, JSON.stringify(noted.body)).toBe(200);
  const notifications = () =>
    prisma.notification.count({
      where: {
        userId: requester.id,
        type: 'job_order_approved',
        linkTo: `/job-order/${order.id}`
      }
    });
  return {
    vehicle,
    part,
    order,
    admin,
    evp,
    header,
    evpHeader,
    post,
    notifications
  };
}

// Delay delivery of real PostgreSQL preflight snapshots, not their contents or
// writes. This creates the stale read even if approval's write moves into a
// transaction. Other reads, authentication, notifications and HTTP stay real.
function pausePreflights(id: string, expected = 1) {
  const read = prisma.jobOrder.findUnique.bind(prisma.jobOrder);
  let captured = 0;
  let pending = expected;
  let reached!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    release = resolve;
  });
  prisma.jobOrder.findUnique = (args) => {
    const result = read(args);
    if (args.where.id !== id || captured >= expected) return result;
    captured += 1;
    return result.then(async (snapshot) => {
      if (--pending === 0) reached();
      await proceed;
      return snapshot;
    }) as typeof result;
  };
  const wait = async () => {
    let timer!: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        ready,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Approval preflight did not reach barrier')),
            3000
          );
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  return { wait, release };
}

describe('job-order approval concurrency', () => {
  beforeEach(truncateAll);
  afterEach(() => {
    prisma.jobOrder.findUnique = originalFindUnique;
  });
  afterAll(() => prisma.$disconnect());

  it('refuses a stale approval after completion and preserves one service row and approval notification', async () => {
    const s = await fixture();
    const barrier = pausePreflights(s.order.id);
    const stale = s.post('approve', s.evpHeader);
    try {
      await barrier.wait();
      expect((await s.post('approve')).status).toBe(200);
      expect(
        (
          await s.post('complete-repair', s.header, {
            repairDone: 'simple',
            completedMileage: 1000
          })
        ).status
      ).toBe(200);
    } finally {
      barrier.release();
      await Promise.allSettled([stale]);
    }
    const response = await stale;
    const order = await prisma.jobOrder.findUniqueOrThrow({
      where: { id: s.order.id }
    });
    const repeatedCompletion = await s.post('complete-repair', s.header, {
      repairDone: 'simple',
      completedMileage: 1000
    });
    expect.soft(response.status).toBe(409);
    expect.soft(response.body.error?.code).toBe('INVALID_TRANSITION');
    expect.soft(order).toMatchObject({
      status: 'repaired',
      approvedById: s.admin.id,
      repairDone: 'simple'
    });
    expect.soft(repeatedCompletion.status).toBe(409);
    expect.soft(await s.notifications()).toBe(1);
    expect
      .soft(
        await prisma.maintenance.count({ where: { vehicleId: s.vehicle.id } })
      )
      .toBe(1);
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } })
    ).toMatchObject({ status: 'available', mileage: 1000 });
    expect(
      await prisma.sparePart.findUniqueOrThrow({ where: { id: s.part.id } })
    ).toMatchObject({ quantity: 8 });
  }, 15000);

  it('claims simultaneous approvals once and sends one notification to each recipient', async () => {
    const s = await fixture();
    const barrier = pausePreflights(s.order.id, 2);
    const attempts = [s.post('approve'), s.post('approve', s.evpHeader)];
    try {
      await barrier.wait();
    } finally {
      barrier.release();
      await Promise.allSettled(attempts);
    }
    const responses = await Promise.all(attempts);
    expect
      .soft(responses.map((response) => response.status).sort())
      .toEqual([200, 409]);
    const loser = responses.find((response) => response.status === 409);
    expect.soft(loser?.body.error?.code).toBe('INVALID_TRANSITION');
    expect.soft(await s.notifications()).toBe(1);
    const order = await prisma.jobOrder.findUniqueOrThrow({
      where: { id: s.order.id }
    });
    expect(order.status).toBe('ongoing_repair');
    const winner = responses.findIndex((response) => response.status === 200);
    expect(order.approvedById).toBe(winner === 0 ? s.admin.id : s.evp.id);
    expect(order.dateApproved).not.toBeNull();
    expect((await s.post('approve')).status).toBe(409);
    expect.soft(await s.notifications()).toBe(1);
    expect(
      (
        await s.post('complete-repair', s.header, {
          repairDone: 'simple',
          completedMileage: 1000
        })
      ).status
    ).toBe(200);
    expect(
      await prisma.maintenance.count({ where: { vehicleId: s.vehicle.id } })
    ).toBe(1);
  }, 15000);

  it('rejects approval after deletion without restoring the order or consuming returned stock', async () => {
    const s = await fixture();
    const barrier = pausePreflights(s.order.id);
    const stale = s.post('approve', s.evpHeader);
    try {
      await barrier.wait();
      expect(
        (
          await request(app)
            .delete(`/api/job-orders/${s.order.id}`)
            .set('Authorization', s.header)
        ).status
      ).toBe(204);
    } finally {
      barrier.release();
      await Promise.allSettled([stale]);
    }
    const response = await stale;
    expect.soft(response.status).toBe(409);
    expect.soft(response.body.error?.code).toBe('INVALID_TRANSITION');
    expect(await prisma.jobOrder.count({ where: { id: s.order.id } })).toBe(0);
    expect(await s.notifications()).toBe(0);
    expect(
      await prisma.maintenance.count({ where: { vehicleId: s.vehicle.id } })
    ).toBe(0);
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } })
    ).toMatchObject({ status: 'available' });
    expect(
      await prisma.sparePart.findUniqueOrThrow({ where: { id: s.part.id } })
    ).toMatchObject({ quantity: 10 });
  }, 15000);
});
