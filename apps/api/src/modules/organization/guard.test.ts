import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
import { branchBlockers, officeBlockers, officeHeadBlockers } from './guard.js';

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
    await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      officeId: office.id,
      status: 'in_progress'
    });
    expect(names(await officeBlockers(office.id))).toEqual(['tripTickets']);
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
  });
});
