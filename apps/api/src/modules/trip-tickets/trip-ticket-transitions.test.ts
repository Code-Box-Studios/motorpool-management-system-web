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

const app = createApp();

async function pendingTicket() {
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
      mileage: 1000,
      status: 'available',
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
  const { user: requester } = await createTestUser({
    email: 'req@test.local',
    role: 'requester'
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
      requestedById: requester.id,
      status: 'pending_admin_approval'
    }
  });
  return { branch, vehicle, ticket, requester };
}

const fuelBody = {
  liters: 40,
  fuelType: 'diesel',
  date: '2026-07-10',
  purpose: 'Delivery',
  tripTo: 'Site A'
};

// Task 6: an approved event covering two non-consecutive dates, each its own
// TripDate row/gate cycle. Windows are relative to `now` so "the outing due
// today" and "the outing a week out" both stay in the future as the clock
// moves, same convention as approvedTwoDateTicket() in
// trip-ticket-guard.test.ts (that copy is scoped to its own describe block,
// not exported, so this file gets its own).
const CANCEL_TEST_START_KM = 1000;

// A counter, not a fixed suffix: fix round 2 adds a foreign-dateId test that
// needs TWO of these tickets live in the same test (one ticket's dateId
// against another ticket's URL), and a fixed 'V6'/'d6@test.local'/etc. would
// collide on the vehicle/driver/user unique constraints on the second call.
let twoDateTicketSeq = 0;

async function approvedTwoDateTicket() {
  const n = ++twoDateTicketSeq;
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T',
      model: 'H',
      year: 2021,
      vin: `V6-${n}`,
      licensePlate: `P6-${n}`,
      capacity: 5,
      fuelType: 'diesel',
      mileage: CANCEL_TEST_START_KM,
      status: 'available',
      branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-01-01')
    }
  });
  const driver = await prisma.driver.create({
    data: {
      email: `d6-${n}@test.local`,
      fullName: 'D6',
      status: 'active',
      branchId: branch.id
    }
  });
  const { user: requester } = await createTestUser({
    email: `req6-${n}@test.local`,
    role: 'requester'
  });
  const { user: admin } = await createTestUser({
    email: `admin6-${n}@test.local`,
    role: 'admin'
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
      requestedById: requester.id,
      status: 'approved'
    }
  });
  await prisma.tripDate.createMany({
    data: [
      // Due "today" — inside resolveOutingForCheckOut's window, for the
      // "already out" test.
      {
        tripTicketId: ticket.id,
        startTs: new Date(now.getTime() - 3_600_000),
        endTs: new Date(now.getTime() + 6 * 3_600_000)
      },
      // A week out — non-consecutive with the first, the whole point of this
      // feature.
      {
        tripTicketId: ticket.id,
        startTs: new Date(now.getTime() + 7 * 86_400_000),
        endTs: new Date(now.getTime() + 7 * 86_400_000 + 6 * 3_600_000)
      }
    ]
  });
  return { branch, vehicle, driver, requester, admin, ticketId: ticket.id };
}

let cancelTestGuardSeq = 0;
async function guardHeaderForCancelTests(): Promise<string> {
  const { user } = await createTestUser({
    email: `g${++cancelTestGuardSeq}@date-cancel.test.local`,
    role: 'security_guard'
  });
  return authHeader(user.id, user.email, 'security_guard');
}

// Puts date 1 of a two-date ticket `in_progress`, for the "already out" test.
async function checkOut(
  s: { ticketId: string },
  startMileage: number
): Promise<void> {
  const header = await guardHeaderForCancelTests();
  const res = await request(app)
    .post(`/api/trip-tickets/${s.ticketId}/check-out`)
    .set('Authorization', header)
    .send({ startMileage });
  if (res.status !== 200) {
    throw new Error(
      `checkOut(${s.ticketId}) failed: ${res.status} ${JSON.stringify(res.body)}`
    );
  }
}

describe('trip-ticket approval transitions', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('admin approve → pending_fuel_allocation_approval and creates the fuel allocation', async () => {
    const { ticket, vehicle, branch } = await pendingTicket();
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(fuelBody);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_fuel_allocation_approval');
    expect(res.body.approvedByAdminId).toBe(admin.id);
    const fa = await prisma.fuelAllocation.findUniqueOrThrow({
      where: { tripTicketId: ticket.id }
    });
    expect(fa).toMatchObject({
      liters: 40,
      status: 'pending',
      vehicleId: vehicle.id,
      branchId: branch.id,
      requestedById: admin.id
    });
  });

  it('rejects approve from the wrong role (403) and wrong state (409)', async () => {
    const { ticket } = await pendingTicket();
    const { user: req } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });
    const forbidden = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve`)
      .set('Authorization', authHeader(req.id, req.email, 'requester'))
      .send(fuelBody);
    expect(forbidden.status).toBe(403);

    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });
    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { status: 'approved' }
    });
    const wrongState = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(fuelBody);
    expect(wrongState.status).toBe(409);
    expect(wrongState.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('evp approve → approved and stamps the allocation', async () => {
    const { ticket } = await pendingTicket();
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });
    await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(fuelBody);
    const { user: evp } = await createTestUser({
      email: 'e@test.local',
      role: 'evp_operations'
    });
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve-evp`)
      .set('Authorization', authHeader(evp.id, evp.email, 'evp_operations'))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    const fa = await prisma.fuelAllocation.findUniqueOrThrow({
      where: { tripTicketId: ticket.id }
    });
    expect(fa).toMatchObject({ status: 'approved', approvedByEvpId: evp.id });
  });

  it('disapprove requires a reason and marks the allocation disapproved if it exists', async () => {
    const { ticket } = await pendingTicket();
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });
    await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(fuelBody);
    const noReason = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/disapprove`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send({});
    expect(noReason.status).toBe(400);
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/disapprove`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send({ reason: 'Budget' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('disapproved');
    expect(res.body.disapprovedReason).toBe('Budget');
    expect(
      (
        await prisma.fuelAllocation.findUniqueOrThrow({
          where: { tripTicketId: ticket.id }
        })
      ).status
    ).toBe('disapproved');
  });

  it('cancel by the owner from a pending state, but not by a stranger', async () => {
    const { ticket, requester } = await pendingTicket();
    const { user: stranger } = await createTestUser({
      email: 's@test.local',
      role: 'requester'
    });
    const forbidden = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/cancel`)
      .set(
        'Authorization',
        authHeader(stranger.id, stranger.email, 'requester')
      )
      .send({ reason: 'x' });
    expect(forbidden.status).toBe(403);
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/cancel`)
      .set(
        'Authorization',
        authHeader(requester.id, requester.email, 'requester')
      )
      .send({ reason: 'Changed plans' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.cancellationReason).toBe('Changed plans');
  });

  // --- Task 6: cancel ONE date without voiding the rest of the event ---

  it('cancels one date and leaves the rest of the event standing', async () => {
    const s = await approvedTwoDateTicket();
    const dates = await prisma.tripDate.findMany({
      where: { tripTicketId: s.ticketId },
      orderBy: { startTs: 'asc' }
    });
    expect(dates).toHaveLength(2);
    // Brief defect: `noUncheckedIndexedAccess` types `dates[1]` as possibly
    // `undefined` even right after the length check — destructure instead of
    // indexing so the compiler can actually narrow it.
    const [firstDate, secondDate] = dates;
    if (!firstDate || !secondDate) throw new Error('expected two dates'); // unreachable

    const res = await request(app)
      .post(`/api/trip-tickets/${s.ticketId}/dates/${secondDate.id}/cancel`)
      .set('Authorization', authHeader(s.admin.id, s.admin.email, 'admin'))
      .send({ reason: 'venue moved' });
    expect(res.status).toBe(200);

    const after = await prisma.tripDate.findMany({
      where: { tripTicketId: s.ticketId },
      orderBy: { startTs: 'asc' }
    });
    expect(after).toHaveLength(2);
    const [afterFirst, afterSecond] = after;
    // Safe only because toHaveLength(2) above makes both elements
    // unreachable-undefined.
    expect(afterFirst!.status).toBe('scheduled');
    expect(afterSecond!.status).toBe('cancelled');
    expect(afterSecond!.cancellationReason).toBe('venue moved');

    const ticket = await prisma.tripTicket.findUniqueOrThrow({
      where: { id: s.ticketId }
    });
    // The rest of the event stands — cancelling one date must not touch the
    // approval chain, and syncTicketStatus leaves an ordinary approved ticket
    // with one live date alone.
    expect(ticket.status).toBe('approved');
  });

  it('cancels the whole ticket once every date is cancelled, and records why', async () => {
    const s = await approvedTwoDateTicket();
    const dates = await prisma.tripDate.findMany({
      where: { tripTicketId: s.ticketId }
    });
    for (const d of dates) {
      const res = await request(app)
        .post(`/api/trip-tickets/${s.ticketId}/dates/${d.id}/cancel`)
        .set('Authorization', authHeader(s.admin.id, s.admin.email, 'admin'))
        .send({ reason: 'event called off' });
      expect(res.status).toBe(200);
    }
    const ticket = await prisma.tripTicket.findUniqueOrThrow({
      where: { id: s.ticketId }
    });
    expect(ticket.status).toBe('cancelled');
    // Amendment 3: nothing else sets the TICKET's own cancellationReason when
    // it derives to cancelled via its dates — without this a reader opening
    // it later would see "cancelled" with no explanation, unlike every ticket
    // cancelled through the normal whole-ticket path.
    expect(ticket.cancellationReason).toBe('event called off');
  });

  it('refuses to cancel an outing that is already out', async () => {
    const s = await approvedTwoDateTicket();
    await checkOut(s, CANCEL_TEST_START_KM);
    const out = await prisma.tripDate.findFirstOrThrow({
      where: { tripTicketId: s.ticketId, status: 'in_progress' }
    });
    const res = await request(app)
      .post(`/api/trip-tickets/${s.ticketId}/dates/${out.id}/cancel`)
      .set('Authorization', authHeader(s.admin.id, s.admin.email, 'admin'))
      .send({ reason: 'too late' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  // Amendment 1: cancelDate is legal only from `approved`/`in_progress` — a
  // pending ticket's status is owned by the approval chain, and letting its
  // dates be cancelled one by one could strip it to zero live rows, which
  // would then throw 400 NO_TRIP_DATES on the next unrelated edit. Narrower
  // than whole-ticket cancel, which also allows the two pending states —
  // that asymmetry is intentional.
  it('refuses to cancel a date on a ticket still pending admin approval', async () => {
    const { ticket } = await pendingTicket();
    const date = await prisma.tripDate.create({
      data: {
        tripTicketId: ticket.id,
        startTs: new Date(),
        endTs: new Date(Date.now() + 3_600_000)
      }
    });
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/dates/${date.id}/cancel`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send({ reason: 'too early' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  // A cancelled date must become a free window someone else can book —
  // assertBookable already excludes cancelled rows from its clash scan; this
  // exercises that end to end through cancelDate rather than whole-ticket
  // cancel (already covered by "a cancelled trip releases its vehicle and
  // driver for the same window" in trip-ticket-booking.test.ts).
  it('frees the cancelled date for someone else to book the same vehicle and driver', async () => {
    const s = await approvedTwoDateTicket();
    const dates = await prisma.tripDate.findMany({
      where: { tripTicketId: s.ticketId },
      orderBy: { startTs: 'asc' }
    });
    expect(dates).toHaveLength(2);
    const [, secondDate] = dates;
    if (!secondDate) throw new Error('expected a second date'); // unreachable

    const adminHeader = authHeader(s.admin.id, s.admin.email, 'admin');
    const cancelRes = await request(app)
      .post(`/api/trip-tickets/${s.ticketId}/dates/${secondDate.id}/cancel`)
      .set('Authorization', adminHeader)
      .send({ reason: 'venue moved' });
    expect(cancelRes.status).toBe(200);

    const rebook = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', adminHeader)
      .send({
        branchId: s.branch.id,
        driverId: s.driver.id,
        vehicleId: s.vehicle.id,
        destination: 'Elsewhere',
        purpose: 'A different event',
        dateRequested: new Date().toISOString(),
        startTs: secondDate.startTs.toISOString(),
        endTs: secondDate.endTs.toISOString()
      });
    expect(rebook.status).toBe(201);
  });

  // Fix round 2, item 3: neither authorisation path on the new endpoint had
  // coverage. `dateId` is looked up scoped to `tripTicketId` via a single
  // `findFirst` — a date that is real but belongs to a DIFFERENT ticket must
  // 404 exactly like one that doesn't exist at all, or a ticket's own dates
  // aren't the only rows its owner can reach through this route.
  it('refuses a dateId that belongs to a different ticket (404)', async () => {
    const s1 = await approvedTwoDateTicket();
    const s2 = await approvedTwoDateTicket();
    const s2Dates = await prisma.tripDate.findMany({
      where: { tripTicketId: s2.ticketId }
    });
    const [foreignDate] = s2Dates;
    if (!foreignDate) throw new Error('expected a date'); // unreachable

    const res = await request(app)
      .post(`/api/trip-tickets/${s1.ticketId}/dates/${foreignDate.id}/cancel`)
      .set('Authorization', authHeader(s1.admin.id, s1.admin.email, 'admin'))
      .send({ reason: 'wrong ticket' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    // And untouched: the foreign date is still exactly as it was.
    const untouched = await prisma.tripDate.findUniqueOrThrow({
      where: { id: foreignDate.id }
    });
    expect(untouched.status).toBe('scheduled');
  });

  // The other authorisation axis: a stranger requester (neither admin nor
  // the ticket's own requester) gets the same NOT_TICKET_OWNER refusal
  // whole-ticket cancel already has covered above.
  it('refuses to cancel a date on a ticket a stranger requester does not own (403)', async () => {
    const s = await approvedTwoDateTicket();
    const dates = await prisma.tripDate.findMany({
      where: { tripTicketId: s.ticketId },
      orderBy: { startTs: 'asc' }
    });
    const [firstDate] = dates;
    if (!firstDate) throw new Error('expected a date'); // unreachable

    const { user: stranger } = await createTestUser({
      email: 'stranger6@test.local',
      role: 'requester'
    });
    const res = await request(app)
      .post(`/api/trip-tickets/${s.ticketId}/dates/${firstDate.id}/cancel`)
      .set(
        'Authorization',
        authHeader(stranger.id, stranger.email, 'requester')
      )
      .send({ reason: 'not mine' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_TICKET_OWNER');
  });
});
