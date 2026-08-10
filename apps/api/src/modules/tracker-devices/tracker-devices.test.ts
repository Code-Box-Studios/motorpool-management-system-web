import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../../test/factories.js';

const app = createApp();

// Single disconnect for the whole file: a per-describe afterAll would run before
// later describes' tests finish (only "working" via lazy reconnect).
afterAll(() => prisma.$disconnect());

// Minimal vehicle fixture for the active-tracker-per-vehicle tests below.
function makeVehicle(vin: string, licensePlate: string) {
  return prisma.vehicle.create({
    data: {
      make: 'Toyota',
      model: 'Hiace',
      year: 2022,
      vin,
      licensePlate,
      capacity: 4,
      fuelType: 'diesel',
      mileage: 1000,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-01-01')
    }
  });
}

describe('tracker-devices module (CRUD)', () => {
  beforeEach(truncateAll);

  async function adminAuth() {
    const { user } = await createTestUser({
      email: 'admin@test.local',
      role: 'admin'
    });
    return authHeader(user.id, user.email, 'admin');
  }

  it('creates, reads, lists, updates, and deletes a device (admin)', async () => {
    const auth = await adminAuth();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'Toyota',
        model: 'Hiace',
        year: 2022,
        vin: 'VIN-TD-1',
        licensePlate: 'TD-0001',
        capacity: 4,
        fuelType: 'diesel',
        mileage: 1000,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });

    const created = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({
        imei: '355000000000001',
        label: 'Van 1 tracker',
        vehicleId: vehicle.id
      });
    expect(created.status).toBe(201);
    expect(created.body.imei).toBe('355000000000001');
    expect(created.body.status).toBe('active');
    const id = created.body.id as string;

    const got = await request(app)
      .get(`/api/tracker-devices/${id}`)
      .set('Authorization', auth);
    expect(got.status).toBe(200);
    expect(got.body.vehicleId).toBe(vehicle.id);

    const listed = await request(app)
      .get('/api/tracker-devices')
      .set('Authorization', auth);
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

    const del = await request(app)
      .delete(`/api/tracker-devices/${id}`)
      .set('Authorization', auth);
    expect(del.status).toBe(204);
    expect(await prisma.trackerDevice.count()).toBe(0);
  });

  it('rejects a duplicate IMEI with 409', async () => {
    const auth = await adminAuth();
    await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: 'DUP-1' });
    const dup = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: 'DUP-1' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('IMEI_TAKEN');
  });

  it('403s writes for non-admins and 404s a missing device', async () => {
    const branch = await createTestBranch();
    const { user } = await createTestUser({
      email: 'driver@test.local',
      role: 'driver',
      branchId: branch.id
    });
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

  it('rejects creating a second active device on a vehicle that already has one (409)', async () => {
    const auth = await adminAuth();
    const vehicle = await makeVehicle('VIN-TD-2', 'TD-0002');
    const first = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000002', vehicleId: vehicle.id });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000003', vehicleId: vehicle.id });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VEHICLE_HAS_ACTIVE_DEVICE');
  });

  it('rejects PATCHing a device active onto a vehicle that already has an active device (409)', async () => {
    const auth = await adminAuth();
    const vehicle = await makeVehicle('VIN-TD-3', 'TD-0003');
    const first = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000004', vehicleId: vehicle.id });
    expect(first.status).toBe(201);

    const spare = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000005' });
    expect(spare.status).toBe(201);

    const patched = await request(app)
      .patch(`/api/tracker-devices/${spare.body.id}`)
      .set('Authorization', auth)
      .send({ vehicleId: vehicle.id });
    expect(patched.status).toBe(409);
    expect(patched.body.error.code).toBe('VEHICLE_HAS_ACTIVE_DEVICE');
  });

  it('allows the replacement flow: deactivate the old active device, then assign a new one', async () => {
    const auth = await adminAuth();
    const vehicle = await makeVehicle('VIN-TD-4', 'TD-0004');
    const deviceA = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000006', vehicleId: vehicle.id });
    expect(deviceA.status).toBe(201);

    const deactivated = await request(app)
      .patch(`/api/tracker-devices/${deviceA.body.id}`)
      .set('Authorization', auth)
      .send({ status: 'inactive' });
    expect(deactivated.status).toBe(200);

    const deviceB = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000007', vehicleId: vehicle.id });
    expect(deviceB.status).toBe(201);
  });

  it('allows a second device on the same vehicle when it is created inactive', async () => {
    const auth = await adminAuth();
    const vehicle = await makeVehicle('VIN-TD-5', 'TD-0005');
    const first = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000008', vehicleId: vehicle.id });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({
        imei: '355000000000009',
        vehicleId: vehicle.id,
        status: 'inactive'
      });
    expect(second.status).toBe(201);
  });

  it('allows editing an active, assigned device without 409ing against itself', async () => {
    const auth = await adminAuth();
    const vehicle = await makeVehicle('VIN-TD-6', 'TD-0006');
    const device = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000010', vehicleId: vehicle.id });
    expect(device.status).toBe(201);

    // Re-saving the same active+assigned device (label only) must not trip the
    // one-active-per-vehicle guard against the device's own row.
    const patched = await request(app)
      .patch(`/api/tracker-devices/${device.body.id}`)
      .set('Authorization', auth)
      .send({ label: 'Renamed in place' });
    expect(patched.status).toBe(200);
    expect(patched.body.label).toBe('Renamed in place');
    expect(patched.body.vehicleId).toBe(vehicle.id);
    expect(patched.body.status).toBe('active');
  });

  it('filters the list by status', async () => {
    const auth = await adminAuth();
    const active = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000010' });
    expect(active.status).toBe(201);
    const inactive = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000011', status: 'inactive' });
    expect(inactive.status).toBe(201);

    const listed = await request(app)
      .get('/api/tracker-devices?status=inactive')
      .set('Authorization', auth);
    expect(listed.status).toBe(200);
    expect(listed.body.count).toBe(1);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].id).toBe(inactive.body.id);
  });

  it('unassigns a device by PATCHing vehicleId to null', async () => {
    const auth = await adminAuth();
    const vehicle = await makeVehicle('VIN-TD-6', 'TD-0006');
    const created = await request(app)
      .post('/api/tracker-devices')
      .set('Authorization', auth)
      .send({ imei: '355000000000012', vehicleId: vehicle.id });
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`/api/tracker-devices/${created.body.id}`)
      .set('Authorization', auth)
      .send({ vehicleId: null });
    expect(patched.status).toBe(200);
    expect(patched.body.vehicleId).toBeNull();
  });
});

describe('tracker-devices resolve (device auth)', () => {
  beforeEach(truncateAll);
  afterEach(() => {
    delete process.env.GPS_DEVICE_API_KEY;
  });

  const KEY = 'test-device-key';
  async function seedDevice(
    overrides: { status?: string; withVehicle?: boolean } = {}
  ) {
    const vehicle = overrides.withVehicle
      ? await prisma.vehicle.create({
          data: {
            make: 'M',
            model: 'M',
            year: 2022,
            vin: `VIN-${Math.random()}`,
            licensePlate: `P-${Math.random()}`,
            capacity: 4,
            fuelType: 'diesel',
            mileage: 0,
            insuranceExpiry: new Date('2027-01-01'),
            registrationExpiry: new Date('2027-01-01')
          }
        })
      : null;
    const device = await prisma.trackerDevice.create({
      data: {
        imei: 'RESOLVE-1',
        status: (overrides.status ?? 'active') as 'active',
        vehicleId: vehicle?.id ?? null
      }
    });
    return { device, vehicle };
  }

  it('500s when the device key is not configured (fail closed)', async () => {
    delete process.env.GPS_DEVICE_API_KEY;
    const res = await request(app).get(
      '/api/tracker-devices/resolve?deviceId=RESOLVE-1'
    );
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('GPS_NOT_CONFIGURED');
  });

  it('401s a missing/wrong device key', async () => {
    process.env.GPS_DEVICE_API_KEY = KEY;
    const res = await request(app)
      .get('/api/tracker-devices/resolve?deviceId=RESOLVE-1')
      .set('x-device-api-key', 'wrong');
    expect(res.status).toBe(401);
  });

  it('resolves an active, assigned device to its vehicle and stamps lastSeenAt', async () => {
    process.env.GPS_DEVICE_API_KEY = KEY;
    const { device, vehicle } = await seedDevice({ withVehicle: true });
    const res = await request(app)
      .get('/api/tracker-devices/resolve?deviceId=RESOLVE-1')
      .set('x-device-api-key', KEY);
    expect(res.status).toBe(200);
    expect(res.body.vehicleId).toBe(vehicle!.id);
    const after = await prisma.trackerDevice.findUnique({
      where: { id: device.id }
    });
    expect(after?.lastSeenAt).not.toBeNull();
  });

  it('404s an unknown IMEI, an inactive device, and an unassigned device', async () => {
    process.env.GPS_DEVICE_API_KEY = KEY;
    const unknown = await request(app)
      .get('/api/tracker-devices/resolve?deviceId=NOPE')
      .set('x-device-api-key', KEY);
    expect(unknown.status).toBe(404);

    await seedDevice({ status: 'inactive', withVehicle: true });
    const inactive = await request(app)
      .get('/api/tracker-devices/resolve?deviceId=RESOLVE-1')
      .set('x-device-api-key', KEY);
    expect(inactive.status).toBe(404);

    await prisma.trackerDevice.deleteMany();
    await seedDevice({ withVehicle: false });
    const unassigned = await request(app)
      .get('/api/tracker-devices/resolve?deviceId=RESOLVE-1')
      .set('x-device-api-key', KEY);
    expect(unassigned.status).toBe(404);
    expect(unassigned.body.error.code).toBe('NO_VEHICLE_ASSIGNED');
  });
});
