import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import { createTestBranch, createTestUser } from '../../test/factories.js';
import { completeRepair } from './transitions.js';
import * as tracking from '../maintenance/tracking.service.js';

describe('repair datetime storage', () => {
  beforeEach(truncateAll);
  afterEach(() => vi.useRealTimers());
  afterAll(() => prisma.$disconnect());

  it.each([
    'incidentDate',
    'dateOfRequest',
    'targetDate',
    'actualDateOfRelease'
  ] as const)(
    'retains the exact %s instant across the Philippine midnight boundary',
    async (field) => {
      const branch = await createTestBranch();
      const vehicle = await prisma.vehicle.create({
        data: {
          make: 'Clock',
          model: 'Van',
          year: 2026,
          vin: 'REPAIR-CLOCK',
          licensePlate: 'CLOCK',
          capacity: 8,
          fuelType: 'diesel',
          mileage: 1000,
          branchId: branch.id,
          insuranceExpiry: new Date('2027-01-01'),
          registrationExpiry: new Date('2027-01-01')
        }
      });
      const instant = new Date('2026-11-13T00:30:12.345+08:00');
      const order = await prisma.jobOrder.create({
        data: {
          vehicleId: vehicle.id,
          branchId: branch.id,
          [field]: instant
        }
      });
      const read = await prisma.jobOrder.findUniqueOrThrow({
        where: { id: order.id }
      });
      expect(read[field]?.toISOString()).toBe(instant.toISOString());
    }
  );

  it('records the Philippine release day in calendar-only maintenance history', async () => {
    const branch = await createTestBranch();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'Clock',
        model: 'Van',
        year: 2026,
        vin: 'REPAIR-RELEASE',
        licensePlate: 'RELEASE',
        capacity: 8,
        fuelType: 'diesel',
        mileage: 1000,
        status: 'under_maintenance',
        branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    const { user } = await createTestUser({
      role: 'admin',
      email: 'release-clock@test.local'
    });
    const order = await prisma.jobOrder.create({
      data: {
        branchId: branch.id,
        vehicleId: vehicle.id,
        status: 'ongoing_repair'
      }
    });
    await completeRepair(
      order.id,
      { id: user.id, email: user.email, role: 'admin', branchId: branch.id },
      {
        repairDone: 'simple',
        completedMileage: 1000,
        actualDateOfRelease: new Date('2026-11-13T00:30:00+08:00')
      }
    );
    const history = await prisma.maintenance.findFirstOrThrow({
      where: { vehicleId: vehicle.id }
    });
    expect(history.date.toISOString()).toBe('2026-11-13T00:00:00.000Z');
  });

  it('anchors assigned and completed monthly tasks to the Philippine calendar day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T00:30:00+08:00'));
    const branch = await createTestBranch();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'Clock',
        model: 'Van',
        year: 2026,
        vin: 'TRACK-CLOCK',
        licensePlate: 'TRACK',
        capacity: 8,
        fuelType: 'diesel',
        mileage: 1000,
        branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    const standard = await prisma.maintenanceStandard.create({
      data: {
        name: 'Monthly',
        scheduleItems: {
          create: {
            taskName: 'Inspect',
            intervalType: 'time',
            intervalMonths: 1
          }
        }
      }
    });
    const { user } = await createTestUser({
      role: 'admin',
      email: 'tracking-clock@test.local'
    });
    const assigned = await tracking.assign(vehicle.id, standard.id);
    expect(assigned.data).toHaveLength(1);
    expect(assigned.data[0]!.nextDueDate?.toISOString()).toBe(
      '2026-12-13T00:00:00.000Z'
    );
    const completed = await tracking.complete(assigned.data[0]!.id, user.id, {
      completedMileage: 1000
    });
    expect(completed.lastCompletedDate?.toISOString()).toBe(
      '2026-11-13T00:00:00.000Z'
    );
    expect(completed.nextDueDate?.toISOString()).toBe(
      '2026-12-13T00:00:00.000Z'
    );
    const history = await prisma.maintenance.findFirstOrThrow({
      where: { vehicleId: vehicle.id }
    });
    expect(history.date.toISOString()).toBe('2026-11-13T00:00:00.000Z');
  });
});
