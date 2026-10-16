import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function scaffold() {
  const branch = await createTestBranch();
  const otherBranch = await createTestBranch('Other Branch');
  const { user: admin } = await createTestUser();
  const { user: guide } = await createTestUser({
    email: 'guide@test.local',
    fullName: 'Other Branch Requester',
    role: 'requester',
    branchId: otherBranch.id
  });
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(branch.id);
  const legacy = await createTestEmployee(branch.id, 'Historical Guide');
  const header = authHeader(admin.id, admin.email, 'admin');
  const start = new Date(Date.now() + 14 * 86400000);
  start.setUTCHours(8, 0, 0, 0);
  const end = new Date(start.getTime() + 8 * 3600000);
  const body = {
    branchId: branch.id,
    driverId: driver.id,
    vehicleId: vehicle.id,
    destination: 'Pinned site',
    purpose: 'Delivery',
    dateRequested: new Date().toISOString(),
    dates: [{ startTs: start.toISOString(), endTs: end.toISOString() }],
    participants: ['Alice'],
    guideIds: [guide.id]
  };
  return { branch, vehicle, driver, guide, legacy, admin, header, body };
}

describe('trip guides use active driver and requester accounts', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('offers every eligible account across branches without exposing private fields', async () => {
    const s = await scaffold();
    const { user: driver } = await createTestUser({
      email: 'driver-account@test.local',
      fullName: 'Driver Account',
      role: 'driver'
    });
    await createTestUser({
      email: 'inactive@test.local',
      role: 'requester',
      status: 'inactive'
    });
    await createTestUser({ email: 'guard@test.local', role: 'security_guard' });
    const res = await request(app)
      .get('/api/trip-tickets/guide-options')
      .set('Authorization', s.header);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: driver.id, fullName: 'Driver Account', role: 'driver' },
      { id: s.guide.id, fullName: 'Other Branch Requester', role: 'requester' }
    ]);
    expect(
      (await request(app).get('/api/trip-tickets/guide-options')).status
    ).toBe(401);
  });

  it('returns eligible users beyond normal user-list page boundaries', async () => {
    const s = await scaffold();
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'requester' }
    });
    const ids = Array.from({ length: 105 }, () => randomUUID());
    await prisma.user.createMany({
      data: ids.map((id, index) => ({
        id,
        email: `roster-${index}@test.local`,
        fullName: `Roster ${index}`,
        passwordHash: 'unused-test-password-hash'
      }))
    });
    await prisma.userRole.createMany({
      data: ids.map((userId) => ({ userId, roleId: role.id }))
    });
    const res = await request(app)
      .get('/api/trip-tickets/guide-options')
      .set('Authorization', s.header);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(106);
    expect(res.body.map((guide: { id: string }) => guide.id)).toEqual(
      expect.arrayContaining([...ids, s.guide.id])
    );
  });

  it('requires exactly one stored user or legacy employee identity', async () => {
    const s = await scaffold();
    const ticket = await createTestTicket({
      branchId: s.branch.id,
      driverId: s.driver.id,
      vehicleId: s.vehicle.id
    });
    await expect(
      prisma.tripTicketEmployee.create({ data: { tripTicketId: ticket.id } })
    ).rejects.toThrow();
    await expect(
      prisma.tripTicketEmployee.create({
        data: {
          tripTicketId: ticket.id,
          userId: s.guide.id,
          employeeId: s.legacy.id
        }
      })
    ).rejects.toThrow();
    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, userId: s.guide.id }
    });
    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, employeeId: s.legacy.id }
    });
    expect(
      await prisma.tripTicketEmployee.count({
        where: { tripTicketId: ticket.id }
      })
    ).toBe(2);
  });

  it('creates, edits and reassigns cross-branch users with only public guide fields on detail and list', async () => {
    const s = await scaffold();
    const { user: driverGuide } = await createTestUser({
      email: 'driver-guide@test.local',
      role: 'driver'
    });
    const created = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', s.header)
      .send(s.body);
    expect(created.status).toBe(201);
    expect(created.body.guides[0]).toMatchObject({
      userId: s.guide.id,
      employeeId: null,
      user: { id: s.guide.id, fullName: 'Other Branch Requester' }
    });
    expect(Object.keys(created.body.guides[0].user).sort()).toEqual([
      'fullName',
      'id',
      'userRole'
    ]);
    const id = created.body.id;
    const patched = await request(app)
      .patch(`/api/trip-tickets/${id}`)
      .set('Authorization', s.header)
      .send({ guideIds: [driverGuide.id] });
    expect(patched.status).toBe(200);
    expect(patched.body.guides[0].userId).toBe(driverGuide.id);
    await prisma.tripTicket.update({
      where: { id },
      data: { status: 'approved' }
    });
    const reassigned = await request(app)
      .post(`/api/trip-tickets/${id}/guides`)
      .set('Authorization', s.header)
      .send({ guideIds: [s.guide.id] });
    expect(reassigned.status).toBe(200);
    const detail = await request(app)
      .get(`/api/trip-tickets/${id}`)
      .set('Authorization', s.header);
    const list = await request(app)
      .get('/api/trip-tickets')
      .set('Authorization', s.header);
    for (const ticket of [reassigned.body, detail.body, list.body.data[0]]) {
      expect(ticket.guides[0].userId).toBe(s.guide.id);
      expect(ticket.guides[0].user.passwordHash).toBeUndefined();
      expect(ticket.guides[0].user.refreshTokens).toBeUndefined();
    }
  });

  it('rejects inactive accounts, other roles, employee IDs, missing IDs and duplicates through every write route', async () => {
    const s = await scaffold();
    const { user: inactive } = await createTestUser({
      email: 'inactive@test.local',
      role: 'requester',
      status: 'inactive'
    });
    const ticket = await createTestTicket({
      branchId: s.branch.id,
      driverId: s.driver.id,
      vehicleId: s.vehicle.id,
      status: 'pending_admin_approval'
    });
    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, employeeId: s.legacy.id }
    });
    for (const guideIds of [
      [s.admin.id],
      [inactive.id],
      [s.legacy.id],
      [randomUUID()],
      [s.guide.id, s.guide.id]
    ]) {
      const created = await request(app)
        .post('/api/trip-tickets')
        .set('Authorization', s.header)
        .send({ ...s.body, guideIds });
      expect(created.status, JSON.stringify(guideIds)).toBe(400);
      expect(created.body.error.code).toBe('INVALID_GUIDES');
      const patched = await request(app)
        .patch(`/api/trip-tickets/${ticket.id}`)
        .set('Authorization', s.header)
        .send({ guideIds });
      expect(patched.status).toBe(400);
      expect(patched.body.error.code).toBe('INVALID_GUIDES');
    }
    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { status: 'approved' }
    });
    for (const guideIds of [
      [s.admin.id],
      [inactive.id],
      [s.legacy.id],
      [randomUUID()],
      [s.guide.id, s.guide.id]
    ]) {
      const res = await request(app)
        .post(`/api/trip-tickets/${ticket.id}/guides`)
        .set('Authorization', s.header)
        .send({ guideIds });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_GUIDES');
    }
    expect(
      await prisma.tripTicketEmployee.count({
        where: { tripTicketId: ticket.id, employeeId: s.legacy.id }
      })
    ).toBe(1);
  });

  it('keeps historical employee names and rows when unrelated ticket fields change', async () => {
    const s = await scaffold();
    const ticket = await createTestTicket({
      branchId: s.branch.id,
      driverId: s.driver.id,
      vehicleId: s.vehicle.id,
      status: 'pending_admin_approval'
    });
    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, employeeId: s.legacy.id }
    });
    await prisma.employee.update({
      where: { id: s.legacy.id },
      data: { archivedAt: new Date() }
    });
    const dates = s.body.dates.map((date) => ({
      startTs: new Date(date.startTs),
      endTs: new Date(date.endTs),
      tripTicketId: ticket.id
    }));
    await prisma.tripDate.createMany({ data: dates });
    const before = await prisma.tripTicketEmployee.findMany({
      where: { tripTicketId: ticket.id }
    });
    const patched = await request(app)
      .patch(`/api/trip-tickets/${ticket.id}`)
      .set('Authorization', s.header)
      .send({ destination: 'Updated name' });
    expect(patched.status).toBe(200);
    expect(patched.body.guides[0].employee.name).toBe('Historical Guide');
    expect(
      await prisma.tripTicketEmployee.findMany({
        where: { tripTicketId: ticket.id }
      })
    ).toEqual(before);
  });
});

describe('trip destination coordinates', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('roundtrips pins, keeps pins on unrelated edits, replaces pins and clears them on text-only destination edits', async () => {
    const s = await scaffold();
    const created = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', s.header)
      .send({
        ...s.body,
        destinationLatitude: 14.5995,
        destinationLongitude: 120.9842
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      destinationLatitude: 14.5995,
      destinationLongitude: 120.9842
    });
    const id = created.body.id;
    const preserved = await request(app)
      .patch(`/api/trip-tickets/${id}`)
      .set('Authorization', s.header)
      .send({ purpose: 'Changed purpose' });
    expect(preserved.body).toMatchObject({
      destinationLatitude: 14.5995,
      destinationLongitude: 120.9842
    });
    const moved = await request(app)
      .patch(`/api/trip-tickets/${id}`)
      .set('Authorization', s.header)
      .send({
        destination: 'Cebu',
        destinationLatitude: 10.3157,
        destinationLongitude: 123.8854
      });
    expect(moved.body).toMatchObject({
      destinationLatitude: 10.3157,
      destinationLongitude: 123.8854
    });
    const cleared = await request(app)
      .patch(`/api/trip-tickets/${id}`)
      .set('Authorization', s.header)
      .send({ destination: 'Text address' });
    expect(cleared.body).toMatchObject({
      destinationLatitude: null,
      destinationLongitude: null
    });
    const detail = await request(app)
      .get(`/api/trip-tickets/${id}`)
      .set('Authorization', s.header);
    expect(detail.body.destinationLatitude).toBeNull();
  });

  it('keeps the pin when an unrelated edit also includes the unchanged destination', async () => {
    const s = await scaffold();
    const created = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', s.header)
      .send({
        ...s.body,
        destinationLatitude: 14.5995,
        destinationLongitude: 120.9842
      });
    expect(created.status).toBe(201);
    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({
        destination: s.body.destination,
        remarks: 'Same destination, updated remarks'
      });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      destinationLatitude: 14.5995,
      destinationLongitude: 120.9842
    });
  });

  it.each([
    { destinationLatitude: 91, destinationLongitude: 0 },
    { destinationLatitude: 0, destinationLongitude: -181 },
    { destinationLatitude: 14.6 },
    { destinationLongitude: 121 },
    { destinationLatitude: null, destinationLongitude: 121 }
  ])(
    'rejects invalid or incomplete coordinates %j on create and PATCH',
    async (coordinates) => {
      const s = await scaffold();
      const created = await request(app)
        .post('/api/trip-tickets')
        .set('Authorization', s.header)
        .send({ ...s.body, ...coordinates });
      expect(created.status).toBe(400);
      expect(created.body.error.code).toBe('VALIDATION_ERROR');
      const ticket = await createTestTicket({
        branchId: s.branch.id,
        driverId: s.driver.id,
        vehicleId: s.vehicle.id,
        status: 'pending_admin_approval'
      });
      const patched = await request(app)
        .patch(`/api/trip-tickets/${ticket.id}`)
        .set('Authorization', s.header)
        .send(coordinates);
      expect(patched.status).toBe(400);
      expect(patched.body.error.code).toBe('VALIDATION_ERROR');
    }
  );
});
