import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';

const app = createApp();
const start = new Date('2026-10-25T00:00:00Z');
const end = new Date('2026-10-25T00:10:00Z');
async function fixture() {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(branch.id);
  const { user } = await createTestUser({ role: 'admin' });
  const ticket = await createTestTicket({
    branchId: branch.id,
    vehicleId: vehicle.id,
    driverId: driver.id,
    status: 'completed'
  });
  await prisma.tripDate.create({
    data: {
      tripTicketId: ticket.id,
      startTs: start,
      endTs: end,
      preTripCheckedAt: start,
      postTripCheckedAt: end,
      status: 'completed'
    }
  });
  await prisma.fuelAllocation.create({
    data: {
      tripTicketId: ticket.id,
      vehicleId: vehicle.id,
      branchId: branch.id,
      requestedById: user.id,
      liters: 15,
      fuelType: 'diesel',
      date: new Date('2026-10-25'),
      purpose: 'Event-time regression',
      tripTo: 'City',
      status: 'approved'
    }
  });
  const report = () =>
    request(app)
      .get('/api/reports')
      .query({
        type: 'fuel',
        vehicleId: vehicle.id,
        from: '2026-10-25',
        to: '2026-10-25'
      })
      .set('Authorization', authHeader(user.id, user.email, 'admin'));
  return { vehicle, ticket, report };
}

describe('fuel report GPS event-time attribution', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('includes in-outing measurements received after the vehicle returned', async () => {
    const s = await fixture();
    await prisma.gpsData.createMany({
      data: [
        {
          vehicleId: s.vehicle.id,
          tripId: s.ticket.id,
          latitude: 7,
          longitude: 125,
          fixTime: start,
          createdAt: new Date('2026-10-25T02:00:00Z')
        },
        {
          vehicleId: s.vehicle.id,
          tripId: s.ticket.id,
          latitude: 7,
          longitude: 125.01,
          fixTime: end,
          createdAt: new Date('2026-10-25T02:00:01Z')
        }
      ]
    });
    const response = await s.report();
    expect(response.status).toBe(200);
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.fuel.totalLiters).toBe(15);
    // 0.01 longitude degrees at latitude 7 is approximately 1.104 km.
    expect(response.body.fuel.totalDistanceKm).toBeGreaterThan(1.1);
    expect(response.body.fuel.totalDistanceKm).toBeLessThan(1.11);
    expect(response.body.fuel.excluded).toEqual([]);
  });

  it('excludes old measurements merely received during an unrelated outing', async () => {
    const s = await fixture();
    await prisma.gpsData.createMany({
      data: [
        {
          vehicleId: s.vehicle.id,
          tripId: null,
          latitude: 7,
          longitude: 125,
          fixTime: new Date('2026-10-24T22:00:00Z'),
          createdAt: start
        },
        {
          vehicleId: s.vehicle.id,
          tripId: null,
          latitude: 7,
          longitude: 125.01,
          fixTime: new Date('2026-10-24T22:10:00Z'),
          createdAt: end
        }
      ]
    });
    const response = await s.report();
    expect(response.status).toBe(200);
    expect(response.body.rows).toEqual([]);
    expect(response.body.fuel.totalDistanceKm).toBe(0);
    expect(response.body.fuel.totalLiters).toBe(0);
    expect(response.body.fuel.excluded).toEqual([
      expect.objectContaining({ reason: 'Insufficient valid GPS samples' })
    ]);
  });

  it('retains receipt-time fallback for legacy rows with no known fix time', async () => {
    const s = await fixture();
    await prisma.gpsData.createMany({
      data: [
        {
          vehicleId: s.vehicle.id,
          tripId: null,
          latitude: 7,
          longitude: 125,
          fixTime: null,
          createdAt: start
        },
        {
          vehicleId: s.vehicle.id,
          tripId: null,
          latitude: 7,
          longitude: 125.01,
          fixTime: null,
          createdAt: end
        }
      ]
    });
    const response = await s.report();
    expect(response.status).toBe(200);
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.fuel.totalLiters).toBe(15);
    expect(response.body.fuel.totalDistanceKm).toBeGreaterThan(1.1);
    expect(response.body.fuel.totalDistanceKm).toBeLessThan(1.11);
    expect(response.body.fuel.excluded).toEqual([]);
  });
});
