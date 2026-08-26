import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  createTestBranch,
  createTestDriver,
  createTestOffice,
  createTestOfficeHead,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import {
  assertArchivable,
  branchBlockers,
  officeBlockers,
  officeHeadBlockers
} from './guard.js';

// Blockers are returned as a list; tests care about which resources appear.
function names(blockers: { resource: string }[]) {
  return blockers.map((b) => b.resource).sort();
}

describe('organization archive guard', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('reports no blockers for an untouched branch', async () => {
    const branch = await createTestBranch('Empty');
    expect(await branchBlockers(branch.id)).toEqual([]);
  });

  it('blocks on a vehicle, whatever its status', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: 'out_of_service' }
    });
    // A van is a physical object. An out-of-service one is still parked at the
    // depot, so it blocks where an inactive DRIVER would not.
    expect(names(await branchBlockers(branch.id))).toEqual(['vehicles']);
  });

  it('blocks on an active driver but NOT an inactive one', async () => {
    const branch = await createTestBranch();
    await createTestDriver(branch.id, 'active', 'active@test.local');
    expect(names(await branchBlockers(branch.id))).toContain('drivers');

    await prisma.driver.deleteMany({});
    await createTestDriver(branch.id, 'inactive', 'gone@test.local');
    expect(await branchBlockers(branch.id)).toEqual([]);
  });

  it('blocks on an active user but NOT an inactive one', async () => {
    const branch = await createTestBranch();
    await createTestUser({ email: 'live@test.local', branchId: branch.id });
    expect(names(await branchBlockers(branch.id))).toContain('users');

    await prisma.user.updateMany({ data: { status: 'inactive' } });
    expect(await branchBlockers(branch.id)).toEqual([]);
  });

  it('blocks on an ACTIVE child office but NOT an archived one', async () => {
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    expect(names(await branchBlockers(branch.id))).toContain(
      'departmentOffices'
    );

    // The load-bearing case. Offices can only be archived, never deleted, so
    // if an archived office still blocked its branch, no branch could ever be
    // emptied and archiving would deadlock on its first real use.
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { archivedAt: new Date() }
    });
    expect(await branchBlockers(branch.id)).toEqual([]);
  });

  it('blocks on an ACTIVE child office head but NOT an archived one', async () => {
    const branch = await createTestBranch();
    const head = await createTestOfficeHead(branch.id);
    expect(names(await branchBlockers(branch.id))).toContain('officeHeads');

    await prisma.officeHead.update({
      where: { id: head.id },
      data: { archivedAt: new Date() }
    });
    expect(await branchBlockers(branch.id)).toEqual([]);
  });

  it('blocks on a live trip ticket but NOT a completed one', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id, 'inactive');
    const ticket = await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      status: 'approved'
    });
    expect(names(await branchBlockers(branch.id))).toContain('tripTickets');

    // History must never block: a branch with hundreds of finished trips has
    // to stay closable.
    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { status: 'completed' }
    });
    expect(names(await branchBlockers(branch.id))).not.toContain('tripTickets');
  });

  // I-2: `completed` was the only history status ever exercised. If
  // LIVE_TRIP_STATUSES quietly grew `cancelled`, nothing above would fail.
  it('does not block on a cancelled or a disapproved trip ticket either', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id, 'inactive');
    const ticket = await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      status: 'cancelled'
    });
    expect(names(await branchBlockers(branch.id))).not.toContain('tripTickets');

    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { status: 'disapproved' }
    });
    expect(names(await branchBlockers(branch.id))).not.toContain('tripTickets');
  });

  it('blocks on an open job order but NOT a repaired one', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const order = await prisma.jobOrder.create({
      data: { vehicleId: vehicle.id, branchId: branch.id, status: 'pending' }
    });
    expect(names(await branchBlockers(branch.id))).toContain('jobOrders');

    await prisma.jobOrder.update({
      where: { id: order.id },
      data: { status: 'repaired' }
    });
    expect(names(await branchBlockers(branch.id))).not.toContain('jobOrders');
  });

  it('counts each blocker so the dialog can name numbers', async () => {
    const branch = await createTestBranch();
    await createTestVehicle(branch.id, { vin: 'V1', licensePlate: 'P1' });
    await createTestVehicle(branch.id, { vin: 'V2', licensePlate: 'P2' });
    const blockers = await branchBlockers(branch.id);
    expect(blockers).toContainEqual({ resource: 'vehicles', count: 2 });
  });

  it('blocks an office on its active heads and live tickets only', async () => {
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id);
    expect(names(await officeBlockers(office.id))).toEqual(['officeHeads']);

    await prisma.officeHead.update({
      where: { id: head.id },
      data: { archivedAt: new Date() }
    });
    expect(await officeBlockers(office.id)).toEqual([]);

    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id, 'inactive');
    const ticket = await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      officeId: office.id,
      status: 'in_progress'
    });
    expect(names(await officeBlockers(office.id))).toEqual(['tripTickets']);

    // I-1: history must release an office too, not just a branch.
    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { status: 'completed' }
    });
    expect(await officeBlockers(office.id)).toEqual([]);
  });

  it('blocks an office head on the office it heads and live tickets only', async () => {
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id);
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { headId: head.id }
    });
    expect(names(await officeHeadBlockers(head.id))).toEqual([
      'departmentOffices'
    ]);

    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { archivedAt: new Date() }
    });
    expect(await officeHeadBlockers(head.id)).toEqual([]);

    // C-1 / I-1: the tripTickets side of officeHeadBlockers had zero
    // coverage — delete guard.ts's officeHeadId ticket check, or drop its
    // status filter, and every assertion above still passes. A live ticket
    // signed by this head must block; completing it must release the head.
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id, 'inactive');
    const ticket = await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      officeHeadId: head.id,
      status: 'in_progress'
    });
    expect(names(await officeHeadBlockers(head.id))).toEqual(['tripTickets']);

    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { status: 'completed' }
    });
    expect(await officeHeadBlockers(head.id)).toEqual([]);
  });

  it("does not count a sibling branch's vehicle, driver, office, or head", async () => {
    const branchA = await createTestBranch('Branch A');
    const branchB = await createTestBranch('Branch B');

    // I-5: every one of branchBlockers' checks is scoped by branchId. Delete
    // any `branchId: id` filter and this stays green today only because
    // every other test uses exactly one branch — a sibling branch full of
    // live resources must never leak into branchA's count.
    await createTestVehicle(branchB.id, {
      vin: 'SIB-VIN',
      licensePlate: 'SIB-1'
    });
    await createTestDriver(branchB.id, 'active', 'sibling-driver@test.local');
    await createTestOffice(branchB.id, 'Sibling Office');
    await createTestOfficeHead(branchB.id, null, 'Sibling Head');

    expect(await branchBlockers(branchA.id)).toEqual([]);
  });

  it("does not count a sibling office's head in officeBlockers", async () => {
    const branch = await createTestBranch();
    const officeA = await createTestOffice(branch.id, 'Office A');
    const officeB = await createTestOffice(branch.id, 'Office B');
    // Head belongs to officeB, not officeA — officeBlockers(officeA.id) must
    // not count it. Removing the `officeId: id` filter in guard.ts would
    // make this pass the officeHeads check for every office in the branch.
    await createTestOfficeHead(branch.id, officeB.id, 'Head Of B');

    expect(await officeBlockers(officeA.id)).toEqual([]);
  });

  it("does not count a sibling head's office in officeHeadBlockers", async () => {
    const branch = await createTestBranch();
    const officeA = await createTestOffice(branch.id, 'Office A');
    const headA = await createTestOfficeHead(branch.id, null, 'Head A');
    const headB = await createTestOfficeHead(branch.id, null, 'Head B');
    // officeA is headed by headB, not headA — officeHeadBlockers(headA.id)
    // must not count it. Removing the `headId: id` filter in guard.ts would
    // make this pass the departmentOffices check for any head in the branch.
    await prisma.departmentOffice.update({
      where: { id: officeA.id },
      data: { headId: headB.id }
    });

    expect(await officeHeadBlockers(headA.id)).toEqual([]);
  });
});

describe('assertArchivable', () => {
  it('returns silently when there are no blockers', () => {
    expect(() => assertArchivable('Branch', [])).not.toThrow();
  });

  // I-3: assertArchivable is the exported contract Tasks 3-4 and the web
  // dialog depend on — statusCode, code, and details.blockers must be pinned
  // here, not left to whoever writes the first caller.
  it('throws a 409 IN_USE AppError carrying the blockers list intact', () => {
    const blockers = [
      { resource: 'vehicles', count: 2 },
      { resource: 'tripTickets', count: 1 }
    ];

    let caught: unknown;
    try {
      assertArchivable('Branch', blockers);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AppError);
    const err = caught as AppError;
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('IN_USE');
    expect(err.message).toBe('Branch is still in use');
    expect(err.details).toEqual({ blockers });
  });
});
