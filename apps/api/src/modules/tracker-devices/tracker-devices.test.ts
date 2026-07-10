import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';

const app = createApp();

describe('tracker-devices module (CRUD)', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  async function adminAuth() {
    const { user } = await createTestUser({ email: 'admin@test.local', role: 'admin' });
    return authHeader(user.id, user.email, 'admin');
  }

  it('creates, reads, lists, updates, and deletes a device (admin)', async () => {
    const auth = await adminAuth();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'Toyota', model: 'Hiace', year: 2022, vin: 'VIN-TD-1', licensePlate: 'TD-0001',
        capacity: 4, fuelType: 'diesel', mileage: 1000, insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });

    const created = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000001', label: 'Van 1 tracker', vehicleId: vehicle.id });
    expect(created.status).toBe(201);
    expect(created.body.imei).toBe('355000000000001');
    expect(created.body.status).toBe('active');
    const id = created.body.id as string;

    const got = await request(app).get(`/api/tracker-devices/${id}`).set('Authorization', auth);
    expect(got.status).toBe(200);
    expect(got.body.vehicleId).toBe(vehicle.id);

    const listed = await request(app).get('/api/tracker-devices').set('Authorization', auth);
    expect(listed.status).toBe(200);
    expect(listed.body.count).toBe(1);
    expect(listed.body.data).toHaveLength(1);

    const patched = await request(app)
      .patch(`/api/tracker-devices/${id}`)
      .set('Authorization', auth)
      .send({ label: 'Van 1 (renamed)', status: 'inactive' });
    expect(patched.status).toBe(200);
    expect(patched.body.label).toBe('Van 1 (renamed)');
    expect(patched.body.status).toBe('inactive');

    const del = await request(app).delete(`/api/tracker-devices/${id}`).set('Authorization', auth);
    expect(del.status).toBe(204);
    expect(await prisma.trackerDevice.count()).toBe(0);
  });

  it('rejects a duplicate IMEI with 409', async () => {
    const auth = await adminAuth();
    await request(app).post('/api/tracker-devices').set('Authorization', auth).send({ imei: 'DUP-1' });
    const dup = await request(app).post('/api/tracker-devices').set('Authorization', auth).send({ imei: 'DUP-1' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('IMEI_TAKEN');
  });

  it('403s writes for non-admins and 404s a missing device', async () => {
    const branch = await createTestBranch();
    const { user } = await createTestUser({ email: 'driver@test.local', role: 'driver', branchId: branch.id });
    const driverAuth = authHeader(user.id, user.email, 'driver', branch.id);
    const forbidden = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', driverAuth)
      .send({ imei: 'X' });
    expect(forbidden.status).toBe(403);

    const admin = await adminAuth();
    const missing = await request(app)
      .get('/api/tracker-devices/00000000-0000-4000-8000-000000000999')
      .set('Authorization', admin);
    expect(missing.status).toBe(404);
  });
});
