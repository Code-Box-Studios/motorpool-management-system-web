import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function scaffold() {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: 'available', branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
  const driver = await prisma.driver.create({ data: { email: 'd@test.local', fullName: 'D', status: 'active', branchId: branch.id } });
  return { branch, vehicle, driver };
}

// Windows are relative to NOW, never hardcoded. A trip cannot be booked entirely
// in the past, and a fixture pinned to a literal date silently rots into one the
// moment the wall clock passes it.
const DAY = 24 * 60 * 60 * 1000;
export const inDays = (days: number, hour = 8) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

function ticketBody(s: { branch: { id: string }; vehicle: { id: string }; driver: { id: string } }, requestedById: string) {
  return {
    branchId: s.branch.id, driverId: s.driver.id, vehicleId: s.vehicle.id,
    destination: 'Site A', purpose: 'Delivery', dateRequested: inDays(1),
    participants: ['Alice', 'Bob'], participantsCount: 2, requestedById,
    startTs: inDays(7, 8), endTs: inDays(7, 17)
  };
}

describe('trip-tickets module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates a ticket as pending_admin_approval and reads it back with embeds', async () => {
    const s = await scaffold();
    const { user } = await createTestUser({ email: 'req@test.local', role: 'requester' });
    const header = authHeader(user.id, user.email, 'requester');

    const created = await request(app).post('/api/trip-tickets').set('Authorization', header).send(ticketBody(s, user.id));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending_admin_approval');
    const id = created.body.id as string;

    const fetched = await request(app).get(`/api/trip-tickets/${id}`).set('Authorization', header);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toMatchObject({ destination: 'Site A' });
    expect(fetched.body.driver).toBeDefined();
    expect(fetched.body.vehicle).toBeDefined();
    expect(fetched.body).toHaveProperty('fuelAllocation'); // null until approved
  });

  it('ignores a client-supplied status on create (always pending_admin_approval)', async () => {
    const s = await scaffold();
    const { user } = await createTestUser({ email: 'req@test.local', role: 'requester' });
    const res = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', authHeader(user.id, user.email, 'requester'))
      .send({ ...ticketBody(s, user.id), status: 'approved' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_admin_approval');
  });

  it('scopes list: requester sees only own, admin sees all, sorted start_ts desc', async () => {
    const s = await scaffold();
    const { user: r1 } = await createTestUser({ email: 'r1@test.local', role: 'requester' });
    const { user: r2 } = await createTestUser({ email: 'r2@test.local', role: 'requester' });
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    // Disjoint FUTURE windows, and each a valid one. This used to override startTs
    // while leaving the fixture's endTs behind, so the second ticket ended nine
    // days before it started — and the two shared one vehicle and one driver.
    await request(app).post('/api/trip-tickets').set('Authorization', authHeader(r1.id, r1.email, 'requester'))
      .send({ ...ticketBody(s, r1.id), startTs: inDays(3, 8), endTs: inDays(3, 17) });
    await request(app).post('/api/trip-tickets').set('Authorization', authHeader(r2.id, r2.email, 'requester'))
      .send({ ...ticketBody(s, r2.id), startTs: inDays(9, 8), endTs: inDays(9, 17) });

    const asR1 = await request(app).get('/api/trip-tickets').set('Authorization', authHeader(r1.id, r1.email, 'requester'));
    expect(asR1.body.count).toBe(1); // only r1's own

    const asAdmin = await request(app).get('/api/trip-tickets').set('Authorization', authHeader(admin.id, admin.email, 'admin'));
    expect(asAdmin.body.count).toBe(2);
    expect(new Date(asAdmin.body.data[0].startTs) > new Date(asAdmin.body.data[1].startTs)).toBe(true); // start_ts desc
  });

  it('a query filter cannot widen a requester past their own tickets (IDOR guard)', async () => {
    const s = await scaffold();
    const { user: r1 } = await createTestUser({ email: 'r1@test.local', role: 'requester' });
    const { user: r2 } = await createTestUser({ email: 'r2@test.local', role: 'requester' });
    await request(app).post('/api/trip-tickets').set('Authorization', authHeader(r2.id, r2.email, 'requester')).send(ticketBody(s, r2.id));

    // r1 tries to read r2's tickets by spoofing the requestedBy filter — must see none.
    const spoof = await request(app)
      .get(`/api/trip-tickets?requestedBy=${r2.id}`)
      .set('Authorization', authHeader(r1.id, r1.email, 'requester'));
    expect(spoof.status).toBe(200);
    expect(spoof.body.count).toBe(0);
  });

  it('scopes driver-role list to the caller driver row (via drivers.userId)', async () => {
    const s = await scaffold();
    const { user: drvUser } = await createTestUser({ email: 'drv@test.local', role: 'driver' });
    await prisma.driver.update({ where: { id: s.driver.id }, data: { userId: drvUser.id } });
    const { user: req } = await createTestUser({ email: 'rq@test.local', role: 'requester' });
    await request(app).post('/api/trip-tickets').set('Authorization', authHeader(req.id, req.email, 'requester')).send(ticketBody(s, req.id));

    const asDriver = await request(app).get('/api/trip-tickets').set('Authorization', authHeader(drvUser.id, drvUser.email, 'driver'));
    expect(asDriver.status).toBe(200);
    expect(asDriver.body.count).toBe(1); // the ticket whose driverId is this driver
  });

  it('PATCH allowed while pending (owner) and 409 once not pending; DELETE admin-only', async () => {
    const s = await scaffold();
    const { user } = await createTestUser({ email: 'req@test.local', role: 'requester' });
    const header = authHeader(user.id, user.email, 'requester');
    const created = await request(app).post('/api/trip-tickets').set('Authorization', header).send(ticketBody(s, user.id));
    const id = created.body.id as string;

    const patched = await request(app).patch(`/api/trip-tickets/${id}`).set('Authorization', header).send({ destination: 'Site B' });
    expect(patched.status).toBe(200);
    expect(patched.body.destination).toBe('Site B');

    // Force it out of pending directly, then PATCH must 409.
    await prisma.tripTicket.update({ where: { id }, data: { status: 'approved' } });
    const late = await request(app).patch(`/api/trip-tickets/${id}`).set('Authorization', header).send({ destination: 'Site C' });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_TRANSITION');

    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const adminH = authHeader(admin.id, admin.email, 'admin');

    // Delete is for a draft nobody has acted on. This ticket is `approved` — it
    // has an admin's sign-off and a fuel allocation hanging off it, and deleting
    // it would cascade that away. Cancel is the off-ramp.
    const tooLate = await request(app).delete(`/api/trip-tickets/${id}`).set('Authorization', adminH);
    expect(tooLate.status).toBe(409);

    // Back to pending: now it is a draft, and DELETE is admin-only.
    await prisma.tripTicket.update({ where: { id }, data: { status: 'pending_admin_approval' } });
    const asRequester = await request(app).delete(`/api/trip-tickets/${id}`).set('Authorization', header);
    expect(asRequester.status).toBe(403);

    const del = await request(app).delete(`/api/trip-tickets/${id}`).set('Authorization', adminH);
    expect(del.status).toBe(204);
  });
});
