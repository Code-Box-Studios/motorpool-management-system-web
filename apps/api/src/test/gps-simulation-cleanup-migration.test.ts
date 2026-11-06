import { readFile } from 'node:fs/promises';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { truncateAll } from './db.js';
import { createTestBranch } from './factories.js';

const migration = new URL(
  '../../prisma/migrations/20261106083000_remove_simulated_gps_history/migration.sql',
  import.meta.url
);

async function runCleanup() {
  let sql: string;
  try {
    sql = await readFile(migration, 'utf8');
  } catch (error) {
    // With no migration, history remains untouched and the behavior assertions fail.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const statements = sql
    .replace(/^--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && s !== 'BEGIN' && s !== 'COMMIT');
  await prisma.$transaction(
    async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    },
    { timeout: 15_000 }
  );
}

async function vehicle() {
  const branch = await createTestBranch();
  return prisma.vehicle.create({
    data: {
      make: 'Toyota',
      model: 'Hiace',
      year: 2021,
      vin: 'CLEANUP',
      licensePlate: 'CLEANUP',
      capacity: 5,
      fuelType: 'diesel',
      mileage: 1000,
      status: 'available',
      branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-01-01'),
      latitude: 14.5995,
      longitude: 120.9842,
      lastLocationUpdate: new Date('2026-07-01T08:00:00Z')
    }
  });
}

const seed = {
  latitude: 14.5995,
  longitude: 120.9842,
  speed: 30,
  heading: 90,
  engineStatus: 'on',
  createdAt: new Date('2026-07-01T08:00:00Z')
};

describe('simulated GPS history cleanup migration', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('restricts recovery backups with row-level security and no public access', async () => {
    const [table] = await prisma.$queryRaw<
      Array<{ protected: boolean; public_access: boolean }>
    >`
      SELECT c.relrowsecurity AS protected,
        EXISTS (
          SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) access
          WHERE access.grantee = 0
        ) AS public_access
      FROM pg_class c WHERE c.oid = 'gps_simulation_cleanup_backups'::regclass
    `;
    expect(table?.protected).toBe(true);
    expect(table?.public_access).toBe(false);
  });

  it('backs up exact simulator matches while retaining real and cutoff-protected history', async () => {
    const v = await vehicle();
    const removed = await Promise.all([
      prisma.gpsData.create({ data: { ...seed, vehicleId: v.id } }),
      prisma.gpsData.create({
        data: {
          ...seed,
          vehicleId: v.id,
          latitude: 7.0731,
          longitude: 125.6128,
          speed: 41.25,
          heading: 44.781024213702324,
          createdAt: new Date('2026-09-16T05:40:00Z')
        }
      }),
      prisma.gpsData.create({
        data: {
          ...seed,
          vehicleId: v.id,
          latitude: 7.0731,
          longitude: 125.6128,
          speed: 37.04,
          heading: 90,
          createdAt: new Date('2026-09-16T05:44:19Z')
        }
      })
    ]);
    const retained = await Promise.all([
      prisma.gpsData.create({
        data: {
          ...seed,
          vehicleId: v.id,
          latitude: 1.390945,
          longitude: 123.761315,
          speed: 0,
          heading: 0,
          createdAt: new Date('2026-11-06T06:10:48Z')
        }
      }),
      prisma.gpsData.create({
        data: {
          ...seed,
          vehicleId: v.id,
          latitude: 7.0731,
          longitude: 125.6128,
          speed: 37.04,
          heading: 90,
          createdAt: new Date('2026-11-06T05:36:19Z')
        }
      }),
      prisma.gpsData.create({
        data: {
          ...seed,
          vehicleId: v.id,
          latitude: 2,
          longitude: 3,
          createdAt: new Date('2026-09-16T05:44:19Z')
        }
      })
    ]);
    await runCleanup();
    const points = await prisma.gpsData.findMany({
      where: { vehicleId: v.id }
    });
    expect(points.map((p) => p.id).sort()).toEqual(
      retained.map((p) => p.id).sort()
    );
    const backups = await prisma.$queryRaw<
      Array<{ gps_id: string; point: { latitude: number } }>
    >`
      SELECT gps_id, point FROM gps_simulation_cleanup_backups
    `;
    expect(backups.map((b) => b.gps_id).sort()).toEqual(
      removed.map((p) => p.id).sort()
    );
    const updated = await prisma.vehicle.findUniqueOrThrow({
      where: { id: v.id }
    });
    expect(updated.latitude).toBeCloseTo(1.390945);
    expect(updated.longitude).toBeCloseTo(123.761315);
    expect(updated.lastLocationUpdate?.toISOString()).toBe(
      '2026-11-06T06:10:48.000Z'
    );
  });

  it('clears a fabricated cached location when no real history remains and is safe to repeat', async () => {
    const v = await vehicle();
    const point = await prisma.gpsData.create({
      data: { ...seed, vehicleId: v.id }
    });
    await runCleanup();
    expect(await prisma.gpsData.count({ where: { vehicleId: v.id } })).toBe(0);
    const updated = await prisma.vehicle.findUniqueOrThrow({
      where: { id: v.id }
    });
    expect(updated.latitude).toBeNull();
    expect(updated.longitude).toBeNull();
    expect(updated.lastLocationUpdate).toBeNull();
    await runCleanup();
    const backups = await prisma.$queryRaw<
      Array<{ gps_id: string }>
    >`SELECT gps_id FROM gps_simulation_cleanup_backups`;
    expect(backups.map((b) => b.gps_id)).toEqual([point.id]);
  });

  it('preserves a point when an existing backup has different contents', async () => {
    const v = await vehicle();
    const point = await prisma.gpsData.create({
      data: { ...seed, vehicleId: v.id }
    });
    const originalBackup = { gps_id: point.id, latitude: 8 };
    await prisma.gpsSimulationCleanupBackup.create({
      data: {
        gpsId: point.id,
        vehicleId: v.id,
        point: originalBackup
      }
    });
    await runCleanup();
    expect(
      await prisma.gpsData.findUnique({ where: { id: point.id } })
    ).not.toBeNull();
    const backup = await prisma.gpsSimulationCleanupBackup.findUniqueOrThrow({
      where: { gpsId: point.id }
    });
    expect(backup.point).toEqual(originalBackup);
  });

  it('preserves trip-linked history even when its telemetry matches a simulator', async () => {
    const v = await vehicle();
    const driver = await prisma.driver.create({
      data: {
        email: 'cleanup-driver@test.local',
        fullName: 'Cleanup Driver',
        branchId: v.branchId
      }
    });
    const trip = await prisma.tripTicket.create({
      data: {
        branchId: v.branchId!,
        driverId: driver.id,
        vehicleId: v.id,
        destination: 'Recorded trip',
        purpose: 'Retained trip history',
        dateRequested: new Date('2026-07-01'),
        preparedBy: 'Test Operator'
      }
    });
    const point = await prisma.gpsData.create({
      data: {
        ...seed,
        vehicleId: v.id,
        tripId: trip.id
      }
    });
    await runCleanup();
    expect(
      await prisma.gpsData.findUnique({ where: { id: point.id } })
    ).not.toBeNull();
    expect(await prisma.gpsSimulationCleanupBackup.count()).toBe(0);
  });
});
