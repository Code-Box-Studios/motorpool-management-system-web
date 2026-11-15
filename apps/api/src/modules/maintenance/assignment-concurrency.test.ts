import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';

const app = createApp();
async function fixture() {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const { user } = await createTestUser();
  const standard = await prisma.maintenanceStandard.create({
    data: {
      name: 'Mileage plan',
      scheduleItems: {
        create: {
          taskName: 'Oil',
          intervalType: 'mileage',
          intervalMileage: 1000
        }
      }
    }
  });
  const assign = () =>
    request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', authHeader(user.id, user.email, 'admin'))
      .send({ maintenanceStandardId: standard.id });
  return { vehicle, assign };
}

describe('maintenance assignment concurrency', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('seeds from committed mileage after waiting for an odometer write', async () => {
    const s = await fixture();
    let release!: () => void;
    let signal!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${s.vehicle.id}::uuid FOR NO KEY UPDATE`;
        signal();
        await released;
        await tx.vehicle.update({
          where: { id: s.vehicle.id },
          data: { mileage: 10000 }
        });
      },
      { timeout: 10000 }
    );
    await locked;
    const assigning = s.assign().then((response) => response);
    let waited = false;
    try {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
              AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'
              AND query LIKE '%vehicles%'
          ) AS waiting
        `;
        if (rows[0]?.waiting) {
          waited = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      release();
    }
    await holder;
    const response = await assigning;
    expect(waited).toBe(true);
    expect(response.status).toBe(201);
    expect(response.body.data[0].nextDueMileage).toBe(11000);
    const stored = await prisma.vehicle.findUniqueOrThrow({
      where: { id: s.vehicle.id }
    });
    expect(stored.mileage).toBe(10000);
  });

  it('serializes repeated assignments without duplicating tracked tasks', async () => {
    const s = await fixture();
    const responses = await Promise.all([s.assign(), s.assign()]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses.reduce((sum, r) => sum + r.body.count, 0)).toBe(1);
    expect(await prisma.vehicleMaintenanceTracking.count()).toBe(1);
  });
});
