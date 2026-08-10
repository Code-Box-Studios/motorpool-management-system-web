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

// Minimal valid vehicle body fields (multipart via .field()).
function vehicleFields(branchId: string) {
  return {
    make: 'Toyota',
    model: 'Hiace',
    year: '2021',
    vin: 'JT-VIN-001',
    licensePlate: 'ABC-1001',
    capacity: '12',
    fuelType: 'diesel',
    mileage: '48000',
    insuranceExpiry: '2027-01-01',
    registrationExpiry: '2027-03-01',
    branchId
  };
}

async function postVehicle(header: string, branchId: string) {
  const req = request(app).post('/api/vehicles').set('Authorization', header);
  const f = vehicleFields(branchId);
  for (const [k, v] of Object.entries(f)) req.field(k, v);
  return req;
}

describe('vehicles module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates, reads, lists, updates, and deletes a vehicle (admin)', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();

    const created = await postVehicle(header, branch.id);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      make: 'Toyota',
      status: 'available',
      mileage: 48000
    });
    expect(created.body.images).toEqual([]);
    const id = created.body.id as string;

    const fetched = await request(app)
      .get(`/api/vehicles/${id}`)
      .set('Authorization', header);
    expect(fetched.status).toBe(200);
    expect(fetched.body.licensePlate).toBe('ABC-1001');

    const list = await request(app)
      .get('/api/vehicles')
      .set('Authorization', header);
    expect(list.body.count).toBe(1);

    const updated = await request(app)
      .patch(`/api/vehicles/${id}`)
      .set('Authorization', header)
      .field('mileage', '52000');
    expect(updated.status).toBe(200);
    expect(updated.body.mileage).toBe(52000);

    const removed = await request(app)
      .delete(`/api/vehicles/${id}`)
      .set('Authorization', header);
    expect(removed.status).toBe(204);
    expect(await prisma.vehicle.count()).toBe(0);
  });

  it('is readable by any authenticated role including security_guard', async () => {
    const branch = await createTestBranch();
    await postVehicle(await adminHeader(), branch.id);
    const { user } = await createTestUser({
      email: 'guard@test.local',
      role: 'security_guard'
    });
    const res = await request(app)
      .get('/api/vehicles')
      .set('Authorization', authHeader(user.id, user.email, 'security_guard'));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('writes a vehicle_status_audit row when PATCH changes status, and none when it does not', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const created = await postVehicle(header, branch.id);
    const id = created.body.id as string;

    // A non-status field change writes NO audit row.
    await request(app)
      .patch(`/api/vehicles/${id}`)
      .set('Authorization', header)
      .field('mileage', '50000');
    expect(await prisma.vehicleStatusAudit.count()).toBe(0);

    // A status change writes exactly one audit row capturing old -> new.
    const res = await request(app)
      .patch(`/api/vehicles/${id}`)
      .set('Authorization', header)
      .field('status', 'under_maintenance');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('under_maintenance');
    const audits = await prisma.vehicleStatusAudit.findMany({
      where: { vehicleId: id }
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      oldStatus: 'available',
      newStatus: 'under_maintenance',
      changeSource: 'manual_edit'
    });
  });

  it('merges edit images: (existing minus removedImages) + newly uploaded', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const created = await postVehicle(header, branch.id);
    const id = created.body.id as string;
    // Seed two existing image paths directly (upload plumbing is exercised elsewhere).
    await prisma.vehicle.update({
      where: { id },
      data: { images: ['/uploads/vehicles/a.jpg', '/uploads/vehicles/b.jpg'] }
    });

    const res = await request(app)
      .patch(`/api/vehicles/${id}`)
      .set('Authorization', header)
      .field('removedImages', '/uploads/vehicles/a.jpg')
      .attach('images', Buffer.from('fakejpeg'), {
        filename: 'c.jpg',
        contentType: 'image/jpeg'
      });
    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(2); // b.jpg kept + the newly uploaded one
    expect(res.body.images).toContain('/uploads/vehicles/b.jpg');
    expect(res.body.images).not.toContain('/uploads/vehicles/a.jpg');
  });

  it('409s deleting a vehicle referenced by a maintenance row (VEHICLE_IN_USE)', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const created = await postVehicle(header, branch.id);
    const id = created.body.id as string;
    await prisma.maintenance.create({
      data: { vehicleId: id, type: 'service', date: new Date('2026-01-01') }
    });

    const res = await request(app)
      .delete(`/api/vehicles/${id}`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_IN_USE');
  });

  it('404s a missing vehicle and 403s writes for non-admins', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const miss = await request(app)
      .get('/api/vehicles/00000000-0000-4000-8000-00000000dead')
      .set('Authorization', header);
    expect(miss.status).toBe(404);

    const { user } = await createTestUser({
      email: 'req@test.local',
      role: 'requester'
    });
    const forbidden = await postVehicle(
      authHeader(user.id, user.email, 'requester'),
      branch.id
    );
    expect(forbidden.status).toBe(403);
  });
});
