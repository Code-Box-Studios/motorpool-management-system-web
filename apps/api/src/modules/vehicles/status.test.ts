import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import {
  createTestBranch,
  createTestDriver,
  createTestTicket
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import { changeVehicleStatus } from './status.js';

async function makeVehicle(
  status: 'available' | 'on_trip' | 'under_maintenance' = 'available'
) {
  const branch = await createTestBranch();
  return prisma.vehicle.create({
    data: {
      make: 'T',
      model: 'H',
      year: 2021,
      vin: 'V',
      licensePlate: 'P',
      capacity: 5,
      fuelType: 'diesel',
      mileage: 1000,
      status,
      branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-01-01')
    }
  });
}

describe('changeVehicleStatus expectedFrom', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it.each(['repair', 'outing'] as const)(
    'skips a mismatched manual Available change before checking a live %s hold',
    async (hold) => {
      const vehicle = await makeVehicle(
        hold === 'repair' ? 'under_maintenance' : 'on_trip'
      );
      if (hold === 'repair') {
        await prisma.jobOrder.create({
          data: {
            branchId: vehicle.branchId!,
            vehicleId: vehicle.id,
            status: 'assigned_mechanic'
          }
        });
      } else {
        const driver = await createTestDriver(vehicle.branchId!);
        const ticket = await createTestTicket({
          branchId: vehicle.branchId!,
          vehicleId: vehicle.id,
          driverId: driver.id,
          status: 'in_progress'
        });
        await prisma.tripDate.create({
          data: {
            tripTicketId: ticket.id,
            startTs: new Date(Date.now() - 3600000),
            endTs: new Date(Date.now() + 3600000),
            status: 'in_progress'
          }
        });
      }
      const flipped = await prisma.$transaction((tx) =>
        changeVehicleStatus(tx, vehicle.id, 'available', {
          source: 'manual_edit',
          expectedFrom: 'available'
        })
      );
      expect(flipped).toBe(false);
      expect(
        await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })
      ).toMatchObject({ status: vehicle.status });
      expect(
        await prisma.vehicleStatusAudit.count({
          where: { vehicleId: vehicle.id }
        })
      ).toBe(0);
    }
  );

  it('flips + audits when the current status matches expectedFrom', async () => {
    const v = await makeVehicle('available');
    const flipped = await prisma.$transaction((tx) =>
      changeVehicleStatus(tx, v.id, 'on_trip', {
        source: 'trip_check_out',
        expectedFrom: 'available'
      })
    );
    expect(flipped).toBe(true);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status
    ).toBe('on_trip');
    expect(
      await prisma.vehicleStatusAudit.count({ where: { vehicleId: v.id } })
    ).toBe(1);
  });

  it('skips (no flip, no audit) and returns false when status is NOT in expectedFrom', async () => {
    const v = await makeVehicle('under_maintenance'); // not 'available'
    const flipped = await prisma.$transaction((tx) =>
      changeVehicleStatus(tx, v.id, 'on_trip', {
        source: 'trip_check_out',
        expectedFrom: 'available'
      })
    );
    expect(flipped).toBe(false);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status
    ).toBe('under_maintenance');
    expect(
      await prisma.vehicleStatusAudit.count({ where: { vehicleId: v.id } })
    ).toBe(0);
  });

  it('throws 404 for a missing vehicle', async () => {
    await expect(
      prisma.$transaction((tx) =>
        changeVehicleStatus(
          tx,
          '00000000-0000-4000-8000-00000000dead',
          'on_trip',
          {
            source: 'trip_check_out',
            expectedFrom: 'available'
          }
        )
      )
    ).rejects.toThrow('Vehicle not found');
  });
});
