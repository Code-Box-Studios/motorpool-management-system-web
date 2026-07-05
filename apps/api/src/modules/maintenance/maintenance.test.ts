import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({ email: 'boss@test.local', role: 'admin' });
  return authHeader(user.id, user.email, 'admin');
}

async function createVehicle() {
  const branch = await createTestBranch();
  return prisma.vehicle.create({
    data: {
      make: 'Toyota', model: 'Hiace', year: 2021, vin: 'V1', licensePlate: 'P1',
      capacity: 12, fuelType: 'diesel', mileage: 40000, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-03-01')
    }
  });
}

describe('maintenance module (service history)', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates, reads, updates, deletes and lists date-desc filtered by vehicle', async () => {
    const header = await adminHeader();
    const v = await createVehicle();

    const created = await request(app)
      .post('/api/maintenance')
      .set('Authorization', header)
      .send({ vehicleId: v.id, type: 'preventive', date: '2026-02-01', cost: 1200.5, mileage: 41000 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ type: 'preventive', mileage: 41000 });
    const id = created.body.id as string;

    await request(app)
      .post('/api/maintenance')
      .set('Authorization', header)
      .send({ vehicleId: v.id, type: 'service', date: '2026-05-01' });

    const list = await request(app)
      .get(`/api/maintenance?vehicleId=${v.id}`)
      .set('Authorization', header);
    expect(list.body.count).toBe(2);
    expect(new Date(list.body.data[0].date).getTime()).toBeGreaterThan(
      new Date(list.body.data[1].date).getTime()
    ); // date desc

    const updated = await request(app)
      .patch(`/api/maintenance/${id}`)
      .set('Authorization', header)
      .send({ cost: 999 });
    expect(updated.body.cost).toBe(999);

    const removed = await request(app).delete(`/api/maintenance/${id}`).set('Authorization', header);
    expect(removed.status).toBe(204);
  });

  it('403 write for non-admin, 403 read for security_guard, 200 read for driver', async () => {
    const { user: g } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const guardRead = await request(app)
      .get('/api/maintenance')
      .set('Authorization', authHeader(g.id, g.email, 'security_guard'));
    expect(guardRead.status).toBe(403);

    const { user: d } = await createTestUser({ email: 'd@test.local', role: 'driver' });
    const driverRead = await request(app)
      .get('/api/maintenance')
      .set('Authorization', authHeader(d.id, d.email, 'driver'));
    expect(driverRead.status).toBe(200);

    const writeForbidden = await request(app)
      .post('/api/maintenance')
      .set('Authorization', authHeader(d.id, d.email, 'driver'))
      .send({ vehicleId: '00000000-0000-4000-8000-00000000dead', type: 'service', date: '2026-01-01' });
    expect(writeForbidden.status).toBe(403);
  });
});
