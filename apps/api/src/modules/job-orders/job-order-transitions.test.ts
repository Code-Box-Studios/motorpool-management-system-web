import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function scaffold(vehicleStatus: 'available' | 'under_maintenance' = 'available') {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: vehicleStatus, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
  const mechanic = await prisma.driver.create({ data: { email: 'm@test.local', fullName: 'Mech', status: 'active', branchId: branch.id } });
  const part = await prisma.sparePart.create({ data: { name: 'Brake Pad', quantity: 10 } });
  const order = await prisma.jobOrder.create({ data: { vehicleId: vehicle.id, branchId: branch.id, status: 'pending' } });
  return { branch, vehicle, mechanic, part, order };
}

describe('job-order transitions', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('note: pending → assigned_mechanic, writes spare-parts join, flips vehicle to under_maintenance', async () => {
    const { vehicle, mechanic, part, order } = await scaffold('available');
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const res = await request(app)
      .post(`/api/job-orders/${order.id}/note`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send({ assignedMechanicId: mechanic.id, targetDate: '2026-08-01', spareParts: [{ sparePartId: part.id, quantity: 3 }] });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('assigned_mechanic');
    expect(res.body.notedById).toBe(admin.id);
    const joins = await prisma.jobOrderSparePart.findMany({ where: { jobOrderId: order.id } });
    expect(joins).toHaveLength(1);
    expect(joins[0]).toMatchObject({ sparePartId: part.id, quantity: 3 });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('under_maintenance');
  });

  it('rejects note from the wrong role (403) and wrong state (409)', async () => {
    const { mechanic, order } = await scaffold();
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    const forbidden = await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({ assignedMechanicId: mechanic.id });
    expect(forbidden.status).toBe(403);
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await prisma.jobOrder.update({ where: { id: order.id }, data: { status: 'ongoing_repair' } });
    const wrong = await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({ assignedMechanicId: mechanic.id });
    expect(wrong.status).toBe(409);
  });

  it('approve (evp): assigned_mechanic → ongoing_repair', async () => {
    const { mechanic, part, order } = await scaffold();
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({ assignedMechanicId: mechanic.id, spareParts: [{ sparePartId: part.id, quantity: 3 }] });
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    const res = await request(app).post(`/api/job-orders/${order.id}/approve`).set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ongoing_repair');
    expect(res.body.approvedById).toBe(evp.id);
    expect(res.body.dateApproved).not.toBeNull();
  });

  it('complete-repair (admin): decrements spare-parts quantity, writes a maintenance row, flips vehicle to available', async () => {
    const { vehicle, mechanic, part, order } = await scaffold('available');
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const adminH = authHeader(admin.id, admin.email, 'admin');
    await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', adminH).send({ assignedMechanicId: mechanic.id, spareParts: [{ sparePartId: part.id, quantity: 3 }] });
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    await request(app).post(`/api/job-orders/${order.id}/approve`).set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({});

    const res = await request(app).post(`/api/job-orders/${order.id}/complete-repair`).set('Authorization', adminH).send({ repairDone: 'simple', completedMileage: 1500, remarks: 'Done', actualDateOfRelease: '2026-08-05' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('repaired');
    expect((await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } })).quantity).toBe(7); // 10 - 3
    expect(await prisma.maintenance.count({ where: { vehicleId: vehicle.id } })).toBe(1);

    // The maintenance row MUST carry the odometer it was serviced at. Written
    // with mileage: null, the risk model reads it as a service at 0 km — so
    // "distance since last service" becomes the vehicle's whole odometer and a
    // freshly repaired van scores as critically overdue.
    const record = await prisma.maintenance.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
    expect(record.mileage).toBe(1500);

    const after = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(after.status).toBe('available');
    expect(after.mileage).toBe(1500);
  });

  it('complete-repair: refuses an odometer reading below the vehicle’s current mileage', async () => {
    const { vehicle, mechanic, order } = await scaffold('available');
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const adminH = authHeader(admin.id, admin.email, 'admin');
    await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', adminH).send({ assignedMechanicId: mechanic.id, spareParts: [] });
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    await request(app).post(`/api/job-orders/${order.id}/approve`).set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({});

    const res = await request(app).post(`/api/job-orders/${order.id}/complete-repair`).set('Authorization', adminH).send({ repairDone: 'simple', completedMileage: 999 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ODOMETER_BACKWARDS');
    expect(await prisma.maintenance.count({ where: { vehicleId: vehicle.id } })).toBe(0);
  });

  it('note: REFUSES to take a vehicle into the workshop while it is on a trip', async () => {
    const { vehicle, mechanic, order } = await scaffold('available');
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: 'on_trip' } });
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const adminH = authHeader(admin.id, admin.email, 'admin');

    const res = await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', adminH).send({ assignedMechanicId: mechanic.id, spareParts: [] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_ON_TRIP');
    // Previously this succeeded and silently skipped the flip, so the van stayed
    // 'on_trip' — and when the guard checked that trip back in it went straight
    // to 'available' while it was under repair.
    expect((await prisma.jobOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('pending');
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('on_trip');
  });

  it('complete-repair: concurrent double-submit decrements spare-parts inventory exactly once', async () => {
    const { vehicle, mechanic, part, order } = await scaffold('available');
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const adminH = authHeader(admin.id, admin.email, 'admin');
    await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', adminH).send({ assignedMechanicId: mechanic.id, spareParts: [{ sparePartId: part.id, quantity: 3 }] });
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    await request(app).post(`/api/job-orders/${order.id}/approve`).set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({});

    const fire = () =>
      request(app).post(`/api/job-orders/${order.id}/complete-repair`).set('Authorization', adminH).send({ repairDone: 'simple', completedMileage: 1500, remarks: 'Done', actualDateOfRelease: '2026-08-05' });
    const [first, second] = await Promise.all([fire(), fire()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect((await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } })).quantity).toBe(7); // 10 - 3, not 4
    expect(await prisma.maintenance.count({ where: { vehicleId: vehicle.id } })).toBe(1);
  });
});
