import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

// Nothing used to check any of this. A trip could be booked on a van that was
// out of service; it could end before it started; and the same van AND the same
// driver could be booked twice over for the same hours — right through to the
// guard checking both trips out and two trips running on one vehicle.
const app = createApp();

async function scaffold() {
  const branch = await createTestBranch();
  const mk = async (
    plate: string,
    vin: string,
    status: 'available' | 'out_of_service' = 'available'
  ) =>
    prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin,
        licensePlate: plate,
        capacity: 5,
        fuelType: 'diesel',
        mileage: 1000,
        status,
        branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
  const vehicle = await mk('P1', 'V1');
  const otherVehicle = await mk('P2', 'V2');
  const deadVehicle = await mk('P3', 'V3', 'out_of_service');
  const driver = await prisma.driver.create({
    data: {
      email: 'd1@test.local',
      fullName: 'D1',
      status: 'active',
      branchId: branch.id
    }
  });
  const otherDriver = await prisma.driver.create({
    data: {
      email: 'd2@test.local',
      fullName: 'D2',
      status: 'active',
      branchId: branch.id
    }
  });
  const inactiveDriver = await prisma.driver.create({
    data: {
      email: 'd3@test.local',
      fullName: 'D3',
      status: 'inactive',
      branchId: branch.id
    }
  });
  const { user: admin } = await createTestUser({
    email: 'a@test.local',
    role: 'admin'
  });
  return {
    branch,
    vehicle,
    otherVehicle,
    deadVehicle,
    driver,
    otherDriver,
    inactiveDriver,
    header: authHeader(admin.id, admin.email, 'admin'),
    adminId: admin.id
  };
}

type Scaffold = Awaited<ReturnType<typeof scaffold>>;

// Windows are relative to NOW. A trip cannot be booked entirely in the past, so a
// fixture pinned to a literal date silently rots into one as the clock passes it.
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number, hour = 8) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

const body = (s: Scaffold, over: Record<string, unknown> = {}) => ({
  branchId: s.branch.id,
  driverId: s.driver.id,
  vehicleId: s.vehicle.id,
  destination: 'Site A',
  purpose: 'Delivery',
  dateRequested: inDays(1),
  participants: ['Alice'],
  requestedById: s.adminId,
  startTs: inDays(14, 8),
  endTs: inDays(14, 17),
  ...over
});

const post = (s: Scaffold, over: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/trip-tickets')
    .set('Authorization', s.header)
    .send(body(s, over));

describe('trip-ticket booking rules', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  // A branch runs its own vans and borrows another branch's when it needs to.
  // That is the policy, so this is a rule about what must KEEP working: the
  // absence of a branch check here is deliberate, not an oversight, and a future
  // reader who "tightens" this by matching trip.branchId to vehicle.branchId
  // breaks a real workflow. The web surfaces the borrow to the approver — who is
  // the control on it — rather than the API forbidding it.
  it('ALLOWS a branch to borrow another branch’s vehicle', async () => {
    const s = await scaffold();
    const lender = await createTestBranch();
    const lentVehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'V9',
        licensePlate: 'P9',
        capacity: 5,
        fuelType: 'diesel',
        mileage: 1000,
        status: 'available',
        branchId: lender.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });

    // The trip is FOR s.branch; the van belongs to `lender`.
    const res = await post(s, { vehicleId: lentVehicle.id });
    expect(res.status).toBe(201);
    expect(res.body.branchId).toBe(s.branch.id);
    expect(res.body.vehicle.branchId).toBe(lender.id);
  });

  // Borrowing does not get you out of the queue: a borrowed van is still one van,
  // and the overlap check does not care whose it is.
  it('a borrowed vehicle still cannot be double-booked by its OWN branch', async () => {
    const s = await scaffold();
    const lender = await createTestBranch();
    const lentVehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'V9',
        licensePlate: 'P9',
        capacity: 5,
        fuelType: 'diesel',
        mileage: 1000,
        status: 'available',
        branchId: lender.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });

    const borrowed = await post(s, { vehicleId: lentVehicle.id });
    expect(borrowed.status).toBe(201);

    // The owning branch now wants its own van back for the same hours. Too late.
    const clash = await post(s, {
      branchId: lender.id,
      vehicleId: lentVehicle.id,
      driverId: s.otherDriver.id
    });
    expect(clash.status).toBe(409);
  });

  it('refuses a vehicle that is out of service', async () => {
    const s = await scaffold();
    const res = await post(s, { vehicleId: s.deadVehicle.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_OUT_OF_SERVICE');
  });

  it('refuses a trip that ends before it starts', async () => {
    const s = await scaffold();
    const res = await post(s, {
      startTs: inDays(14, 17),
      endTs: inDays(14, 8)
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRIP_WINDOW');
  });

  it('refuses to double-book the same VEHICLE for an overlapping window', async () => {
    const s = await scaffold();
    expect((await post(s)).status).toBe(201);
    // Same van, different driver, overlapping hours.
    const clash = await post(s, {
      driverId: s.otherDriver.id,
      startTs: inDays(14, 12),
      endTs: inDays(14, 20)
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('VEHICLE_DOUBLE_BOOKED');
  });

  it('refuses to double-book the same DRIVER for an overlapping window', async () => {
    const s = await scaffold();
    expect((await post(s)).status).toBe(201);
    // Different van, same driver, overlapping hours — one person, two vehicles.
    const clash = await post(s, {
      vehicleId: s.otherVehicle.id,
      startTs: inDays(14, 12),
      endTs: inDays(14, 20)
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('DRIVER_DOUBLE_BOOKED');
  });

  it('allows the same vehicle back-to-back when the windows do not overlap', async () => {
    const s = await scaffold();
    expect((await post(s)).status).toBe(201); // 08:00 - 17:00
    const next = await post(s, {
      startTs: inDays(14, 17), // starts exactly as the first ends
      endTs: inDays(14, 20)
    });
    expect(next.status).toBe(201);
  });

  it('a cancelled trip releases its vehicle and driver for the same window', async () => {
    const s = await scaffold();
    const first = await post(s);
    expect(first.status).toBe(201);
    const cancelled = await request(app)
      .post(`/api/trip-tickets/${first.body.id}/cancel`)
      .set('Authorization', s.header)
      .send({ reason: 'not needed' });
    expect(cancelled.status).toBe(200);

    // The window is free again — a terminal trip holds nothing.
    expect((await post(s)).status).toBe(201);
  });

  it('books an event on two non-consecutive dates', async () => {
    const s = await scaffold();
    const res = await post(s, {
      startTs: undefined,
      endTs: undefined,
      dates: [
        { startTs: inDays(14, 8), endTs: inDays(14, 17) },
        { startTs: inDays(18, 8), endTs: inDays(18, 17) }
      ]
    });
    expect(res.status).toBe(201);
    const dates = await prisma.tripDate.findMany({
      where: { tripTicketId: res.body.id },
      orderBy: { startTs: 'asc' }
    });
    expect(dates).toHaveLength(2);
    expect(dates.every((d) => d.status === 'scheduled')).toBe(true);
  });

  it('leaves the days BETWEEN two dates bookable by someone else', async () => {
    const s = await scaffold();
    expect(
      (
        await post(s, {
          startTs: undefined,
          endTs: undefined,
          dates: [
            { startTs: inDays(14, 8), endTs: inDays(14, 17) },
            { startTs: inDays(18, 8), endTs: inDays(18, 17) }
          ]
        })
      ).status
    ).toBe(201);

    // The 16th sits in the gap: same van, same driver, must be free.
    const gap = await post(s, {
      startTs: inDays(16, 8),
      endTs: inDays(16, 17)
    });
    expect(gap.status).toBe(201);
  });

  it('refuses a date that clashes with another ticket date on the same vehicle', async () => {
    const s = await scaffold();
    expect(
      (
        await post(s, {
          startTs: undefined,
          endTs: undefined,
          dates: [{ startTs: inDays(14, 8), endTs: inDays(14, 17) }]
        })
      ).status
    ).toBe(201);

    const clash = await post(s, {
      driverId: s.otherDriver.id,
      startTs: undefined,
      endTs: undefined,
      dates: [
        { startTs: inDays(20, 8), endTs: inDays(20, 17) },
        { startTs: inDays(14, 12), endTs: inDays(14, 20) }
      ]
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('VEHICLE_DOUBLE_BOOKED');
  });

  it('refuses two rows in the SAME submission that overlap each other', async () => {
    const s = await scaffold();
    const res = await post(s, {
      startTs: undefined,
      endTs: undefined,
      dates: [
        { startTs: inDays(14, 8), endTs: inDays(14, 17) },
        { startTs: inDays(14, 14), endTs: inDays(14, 20) }
      ]
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVERLAPPING_TRIP_DATES');
  });

  it('refuses a ticket with no dates at all', async () => {
    const s = await scaffold();
    const res = await post(s, {
      startTs: undefined,
      endTs: undefined,
      dates: []
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_TRIP_DATES');
  });

  it('ignores a CANCELLED date when checking for clashes', async () => {
    const s = await scaffold();
    const first = await post(s, {
      startTs: undefined,
      endTs: undefined,
      dates: [{ startTs: inDays(14, 8), endTs: inDays(14, 17) }]
    });
    expect(first.status).toBe(201);
    await prisma.tripDate.updateMany({
      where: { tripTicketId: first.body.id },
      data: { status: 'cancelled' }
    });

    const reuse = await post(s, {
      startTs: inDays(14, 9),
      endTs: inDays(14, 16)
    });
    expect(reuse.status).toBe(201);
  });

  it('sets the ticket span to the earliest start and the latest end', async () => {
    const s = await scaffold();
    const res = await post(s, {
      startTs: undefined,
      endTs: undefined,
      dates: [
        { startTs: inDays(18, 8), endTs: inDays(18, 17) },
        { startTs: inDays(14, 8), endTs: inDays(14, 17) }
      ]
    });
    expect(res.status).toBe(201);
    const ticket = await prisma.tripTicket.findUniqueOrThrow({
      where: { id: res.body.id }
    });
    expect(ticket.startTs!.toISOString()).toBe(inDays(14, 8));
    expect(ticket.endTs!.toISOString()).toBe(inDays(18, 17));
  });

  it("refuses a PATCH that moves a ticket's dates onto another ticket's window (same vehicle), and does not write the change", async () => {
    const s = await scaffold();
    const a = await post(s, {
      startTs: inDays(14, 8),
      endTs: inDays(14, 17)
    });
    expect(a.status).toBe(201);

    const b = await post(s, {
      driverId: s.otherDriver.id,
      startTs: inDays(20, 8),
      endTs: inDays(20, 17)
    });
    expect(b.status).toBe(201);

    // B tries to move its dates onto a window that overlaps A's, same vehicle.
    const patched = await request(app)
      .patch(`/api/trip-tickets/${b.body.id}`)
      .set('Authorization', s.header)
      .send({
        dates: [{ startTs: inDays(14, 12), endTs: inDays(14, 20) }]
      });
    expect(patched.status).toBe(409);
    expect(patched.body.error.code).toBe('VEHICLE_DOUBLE_BOOKED');

    // The rejected write must not land — B still holds its ORIGINAL date.
    const bDates = await prisma.tripDate.findMany({
      where: { tripTicketId: b.body.id },
      orderBy: { startTs: 'asc' }
    });
    expect(bDates).toHaveLength(1);
    expect(bDates.map((d) => d.startTs.toISOString())).toEqual([inDays(20, 8)]);
    expect(bDates.map((d) => d.endTs.toISOString())).toEqual([inDays(20, 17)]);
  });

  it('an edit to an unrelated field does not re-validate the DERIVED SPAN as one continuous window', async () => {
    const s = await scaffold();
    const a = await post(s, {
      startTs: undefined,
      endTs: undefined,
      dates: [
        { startTs: inDays(14, 8), endTs: inDays(14, 17) },
        { startTs: inDays(18, 8), endTs: inDays(18, 17) }
      ]
    });
    expect(a.status).toBe(201);

    // The 16th sits in the gap between A's two dates — someone else legitimately
    // books it, same vehicle.
    const gap = await post(s, {
      driverId: s.otherDriver.id,
      startTs: inDays(16, 8),
      endTs: inDays(16, 17)
    });
    expect(gap.status).toBe(201);

    // Editing an unrelated field on A must not re-check A's DERIVED SPAN
    // (14th -> 18th) as one continuous window — that would falsely clash with
    // the legitimately-booked 16th, which is exactly the gap this feature
    // exists to keep free.
    const patched = await request(app)
      .patch(`/api/trip-tickets/${a.body.id}`)
      .set('Authorization', s.header)
      .send({ destination: 'Site B' });
    expect(patched.status).toBe(200);
    expect(patched.body.destination).toBe('Site B');

    const aDates = await prisma.tripDate.findMany({
      where: { tripTicketId: a.body.id },
      orderBy: { startTs: 'asc' }
    });
    expect(aDates).toHaveLength(2);
    expect(aDates.map((d) => d.startTs.toISOString())).toEqual([
      inDays(14, 8),
      inDays(18, 8)
    ]);
  });

  it('a half-pair PATCH (startTs without endTs) does not let the derived span drift', async () => {
    const s = await scaffold();
    const created = await post(s, {
      startTs: inDays(14, 8),
      endTs: inDays(14, 17)
    });
    expect(created.status).toBe(201);

    // Only ONE half of the legacy pair — mirrors what the real web client's
    // mapUpdateBody sends when a form dirties only one field.
    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({ startTs: inDays(30, 8) });
    expect(patched.status).toBe(200);

    // The date rows are untouched...
    const dates = await prisma.tripDate.findMany({
      where: { tripTicketId: created.body.id },
      orderBy: { startTs: 'asc' }
    });
    expect(dates).toHaveLength(1);
    expect(dates.map((d) => d.startTs.toISOString())).toEqual([inDays(14, 8)]);

    // ...and the DERIVED SPAN still equals what those (unchanged) rows imply —
    // not the half-pair value that was sent, and not left dangling/drifted.
    const ticket = await prisma.tripTicket.findUniqueOrThrow({
      where: { id: created.body.id }
    });
    expect(ticket.startTs!.toISOString()).toBe(inDays(14, 8));
    expect(ticket.endTs!.toISOString()).toBe(inDays(14, 17));
  });

  it('refuses a PATCH that empties dates outright, and leaves the existing rows untouched', async () => {
    const s = await scaffold();
    const created = await post(s, {
      startTs: inDays(14, 8),
      endTs: inDays(14, 17)
    });
    expect(created.status).toBe(201);

    // `dates` PRESENT but EMPTY is a validation error — unlike `dates` ABSENT,
    // which is a legal no-op (covered by the "unrelated field" test above).
    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({ dates: [] });
    expect(patched.status).toBe(400);
    expect(patched.body.error.code).toBe('NO_TRIP_DATES');

    const dates = await prisma.tripDate.findMany({
      where: { tripTicketId: created.body.id }
    });
    expect(dates).toHaveLength(1);
  });

  it('names the clash day in the application display timezone (Asia/Manila), not UTC', async () => {
    const s = await scaffold();
    // 23:00 UTC is 07:00 the NEXT day in Asia/Manila (UTC+8): this window's
    // startTs sits on one UTC calendar day but one Manila calendar day later.
    const a = await post(s, {
      startTs: inDays(14, 23),
      endTs: inDays(15, 2)
    });
    expect(a.status).toBe(201);

    const clash = await post(s, {
      driverId: s.otherDriver.id,
      startTs: inDays(15, 0),
      endTs: inDays(15, 1)
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('VEHICLE_DOUBLE_BOOKED');

    // The Manila-local calendar day for `inDays(14, 23)` is the 15th, not the
    // 14th a naive UTC slice of the same instant would have named.
    const manilaLocalDay = inDays(15, 0).slice(0, 10);
    const utcDay = inDays(14, 23).slice(0, 10);
    expect(clash.body.error.message).toContain(manilaLocalDay);
    expect(clash.body.error.message).not.toContain(utcDay);
  });
});

describe('trip-ticket off-ramps', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('an APPROVED trip that is no longer needed can be cancelled', async () => {
    const s = await scaffold();
    const created = await post(s);
    await request(app)
      .post(`/api/trip-tickets/${created.body.id}/approve`)
      .set('Authorization', s.header)
      .send({
        liters: 20,
        fuelType: 'diesel',
        date: inDays(14),
        purpose: 'p',
        tripTo: 't'
      });
    const { user: evp } = await createTestUser({
      email: 'e@test.local',
      role: 'evp_operations'
    });
    await request(app)
      .post(`/api/trip-tickets/${created.body.id}/approve-evp`)
      .set('Authorization', authHeader(evp.id, evp.email, 'evp_operations'))
      .send({});

    // Previously 409 INVALID_TRANSITION: an approved-but-unwanted trip had no
    // exit at all except deleting the record or driving it to completion.
    const res = await request(app)
      .post(`/api/trip-tickets/${created.body.id}/cancel`)
      .set('Authorization', s.header)
      .send({ reason: 'meeting called off' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');

    const allocation = await prisma.fuelAllocation.findUniqueOrThrow({
      where: { tripTicketId: created.body.id }
    });
    expect(allocation.status).toBe('cancelled'); // the fuel budget is released with it
  });

  it('a COMPLETED trip cannot be deleted', async () => {
    const s = await scaffold();
    const created = await post(s);
    await prisma.tripTicket.update({
      where: { id: created.body.id },
      data: { status: 'completed' }
    });

    // Previously 204 — and the fuel allocation cascaded away with it, erasing an
    // approved fuel spend for a trip that physically happened.
    const res = await request(app)
      .delete(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header);
    expect(res.status).toBe(409);
    expect(
      await prisma.tripTicket.count({ where: { id: created.body.id } })
    ).toBe(1);
  });

  it('an APPROVED trip cannot be deleted — its fuel allocation is signed off', async () => {
    const s = await scaffold();
    const created = await post(s);
    await request(app)
      .post(`/api/trip-tickets/${created.body.id}/approve`)
      .set('Authorization', s.header)
      .send({
        liters: 30,
        fuelType: 'diesel',
        date: inDays(14),
        purpose: 'p',
        tripTo: 't'
      });
    const { user: evp } = await createTestUser({
      email: 'e@test.local',
      role: 'evp_operations'
    });
    await request(app)
      .post(`/api/trip-tickets/${created.body.id}/approve-evp`)
      .set('Authorization', authHeader(evp.id, evp.email, 'evp_operations'))
      .send({});

    // Previously 204: the trip AND the EVP-approved 30 L allocation both vanished.
    const res = await request(app)
      .delete(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header);
    expect(res.status).toBe(409);
    expect(
      await prisma.fuelAllocation.count({
        where: { tripTicketId: created.body.id }
      })
    ).toBe(1);
  });
});

describe('trip-ticket attribution', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('the requester is the CALLER, not whoever the body names', async () => {
    const s = await scaffold();
    const { user: requester } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });

    // A requester booking a trip in the ADMIN's name. requestedById used to be
    // spread straight out of the body, so this worked.
    const res = await request(app)
      .post('/api/trip-tickets')
      .set(
        'Authorization',
        authHeader(requester.id, requester.email, 'requester')
      )
      .send(body(s, { requestedById: s.adminId }));
    expect(res.status).toBe(201);
    expect(res.body.requestedById).toBe(requester.id); // forced back to the caller
  });

  it('a trip cannot be created with NO owner', async () => {
    const s = await scaffold();
    const { user: requester } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });

    // `requestedById: null` used to be accepted, and cancel/edit compare against
    // that column — so an unowned ticket locked everyone but an admin out of it.
    const res = await request(app)
      .post('/api/trip-tickets')
      .set(
        'Authorization',
        authHeader(requester.id, requester.email, 'requester')
      )
      .send(body(s, { requestedById: null }));
    expect(res.status).toBe(201);
    expect(res.body.requestedById).toBe(requester.id);
  });

  it('an admin may still raise a trip on someone else’s behalf', async () => {
    const s = await scaffold();
    const { user: requester } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });
    const res = await post(s, { requestedById: requester.id }); // s.header is the admin
    expect(res.status).toBe(201);
    expect(res.body.requestedById).toBe(requester.id);
  });

  it('an edit cannot hand the ticket to someone else', async () => {
    const s = await scaffold();
    const { user: requester } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });
    const header = authHeader(requester.id, requester.email, 'requester');
    const created = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', header)
      .send(body(s));
    expect(created.body.requestedById).toBe(requester.id);

    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', header)
      .send({ requestedById: s.adminId, destination: 'Site B' });
    expect(patched.status).toBe(200);
    expect(patched.body.destination).toBe('Site B'); // the real edit lands
    expect(patched.body.requestedById).toBe(requester.id); // the hand-off does not
  });
});

describe('trip-ticket sanity rules', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('refuses more passengers than the vehicle seats', async () => {
    const s = await scaffold(); // capacity 5
    const res = await post(s, {
      participants: Array.from({ length: 8 }, (_, i) => `P${i}`),
      participantsCount: 8
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVER_CAPACITY');
  });

  it('refuses a participant count that disagrees with the names given', async () => {
    const s = await scaffold();
    const res = await post(s, {
      participants: ['Alice'],
      participantsCount: 4
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PARTICIPANTS_MISMATCH');
  });

  it('refuses an INACTIVE driver', async () => {
    const s = await scaffold();
    const res = await post(s, { driverId: s.inactiveDriver.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_INACTIVE');
  });

  it('refuses a trip booked entirely in the past', async () => {
    const s = await scaffold();
    const res = await post(s, {
      startTs: inDays(-9, 8),
      endTs: inDays(-9, 17)
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TRIP_IN_THE_PAST');
  });

  it('refuses an absurd fuel allocation', async () => {
    const s = await scaffold();
    const created = await post(s);
    const res = await request(app)
      .post(`/api/trip-tickets/${created.body.id}/approve`)
      .set('Authorization', s.header)
      .send({
        liters: 9_999_999,
        fuelType: 'diesel',
        date: inDays(14),
        purpose: 'p',
        tripTo: 't'
      });
    expect(res.status).toBe(400); // `positive()` alone accepted this
  });
});

describe('trip-ticket concurrency', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('two SIMULTANEOUS check-outs cannot both claim one vehicle', async () => {
    const s = await scaffold();
    const { user: evp } = await createTestUser({
      email: 'e@test.local',
      role: 'evp_operations'
    });
    const { user: guard } = await createTestUser({
      email: 'g@test.local',
      role: 'security_guard'
    });
    const evpH = authHeader(evp.id, evp.email, 'evp_operations');
    const guardH = authHeader(guard.id, guard.email, 'security_guard');

    // Two trips on ONE van, back-to-back so the overlap rule permits both.
    const approvedTrip = async (driverId: string, day: number) => {
      const t = await post(s, {
        driverId,
        startTs: inDays(day, 8),
        endTs: inDays(day, 17)
      });
      await request(app)
        .post(`/api/trip-tickets/${t.body.id}/approve`)
        .set('Authorization', s.header)
        .send({
          liters: 10,
          fuelType: 'diesel',
          date: inDays(day),
          purpose: 'p',
          tripTo: 't'
        });
      await request(app)
        .post(`/api/trip-tickets/${t.body.id}/approve-evp`)
        .set('Authorization', evpH)
        .send({});
      return t.body.id as string;
    };
    const a = await approvedTrip(s.driver.id, 20);
    const b = await approvedTrip(s.otherDriver.id, 21);

    // Fire both at the same instant. A read-then-write let BOTH read `available`
    // before either committed, and two trips went in_progress on one van.
    const fire = (id: string) =>
      request(app)
        .post(`/api/trip-tickets/${id}/check-out`)
        .set('Authorization', guardH)
        .send({ startMileage: 1000 });
    const [ra, rb] = await Promise.all([fire(a), fire(b)]);

    const codes = [ra.status, rb.status].sort();
    expect(codes).toEqual([200, 409]); // exactly one wins
    expect(
      await prisma.tripTicket.count({ where: { status: 'in_progress' } })
    ).toBe(1);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .status
    ).toBe('on_trip');
  });
});
