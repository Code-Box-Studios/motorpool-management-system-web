import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';

const app = createApp();
beforeEach(truncateAll);
afterAll(() => prisma.$disconnect());

async function setup() {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(branch.id);
  const { user } = await createTestUser();
  const employee = await createTestEmployee(branch.id, 'Employee One');
  const other = await createTestEmployee(branch.id, 'Employee Two');
  const guide = await createTestEmployee(branch.id, 'Trip Guide');
  const archived = await createTestEmployee(branch.id, 'Archived Employee');
  await prisma.employee.update({
    where: { id: archived.id },
    data: { archivedAt: new Date() }
  });
  const header = authHeader(user.id, user.email, 'admin');
  const start = new Date(Date.now() + 86400000);
  const body = {
    branchId: branch.id,
    vehicleId: vehicle.id,
    driverId: driver.id,
    destination: 'Employee event',
    purpose: 'Participant test',
    dateRequested: new Date().toISOString(),
    dates: [
      {
        startTs: start.toISOString(),
        endTs: new Date(start.getTime() + 3600000).toISOString()
      }
    ],
    participantType: 'employees',
    participantEmployeeIds: [employee.id, other.id],
    guideIds: []
  };
  const create = (data: Record<string, unknown> = body) =>
    request(app)
      .post('/api/trip-tickets')
      .set('Authorization', header)
      .send(data);
  const patch = (id: string, data: Record<string, unknown>) =>
    request(app)
      .patch(`/api/trip-tickets/${id}`)
      .set('Authorization', header)
      .send(data);
  return {
    branch,
    vehicle,
    employee,
    other,
    guide,
    archived,
    header,
    body,
    create,
    patch
  };
}

describe('student and employee trip participants', () => {
  it('creates an employee trip without guides, deriving names and headcount from the roster', async () => {
    const s = await setup();
    const response = await s.create({
      ...s.body,
      participants: ['Forged name']
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      participantType: 'employees',
      participants: ['Employee One', 'Employee Two'],
      participantsCount: 2,
      guides: []
    });
    expect(
      response.body.participantEmployees
        .map((row: { employeeId: string }) => row.employeeId)
        .sort()
    ).toEqual([s.employee.id, s.other.id].sort());
    const list = await request(app)
      .get('/api/trip-tickets')
      .set('Authorization', s.header);
    expect(list.body.data[0]).toMatchObject({
      participantType: 'employees',
      participantsCount: 2
    });
  });

  it('keeps private employee contact fields out of trip participant responses', async () => {
    const s = await setup();
    await prisma.employee.update({
      where: { id: s.employee.id },
      data: { phone: '09170000000' }
    });
    const created = await s.create();
    expect(created.status).toBe(201);
    const member = created.body.participantEmployees.find(
      (row: { employeeId: string }) => row.employeeId === s.employee.id
    );
    expect(member.employee).toMatchObject({
      id: s.employee.id,
      name: 'Employee One',
      position: null,
      archivedAt: null
    });
    expect(member.employee).not.toHaveProperty('phone');
    const list = await request(app)
      .get('/api/trip-tickets')
      .set('Authorization', s.header);
    const listed = list.body.data[0].participantEmployees.find(
      (row: { employeeId: string }) => row.employeeId === s.employee.id
    );
    expect(listed.employee).not.toHaveProperty('phone');
  });

  it('blocks employee archival while they participate in a live trip and releases the blocker after completion', async () => {
    const s = await setup();
    const created = await s.create();
    expect(created.status).toBe(201);
    const blocked = await request(app)
      .post(`/api/employees/${s.employee.id}/archive`)
      .set('Authorization', s.header);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('IN_USE');
    await prisma.tripTicket.update({
      where: { id: created.body.id },
      data: { status: 'completed' }
    });
    expect(
      (
        await request(app)
          .post(`/api/employees/${s.employee.id}/archive`)
          .set('Authorization', s.header)
      ).status
    ).toBe(200);
  });

  it('keeps free-text students and requires at least one guide', async () => {
    const s = await setup();
    const student = {
      ...s.body,
      participantType: 'students',
      participantEmployeeIds: [],
      participants: ['Student One']
    };
    expect((await s.create(student)).status).toBe(400);
    const response = await s.create({ ...student, guideIds: [s.guide.id] });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      participantType: 'students',
      participants: ['Student One'],
      participantEmployees: []
    });
    expect((await s.patch(response.body.id, { guideIds: [] })).status).toBe(
      400
    );
  });

  it('rejects duplicate, missing, archived, and login-account employee identities without creating a ticket', async () => {
    const s = await setup();
    const { user } = await createTestUser({
      email: 'not-an-employee@test.local',
      role: 'requester'
    });
    for (const ids of [
      [s.employee.id, s.employee.id],
      [randomUUID()],
      [s.archived.id],
      [user.id]
    ]) {
      const response = await s.create({
        ...s.body,
        participantEmployeeIds: ids
      });
      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(response.body.error.code).toBe('INVALID_PARTICIPANTS');
    }
    expect(await prisma.tripTicket.count()).toBe(0);
  });

  it('rejects employee participants also assigned as guides', async () => {
    const s = await setup();
    const response = await s.create({ ...s.body, guideIds: [s.employee.id] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DUPLICATE_TRIP_EMPLOYEE');
  });

  it('counts employee participants and optional guides against capacity', async () => {
    const s = await setup();
    await prisma.vehicle.update({
      where: { id: s.vehicle.id },
      data: { capacity: 2 }
    });
    const over = await s.create({ ...s.body, guideIds: [s.guide.id] });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('OVER_CAPACITY');
    expect((await s.create()).status).toBe(201);
  });

  it('replaces employee membership atomically and rejects an invalid replacement without changing names', async () => {
    const s = await setup();
    const created = await s.create();
    expect(created.status).toBe(201);
    const response = await s.patch(created.body.id, {
      participantEmployeeIds: [s.other.id]
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      participants: ['Employee Two'],
      participantsCount: 1
    });
    expect(response.body.participantEmployees).toHaveLength(1);
    const rejected = await s.patch(created.body.id, {
      participantEmployeeIds: [s.archived.id]
    });
    expect(rejected.status).toBe(400);
    const stored = await request(app)
      .get(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header);
    expect(stored.body.participants).toEqual(['Employee Two']);
  });

  it('preserves archived roster membership and historical names on an unrelated edit', async () => {
    const s = await setup();
    const created = await s.create();
    expect(created.status).toBe(201);
    await prisma.employee.update({
      where: { id: s.employee.id },
      data: { archivedAt: new Date(), name: 'Renamed Employee' }
    });
    const response = await s.patch(created.body.id, {
      purpose: 'Revised purpose'
    });
    expect(response.status).toBe(200);
    expect(response.body.participants).toEqual([
      'Employee One',
      'Employee Two'
    ]);
    expect(response.body.participantEmployees).toHaveLength(2);
  });

  it('requires guides when switching employees to students and clears roster membership after a valid switch', async () => {
    const s = await setup();
    const created = await s.create();
    expect(created.status).toBe(201);
    expect(
      (
        await s.patch(created.body.id, {
          participantType: 'students',
          participants: ['Student One'],
          participantsCount: 1
        })
      ).status
    ).toBe(400);
    const response = await s.patch(created.body.id, {
      participantType: 'students',
      participantEmployeeIds: [],
      participants: ['Student One'],
      participantsCount: 1,
      guideIds: [s.guide.id]
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      participantType: 'students',
      participants: ['Student One'],
      participantEmployees: []
    });
  });

  it('allows removing every guide from an approved employee trip, while preserving the student requirement', async () => {
    const s = await setup();
    const created = await s.create({ ...s.body, guideIds: [s.guide.id] });
    expect(created.status).toBe(201);
    await prisma.tripTicket.update({
      where: { id: created.body.id },
      data: { status: 'approved' }
    });
    const response = await request(app)
      .post(`/api/trip-tickets/${created.body.id}/guides`)
      .set('Authorization', s.header)
      .send({ guideIds: [] });
    expect(response.status).toBe(200);
    expect(response.body.guides).toEqual([]);
  });

  it('refuses a draft deletion if approval commits after the deletion preflight read', async () => {
    const s = await setup();
    const created = await s.create();
    expect(created.status).toBe(201);
    const original = prisma.tripTicket.findUnique.bind(prisma.tripTicket);
    let resume!: () => void;
    let loaded!: () => void;
    const ready = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    const release = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let first = true;
    prisma.tripTicket.findUnique = (async (
      args: Parameters<typeof original>[0]
    ) => {
      const result = await original(args);
      if (first) {
        first = false;
        loaded();
        await release;
      }
      return result;
    }) as unknown as typeof prisma.tripTicket.findUnique;
    const deleting = request(app)
      .delete(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .then((response) => response);
    try {
      await ready;
      const approved = await request(app)
        .post(`/api/trip-tickets/${created.body.id}/approve`)
        .set('Authorization', s.header)
        .send({
          liters: 10,
          fuelType: 'diesel',
          date: new Date().toISOString(),
          purpose: 'Approved trip',
          tripTo: 'Campus'
        });
      expect(approved.status).toBe(200);
    } finally {
      resume();
    }
    const response = await deleting;
    prisma.tripTicket.findUnique = original;
    expect(response.status).toBe(409);
    expect(
      await prisma.fuelAllocation.count({
        where: { tripTicketId: created.body.id }
      })
    ).toBe(1);
    expect(
      await prisma.tripTicket.count({ where: { id: created.body.id } })
    ).toBe(1);
  });
});
