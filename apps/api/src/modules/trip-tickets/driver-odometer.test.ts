import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import { fixtureGateDateId } from '../../test/trip-gate.js';
import {
  authHeader,
  createTestBranch,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';

const app = createApp();
async function setup() {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const { user: driverUser } = await createTestUser({
    role: 'driver',
    email: 'assigned@test.local',
    branchId: branch.id
  });
  const { user: guard } = await createTestUser({
    role: 'security_guard',
    email: 'gate@test.local',
    branchId: branch.id
  });
  const { user: admin } = await createTestUser({
    role: 'admin',
    email: 'admin@test.local'
  });
  const driver = await prisma.driver.create({
    data: {
      userId: driverUser.id,
      email: driverUser.email,
      fullName: 'Assigned Driver',
      status: 'active',
      branchId: branch.id
    }
  });
  const ticket = await prisma.tripTicket.create({
    data: {
      branchId: branch.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
      status: 'approved',
      preparedBy: '',
      destination: 'Campus',
      purpose: 'Visit',
      dateRequested: new Date(),
      dates: {
        create: {
          startTs: new Date(Date.now() - 3600000),
          endTs: new Date(Date.now() + 3600000)
        }
      }
    },
    include: { dates: true }
  });
  const date = ticket.dates[0]!;
  const driverAuth = authHeader(
    driverUser.id,
    driverUser.email,
    'driver',
    branch.id
  );
  const guardAuth = authHeader(
    guard.id,
    guard.email,
    'security_guard',
    branch.id
  );
  const read = (
    phase: 'before' | 'after',
    mileage: number,
    header = driverAuth
  ) =>
    request(app)
      .post(`/api/trip-tickets/${ticket.id}/dates/${date.id}/odometer`)
      .set('Authorization', header)
      .send({ phase, mileage });
  const scan = async (phase: 'out' | 'in', header = guardAuth) =>
    request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-${phase}`)
      .set('Authorization', header)
      .send({ dateId: await fixtureGateDateId(ticket.id) });
  return {
    branch,
    vehicle,
    ticket,
    date,
    driverUser,
    driverAuth,
    guardAuth,
    adminAuth: authHeader(admin.id, admin.email, 'admin'),
    read,
    scan
  };
}

describe('driver readings with QR-only gate transitions', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());
  it('scans out/in with missing readings and records guard stamps without inventing mileage', async () => {
    const s = await setup();
    expect((await s.scan('out')).status).toBe(200);
    expect((await s.read('after', 999)).status).toBe(409);
    expect((await s.scan('in')).status).toBe(200);
    expect(
      await prisma.tripDate.findUniqueOrThrow({ where: { id: s.date.id } })
    ).toMatchObject({
      status: 'completed',
      startMileage: null,
      endMileage: null,
      startMileageRecordedById: null,
      endMileageRecordedById: null,
      preTripCheckedAt: expect.any(Date),
      postTripCheckedAt: expect.any(Date)
    });
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } })
    ).toMatchObject({ mileage: 1000, status: 'available' });
  });
  it('accepts assigned driver readings, audits actor/time, and advances mileage monotonically', async () => {
    const s = await setup();
    expect((await s.read('before', 1050)).status).toBe(200);
    expect((await s.read('after', 1100)).status).toBe(409);
    expect((await s.scan('out')).status).toBe(200);
    expect((await s.read('after', 1100)).status).toBe(200);
    expect((await s.scan('in')).status).toBe(200);
    expect(
      await prisma.tripDate.findUniqueOrThrow({ where: { id: s.date.id } })
    ).toMatchObject({
      startMileage: 1050,
      endMileage: 1100,
      startMileageRecordedById: s.driverUser.id,
      startMileageRecordedAt: expect.any(Date),
      endMileageRecordedById: s.driverUser.id,
      endMileageRecordedAt: expect.any(Date)
    });
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1100);
  });
  it('keeps a starting typo provisional so a correction does not poison ending mileage', async () => {
    const s = await setup();
    expect((await s.read('before', 11000)).status).toBe(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1000);
    expect((await s.read('before', 1100)).status).toBe(200);
    expect((await s.scan('out')).status).toBe(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1100);
    expect((await s.read('before', 1150)).status).toBe(409);
    expect((await s.read('after', 1200)).status).toBe(200);
    expect((await s.scan('in')).status).toBe(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1200);
  });
  it('keeps ending readings provisional until return so an unfrozen typo can be corrected', async () => {
    const s = await setup();
    expect((await s.read('before', 1100)).status).toBe(200);
    expect((await s.scan('out')).status).toBe(200);
    expect((await s.read('after', 12000)).status).toBe(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1100);
    expect((await s.read('after', 1200)).status).toBe(200);
    expect((await s.scan('in')).status).toBe(200);
    expect((await s.read('after', 1250)).status).toBe(409);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1200);
  });
  it('does not let a future provisional reading raise the current outing mileage floor', async () => {
    const s = await setup();
    const future = await prisma.tripDate.create({
      data: {
        tripTicketId: s.ticket.id,
        startTs: new Date(Date.now() + 86400000),
        endTs: new Date(Date.now() + 90000000)
      }
    });
    expect(
      (
        await request(app)
          .post(`/api/trip-tickets/${s.ticket.id}/dates/${future.id}/odometer`)
          .set('Authorization', s.driverAuth)
          .send({ phase: 'before', mileage: 11000 })
      ).status
    ).toBe(200);
    expect((await s.read('before', 1100)).status).toBe(200);
    expect((await s.scan('out')).status).toBe(200);
    expect((await s.read('after', 1200)).status).toBe(200);
    expect((await s.scan('in')).status).toBe(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1200);
  });
  it('rejects manual availability while an outing is open, including an already-corrupted available status', async () => {
    const s = await setup();
    expect((await s.scan('out')).status).toBe(200);
    const setAvailable = () =>
      request(app)
        .patch(`/api/vehicles/${s.vehicle.id}`)
        .set('Authorization', s.adminAuth)
        .field('status', 'available');
    const blocked = await setAvailable();
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('VEHICLE_ON_TRIP');
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .status
    ).toBe('on_trip');
    expect(
      await prisma.vehicleStatusAudit.count({
        where: { vehicleId: s.vehicle.id, changeSource: 'manual_edit' }
      })
    ).toBe(0);
    await prisma.vehicle.update({
      where: { id: s.vehicle.id },
      data: { status: 'available' }
    });
    expect((await setAvailable()).status).toBe(409);
  });
  it('refuses a second driver checkout when a legacy available status contradicts an open vehicle outing', async () => {
    const s = await setup();
    expect((await s.scan('out')).status).toBe(200);
    // The first planned window has elapsed, but the physical outing is open.
    await prisma.tripDate.update({
      where: { id: s.date.id },
      data: { endTs: new Date(Date.now() - 1000) }
    });
    const otherDriver = await prisma.driver.create({
      data: {
        fullName: 'Other Driver',
        email: 'other-claim@test.local',
        status: 'active',
        branchId: s.branch.id
      }
    });
    const otherTicket = await prisma.tripTicket.create({
      data: {
        branchId: s.branch.id,
        vehicleId: s.vehicle.id,
        driverId: otherDriver.id,
        status: 'approved',
        preparedBy: '',
        destination: 'Campus',
        purpose: 'Later trip',
        dateRequested: new Date(),
        dates: {
          create: {
            startTs: new Date(),
            endTs: new Date(Date.now() + 3600000)
          }
        }
      },
      include: { dates: true }
    });
    await prisma.vehicle.update({
      where: { id: s.vehicle.id },
      data: { status: 'available' }
    });
    const second = await request(app)
      .post(`/api/trip-tickets/${otherTicket.id}/check-out`)
      .set('Authorization', s.guardAuth)
      .send({ dateId: otherTicket.dates[0]!.id });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VEHICLE_NOT_AVAILABLE');
    expect(
      await prisma.tripDate.count({
        where: {
          status: 'in_progress',
          tripTicket: { vehicleId: s.vehicle.id }
        }
      })
    ).toBe(1);
  });
  it('allows late missing values after completed gate scans and freezes existing values', async () => {
    const s = await setup();
    await s.scan('out');
    await s.scan('in');
    expect((await s.read('after', 1200)).status).toBe(200);
    expect((await s.read('before', 1100)).status).toBe(200);
    expect((await s.read('before', 1150)).status).toBe(409);
    expect((await s.read('after', 1250)).status).toBe(409);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1200);
  });
  it('preserves the completed outing late-reading path when the remaining dates are cancelled', async () => {
    const s = await setup();
    const future = await prisma.tripDate.create({
      data: {
        tripTicketId: s.ticket.id,
        startTs: new Date(Date.now() + 86400000),
        endTs: new Date(Date.now() + 90000000)
      }
    });
    expect((await s.scan('out')).status).toBe(200);
    expect((await s.scan('in')).status).toBe(200);
    const cancel = await request(app)
      .post(`/api/trip-tickets/${s.ticket.id}/cancel`)
      .set('Authorization', s.adminAuth)
      .send({ reason: 'Remaining outing cancelled' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');
    expect((await s.read('before', 1100)).status).toBe(200);
    expect((await s.read('after', 1200)).status).toBe(200);
    expect((await s.read('before', 1150)).status).toBe(409);
    expect((await s.read('after', 1250)).status).toBe(409);
    const cancelledReading = await request(app)
      .post(`/api/trip-tickets/${s.ticket.id}/dates/${future.id}/odometer`)
      .set('Authorization', s.driverAuth)
      .send({ phase: 'before', mileage: 1300 });
    expect(cancelledReading.status).toBe(409);
    expect(
      await prisma.tripDate.findUniqueOrThrow({ where: { id: future.id } })
    ).toMatchObject({ status: 'cancelled', startMileage: null });
    expect(
      await prisma.tripDate.findUniqueOrThrow({ where: { id: s.date.id } })
    ).toMatchObject({
      status: 'completed',
      startMileage: 1100,
      endMileage: 1200
    });
    expect(
      await prisma.tripTicket.findUniqueOrThrow({ where: { id: s.ticket.id } })
    ).toMatchObject({ status: 'cancelled' });
  });
  it('does not let a provisional correction lower a separately confirmed mileage floor', async () => {
    const s = await setup();
    expect((await s.read('before', 1400)).status).toBe(200);
    await prisma.vehicle.update({
      where: { id: s.vehicle.id },
      data: { mileage: 1300 }
    });
    expect((await s.read('before', 1299)).status).toBe(409);
    expect((await s.read('before', 1350)).status).toBe(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1300);
    expect((await s.scan('out')).status).toBe(200);
    expect((await s.read('after', 1500)).status).toBe(200);
    expect((await s.read('after', 1299)).status).toBe(409);
    expect((await s.read('after', 1400)).status).toBe(200);
    expect((await s.scan('in')).status).toBe(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1400);
  });
  it('invalidates a provisional start below mileage confirmed outside the trip gate history', async () => {
    const s = await setup();
    expect((await s.read('before', 1100)).status).toBe(200);
    await prisma.vehicle.update({
      where: { id: s.vehicle.id },
      data: { mileage: 1200 }
    });
    expect((await s.scan('out')).status).toBe(200);
    expect(
      await prisma.tripDate.findUniqueOrThrow({ where: { id: s.date.id } })
    ).toMatchObject({
      startMileage: null,
      startMileageRecordedById: null,
      startMileageRecordedAt: null
    });
    expect((await s.read('before', 1250)).status).toBe(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1250);
    const audit = await prisma.vehicleStatusAudit.findFirstOrThrow({
      where: {
        vehicleId: s.vehicle.id,
        changeSource: 'trip_check_out',
        reason: { not: null }
      }
    });
    expect(JSON.parse(audit.reason!)).toMatchObject({
      action: 'invalidate_stale_driver_start',
      tripDateId: s.date.id,
      mileage: 1100,
      recordedById: s.driverUser.id,
      currentVehicleMileage: 1200
    });
  });
  it('rejects another driver, guards, and unapproved or inactive assignments', async () => {
    const s = await setup();
    const { user } = await createTestUser({
      role: 'driver',
      email: 'other@test.local'
    });
    expect(
      (await s.read('before', 1000, authHeader(user.id, user.email, 'driver')))
        .status
    ).toBe(403);
    expect((await s.read('before', 1000, s.guardAuth)).status).toBe(403);
    await prisma.tripTicket.update({
      where: { id: s.ticket.id },
      data: { status: 'pending_admin_approval' }
    });
    expect((await s.read('before', 1000)).status).toBe(409);
    await prisma.tripTicket.update({
      where: { id: s.ticket.id },
      data: { status: 'approved' }
    });
    await prisma.driver.update({
      where: { id: s.ticket.driverId },
      data: { status: 'inactive' }
    });
    expect((await s.read('before', 1000)).status).toBe(409);
  });
  it('rejects fractional/decreasing readings, duplicate scans and another branch guard', async () => {
    const s = await setup();
    expect((await s.read('before', 1000.5)).status).toBe(400);
    expect((await s.read('before', 999)).status).toBe(409);
    expect((await s.read('before', 1050)).status).toBe(200);
    const otherBranch = await createTestBranch('Other');
    expect(
      (
        await s.scan(
          'out',
          authHeader(
            s.driverUser.id,
            s.driverUser.email,
            'security_guard',
            otherBranch.id
          )
        )
      ).status
    ).toBe(403);
    const scans = await Promise.all([s.scan('out'), s.scan('out')]);
    expect(scans.map((res) => res.status).sort()).toEqual([200, 409]);
    expect((await s.read('after', 1049)).status).toBe(409);
    expect((await s.scan('in')).status).toBe(200);
    expect((await s.scan('in')).status).toBe(409);
  });
  it('rejects late values contradicting a later outing while allowing a bounded missing reading', async () => {
    const s = await setup();
    await s.scan('out');
    await s.scan('in');
    await prisma.tripDate.update({
      where: { id: s.date.id },
      data: {
        preTripCheckedAt: new Date(Date.now() - 7200000),
        postTripCheckedAt: new Date(Date.now() - 3600000)
      }
    });
    await prisma.tripDate.create({
      data: {
        tripTicketId: s.ticket.id,
        status: 'completed',
        startTs: new Date(),
        endTs: new Date(Date.now() + 3600000),
        startMileage: 1200,
        endMileage: 1250,
        preTripCheckedAt: new Date(),
        postTripCheckedAt: new Date(Date.now() + 1000)
      }
    });
    await prisma.vehicle.update({
      where: { id: s.vehicle.id },
      data: { mileage: 1250 }
    });
    expect((await s.read('after', 1300)).status).toBe(409);
    expect((await s.read('after', 1150)).status).toBe(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1250);
  });
  it('invalidates a stale future start on departure, preserves its audit, and accepts a valid late replacement', async () => {
    const s = await setup();
    await prisma.tripDate.update({
      where: { id: s.date.id },
      data: { endTs: new Date(Date.now() + 60000) }
    });
    const second = await prisma.tripDate.create({
      data: {
        tripTicketId: s.ticket.id,
        startTs: new Date(Date.now() + 120000),
        endTs: new Date(Date.now() + 3600000)
      }
    });
    const readSecond = (mileage: number) =>
      request(app)
        .post(`/api/trip-tickets/${s.ticket.id}/dates/${second.id}/odometer`)
        .set('Authorization', s.driverAuth)
        .send({ phase: 'before', mileage });
    expect((await readSecond(1000)).status).toBe(200);
    expect((await s.scan('out')).status).toBe(200);
    expect((await s.read('after', 1150)).status).toBe(200);
    expect((await s.scan('in')).status).toBe(200);
    expect((await s.scan('out')).status).toBe(200);
    expect(
      await prisma.tripDate.findUniqueOrThrow({ where: { id: second.id } })
    ).toMatchObject({
      status: 'in_progress',
      startMileage: null,
      startMileageRecordedById: null,
      startMileageRecordedAt: null
    });
    const audits = await prisma.vehicleStatusAudit.findMany({
      where: {
        vehicleId: s.vehicle.id,
        changeSource: 'trip_check_out',
        reason: { not: null }
      }
    });
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0]!.reason!)).toMatchObject({
      action: 'invalidate_stale_driver_start',
      tripDateId: second.id,
      mileage: 1000,
      recordedById: s.driverUser.id,
      precedingGateMileage: 1150
    });
    expect((await readSecond(1175)).status).toBe(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .mileage
    ).toBe(1175);
  });
});
