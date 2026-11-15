import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestOffice,
  createTestOfficeHead,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';

const app = createApp();

async function fixture() {
  const a = await createTestBranch('A');
  const b = await createTestBranch('B');
  const officeA = await createTestOffice(a.id, 'Office A');
  const officeA2 = await createTestOffice(a.id, 'Office A2');
  const officeB = await createTestOffice(b.id, 'Office B');
  const headA = await createTestOfficeHead(a.id, officeA.id, 'Head A');
  const headA2 = await createTestOfficeHead(a.id, officeA2.id, 'Head A2');
  const headB = await createTestOfficeHead(b.id, officeB.id, 'Head B');
  const vehicle = await createTestVehicle(a.id);
  const driver = await createTestDriver(a.id);
  const employee = await createTestEmployee(a.id);
  const { user } = await createTestUser();
  const header = authHeader(user.id, user.email, 'admin');
  const start = new Date(Date.now() + 14 * 86_400_000);
  const body = {
    branchId: a.id,
    officeId: officeA.id,
    officeHeadId: headA.id,
    vehicleId: vehicle.id,
    driverId: driver.id,
    destination: 'Organization test',
    purpose: 'Trip organization validation',
    dateRequested: new Date().toISOString(),
    participantType: 'employees',
    participantEmployeeIds: [employee.id],
    dates: [
      {
        startTs: start.toISOString(),
        endTs: new Date(start.getTime() + 3_600_000).toISOString()
      }
    ]
  };
  const created = await request(app)
    .post('/api/trip-tickets')
    .set('Authorization', header)
    .send(body);
  expect(created.status).toBe(201);
  return {
    a,
    b,
    officeA,
    officeA2,
    officeB,
    headA,
    headA2,
    headB,
    header,
    body,
    id: created.body.id as string
  };
}

describe('TRIP-01 effective organization references', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('rejects branch-only updates that leave stored office/head in the previous branch', async () => {
    const s = await fixture();
    const result = await request(app)
      .patch(`/api/trip-tickets/${s.id}`)
      .set('Authorization', s.header)
      .send({ branchId: s.b.id });
    expect(result.status).toBe(400);
    expect(
      await prisma.tripTicket.findUnique({ where: { id: s.id } })
    ).toMatchObject({
      branchId: s.a.id,
      officeId: s.officeA.id,
      officeHeadId: s.headA.id
    });
  });

  it('rejects office-only changes that strand the stored head in another office', async () => {
    const s = await fixture();
    const result = await request(app)
      .patch(`/api/trip-tickets/${s.id}`)
      .set('Authorization', s.header)
      .send({ officeId: s.officeA2.id });
    expect(result.status).toBe(400);
  });

  it('rejects head-only changes to another branch or another office', async () => {
    const s = await fixture();
    for (const head of [s.headB, s.headA2]) {
      const result = await request(app)
        .patch(`/api/trip-tickets/${s.id}`)
        .set('Authorization', s.header)
        .send({ officeHeadId: head.id });
      expect(result.status).toBe(400);
    }
  });

  it('accepts a coherent reassignment or explicit clearing while preserving unrelated edits', async () => {
    const s = await fixture();
    const coherent = await request(app)
      .patch(`/api/trip-tickets/${s.id}`)
      .set('Authorization', s.header)
      .send({
        branchId: s.b.id,
        officeId: s.officeB.id,
        officeHeadId: s.headB.id
      });
    expect(coherent.status).toBe(200);
    expect(coherent.body).toMatchObject({
      branchId: s.b.id,
      officeId: s.officeB.id,
      officeHeadId: s.headB.id
    });
    const clear = await request(app)
      .patch(`/api/trip-tickets/${s.id}`)
      .set('Authorization', s.header)
      .send({ branchId: s.a.id, officeId: null, officeHeadId: null });
    expect(clear.status).toBe(200);
    const unrelated = await request(app)
      .patch(`/api/trip-tickets/${s.id}`)
      .set('Authorization', s.header)
      .send({ purpose: 'Updated purpose' });
    expect(unrelated.status).toBe(200);
    expect(unrelated.body).toMatchObject({
      officeId: null,
      officeHeadId: null,
      purpose: 'Updated purpose'
    });
  });

  it('rejects mismatched create references before creating a booking', async () => {
    const s = await fixture();
    const before = await prisma.tripTicket.count();
    const result = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', s.header)
      .send({
        ...s.body,
        officeId: s.officeB.id,
        officeHeadId: s.headB.id,
        dates: [
          {
            startTs: new Date(Date.now() + 24 * 86_400_000).toISOString(),
            endTs: new Date(
              Date.now() + 24 * 86_400_000 + 3_600_000
            ).toISOString()
          }
        ]
      });
    expect(result.status).toBe(400);
    expect(await prisma.tripTicket.count()).toBe(before);
  });
});
