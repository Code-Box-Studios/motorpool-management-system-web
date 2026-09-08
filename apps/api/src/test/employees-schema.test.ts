import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import {
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestTicket,
  createTestVehicle
} from './factories.js';
import { truncateAll } from './db.js';

// Schema-level guarantees only — nothing here goes through HTTP. These are the
// invariants the migration is responsible for, and every later task assumes
// them: the join's composite key, its asymmetric cascade, and the deliberate
// absence of name uniqueness.
describe('employees and trip guides schema', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  async function branchWithTicket() {
    const branch = await createTestBranch('Guides Branch');
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id);
    const ticket = await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id
    });
    return { branch, ticket };
  }

  it('creates an employee scoped to a branch, active by default', async () => {
    const branch = await createTestBranch('Guides Branch');
    const employee = await createTestEmployee(branch.id, 'Ana Bautista');

    expect(employee.branchId).toBe(branch.id);
    expect(employee.position).toBeNull();
    expect(employee.phone).toBeNull();
    expect(employee.archivedAt).toBeNull();
  });

  it('allows two employees with the same name in one branch', async () => {
    const branch = await createTestBranch('Guides Branch');
    await createTestEmployee(branch.id, 'Juan Cruz');
    await createTestEmployee(branch.id, 'Juan Cruz');

    expect(await prisma.employee.count({ where: { name: 'Juan Cruz' } })).toBe(
      2
    );
  });

  it('refuses the same employee twice on one ticket', async () => {
    const { branch, ticket } = await branchWithTicket();
    const employee = await createTestEmployee(branch.id);

    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, employeeId: employee.id }
    });

    await expect(
      prisma.tripTicketEmployee.create({
        data: { tripTicketId: ticket.id, employeeId: employee.id }
      })
    ).rejects.toThrow();
  });

  it('deletes guide links with the ticket but refuses to delete a guide', async () => {
    const { branch, ticket } = await branchWithTicket();
    const employee = await createTestEmployee(branch.id);
    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, employeeId: employee.id }
    });

    // Restrict toward the reference row: someone who has ever guided a trip is
    // not silently deletable.
    await expect(
      prisma.employee.delete({ where: { id: employee.id } })
    ).rejects.toThrow();

    // Cascade from the owning parent: deleting the ticket takes its links.
    await prisma.tripTicket.delete({ where: { id: ticket.id } });
    expect(await prisma.tripTicketEmployee.count()).toBe(0);
    expect(await prisma.employee.count()).toBe(1);
  });

  it('truncateAll clears employees and their guide links', async () => {
    const { branch, ticket } = await branchWithTicket();
    const employee = await createTestEmployee(branch.id);
    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, employeeId: employee.id }
    });

    await truncateAll();
    expect(await prisma.employee.count()).toBe(0);
    expect(await prisma.tripTicketEmployee.count()).toBe(0);
  });
});
