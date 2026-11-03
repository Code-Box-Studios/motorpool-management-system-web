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
  const guide = await prisma.employee.create({
    data: {
      name: 'Other Branch Guide',
      position: 'Tour Guide',
      branchId: otherBranch.id
    }
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

describe('trip guides use the employee roster', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('offers unarchived employees across branches with their positions, excluding login accounts', async () => {
    const s = await scaffold();
    await createTestUser({ email: 'requester@test.local', role: 'requester' });
    await createTestUser({ email: 'driver@test.local', role: 'driver' });
    await prisma.employee.create({
      data: {
        name: 'Archived Guide',
        branchId: s.branch.id,
        archivedAt: new Date()
      }
    });
    const res = await request(app)
      .get('/api/trip-tickets/guide-options')
      .set('Authorization', s.header);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: s.legacy.id, name: 'Historical Guide', position: null },
      { id: s.guide.id, name: 'Other Branch Guide', position: 'Tour Guide' }
    ]);
    expect(
      (await request(app).get('/api/trip-tickets/guide-options')).status
    ).toBe(401);
  });

  it('returns employees beyond normal list page boundaries', async () => {
    const s = await scaffold();
    const ids = Array.from({ length: 105 }, () => randomUUID());
    await prisma.employee.createMany({
      data: ids.map((id, index) => ({
        id,
        name: `Roster ${index}`,
        branchId: s.branch.id
      }))
    });
    const res = await request(app)
      .get('/api/trip-tickets/guide-options')
      .set('Authorization', s.header);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(107);
    expect(res.body.map((guide: { id: string }) => guide.id)).toEqual(
      expect.arrayContaining([...ids, s.guide.id, s.legacy.id])
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
          userId: s.admin.id,
          employeeId: s.legacy.id
        }
      })
    ).rejects.toThrow();
    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, userId: s.admin.id }
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

  it('creates, edits and reassigns employees, returning them on detail and list', async () => {
    const s = await scaffold();
    const created = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', s.header)
      .send(s.body);
    expect(created.status).toBe(201);
    expect(created.body.guides[0]).toMatchObject({
      employeeId: s.guide.id,
      userId: null,
      employee: {
        id: s.guide.id,
        name: 'Other Branch Guide',
        position: 'Tour Guide'
      }
    });
    const id = created.body.id;
    const patched = await request(app)
      .patch(`/api/trip-tickets/${id}`)
      .set('Authorization', s.header)
      .send({ guideIds: [s.legacy.id] });
    expect(patched.status).toBe(200);
    expect(patched.body.guides[0].employeeId).toBe(s.legacy.id);
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
    expect(detail.status).toBe(200);
    expect(list.status).toBe(200);
    for (const ticket of [reassigned.body, detail.body, list.body.data[0]]) {
      expect(ticket.guides[0]).toMatchObject({
        employeeId: s.guide.id,
        userId: null
      });
      expect(ticket.guides[0].employee.name).toBe('Other Branch Guide');
    }
  });

  it('rejects archived employees, user IDs, missing IDs and duplicates through every write route', async () => {
    const s = await scaffold();
    const { user: account } = await createTestUser({
      email: 'requester@test.local',
      role: 'requester'
    });
    const archived = await prisma.employee.create({
      data: {
        name: 'Archived Guide',
        branchId: s.branch.id,
        archivedAt: new Date()
      }
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
    const invalid = [
      [s.admin.id],
      [account.id],
      [archived.id],
      [randomUUID()],
      [s.guide.id, s.guide.id]
    ];
    for (const guideIds of invalid) {
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
    for (const guideIds of invalid) {
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

  it.each(['employee', 'user'] as const)(
    'preserves historical %s assignments on unrelated edits',
    async (identity) => {
      const s = await scaffold();
      const { user: account } = await createTestUser({
        email: 'old-guide@test.local',
        role: 'requester'
      });
      const ticket = await createTestTicket({
        branchId: s.branch.id,
        driverId: s.driver.id,
        vehicleId: s.vehicle.id,
        status: 'pending_admin_approval'
      });
      await prisma.tripTicketEmployee.create({
        data: {
          tripTicketId: ticket.id,
          ...(identity === 'employee'
            ? { employeeId: s.legacy.id }
            : { userId: account.id })
        }
      });
      await prisma.employee.update({
        where: { id: s.legacy.id },
        data: { archivedAt: new Date() }
      });
      await prisma.user.update({
        where: { id: account.id },
        data: { status: 'inactive' }
      });
      await prisma.tripDate.createMany({
        data: s.body.dates.map((date) => ({
          startTs: new Date(date.startTs),
          endTs: new Date(date.endTs),
          tripTicketId: ticket.id
        }))
      });
      const before = await prisma.tripTicketEmployee.findMany({
        where: { tripTicketId: ticket.id }
      });
      const patched = await request(app)
        .patch(`/api/trip-tickets/${ticket.id}`)
        .set('Authorization', s.header)
        .send({ destination: 'Updated name' });
      expect(patched.status).toBe(200);
      if (identity === 'employee')
        expect(patched.body.guides[0].employee.name).toBe('Historical Guide');
      else {
        expect(patched.body.guides[0].user.id).toBe(account.id);
        expect(patched.body.guides[0].user.passwordHash).toBeUndefined();
      }
      expect(
        await prisma.tripTicketEmployee.findMany({
          where: { tripTicketId: ticket.id }
        })
      ).toEqual(before);
    }
  );
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
