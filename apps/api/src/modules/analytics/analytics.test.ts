import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({ email: 'a@test.local', role: 'admin' });
  return authHeader(user.id, user.email, 'admin');
}

async function vehicle(status: string, mileage = 1000) {
  const branch = await createTestBranch();
  return prisma.vehicle.create({
    data: {
      make: 'Toyota', model: 'Hiace', year: 2021, vin: `V${Math.random()}`, licensePlate: `P${Math.random()}`,
      capacity: 5, fuelType: 'diesel', mileage, status: status as never, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
}

describe('analytics module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('GET /analytics/dashboard returns status buckets + completedTrips', async () => {
    const header = await adminHeader();
    await vehicle('available');
    await vehicle('available');
    await vehicle('under_maintenance');
    const v = await vehicle('on_trip');
    const driver = await prisma.driver.create({ data: { email: 'd@t.local', fullName: 'D', status: 'active' } });
    await prisma.tripTicket.create({ data: { branchId: (await createTestBranch()).id, driverId: driver.id, vehicleId: v.id, destination: 'X', purpose: 'Y', dateRequested: new Date('2026-07-01'), preparedBy: '', status: 'completed' } });

    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: 2, underMaintenance: 1, onTrip: 1, completedTrips: 1 });
    expect(res.body.total).toBe(4);
  });

  it('GET /analytics/predictive-maintenance scores every vehicle', async () => {
    const header = await adminHeader();
    const v = await vehicle('available', 100000);
    await prisma.maintenance.create({ data: { vehicleId: v.id, type: 'service', date: new Date('2020-01-01'), mileage: 0 } });
    const res = await request(app).get('/api/analytics/predictive-maintenance').set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0]).toHaveProperty('riskScore');
    expect(res.body.data[0]).toHaveProperty('priority');
    expect(res.body.data[0].kmSinceLastMaint).toBe(100000); // 100000 - 0
  });

  it('GET /analytics/association-rules mines the job-order spare-parts join', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const v = await vehicle('available');
    const partA = await prisma.sparePart.create({ data: { name: 'Brake Pad' } });
    const partB = await prisma.sparePart.create({ data: { name: 'Rotor' } });
    // Two job orders each using both parts → a co-occurrence.
    for (let i = 0; i < 2; i++) {
      const jo = await prisma.jobOrder.create({ data: { vehicleId: v.id, branchId: branch.id, status: 'repaired' } });
      await prisma.jobOrderSparePart.createMany({ data: [
        { jobOrderId: jo.id, sparePartId: partA.id, quantity: 1 },
        { jobOrderId: jo.id, sparePartId: partB.id, quantity: 1 }
      ] });
    }
    const res = await request(app).get('/api/analytics/association-rules').set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    const rule = res.body.data[0];
    expect([rule.partA, rule.partB].sort()).toEqual(['Brake Pad', 'Rotor']);
  });

  it('403 for non-admin/non-evp roles on every analytics endpoint', async () => {
    const { user } = await createTestUser({ email: 'r@test.local', role: 'requester' });
    const h = authHeader(user.id, user.email, 'requester');
    for (const path of ['/api/analytics/dashboard', '/api/analytics/predictive-maintenance', '/api/analytics/association-rules']) {
      expect((await request(app).get(path).set('Authorization', h)).status).toBe(403);
    }
  });
});
