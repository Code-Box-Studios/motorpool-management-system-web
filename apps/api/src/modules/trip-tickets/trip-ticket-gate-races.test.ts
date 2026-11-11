import request from 'supertest';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import * as transitions from './transitions.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';

// Regression tests pause real preflight reads while competing transactions commit.
// All transition side effects and persistence use the dedicated test database.
const app = createApp();
const originalTicketRead = prisma.tripTicket.findUnique.bind(prisma.tripTicket);
const originalDateRead = prisma.tripDate.findFirst.bind(prisma.tripDate);
beforeEach(truncateAll);
afterEach(() => {
  prisma.tripTicket.findUnique = originalTicketRead;
  prisma.tripDate.findFirst = originalDateRead;
});
afterAll(() => prisma.$disconnect());

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function setup(twoOutings = false) {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(branch.id);
  const { user } = await createTestUser();
  const actor: AuthenticatedUser = {
    ...user,
    role: 'admin',
    branchId: branch.id
  };
  const ticket = await createTestTicket({
    branchId: branch.id,
    vehicleId: vehicle.id,
    driverId: driver.id
  });
  const now = Date.now();
  const outing = await prisma.tripDate.create({
    data: {
      tripTicketId: ticket.id,
      startTs: new Date(now - 3600000),
      endTs: new Date(now + 60000)
    }
  });
  if (twoOutings)
    await prisma.tripDate.create({
      data: {
        tripTicketId: ticket.id,
        startTs: new Date(now + 120000),
        endTs: new Date(now + 240000)
      }
    });
  const header = authHeader(user.id, user.email, 'admin', branch.id);
  return { ticket, outing, vehicle, actor, header };
}

async function state(ticketId: string, vehicleId: string) {
  const ticket = await prisma.tripTicket.findUniqueOrThrow({
    where: { id: ticketId },
    include: { dates: { orderBy: { startTs: 'asc' } } }
  });
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId }
  });
  return {
    ticket: ticket.status,
    outings: ticket.dates.map((d) => d.status),
    vehicle: vehicle.status
  };
}

it('whole-ticket cancellation must not overwrite a departure committed after its preflight read', async () => {
  const s = await setup();
  const loaded = deferred();
  const resume = deferred();
  let first = true;
  prisma.tripTicket.findUnique = (async (
    args: Parameters<typeof originalTicketRead>[0]
  ) => {
    const row = await originalTicketRead(args);
    if (first) {
      first = false;
      loaded.resolve();
      await resume.promise;
    }
    return row;
  }) as unknown as typeof prisma.tripTicket.findUnique;
  const cancellation = transitions
    .cancel(s.ticket.id, s.actor, 'Cancelled at gate')
    .then(
      () => true,
      () => false
    );
  await loaded.promise;
  try {
    await transitions.checkOut(s.ticket.id, s.actor, { dateId: s.outing.id });
  } finally {
    resume.resolve();
  }
  const accepted = await cancellation;
  const observed = await state(s.ticket.id, s.vehicle.id);
  const checkIn = await request(app)
    .post(`/api/trip-tickets/${s.ticket.id}/check-in`)
    .set('Authorization', s.header)
    .send({ dateId: s.outing.id });
  expect(accepted).toBe(false);
  expect(observed).toEqual({
    ticket: 'in_progress',
    outings: ['in_progress'],
    vehicle: 'on_trip'
  });
  expect(checkIn.status).toBe(200);
  expect(await state(s.ticket.id, s.vehicle.id)).toEqual({
    ticket: 'completed',
    outings: ['completed'],
    vehicle: 'available'
  });
});

it('single-outing cancellation must not erase an outing that departed after its preflight read', async () => {
  const s = await setup();
  const loaded = deferred();
  const resume = deferred();
  let first = true;
  prisma.tripDate.findFirst = (async (
    args: Parameters<typeof originalDateRead>[0]
  ) => {
    const row = await originalDateRead(args);
    if (first) {
      first = false;
      loaded.resolve();
      await resume.promise;
    }
    return row;
  }) as unknown as typeof prisma.tripDate.findFirst;
  const cancellation = transitions
    .cancelDate(s.ticket.id, s.outing.id, s.actor, 'Cancel outing')
    .then(
      () => true,
      () => false
    );
  await loaded.promise;
  try {
    await transitions.checkOut(s.ticket.id, s.actor, { dateId: s.outing.id });
  } finally {
    resume.resolve();
  }
  const accepted = await cancellation;
  const observed = await state(s.ticket.id, s.vehicle.id);
  const checkIn = await request(app)
    .post(`/api/trip-tickets/${s.ticket.id}/check-in`)
    .set('Authorization', s.header)
    .send({ dateId: s.outing.id });
  expect(accepted).toBe(false);
  expect(observed).toEqual({
    ticket: 'in_progress',
    outings: ['in_progress'],
    vehicle: 'on_trip'
  });
  expect(checkIn.status).toBe(200);
});

it('EVP approval must not resurrect a ticket cancelled after the approval preflight read', async () => {
  const s = await setup();
  await prisma.tripTicket.update({
    where: { id: s.ticket.id },
    data: { status: 'pending_fuel_allocation_approval' }
  });
  await prisma.fuelAllocation.create({
    data: {
      tripTicketId: s.ticket.id,
      vehicleId: s.vehicle.id,
      branchId: s.actor.branchId,
      requestedById: s.actor.id,
      liters: 10,
      fuelType: 'diesel',
      date: new Date(),
      purpose: 'Audit',
      tripTo: 'Audit',
      status: 'pending'
    }
  });
  const loaded = deferred();
  const resume = deferred();
  let first = true;
  prisma.tripTicket.findUnique = (async (
    args: Parameters<typeof originalTicketRead>[0]
  ) => {
    const row = await originalTicketRead(args);
    if (first) {
      first = false;
      loaded.resolve();
      await resume.promise;
    }
    return row;
  }) as unknown as typeof prisma.tripTicket.findUnique;
  const approval = transitions.approveEvp(s.ticket.id, s.actor).then(
    () => true,
    () => false
  );
  await loaded.promise;
  try {
    await transitions.cancel(s.ticket.id, s.actor, 'Cancelled before signoff');
  } finally {
    resume.resolve();
  }
  const accepted = await approval;
  const observed = await state(s.ticket.id, s.vehicle.id);
  const allocation = await prisma.fuelAllocation.findUniqueOrThrow({
    where: { tripTicketId: s.ticket.id }
  });
  expect(accepted).toBe(false);
  expect(observed).toEqual({
    ticket: 'cancelled',
    outings: ['cancelled'],
    vehicle: 'available'
  });
  expect(allocation.status).toBe('cancelled');
  expect(allocation.decidedById).toBeNull();
});

it('a return confirmation opened for outing one must not close a later outing', async () => {
  const s = await setup(true);
  await transitions.checkOut(s.ticket.id, s.actor, { dateId: s.outing.id });
  // Guard A now has the return modal open for outing one. Guard B returns
  // outing one, then records the next departure before Guard A confirms.
  await transitions.checkIn(s.ticket.id, s.actor, { dateId: s.outing.id });
  const later = await prisma.tripDate.findFirstOrThrow({
    where: { tripTicketId: s.ticket.id, status: 'scheduled' }
  });
  await transitions.checkOut(s.ticket.id, s.actor, { dateId: later.id });
  const before = await persistedState(s.ticket.id, s.vehicle.id);
  const staleReturn = await request(app)
    .post(`/api/trip-tickets/${s.ticket.id}/check-in`)
    .set('Authorization', s.header)
    .send({ dateId: s.outing.id });
  const observed = await state(s.ticket.id, s.vehicle.id);
  expect(staleReturn.status).toBe(409);
  expect(observed).toEqual({
    ticket: 'in_progress',
    outings: ['completed', 'in_progress'],
    vehicle: 'on_trip'
  });
  expect(await prisma.vehicleStatusAudit.count()).toBe(3);
  expect(await persistedState(s.ticket.id, s.vehicle.id)).toEqual(before);
});

async function persistedState(ticketId: string, vehicleId: string) {
  return {
    ticket: await prisma.tripTicket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { dates: { orderBy: { startTs: 'asc' } } }
    }),
    vehicle: await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId }
    }),
    audits: await prisma.vehicleStatusAudit.findMany({ orderBy: { id: 'asc' } })
  };
}

it('a delayed departure for a completed outing cannot release the next outing', async () => {
  const s = await setup(true);
  await transitions.checkOut(s.ticket.id, s.actor, { dateId: s.outing.id });
  await transitions.checkIn(s.ticket.id, s.actor, { dateId: s.outing.id });
  const before = await persistedState(s.ticket.id, s.vehicle.id);
  const staleDeparture = await request(app)
    .post(`/api/trip-tickets/${s.ticket.id}/check-out`)
    .set('Authorization', s.header)
    .send({ dateId: s.outing.id });
  expect(staleDeparture.status).toBe(409);
  expect(await persistedState(s.ticket.id, s.vehicle.id)).toEqual(before);
});

it.each(['check-out', 'check-in'])(
  '%s rejects a missing outing ID before any writes',
  async (action) => {
    const s = await setup();
    if (action === 'check-in')
      await transitions.checkOut(s.ticket.id, s.actor, { dateId: s.outing.id });
    const before = await persistedState(s.ticket.id, s.vehicle.id);
    const result = await request(app)
      .post(`/api/trip-tickets/${s.ticket.id}/${action}`)
      .set('Authorization', s.header)
      .send({});
    expect(result.status).toBe(400);
    expect(await persistedState(s.ticket.id, s.vehicle.id)).toEqual(before);
  }
);

it.each(['check-out', 'check-in'])(
  '%s rejects a foreign outing ID without writes',
  async (action) => {
    const s = await setup();
    const otherTicket = await createTestTicket({
      branchId: s.actor.branchId!,
      driverId: (
        await prisma.tripTicket.findUniqueOrThrow({
          where: { id: s.ticket.id }
        })
      ).driverId,
      vehicleId: s.vehicle.id
    });
    const foreign = await prisma.tripDate.create({
      data: {
        tripTicketId: otherTicket.id,
        startTs: new Date(),
        endTs: new Date(Date.now() + 3600000)
      }
    });
    if (action === 'check-in')
      await transitions.checkOut(s.ticket.id, s.actor, { dateId: s.outing.id });
    const before = await persistedState(s.ticket.id, s.vehicle.id);
    const result = await request(app)
      .post(`/api/trip-tickets/${s.ticket.id}/${action}`)
      .set('Authorization', s.header)
      .send({ dateId: foreign.id });
    expect(result.status).toBe(409);
    expect(await persistedState(s.ticket.id, s.vehicle.id)).toEqual(before);
    expect(
      (await prisma.tripDate.findUniqueOrThrow({ where: { id: foreign.id } }))
        .status
    ).toBe('scheduled');
  }
);

it.each(['approve', 'disapprove'])(
  '%s cannot overwrite a cancellation committed after its preflight',
  async (action) => {
    const s = await setup();
    await prisma.tripTicket.update({
      where: { id: s.ticket.id },
      data: { status: 'pending_admin_approval' }
    });
    const loaded = deferred();
    const resume = deferred();
    let first = true;
    prisma.tripTicket.findUnique = (async (
      args: Parameters<typeof originalTicketRead>[0]
    ) => {
      const row = await originalTicketRead(args);
      if (first) {
        first = false;
        loaded.resolve();
        await resume.promise;
      }
      return row;
    }) as unknown as typeof prisma.tripTicket.findUnique;
    const decision = (
      action === 'approve'
        ? transitions.approve(s.ticket.id, s.actor, {
            liters: 10,
            fuelType: 'diesel',
            date: new Date(),
            purpose: 'Test',
            tripTo: 'Test'
          })
        : transitions.disapprove(s.ticket.id, s.actor, 'Declined')
    ).then(
      () => true,
      () => false
    );
    await loaded.promise;
    try {
      await transitions.cancel(
        s.ticket.id,
        s.actor,
        'Cancelled before decision'
      );
    } finally {
      resume.resolve();
    }
    expect(await decision).toBe(false);
    expect(await state(s.ticket.id, s.vehicle.id)).toEqual({
      ticket: 'cancelled',
      outings: ['cancelled'],
      vehicle: 'available'
    });
    expect(await prisma.fuelAllocation.count()).toBe(0);
  }
);
