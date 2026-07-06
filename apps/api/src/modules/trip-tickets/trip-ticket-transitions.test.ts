import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function pendingTicket() {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: 'available', branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
  const driver = await prisma.driver.create({ data: { email: 'd@test.local', fullName: 'D', status: 'active', branchId: branch.id } });
  const { user: requester } = await createTestUser({ email: 'req@test.local', role: 'requester' });
  const ticket = await prisma.tripTicket.create({
    data: {
      branchId: branch.id, driverId: driver.id, vehicleId: vehicle.id, destination: 'A', purpose: 'P',
      dateRequested: new Date('2026-07-10'), preparedBy: '', requestedById: requester.id, status: 'pending_admin_approval'
    }
  });
  return { branch, vehicle, ticket, requester };
}

const fuelBody = { liters: 40, fuelType: 'diesel', date: '2026-07-10', purpose: 'Delivery', tripTo: 'Site A' };

describe('trip-ticket approval transitions', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('admin approve → pending_fuel_allocation_approval and creates the fuel allocation', async () => {
    const { ticket, vehicle, branch } = await pendingTicket();
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(fuelBody);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_fuel_allocation_approval');
    expect(res.body.approvedByAdminId).toBe(admin.id);
    const fa = await prisma.fuelAllocation.findUniqueOrThrow({ where: { tripTicketId: ticket.id } });
    expect(fa).toMatchObject({ liters: 40, status: 'pending', vehicleId: vehicle.id, branchId: branch.id, requestedById: admin.id });
  });

  it('rejects approve from the wrong role (403) and wrong state (409)', async () => {
    const { ticket } = await pendingTicket();
    const { user: req } = await createTestUser({ email: 'r@test.local', role: 'requester' });
    const forbidden = await request(app).post(`/api/trip-tickets/${ticket.id}/approve`).set('Authorization', authHeader(req.id, req.email, 'requester')).send(fuelBody);
    expect(forbidden.status).toBe(403);

    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await prisma.tripTicket.update({ where: { id: ticket.id }, data: { status: 'approved' } });
    const wrongState = await request(app).post(`/api/trip-tickets/${ticket.id}/approve`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send(fuelBody);
    expect(wrongState.status).toBe(409);
    expect(wrongState.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('evp approve → approved and stamps the allocation', async () => {
    const { ticket } = await pendingTicket();
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await request(app).post(`/api/trip-tickets/${ticket.id}/approve`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send(fuelBody);
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/approve-evp`).set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    const fa = await prisma.fuelAllocation.findUniqueOrThrow({ where: { tripTicketId: ticket.id } });
    expect(fa).toMatchObject({ status: 'approved', approvedByEvpId: evp.id });
  });

  it('disapprove requires a reason and marks the allocation disapproved if it exists', async () => {
    const { ticket } = await pendingTicket();
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await request(app).post(`/api/trip-tickets/${ticket.id}/approve`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send(fuelBody);
    const noReason = await request(app).post(`/api/trip-tickets/${ticket.id}/disapprove`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({});
    expect(noReason.status).toBe(400);
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/disapprove`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({ reason: 'Budget' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('disapproved');
    expect(res.body.disapprovedReason).toBe('Budget');
    expect((await prisma.fuelAllocation.findUniqueOrThrow({ where: { tripTicketId: ticket.id } })).status).toBe('disapproved');
  });

  it('cancel by the owner from a pending state, but not by a stranger', async () => {
    const { ticket, requester } = await pendingTicket();
    const { user: stranger } = await createTestUser({ email: 's@test.local', role: 'requester' });
    const forbidden = await request(app).post(`/api/trip-tickets/${ticket.id}/cancel`).set('Authorization', authHeader(stranger.id, stranger.email, 'requester')).send({ reason: 'x' });
    expect(forbidden.status).toBe(403);
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/cancel`).set('Authorization', authHeader(requester.id, requester.email, 'requester')).send({ reason: 'Changed plans' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.cancellationReason).toBe('Changed plans');
  });
});
