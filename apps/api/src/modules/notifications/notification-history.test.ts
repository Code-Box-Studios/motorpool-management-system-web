import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import * as events from './events.js';

const app = createApp();

async function scaffold() {
  const branch = await createTestBranch();
  const { user: admin } = await createTestUser();
  const { user: requester } = await createTestUser({
    role: 'requester',
    email: 'requester-history@test.local'
  });
  const { user: driverUser } = await createTestUser({
    role: 'driver',
    email: 'driver-history@test.local'
  });
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(branch.id);
  await prisma.driver.update({
    where: { id: driver.id },
    data: { userId: driverUser.id }
  });
  const created = await createTestTicket({
    branchId: branch.id,
    vehicleId: vehicle.id,
    driverId: driver.id
  });
  const ticket = await prisma.tripTicket.update({
    where: { id: created.id },
    data: { requestedById: requester.id }
  });
  return {
    branch,
    admin,
    requester,
    driverUser,
    vehicle,
    ticket,
    linkTo: `/trip-tickets/${ticket.id}`,
    requesterHeader: authHeader(requester.id, requester.email, 'requester'),
    adminHeader: authHeader(admin.id, admin.email, 'admin')
  };
}

describe('notification history and current record status', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it.each(['cancelled', 'completed', 'disapproved'] as const)(
    'shows a legacy approval as history when the trip is %s, without changing read state or stored history',
    async (status) => {
      const s = await scaffold();
      await prisma.tripTicket.update({
        where: { id: s.ticket.id },
        data: { status }
      });
      const readAt = new Date('2026-08-01T00:00:00Z');
      const historical = await prisma.notification.create({
        data: {
          userId: s.requester.id,
          type: 'trip_approved',
          title: `TT-${s.ticket.ticketNo} is approved`,
          body: 'Somewhere — fuel allocated. You are good to go.',
          linkTo: s.linkTo,
          readAt
        }
      });
      const unread = await prisma.notification.create({
        data: {
          userId: s.requester.id,
          type: 'trip_awaiting_approval',
          title: `TT-${s.ticket.ticketNo} needs your approval`,
          linkTo: s.linkTo
        }
      });
      await prisma.notification.create({
        data: {
          userId: s.admin.id,
          type: 'trip_approved',
          title: 'Private to another recipient'
        }
      });
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', s.requesterHeader);
      expect(res.status).toBe(200);
      expect(res.body.unread).toBe(1);
      expect(res.body.data).toHaveLength(2);
      const approval = res.body.data.find(
        (row: { id: string }) => row.id === historical.id
      );
      expect(approval).toMatchObject({
        id: historical.id,
        title: `TT-${s.ticket.ticketNo} was approved`,
        currentStatus: status,
        linkTo: s.linkTo,
        readAt: readAt.toISOString()
      });
      expect(approval.body).not.toMatch(/good to go/i);
      const oldAction = res.body.data.find(
        (row: { id: string }) => row.id === unread.id
      );
      expect(oldAction.title).not.toMatch(/needs your approval/);
      expect(oldAction.currentStatus).toBe(status);
      expect(
        await prisma.notification.findUnique({ where: { id: historical.id } })
      ).toEqual(historical);
      const unreadOnly = await request(app)
        .get('/api/notifications?unreadOnly=true')
        .set('Authorization', s.requesterHeader);
      expect(unreadOnly.body.data.map((row: { id: string }) => row.id)).toEqual(
        [unread.id]
      );
      expect(unreadOnly.body.unread).toBe(1);
      const marked = await request(app)
        .post('/api/notifications/mark-read')
        .set('Authorization', s.requesterHeader)
        .send({ ids: [unread.id] });
      expect(marked.body).toEqual({ count: 1, unread: 0 });
      expect(
        await prisma.notification.count({ where: { userId: s.requester.id } })
      ).toBe(2);
    }
  );

  it('writes approval and driving-assignment events as past events while reporting the current approval', async () => {
    const s = await scaffold();
    await events.tripApprovedByEvp(s.ticket, {
      id: s.admin.id,
      email: s.admin.email,
      role: 'admin',
      branchId: s.branch.id
    });
    const approval = await prisma.notification.findFirstOrThrow({
      where: { userId: s.requester.id }
    });
    expect(approval.title).toMatch(/was approved$/);
    expect(approval.body).not.toMatch(/good to go/);
    const assignment = await prisma.notification.findFirstOrThrow({
      where: { userId: s.driverUser.id }
    });
    expect(assignment.title).toMatch(/were assigned to drive/);
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', s.requesterHeader);
    expect(res.body.data[0].currentStatus).toBe('approved');
  });

  it('keeps the cancelling actor’s approval history and notifies the requester, driver and other admins once', async () => {
    const s = await scaffold();
    const { user: bystander } = await createTestUser({
      email: 'bystander-history@test.local'
    });
    const history = await prisma.notification.create({
      data: {
        userId: s.admin.id,
        type: 'trip_approved',
        title: `TT-${s.ticket.ticketNo} is approved`,
        linkTo: s.linkTo,
        readAt: new Date()
      }
    });
    const cancelled = await request(app)
      .post(`/api/trip-tickets/${s.ticket.id}/cancel`)
      .set('Authorization', s.adminHeader)
      .send({ reason: 'Venue closed' });
    expect(cancelled.status).toBe(200);
    const cancellations = await prisma.notification.findMany({
      where: { type: 'trip_cancelled' }
    });
    expect(cancellations.map((row) => row.userId).sort()).toEqual(
      [s.requester.id, s.driverUser.id, bystander.id].sort()
    );
    expect(
      cancellations.every(
        (row) => row.body === 'Venue closed' && row.linkTo === s.linkTo
      )
    ).toBe(true);
    const actorList = await request(app)
      .get('/api/notifications')
      .set('Authorization', s.adminHeader);
    expect(actorList.body.unread).toBe(0);
    expect(actorList.body.data).toHaveLength(1);
    expect(actorList.body.data[0]).toMatchObject({
      id: history.id,
      currentStatus: 'cancelled',
      title: `TT-${s.ticket.ticketNo} was approved`
    });
  });

  it('updates linked job-order status without presenting a finished repair as ready to proceed', async () => {
    const s = await scaffold();
    const order = await prisma.jobOrder.create({
      data: {
        branchId: s.branch.id,
        vehicleId: s.vehicle.id,
        status: 'repaired'
      }
    });
    await prisma.notification.create({
      data: {
        userId: s.requester.id,
        type: 'job_order_approved',
        title: `JO-${order.orderNo} was approved`,
        body: 'The repair is signed off and can proceed.',
        linkTo: `/job-order/${order.id}`
      }
    });
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', s.requesterHeader);
    expect(res.status).toBe(200);
    expect(res.body.data[0].currentStatus).toBe('repaired');
    expect(res.body.data[0].body).not.toMatch(/can proceed/);
  });

  it('keeps missing and malformed record links as history without failing the bell', async () => {
    const s = await scaffold();
    const links = [
      `/trip-tickets/${randomUUID()}`,
      '/trip-tickets/not-a-uuid',
      null
    ];
    for (const linkTo of links) {
      await prisma.notification.create({
        data: {
          userId: s.requester.id,
          type: 'trip_disapproved',
          title: 'A historical decision',
          body: 'The original reason',
          linkTo
        }
      });
    }
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', s.requesterHeader);
    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(3);
    expect(res.body.data).toHaveLength(3);
    for (const row of res.body.data) {
      expect(row).toMatchObject({
        title: 'A historical decision',
        body: 'The original reason',
        currentStatus: null
      });
      expect(links).toContain(row.linkTo);
    }
  });
});
