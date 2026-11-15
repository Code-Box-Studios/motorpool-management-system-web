import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import * as events from './events.js';
import { notify } from './service.js';

const app = createApp();
const findUsers = prisma.user.findMany;
const findDriver = prisma.driver.findUnique;
const countOutings = prisma.tripDate.count;

async function scaffold() {
  const branch = await createTestBranch();
  const { user: admin } = await createTestUser();
  const { user: requester } = await createTestUser({
    role: 'requester',
    email: 'requester-notification-failure@test.local'
  });
  const driver = await createTestDriver(branch.id);
  const vehicle = await createTestVehicle(branch.id);
  const created = await createTestTicket({
    branchId: branch.id,
    vehicleId: vehicle.id,
    driverId: driver.id,
    status: 'pending_admin_approval'
  });
  const ticket = await prisma.tripTicket.update({
    where: { id: created.id },
    data: { requestedById: requester.id }
  });
  const outing = await prisma.tripDate.create({
    data: {
      tripTicketId: ticket.id,
      startTs: new Date('2026-11-20T00:00:00Z'),
      endTs: new Date('2026-11-20T06:00:00Z')
    }
  });
  const order = await prisma.jobOrder.create({
    data: {
      branchId: branch.id,
      vehicleId: vehicle.id,
      requestedById: requester.id,
      assignedMechanicId: driver.id,
      status: 'pending'
    }
  });
  const actor = {
    id: admin.id,
    email: admin.email,
    role: 'admin',
    branchId: branch.id
  };
  return {
    branch,
    admin,
    requester,
    driver,
    vehicle,
    ticket,
    outing,
    order,
    actor
  };
}

describe('best-effort notification preparation', () => {
  beforeEach(truncateAll);
  afterEach(() => {
    vi.restoreAllMocks();
    prisma.user.findMany = findUsers;
    prisma.driver.findUnique = findDriver;
    prisma.tripDate.count = countOutings;
  });
  afterAll(() => prisma.$disconnect());

  it('returns successful approval after an EVP recipient lookup fails, with one committed allocation and a rejected retry', async () => {
    const s = await scaffold();
    const failure = new Error('Injected EVP recipient lookup failure');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    prisma.user.findMany = ((args) => {
      if (args?.where?.userRole?.role?.name === 'evp_operations') {
        throw failure;
      }
      return findUsers(args);
    }) as typeof prisma.user.findMany;
    const fuel = {
      liters: 40,
      fuelType: 'diesel',
      date: '2026-11-20',
      purpose: 'Delivery',
      tripTo: 'Site A'
    };
    const header = authHeader(s.admin.id, s.admin.email, 'admin');
    const approved = await request(app)
      .post(`/api/trip-tickets/${s.ticket.id}/approve`)
      .set('Authorization', header)
      .send(fuel);
    prisma.user.findMany = findUsers;

    const saved = await prisma.tripTicket.findUniqueOrThrow({
      where: { id: s.ticket.id }
    });
    const allocations = await prisma.fuelAllocation.findMany({
      where: { tripTicketId: s.ticket.id }
    });
    const retried = await request(app)
      .post(`/api/trip-tickets/${s.ticket.id}/approve`)
      .set('Authorization', header)
      .send(fuel);

    expect(saved.status).toBe('pending_fuel_allocation_approval');
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({ liters: 40, status: 'pending' });
    expect(retried.status).toBe(409);
    expect(retried.body.error.code).toBe('INVALID_TRANSITION');
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('pending_fuel_allocation_approval');
    expect(log.mock.calls.some((call) => call[1] === failure)).toBe(true);
    // An unavailable desk must not suppress an independent requester fan-out.
    expect(
      await prisma.notification.findMany({ where: { userId: s.requester.id } })
    ).toMatchObject([
      { type: 'trip_approved', linkTo: `/trip-tickets/${s.ticket.id}` }
    ]);
  });

  it.each([
    [
      'trip submission',
      'admin',
      (s) => events.tripSubmitted(s.ticket, s.actor)
    ],
    [
      'trip decline from EVP queue',
      'evp_operations',
      (s) =>
        events.tripDisapproved(
          { ...s.ticket, status: 'pending_fuel_allocation_approval' },
          s.actor,
          'Budget'
        )
    ],
    [
      'trip cancellation',
      'admin',
      (s) => events.tripCancelled(s.ticket, s.actor, 'Venue closed')
    ],
    [
      'outing cancellation',
      'admin',
      (s) =>
        events.tripDateCancelled(s.ticket, s.outing, s.actor, 'Venue closed')
    ],
    [
      'gate check-out',
      'admin',
      (s) => events.tripCheckedOut(s.ticket, s.outing, s.actor)
    ],
    [
      'gate check-in',
      'admin',
      (s) => events.tripCheckedIn(s.ticket, s.outing, s.actor, true)
    ],
    [
      'repair submission',
      'admin',
      (s) => events.jobOrderSubmitted(s.order, s.actor)
    ],
    [
      'mechanic assignment',
      'evp_operations',
      (s) => events.jobOrderNoted(s.order, s.actor, s.driver.id)
    ],
    [
      'repair approval',
      'admin',
      (s) => events.jobOrderApproved(s.order, s.actor)
    ],
    [
      'repair completion',
      'admin',
      (s) => events.jobOrderCompleted(s.order, s.actor)
    ]
  ] satisfies [
    string,
    string,
    (s: Awaited<ReturnType<typeof scaffold>>) => Promise<void>
  ][])(
    'keeps %s successful when its notification role lookup fails',
    async (_name, failedRole, send) => {
      const s = await scaffold();
      const failure = new Error(
        `Injected ${failedRole} recipient lookup failure`
      );
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      prisma.user.findMany = ((args) => {
        if (args?.where?.userRole?.role?.name === failedRole) throw failure;
        return findUsers(args);
      }) as typeof prisma.user.findMany;

      await expect(send(s)).resolves.toBeUndefined();
      expect(log.mock.calls.some((call) => call[1] === failure)).toBe(true);
    }
  );

  it.each(['driver', 'outing count'] as const)(
    'keeps EVP approval notification preparation best-effort when the %s lookup fails',
    async (failedLookup) => {
      const s = await scaffold();
      const failure = new Error(`Injected ${failedLookup} lookup failure`);
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      if (failedLookup === 'driver') {
        prisma.driver.findUnique = (() => {
          throw failure;
        }) as typeof prisma.driver.findUnique;
      } else {
        prisma.tripDate.count = (() => {
          throw failure;
        }) as typeof prisma.tripDate.count;
      }

      await expect(
        events.tripApprovedByEvp(s.ticket, s.actor)
      ).resolves.toBeUndefined();
      expect(log.mock.calls.some((call) => call[1] === failure)).toBe(true);
      expect(
        await prisma.notification.findMany({
          where: { userId: s.requester.id }
        })
      ).toMatchObject([{ type: 'trip_approved' }]);
    }
  );

  it('rolls back the owning transaction when its atomic notification preparation fails', async () => {
    const s = await scaffold();
    const failure = new Error('Atomic notification preparation failed');
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.tripTicket.update({
          where: { id: s.ticket.id },
          data: { status: 'approved' }
        });
        await notify(async () => {
          throw failure;
        }, tx);
      })
    ).rejects.toThrow(failure);

    expect(
      (
        await prisma.tripTicket.findUniqueOrThrow({
          where: { id: s.ticket.id }
        })
      ).status
    ).toBe('pending_admin_approval');
    expect(await prisma.notification.count()).toBe(0);
  });

  it('rolls back the owning transaction when an atomic notification cannot be written', async () => {
    const s = await scaffold();
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.tripTicket.update({
          where: { id: s.ticket.id },
          data: { status: 'approved' }
        });
        await notify(
          {
            userIds: ['00000000-0000-4000-8000-000000000001'],
            type: 'trip_approved',
            title: 'An atomic event'
          },
          tx
        );
      })
    ).rejects.toMatchObject({ code: 'P2003' });

    expect(
      (
        await prisma.tripTicket.findUniqueOrThrow({
          where: { id: s.ticket.id }
        })
      ).status
    ).toBe('pending_admin_approval');
    expect(await prisma.notification.count()).toBe(0);
  });
});
