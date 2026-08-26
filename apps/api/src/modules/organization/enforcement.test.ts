import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

// An archived branch, ready to be sent where the UI would never offer it.
async function archivedBranch(header: string) {
  const branch = await createTestBranch('Closed Branch');
  const res = await request(app)
    .post(`/api/branches/${branch.id}/archive`)
    .set('Authorization', header);
  expect(res.status).toBe(200);
  return branch;
}

describe('archived branches are rejected on write, not just hidden', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  async function adminHeader() {
    const { user } = await createTestUser({
      email: 'boss@test.local',
      role: 'admin'
    });
    return authHeader(user.id, user.email, 'admin');
  }

  it('POST /api/users rejects an archived branchId', async () => {
    const header = await adminHeader();
    const branch = await archivedBranch(header);
    // createUserBodySchema requires roleId — the brief's test body omitted
    // it, which would 400 before the archived-parent check ever runs.
    const role = await prisma.role.upsert({
      where: { name: 'requester' },
      update: {},
      create: { name: 'requester' }
    });
    // Multipart, not JSON: the route is behind avatarUpload.single('avatar'),
    // as are the driver and vehicle routes below.
    const req = request(app).post('/api/users').set('Authorization', header);
    for (const [k, v] of Object.entries({
      email: 'new@test.local',
      password: 'Password123!',
      fullName: 'New Person',
      roleId: role.id,
      branchId: branch.id
    })) {
      req.field(k, v);
    }
    const res = await req;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('POST /api/vehicles rejects an archived branchId', async () => {
    const header = await adminHeader();
    const branch = await archivedBranch(header);
    const req = request(app).post('/api/vehicles').set('Authorization', header);
    const fields: Record<string, string> = {
      make: 'Toyota',
      model: 'Hiace',
      year: '2021',
      vin: 'JT-VIN-ARCH',
      licensePlate: 'ARC-0001',
      capacity: '12',
      fuelType: 'diesel',
      mileage: '1000',
      insuranceExpiry: '2027-01-01',
      registrationExpiry: '2027-03-01',
      branchId: branch.id
    };
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    const res = await req;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('POST /api/drivers rejects an archived branchId', async () => {
    const header = await adminHeader();
    const branch = await archivedBranch(header);
    const req = request(app).post('/api/drivers').set('Authorization', header);
    for (const [k, v] of Object.entries({
      email: 'newdriver@test.local',
      fullName: 'New Driver',
      branchId: branch.id
    })) {
      req.field(k, v);
    }
    const res = await req;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('POST /api/trip-tickets rejects an archived branchId', async () => {
    const header = await adminHeader();
    // Build the fleet on a LIVE branch, then file the trip against a dead one,
    // so the only thing wrong with the request is the archived branch.
    const live = await createTestBranch('Live');
    const vehicle = await createTestVehicle(live.id);
    const driver = await createTestDriver(live.id);
    const dead = await archivedBranch(header);

    const now = Date.now();
    const res = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', header)
      .send({
        branchId: dead.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'Anywhere',
        purpose: 'Testing',
        dateRequested: '2026-08-26',
        preparedBy: 'Test',
        dates: [
          {
            startTs: new Date(now + 3_600_000).toISOString(),
            endTs: new Date(now + 7_200_000).toISOString()
          }
        ]
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('leaves records that already point at a newly archived branch alone', async () => {
    const header = await adminHeader();
    // The check runs on write, not on read. A vehicle created while its branch
    // was live must keep working after the branch is archived — and archiving
    // is blocked by that vehicle anyway, so this is belt and braces.
    const branch = await createTestBranch('Later Closed');
    const vehicle = await createTestVehicle(branch.id);
    await prisma.branch.update({
      where: { id: branch.id },
      data: { archivedAt: new Date() }
    });
    const res = await request(app)
      .get(`/api/vehicles/${vehicle.id}`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.branchId).toBe(branch.id);
  });
});
