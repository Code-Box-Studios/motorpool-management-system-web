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
import { resolveOutingForCheckOut } from './dates.js';

const app = createApp();

const START_KM = 1000;

async function approvedTicket(
  vehicleStatus: 'available' | 'under_maintenance' | 'on_trip' = 'available'
) {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T',
      model: 'H',
      year: 2021,
      vin: 'V1',
      licensePlate: 'P1',
      capacity: 5,
      fuelType: 'diesel',
      mileage: START_KM,
      status: vehicleStatus,
      branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-01-01')
    }
  });
  const driver = await prisma.driver.create({
    data: {
      email: 'd@test.local',
      fullName: 'D',
      status: 'active',
      branchId: branch.id
    }
  });
  const ticket = await prisma.tripTicket.create({
    data: {
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      destination: 'A',
      purpose: 'P',
      dateRequested: new Date('2026-07-10'),
      preparedBy: '',
      status: 'approved'
    }
  });
  // Gate actions now act on a TripDate row, not the ticket directly (Task 5) —
  // a ticket with no dates has no outing for the guard to resolve, so every
  // check-out/check-in test needs one due "today".
  const now = new Date();
  const date = await prisma.tripDate.create({
    data: {
      tripTicketId: ticket.id,
      startTs: new Date(now.getTime() - 3_600_000),
      endTs: new Date(now.getTime() + 6 * 3_600_000)
    }
  });
  return { vehicle, ticket, date };
}

let guardSeq = 0;
// Each call mints a fresh guard: two calls inside one test (e.g. check-out
// then check-in) must not collide on `createTestUser`'s unique email.
const guardHeader = async () => {
  const { user } = await createTestUser({
    email: `g${++guardSeq}@test.local`,
    role: 'security_guard'
  });
  return {
    guard: user,
    header: authHeader(user.id, user.email, 'security_guard')
  };
};

describe('trip-ticket guard transitions', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('check-out: approved → in_progress, records the guard and the odometer, flips vehicle to on_trip', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { guard, header } = await guardHeader();
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-out`)
      .set('Authorization', header)
      .send({ startMileage: START_KM });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    // Task 5: the pre-trip guard, timestamp and starting odometer now live on
    // the TripDate row, not the ticket — the ticket's own columns are
    // deprecated and no longer written.
    const date = await prisma.tripDate.findFirstOrThrow({
      where: { tripTicketId: ticket.id }
    });
    expect(date.status).toBe('in_progress');
    expect(date.preTripGuardId).toBe(guard.id);
    expect(date.preTripCheckedById).toBe(guard.id);
    expect(date.preTripCheckedAt).not.toBeNull();
    expect(date.startMileage).toBe(START_KM);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
        .status
    ).toBe('on_trip');
    expect(
      await prisma.vehicleStatusAudit.count({
        where: { vehicleId: vehicle.id, newStatus: 'on_trip' }
      })
    ).toBe(1);
  });

  // Was: "check-out still succeeds but SKIPS the vehicle flip". It did — which is
  // how a guard could release a van sitting in the workshop and leave the record
  // saying it was in the shop and on the road at the same time.
  it('check-out REFUSES to release a vehicle that is not available, and changes nothing', async () => {
    const { vehicle, ticket } = await approvedTicket('under_maintenance');
    const { header } = await guardHeader();
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-out`)
      .set('Authorization', header)
      .send({ startMileage: START_KM });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_NOT_AVAILABLE');
    expect(
      (await prisma.tripTicket.findUniqueOrThrow({ where: { id: ticket.id } }))
        .status
    ).toBe('approved');
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
        .status
    ).toBe('under_maintenance');
    expect(
      await prisma.vehicleStatusAudit.count({
        where: { vehicleId: vehicle.id }
      })
    ).toBe(0);
  });

  it('check-out REFUSES a second trip on a vehicle already on the road', async () => {
    const { ticket } = await approvedTicket('on_trip');
    const { header } = await guardHeader();
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-out`)
      .set('Authorization', header)
      .send({ startMileage: START_KM });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_NOT_AVAILABLE');
  });

  it('check-in: in_progress → completed, records post-trip guard, and ADVANCES the odometer', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { guard, header } = await guardHeader();
    await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-out`)
      .set('Authorization', header)
      .send({ startMileage: START_KM });
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-in`)
      .set('Authorization', header)
      .send({ endMileage: START_KM + 250 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    // Task 5: the post-trip guard and closing odometer now live on the
    // TripDate row, not the ticket.
    const date = await prisma.tripDate.findFirstOrThrow({
      where: { tripTicketId: ticket.id }
    });
    expect(date.status).toBe('completed');
    expect(date.postTripGuardId).toBe(guard.id);
    expect(date.endMileage).toBe(START_KM + 250);

    const after = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicle.id }
    });
    expect(after.status).toBe('available');
    // The whole point: this is the ONLY thing that moves the odometer, and every
    // preventive and predictive maintenance number is computed from it.
    expect(after.mileage).toBe(START_KM + 250);
  });

  it('rejects an odometer reading that runs backwards', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { header } = await guardHeader();
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-out`)
      .set('Authorization', header)
      .send({ startMileage: START_KM - 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ODOMETER_BACKWARDS');
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
        .mileage
    ).toBe(START_KM);
  });

  it('requires an odometer reading at the gate', async () => {
    const { ticket } = await approvedTicket('available');
    const { header } = await guardHeader();
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-out`)
      .set('Authorization', header)
      .send({});
    expect(res.status).toBe(400);
  });

  // Was: admin → 403. The admin is the superuser and now stands in at the gate,
  // so the wrong-role case is a requester, who still has no business there.
  it('403 for a role with no business at the gate, 409 for the wrong from-state', async () => {
    const { ticket } = await approvedTicket('available');
    const { user: req } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });
    const forbidden = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-out`)
      .set('Authorization', authHeader(req.id, req.email, 'requester'))
      .send({ startMileage: START_KM });
    expect(forbidden.status).toBe(403);

    const { header } = await guardHeader();
    const badState = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-in`)
      .set('Authorization', header)
      .send({ endMileage: START_KM });
    expect(badState.status).toBe(409); // still 'approved', not 'in_progress'
  });

  // With no guard on duty an approved trip used to have no way out of the yard,
  // and a trip already on the road no way to be closed — the van stayed 'on_trip'
  // forever and the odometer, which every maintenance number is computed from,
  // never advanced.
  it('admin may work the gate when no guard is on duty', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });
    const adminH = authHeader(admin.id, admin.email, 'admin');

    const out = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-out`)
      .set('Authorization', adminH)
      .send({ startMileage: START_KM });
    expect(out.status).toBe(200);
    expect(out.body.status).toBe('in_progress');
    // Task 5: guard/mileage stamps now live on the TripDate row.
    const outDate = await prisma.tripDate.findFirstOrThrow({
      where: { tripTicketId: ticket.id }
    });
    expect(outDate.preTripGuardId).toBe(admin.id);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
        .status
    ).toBe('on_trip');

    const back = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/check-in`)
      .set('Authorization', adminH)
      .send({ endMileage: START_KM + 120 });
    expect(back.status).toBe(200);
    expect(back.body.status).toBe('completed');
    const backDate = await prisma.tripDate.findFirstOrThrow({
      where: { tripTicketId: ticket.id }
    });
    expect(backDate.postTripGuardId).toBe(admin.id);
    const after = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicle.id }
    });
    expect(after.status).toBe('available');
    expect(after.mileage).toBe(START_KM + 120);
  });

  // --- Task 5: gate actions act on a date, ticket status derives from dates ---

  // Brief's snippet builds this ticket via a `scaffold()` helper that does not
  // exist in this file (only trip-ticket-booking.test.ts has one) — inlined
  // here in the same style as `approvedTicket` above instead.
  async function approvedTwoDateTicket() {
    const branch = await createTestBranch();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'V2',
        licensePlate: 'P2',
        capacity: 5,
        fuelType: 'diesel',
        mileage: START_KM,
        status: 'available',
        branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    const driver = await prisma.driver.create({
      data: {
        email: 'd2@test.local',
        fullName: 'D2',
        status: 'active',
        branchId: branch.id
      }
    });
    const now = new Date();
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: now,
        // Brief defect #1: `preparedBy` is required (no default) in
        // schema.prisma; the brief's snippet omitted it and throws at runtime.
        preparedBy: '',
        status: 'approved'
      }
    });
    await prisma.tripDate.createMany({
      data: [
        {
          tripTicketId: ticket.id,
          startTs: new Date(now.getTime() - 3_600_000),
          endTs: new Date(now.getTime() + 6 * 3_600_000)
        },
        {
          tripTicketId: ticket.id,
          startTs: new Date(now.getTime() + 7 * 86_400_000),
          endTs: new Date(now.getTime() + 7 * 86_400_000 + 6 * 3_600_000)
        }
      ]
    });
    return { branch, vehicle, driver, ticketId: ticket.id };
  }

  // Same shape as approvedTwoDateTicket, but its single date starts `days`
  // from now — used to exercise the "nothing scheduled today" refusal.
  async function approvedTicketStartingInDays(days: number) {
    const branch = await createTestBranch();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'V3',
        licensePlate: 'P3',
        capacity: 5,
        fuelType: 'diesel',
        mileage: START_KM,
        status: 'available',
        branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    const driver = await prisma.driver.create({
      data: {
        email: 'd3@test.local',
        fullName: 'D3',
        status: 'active',
        branchId: branch.id
      }
    });
    const now = new Date();
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: now,
        preparedBy: '',
        status: 'approved'
      }
    });
    await prisma.tripDate.create({
      data: {
        tripTicketId: ticket.id,
        startTs: new Date(now.getTime() + days * 86_400_000),
        endTs: new Date(now.getTime() + days * 86_400_000 + 6 * 3_600_000)
      }
    });
    return { branch, vehicle, driver, ticketId: ticket.id };
  }

  // The brief references `checkOut`/`checkIn`/`checkOutRaw` helpers it never
  // defines. Built here on top of the file's own `guardHeader()` — `Raw`
  // returns the response untouched (for asserting on failures); the wrapped
  // form asserts success so a broken fixture fails loudly at the call site
  // rather than surfacing as a confusing downstream assertion failure.
  async function checkOutRaw(s: { ticketId: string }, startMileage: number) {
    const { header } = await guardHeader();
    return request(app)
      .post(`/api/trip-tickets/${s.ticketId}/check-out`)
      .set('Authorization', header)
      .send({ startMileage });
  }

  async function checkOut(s: { ticketId: string }, startMileage: number) {
    const res = await checkOutRaw(s, startMileage);
    if (res.status !== 200) {
      throw new Error(
        `checkOut(${s.ticketId}) failed: ${res.status} ${JSON.stringify(res.body)}`
      );
    }
    return res;
  }

  async function checkInRaw(s: { ticketId: string }, endMileage: number) {
    const { header } = await guardHeader();
    return request(app)
      .post(`/api/trip-tickets/${s.ticketId}/check-in`)
      .set('Authorization', header)
      .send({ endMileage });
  }

  async function checkIn(s: { ticketId: string }, endMileage: number) {
    const res = await checkInRaw(s, endMileage);
    if (res.status !== 200) {
      throw new Error(
        `checkIn(${s.ticketId}) failed: ${res.status} ${JSON.stringify(res.body)}`
      );
    }
    return res;
  }

  it('does NOT complete the ticket while a later date is still scheduled', async () => {
    const s = await approvedTwoDateTicket();
    await checkOut(s, 1000);
    await checkIn(s, 1100);

    const ticket = await prisma.tripTicket.findUniqueOrThrow({
      where: { id: s.ticketId }
    });
    expect(ticket.status).toBe('approved');

    const dates = await prisma.tripDate.findMany({
      where: { tripTicketId: s.ticketId },
      orderBy: { startTs: 'asc' }
    });
    expect(dates).toHaveLength(2);
    // Brief defect #2: `noUncheckedIndexedAccess` types `dates[0]`/`dates[1]`
    // as possibly `undefined`, so the brief's bare indexed access does not
    // compile. Destructured instead; the `!` below is safe only because the
    // toHaveLength(2) assertion above makes both elements unreachable-undefined.
    const [first, second] = dates;
    expect(first!.status).toBe('completed');
    expect(first!.startMileage).toBe(1000);
    expect(first!.endMileage).toBe(1100);
    expect(second!.status).toBe('scheduled');

    // Fix round 1, item 4: these are the two facts that actually let outing 2
    // happen later — a van still flagged `on_trip`, or an odometer that never
    // advanced, would block the second date exactly as it would the first.
    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: s.vehicle.id }
    });
    expect(vehicle.status).toBe('available');
    expect(vehicle.mileage).toBe(1100);
  });

  it('refuses a second check-out while a date on this ticket is already in_progress', async () => {
    const s = await approvedTwoDateTicket();
    await checkOut(s, 1000); // date 1 in_progress; ticket derives to in_progress too
    // Fix round 1, item 3: checkOut's from-state is `['approved']` only — a
    // ticket sitting `in_progress` means some date on it is already out, and
    // the only legal next gate action is closing THAT one via check-in, not
    // opening a second outing.
    const res = await checkOutRaw(s, 1000);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('refuses a check-out when no outing is scheduled today', async () => {
    const s = await approvedTicketStartingInDays(9);
    const res = await checkOutRaw(s, 1000);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_OUTING_TODAY');
  });

  // Brief defect #3: pins the Manila-boundary fix directly against
  // `resolveOutingForCheckOut`, independent of the host machine's own local
  // timezone (which is exactly what made the original `setHours`-based
  // `endOfDay` wrong under a UTC host).
  it('resolves a Manila-morning outing even when `now` is still the UTC previous day', async () => {
    const branch = await createTestBranch();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'V5',
        licensePlate: 'P5',
        capacity: 5,
        fuelType: 'diesel',
        mileage: START_KM,
        status: 'available',
        branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    const driver = await prisma.driver.create({
      data: {
        email: 'd5@test.local',
        fullName: 'D5',
        status: 'active',
        branchId: branch.id
      }
    });
    // 08:00 Manila on 2026-08-17 == 00:00 UTC on 2026-08-17.
    const outingStart = new Date('2026-08-17T00:00:00.000Z');
    const outingEnd = new Date('2026-08-17T06:00:00.000Z');
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: outingStart,
        preparedBy: '',
        status: 'approved'
      }
    });
    const date = await prisma.tripDate.create({
      data: { tripTicketId: ticket.id, startTs: outingStart, endTs: outingEnd }
    });

    // The guard's clock: 07:00 Manila on the 17th == 23:00 UTC on the 16th —
    // the UTC-previous calendar day.
    const guardClock = new Date('2026-08-16T23:00:00.000Z');
    const outing = await prisma.$transaction((tx) =>
      resolveOutingForCheckOut(tx, ticket.id, guardClock)
    );
    expect(outing.id).toBe(date.id);
  });
});
