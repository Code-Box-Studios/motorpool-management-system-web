import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({
    email: 'boss@test.local',
    role: 'admin'
  });
  return authHeader(user.id, user.email, 'admin');
}

describe('drivers module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates, reads, updates, and deletes a driver (admin)', async () => {
    const header = await adminHeader();

    const created = await request(app)
      .post('/api/drivers')
      .set('Authorization', header)
      .send({
        email: 'pilot@test.local',
        fullName: 'Pilot One',
        licenseNumber: 'N01-23-456789',
        licenseExpiry: '2027-06-30',
        status: 'active'
      });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const fetched = await request(app)
      .get(`/api/drivers/${id}`)
      .set('Authorization', header);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toMatchObject({
      email: 'pilot@test.local',
      fullName: 'Pilot One'
    });

    const updated = await request(app)
      .patch(`/api/drivers/${id}`)
      .set('Authorization', header)
      .send({ status: 'on_trip', notes: 'Long haul' });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('on_trip');

    const removed = await request(app)
      .delete(`/api/drivers/${id}`)
      .set('Authorization', header);
    expect(removed.status).toBe(204);
    expect(await prisma.driver.count()).toBe(0);
  });

  it('clears optional dates through JSON and multipart updates while omitted dates remain unchanged', async () => {
    const header = await adminHeader();
    const driver = await prisma.driver.create({
      data: {
        email: 'dates@test.local',
        fullName: 'Driver Dates',
        dateOfBirth: new Date('1990-01-01'),
        hireDate: new Date('2020-01-01'),
        licenseExpiry: new Date('2030-01-01')
      }
    });
    const sparse = await request(app)
      .patch(`/api/drivers/${driver.id}`)
      .set('Authorization', header)
      .send({ fullName: 'Updated Dates' });
    expect(sparse.status).toBe(200);
    expect(sparse.body.dateOfBirth).toBe('1990-01-01T00:00:00.000Z');
    const cleared = await request(app)
      .patch(`/api/drivers/${driver.id}`)
      .set('Authorization', header)
      .send({ dateOfBirth: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.dateOfBirth).toBeNull();
    const multipart = await request(app)
      .patch(`/api/drivers/${driver.id}`)
      .set('Authorization', header)
      .field('hireDate', 'null')
      .field('licenseExpiry', 'null');
    expect(multipart.status).toBe(200);
    expect([multipart.body.hireDate, multipart.body.licenseExpiry]).toEqual([
      null,
      null
    ]);
  });

  it('lists with pagination and total count, readable by any role', async () => {
    const { user } = await createTestUser({ role: 'evp_operations' });
    const header = authHeader(user.id, user.email, 'evp_operations');
    for (const n of ['Alpha', 'Bravo', 'Charlie']) {
      await prisma.driver.create({
        data: {
          email: `${n.toLowerCase()}@test.local`,
          fullName: n,
          status: 'active'
        }
      });
    }
    // Explicit sort keeps the page content deterministic (the DEFAULT order is
    // updatedAt desc, which ties within this test's single transaction).
    const res = await request(app)
      .get('/api/drivers?page=2&limit=2&sortBy=fullName&sortOrder=asc')
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].fullName).toBe('Charlie');

    // The sort allowlist is enforced: unknown columns are rejected.
    const bad = await request(app)
      .get('/api/drivers?sortBy=passwordHash')
      .set('Authorization', header);
    expect(bad.status).toBe(400);
  });

  it('404s on a missing driver and 403s writes for non-admins', async () => {
    const header = await adminHeader();
    const miss = await request(app)
      .get('/api/drivers/00000000-0000-4000-8000-00000000dead')
      .set('Authorization', header);
    expect(miss.status).toBe(404);

    const { user } = await createTestUser({
      email: 'g@test.local',
      role: 'security_guard'
    });
    const forbidden = await request(app)
      .post('/api/drivers')
      .set('Authorization', authHeader(user.id, user.email, 'security_guard'))
      .send({ email: 'x@test.local', fullName: 'X' });
    expect(forbidden.status).toBe(403);
  });

  it('rejects a duplicate driver email with 409 EMAIL_TAKEN', async () => {
    const header = await adminHeader();
    await prisma.driver.create({
      data: { email: 'dupe@test.local', fullName: 'Dupe', status: 'active' }
    });
    const res = await request(app)
      .post('/api/drivers')
      .set('Authorization', header)
      .send({ email: 'dupe@test.local', fullName: 'Dupe Two' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects deleting a driver referenced by a trip ticket with 409 CONFLICT', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const driver = await prisma.driver.create({
      data: {
        email: 'busy@test.local',
        fullName: 'Busy Driver',
        status: 'active'
      }
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'Toyota',
        model: 'Hiace',
        year: 2020,
        vin: 'VIN-0000-0001',
        licensePlate: 'ABC-123',
        capacity: 12,
        fuelType: 'diesel',
        mileage: 10000,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'Manila',
        purpose: 'Delivery run',
        dateRequested: new Date('2026-07-01'),
        preparedBy: 'Ops Desk'
      }
    });

    const res = await request(app)
      .delete(`/api/drivers/${driver.id}`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('scopes driver-role callers to their own row (spec §5 matrix)', async () => {
    const { user } = await createTestUser({
      email: 'wheel@test.local',
      role: 'driver'
    });
    const mine = await prisma.driver.create({
      data: {
        email: 'wheel@test.local',
        fullName: 'Wheel Man',
        status: 'active',
        userId: user.id
      }
    });
    const other = await prisma.driver.create({
      data: {
        email: 'other@test.local',
        fullName: 'Other Driver',
        status: 'active'
      }
    });
    const header = authHeader(user.id, user.email, 'driver');

    const listRes = await request(app)
      .get('/api/drivers')
      .set('Authorization', header);
    expect(listRes.body.count).toBe(1);
    expect(listRes.body.data[0].id).toBe(mine.id);

    const own = await request(app)
      .get(`/api/drivers/${mine.id}`)
      .set('Authorization', header);
    expect(own.status).toBe(200);

    const foreign = await request(app)
      .get(`/api/drivers/${other.id}`)
      .set('Authorization', header);
    expect(foreign.status).toBe(404); // not-found masking
  });
});
