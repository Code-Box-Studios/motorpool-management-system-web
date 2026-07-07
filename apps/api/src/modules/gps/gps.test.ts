import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

async function makeVehicle() {
  const branch = await createTestBranch();
  return prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: 'available', branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
}

describe('gps module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());
  afterEach(() => { delete process.env.GPS_DEVICE_API_KEY; });

  it('ingest FAILS CLOSED with 500 when GPS_DEVICE_API_KEY is unset', async () => {
    delete process.env.GPS_DEVICE_API_KEY;
    const app = createApp();
    const v = await makeVehicle();
    const res = await request(app).post('/api/gps/ingest').set('x-device-api-key', 'anything')
      .send({ vehicleId: v.id, latitude: 7.07, longitude: 125.6 });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('GPS_NOT_CONFIGURED');
  });

  it('ingest 401 on a missing/mismatched device key; 200 + writes on match', async () => {
    process.env.GPS_DEVICE_API_KEY = 'secret-key';
    const app = createApp();
    const v = await makeVehicle();

    const noKey = await request(app).post('/api/gps/ingest').send({ vehicleId: v.id, latitude: 7.07, longitude: 125.6 });
    expect(noKey.status).toBe(401);
    const wrong = await request(app).post('/api/gps/ingest').set('x-device-api-key', 'nope').send({ vehicleId: v.id, latitude: 7.07, longitude: 125.6 });
    expect(wrong.status).toBe(401);

    const ok = await request(app).post('/api/gps/ingest').set('x-device-api-key', 'secret-key')
      .send({ vehicleId: v.id, latitude: 7.07, longitude: 125.6, speed: 45, heading: 90, engineStatus: 'on' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ success: true });
    expect(await prisma.gpsData.count({ where: { vehicleId: v.id } })).toBe(1);
    const updated = await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } });
    expect(updated.latitude).toBeCloseTo(7.07);
    expect(updated.lastLocationUpdate).not.toBeNull();
  });

  it('ingest 400 on out-of-range coordinates (after auth)', async () => {
    process.env.GPS_DEVICE_API_KEY = 'secret-key';
    const app = createApp();
    const v = await makeVehicle();
    const res = await request(app).post('/api/gps/ingest').set('x-device-api-key', 'secret-key')
      .send({ vehicleId: v.id, latitude: 999, longitude: 0 });
    expect(res.status).toBe(400);
  });

  it('GET /gps/latest returns the newest point per vehicle (admin), embeds vehicle', async () => {
    const app = createApp();
    const v = await makeVehicle();
    await prisma.gpsData.create({ data: { vehicleId: v.id, latitude: 1, longitude: 1, createdAt: new Date('2026-07-01T00:00:00Z') } });
    await prisma.gpsData.create({ data: { vehicleId: v.id, latitude: 2, longitude: 2, createdAt: new Date('2026-07-02T00:00:00Z') } });
    const { user } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const res = await request(app).get('/api/gps/latest').set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].latitude).toBeCloseTo(2); // newest
    expect(res.body.data[0].make).toBe('T'); // joined vehicle info
    // Shape is camelCase like every other endpoint (aliased in the raw SQL).
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0]).toHaveProperty('vehicleId', v.id);
    expect(res.body.data[0]).toHaveProperty('createdAt');
    // mileage/fuelType are joined for the FE's nested vehicles.mileage/fuel_type
    // (both required on GpsDataWithVehicle — see apps/web lib/api/gps.ts).
    expect(res.body.data[0]).toHaveProperty('mileage', 1000);
    expect(res.body.data[0]).toHaveProperty('fuelType', 'diesel');
  });

  it('GET /gps/latest 403 for non-admin/non-evp roles', async () => {
    const app = createApp();
    const { user } = await createTestUser({ email: 'd@test.local', role: 'driver' });
    const res = await request(app).get('/api/gps/latest').set('Authorization', authHeader(user.id, user.email, 'driver'));
    expect(res.status).toBe(403);
  });

  it('GET /gps/history filters by vehicleId + limit, newest first', async () => {
    const app = createApp();
    const v = await makeVehicle();
    for (let i = 0; i < 3; i++) {
      await prisma.gpsData.create({ data: { vehicleId: v.id, latitude: i, longitude: i, createdAt: new Date(`2026-07-0${i + 1}T00:00:00Z`) } });
    }
    const { user } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    const res = await request(app).get(`/api/gps/history?vehicleId=${v.id}&limit=2`).set('Authorization', authHeader(user.id, user.email, 'evp_operations'));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3); // total matching rows (spec §6), NOT the page size
    expect(res.body.data).toHaveLength(2); // the limit-capped page
    expect(new Date(res.body.data[0].createdAt) > new Date(res.body.data[1].createdAt)).toBe(true);
  });
});
