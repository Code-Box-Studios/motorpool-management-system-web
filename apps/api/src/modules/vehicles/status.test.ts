import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { createTestBranch } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import { changeVehicleStatus } from './status.js';

async function makeVehicle(status: 'available' | 'on_trip' | 'under_maintenance' = 'available') {
  const branch = await createTestBranch();
  return prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V', licensePlate: 'P', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
}

describe('changeVehicleStatus expectedFrom', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('flips + audits when the current status matches expectedFrom', async () => {
    const v = await makeVehicle('available');
    const flipped = await prisma.$transaction((tx) =>
      changeVehicleStatus(tx, v.id, 'on_trip', { source: 'trip_check_out', expectedFrom: 'available' })
    );
    expect(flipped).toBe(true);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('on_trip');
    expect(await prisma.vehicleStatusAudit.count({ where: { vehicleId: v.id } })).toBe(1);
  });

  it('skips (no flip, no audit) and returns false when status is NOT in expectedFrom', async () => {
    const v = await makeVehicle('under_maintenance'); // not 'available'
    const flipped = await prisma.$transaction((tx) =>
      changeVehicleStatus(tx, v.id, 'on_trip', { source: 'trip_check_out', expectedFrom: 'available' })
    );
    expect(flipped).toBe(false);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('under_maintenance');
    expect(await prisma.vehicleStatusAudit.count({ where: { vehicleId: v.id } })).toBe(0);
  });

  it('throws 404 for a missing vehicle', async () => {
    await expect(
      prisma.$transaction((tx) =>
        changeVehicleStatus(tx, '00000000-0000-4000-8000-00000000dead', 'on_trip', {
          source: 'trip_check_out',
          expectedFrom: 'available'
        })
      )
    ).rejects.toThrow('Vehicle not found');
  });
});
