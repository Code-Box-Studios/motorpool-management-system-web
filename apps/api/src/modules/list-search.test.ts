import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { truncateAll } from '../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../test/factories.js';

const app = createApp();

describe('record list search', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('finds reference substrings before pagination, including an internal zero', async () => {
    const { user } = await createTestUser();
    const header = authHeader(user.id, user.email, 'admin');
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id, {
      licensePlate: 'SEARCH-ABC'
    });
    const driver = await createTestDriver(branch.id);
    for (const number of [123, 223, 789, 10]) {
      const ticket = await createTestTicket({
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id
      });
      await prisma.tripTicket.update({
        where: { id: ticket.id },
        data: { ticketNo: number }
      });
      await prisma.jobOrder.create({
        data: { branchId: branch.id, vehicleId: vehicle.id, orderNo: number }
      });
    }
    for (const [endpoint, field] of [
      ['trip-tickets', 'ticketNo'],
      ['job-orders', 'orderNo']
    ] as const) {
      const response = await request(app)
        .get(`/api/${endpoint}`)
        .query({
          search: '23',
          page: 2,
          limit: 1,
          sortBy: field,
          sortOrder: 'asc'
        })
        .set('Authorization', header);
      expect(response.body.count, endpoint).toBe(2);
      expect(response.body.data[0]?.[field], endpoint).toBe(223);
      const zero = await request(app)
        .get(`/api/${endpoint}`)
        .query({ search: '0' })
        .set('Authorization', header);
      expect(zero.body.count, endpoint).toBe(1);
      expect(zero.body.data[0]?.[field], endpoint).toBe(10);
    }
  });

  it('searches the license type displayed beside the driver license number', async () => {
    const { user } = await createTestUser();
    const branch = await createTestBranch();
    const driver = await createTestDriver(branch.id);
    await prisma.driver.update({
      where: { id: driver.id },
      data: { licenseType: 'Professional' }
    });
    const response = await request(app)
      .get('/api/drivers')
      .query({ search: 'pRoFeSs' })
      .set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(response.body.count).toBe(1);
    expect(response.body.data[0]?.id).toBe(driver.id);
  });

  it('searches the full list before pagination and returns filtered counts', async () => {
    const { user } = await createTestUser();
    const header = authHeader(user.id, user.email, 'admin');
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id, {
      licensePlate: 'Needle-42'
    });
    const driver = await createTestDriver(branch.id);
    await prisma.driver.update({
      where: { id: driver.id },
      data: { fullName: 'Needle Driver' }
    });
    const ticket = await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id
    });
    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { destination: 'Needle City' }
    });
    const order = await prisma.jobOrder.create({
      data: {
        branchId: branch.id,
        vehicleId: vehicle.id,
        incidentDetails: 'Needle repair'
      }
    });
    const maintenance = await prisma.maintenance.create({
      data: {
        vehicleId: vehicle.id,
        type: 'preventive',
        date: new Date(),
        description: 'Needle inspection'
      }
    });
    const part = await prisma.sparePart.create({
      data: { name: 'Needle filter' }
    });
    const tool = await prisma.tool.create({ data: { name: 'Needle wrench' } });
    const tracker = await prisma.trackerDevice.create({
      data: { imei: '123456789012345', label: 'Needle tracker' }
    });
    const { user: targetUser } = await createTestUser({
      email: 'needle@test.local',
      fullName: 'Needle User'
    });
    // Newer non-matches ensure the matching record is outside an unfiltered first page.
    const otherVehicle = await createTestVehicle(branch.id, {
      licensePlate: 'OTHER-1'
    });
    const otherDriver = await createTestDriver(
      branch.id,
      'active',
      'other@test.local'
    );
    await createTestTicket({
      branchId: branch.id,
      driverId: otherDriver.id,
      vehicleId: otherVehicle.id
    });
    await prisma.jobOrder.create({
      data: { branchId: branch.id, vehicleId: otherVehicle.id }
    });
    await prisma.maintenance.create({
      data: { vehicleId: otherVehicle.id, type: 'repair', date: new Date() }
    });
    await prisma.sparePart.create({ data: { name: 'Other filter' } });
    await prisma.tool.create({ data: { name: 'Other wrench' } });
    await prisma.trackerDevice.create({
      data: { imei: '987654321098765', label: 'Other tracker' }
    });
    await createTestUser({ email: 'other-user@test.local' });

    const targets = [
      ['drivers', driver.id],
      ['vehicles', vehicle.id],
      ['trip-tickets', ticket.id],
      ['job-orders', order.id],
      ['maintenance', maintenance.id],
      ['spare-parts', part.id],
      ['tools', tool.id],
      ['tracker-devices', tracker.id],
      ['users', targetUser.id]
    ];
    for (const [endpoint, id] of targets) {
      const response = await request(app)
        .get(`/api/${endpoint}`)
        .query({ search: '  nEeDlE  ', page: 1, limit: 1 })
        .set('Authorization', header);
      expect(response.status, endpoint).toBe(200);
      expect(response.body.count, endpoint).toBe(1);
      expect(
        response.body.data.map((row: { id: string }) => row.id),
        endpoint
      ).toEqual([id]);
    }
  });

  it('keeps requester scope when search has multiple possible matches', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id);
    const { user } = await createTestUser({ role: 'requester' });
    const ticket = await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id
    });
    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { destination: 'Needle hidden' }
    });
    await prisma.jobOrder.create({
      data: {
        branchId: branch.id,
        vehicleId: vehicle.id,
        incidentDetails: 'Needle hidden'
      }
    });
    for (const endpoint of ['trip-tickets', 'job-orders']) {
      const response = await request(app)
        .get(`/api/${endpoint}`)
        .query({ search: 'needle' })
        .set('Authorization', authHeader(user.id, user.email, 'requester'));
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ data: [], count: 0 });
    }
  });

  it('treats SQL wildcard characters as literal search text', async () => {
    const { user } = await createTestUser();
    await prisma.sparePart.createMany({
      data: [{ name: '100% filter' }, { name: 'Other filter' }]
    });
    const response = await request(app)
      .get('/api/spare-parts')
      .query({ search: '%' })
      .set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(response.body.count).toBe(1);
    expect(response.body.data[0].name).toBe('100% filter');
  });

  it('searches complete approval history before merging and paging decisions', async () => {
    const { user } = await createTestUser();
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id);
    for (const title of ['Needle repair', 'Unrelated repair']) {
      await prisma.jobOrder.create({
        data: {
          branchId: branch.id,
          vehicleId: vehicle.id,
          incidentDetails: title,
          approvedById: user.id,
          dateApproved: new Date('2025-01-01')
        }
      });
    }
    for (const destination of ['Needle City', 'Unrelated City']) {
      const ticket = await createTestTicket({
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id
      });
      await prisma.tripTicket.update({
        where: { id: ticket.id },
        data: { destination }
      });
      await prisma.fuelAllocation.create({
        data: {
          tripTicketId: ticket.id,
          vehicleId: vehicle.id,
          requestedById: user.id,
          liters: 20,
          fuelType: 'diesel',
          date: new Date(),
          purpose: 'Testing',
          tripTo: destination,
          status: 'approved',
          decidedById: user.id,
          decidedAt: new Date('2026-01-01')
        }
      });
    }
    const response = await request(app)
      .get('/api/approvals/history')
      .query({ search: 'NEEDLE', page: 1, limit: 1 })
      .set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      title: 'Needle City',
      kind: 'fuel'
    });
  });
});
