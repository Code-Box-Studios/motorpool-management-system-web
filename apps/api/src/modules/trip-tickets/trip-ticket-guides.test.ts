import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { TripTicketStatus } from '@prisma/client';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestEmployee,
  createTestUser
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

// Windows are relative to NOW, never hardcoded. A trip cannot be booked
// entirely in the past, and a fixture pinned to a literal date silently rots
// into one the moment the wall clock passes it. Same convention as the sibling
// suites in this directory.
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number, hour = 8) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function scaffold() {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T',
      model: 'H',
      year: 2021,
      vin: 'VG1',
      licensePlate: 'PG1',
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
      email: 'dg@test.local',
      fullName: 'DG',
      status: 'active',
      branchId: branch.id
    }
  });
  const guideA = await createTestEmployee(branch.id, 'Ana Guide');
  const guideB = await createTestEmployee(branch.id, 'Ben Guide');
  const guideC = await createTestEmployee(branch.id, 'Cara Guide');
  const { user: admin } = await createTestUser({
    email: 'ag@test.local',
    role: 'admin'
  });
  const { user: requester } = await createTestUser({
    email: 'rg@test.local',
    role: 'requester'
  });
  return {
    branch,
    vehicle,
    driver,
    guideA,
    guideB,
    guideC,
    header: authHeader(admin.id, admin.email, 'admin'),
    requesterHeader: authHeader(requester.id, requester.email, 'requester')
  };
}

type Scaffold = Awaited<ReturnType<typeof scaffold>>;

const body = (s: Scaffold, over: Record<string, unknown> = {}) => ({
  branchId: s.branch.id,
  driverId: s.driver.id,
  vehicleId: s.vehicle.id,
  destination: 'Site A',
  purpose: 'Delivery',
  dateRequested: inDays(1),
  participants: ['Alice'],
  guideIds: [s.guideA.id],
  startTs: inDays(14, 8),
  endTs: inDays(14, 17),
  ...over
});

const post = (s: Scaffold, over: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/trip-tickets')
    .set('Authorization', s.header)
    .send(body(s, over));

const guideIdsOf = (t: { guides: { employeeId: string }[] }) =>
  t.guides.map((g) => g.employeeId).sort();

describe('trip-ticket guides: capacity', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('counts guides against the vehicle’s seats', async () => {
    const s = await scaffold(); // capacity 5
    const res = await post(s, {
      participants: ['A', 'B', 'C', 'D'],
      participantsCount: 4,
      guideIds: [s.guideA.id, s.guideB.id]
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVER_CAPACITY');
    expect(res.body.error.message).toBe(
      'That vehicle seats 5; the trip is for 4 participant(s) and 2 guide(s)'
    );
  });

  it('a party that exactly fills the van no longer fits once a guide is added', async () => {
    const s = await scaffold(); // capacity 5
    const res = await post(s, {
      participants: ['A', 'B', 'C', 'D', 'E'],
      participantsCount: 5,
      guideIds: [s.guideA.id]
    });
    // Design §5.1's "consequence to accept": stricter, on purpose. It reads as
    // a regression only to someone who books at the limit.
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVER_CAPACITY');
  });

  it('PARTICIPANTS_MISMATCH still ignores the guides entirely', async () => {
    const s = await scaffold();
    const res = await post(s, {
      participants: ['Alice'],
      participantsCount: 4,
      guideIds: [s.guideA.id, s.guideB.id]
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PARTICIPANTS_MISMATCH');
    // The count is a claim about the NAMES. Two guides do not make "1 name,
    // count 4" add up, and the message must not pretend they do.
    expect(res.body.error.message).toBe(
      '1 participant name(s) given but the count says 4'
    );
  });
});

describe('trip-ticket guides: create', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('writes the join rows for the guides it was given', async () => {
    const s = await scaffold();
    const res = await post(s, { guideIds: [s.guideA.id, s.guideB.id] });
    expect(res.status).toBe(201);
    expect(guideIdsOf(res.body)).toEqual([s.guideA.id, s.guideB.id].sort());
    expect(
      await prisma.tripTicketEmployee.count({
        where: { tripTicketId: res.body.id }
      })
    ).toBe(2);
  });

  it('refuses a create with an EMPTY guide list, and writes nothing', async () => {
    const s = await scaffold();
    const res = await post(s, { guideIds: [] });
    // `.min(1)` on the create body means zod answers this, not the service, so
    // the code is VALIDATION_ERROR rather than NO_GUIDES. Both are 400 and
    // both refuse; what matters is that an empty list is never accepted.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.tripTicket.count()).toBe(0);
  });

  it('refuses a create with no guideIds key at all', async () => {
    const s = await scaffold();
    const payload: Record<string, unknown> = body(s);
    delete payload.guideIds;
    const res = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', s.header)
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.tripTicket.count()).toBe(0);
  });
});

describe('trip-ticket guides: PATCH', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('leaves the guides alone when guideIds is ABSENT', async () => {
    const s = await scaffold();
    const created = await post(s, { guideIds: [s.guideA.id, s.guideB.id] });
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({ destination: 'Site B' });
    expect(patched.status).toBe(200);
    expect(patched.body.destination).toBe('Site B');
    expect(guideIdsOf(patched.body)).toEqual([s.guideA.id, s.guideB.id].sort());
  });

  it('refuses an EMPTY guideIds rather than silently keeping the old set', async () => {
    const s = await scaffold();
    const created = await post(s, { guideIds: [s.guideA.id] });
    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({ guideIds: [] });
    // A 200 that changed nothing would be the worst outcome here: the caller
    // asked for zero guides and would be told it worked.
    expect(patched.status).toBe(400);
    expect(patched.body.error.code).toBe('VALIDATION_ERROR');
    expect(
      await prisma.tripTicketEmployee.count({
        where: { tripTicketId: created.body.id }
      })
    ).toBe(1);
  });

  it('replaces the guide set wholesale when guideIds is sent', async () => {
    const s = await scaffold();
    const created = await post(s, { guideIds: [s.guideA.id, s.guideB.id] });
    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({ guideIds: [s.guideC.id] });
    expect(patched.status).toBe(200);
    expect(guideIdsOf(patched.body)).toEqual([s.guideC.id]);
    // Delete-all-then-recreate, not a diff: the two it had are gone.
    expect(
      await prisma.tripTicketEmployee.count({
        where: { tripTicketId: created.body.id }
      })
    ).toBe(1);
  });

  it('re-checks capacity when the guide list grows on an edit', async () => {
    const s = await scaffold(); // capacity 5
    const guideD = await createTestEmployee(s.branch.id, 'Dee Guide');
    const guideE = await createTestEmployee(s.branch.id, 'Eve Guide');
    const created = await post(s, {
      participants: ['A', 'B'],
      participantsCount: 2,
      guideIds: [s.guideA.id]
    });
    expect(created.status).toBe(201); // 2 + 1 = 3 of 5
    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({
        guideIds: [s.guideA.id, s.guideB.id, s.guideC.id, guideD.id, guideE.id]
      });
    expect(patched.status).toBe(409);
    expect(patched.body.error.code).toBe('OVER_CAPACITY');
  });
});

describe('trip-ticket guides: reads', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('returns the guides with their employee on BOTH the detail and the list read', async () => {
    const s = await scaffold();
    const created = await post(s, { guideIds: [s.guideA.id] });
    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header);
    expect(detail.status).toBe(200);
    expect(detail.body.guides).toHaveLength(1);
    expect(detail.body.guides[0].employee.name).toBe('Ana Guide');

    // The list read shares ONE include with the detail read, and there is no
    // response contract anywhere that would catch a relation dropped from one
    // and not the other — so both are asserted, always.
    const list = await request(app)
      .get('/api/trip-tickets')
      .set('Authorization', s.header);
    expect(list.status).toBe(200);
    expect(list.body.data[0].guides).toHaveLength(1);
    expect(list.body.data[0].guides[0].employee.name).toBe('Ana Guide');
  });

  it('keeps rendering an ARCHIVED employee’s name on a ticket they already guided', async () => {
    const s = await scaffold();
    const created = await post(s, { guideIds: [s.guideA.id] });
    await prisma.employee.update({
      where: { id: s.guideA.id },
      data: { archivedAt: new Date() }
    });
    const detail = await request(app)
      .get(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header);
    // Archiving stops someone being OFFERED for future bookings; it never
    // rewrites history (design §8).
    expect(detail.status).toBe(200);
    expect(detail.body.guides[0].employee.name).toBe('Ana Guide');
    expect(detail.body.guides[0].employee.archivedAt).not.toBeNull();
  });
});

// A counter, not a fixed window: every ticket below shares one vehicle and one
// driver, and assertBookable refuses a second booking over the first's hours.
// Same device as `twoDateTicketSeq` in trip-ticket-transitions.test.ts.
let reassignTicketSeq = 0;

async function ticketAt(s: Scaffold, status: TripTicketStatus) {
  const day = 20 + ++reassignTicketSeq;
  const created = await post(s, {
    guideIds: [s.guideA.id],
    startTs: inDays(day, 8),
    endTs: inDays(day, 17)
  });
  if (created.status !== 201) {
    throw new Error(
      `ticketAt(${status}) could not book: ${created.status} ${JSON.stringify(created.body)}`
    );
  }
  const id = created.body.id as string;
  // Forced directly, the way the sibling transition suites do — the approval
  // chain is not what is under test here.
  await prisma.tripTicket.update({ where: { id }, data: { status } });
  return id;
}

describe('POST /api/trip-tickets/:id/guides', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('reassigns guides on an APPROVED ticket', async () => {
    const s = await scaffold();
    const id = await ticketAt(s, 'approved');
    const res = await request(app)
      .post(`/api/trip-tickets/${id}/guides`)
      .set('Authorization', s.header)
      .send({ guideIds: [s.guideB.id, s.guideC.id] });
    expect(res.status).toBe(200);
    expect(guideIdsOf(res.body)).toEqual([s.guideB.id, s.guideC.id].sort());
  });

  it('reassigns guides on an IN_PROGRESS ticket', async () => {
    const s = await scaffold();
    const id = await ticketAt(s, 'in_progress');
    const res = await request(app)
      .post(`/api/trip-tickets/${id}/guides`)
      .set('Authorization', s.header)
      .send({ guideIds: [s.guideB.id] });
    expect(res.status).toBe(200);
    expect(guideIdsOf(res.body)).toEqual([s.guideB.id]);
  });

  it('the allowed-from list is EXACTLY approved + in_progress', async () => {
    const s = await scaffold();
    // The two pending states are out because the ordinary PATCH already
    // handles guides there — one edit with two doors and two different guards
    // on them is how the freeze gets holes in it. The three terminal states
    // are out because a finished trip's record of who was on it is history.
    const refused: TripTicketStatus[] = [
      'pending_admin_approval',
      'pending_fuel_allocation_approval',
      'completed',
      'cancelled',
      'disapproved'
    ];
    for (const status of refused) {
      const id = await ticketAt(s, status);
      const res = await request(app)
        .post(`/api/trip-tickets/${id}/guides`)
        .set('Authorization', s.header)
        .send({ guideIds: [s.guideB.id] });
      expect(res.status, status).toBe(409);
      expect(res.body.error.code, status).toBe('INVALID_TRANSITION');
      // ...and the guides it had are untouched.
      expect(
        await prisma.tripTicketEmployee.findMany({
          where: { tripTicketId: id },
          select: { employeeId: true }
        }),
        status
      ).toEqual([{ employeeId: s.guideA.id }]);
    }
  });

  it('is admin-only — a requester does not re-staff their own approved trip', async () => {
    const s = await scaffold();
    const id = await ticketAt(s, 'approved');
    const res = await request(app)
      .post(`/api/trip-tickets/${id}/guides`)
      .set('Authorization', s.requesterHeader)
      .send({ guideIds: [s.guideB.id] });
    expect(res.status).toBe(403);
  });

  it('refuses an EMPTY guide list with 400 NO_GUIDES', async () => {
    const s = await scaffold();
    const id = await ticketAt(s, 'approved');
    const res = await request(app)
      .post(`/api/trip-tickets/${id}/guides`)
      .set('Authorization', s.header)
      .send({ guideIds: [] });
    // This endpoint's body schema is deliberately not `.min(1)`, so the empty
    // case reaches the service and gets its own name instead of a generic
    // VALIDATION_ERROR.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_GUIDES');
    // The delete and the insert are one transaction and the refusal precedes
    // both, so the guide it already had is still there.
    expect(
      await prisma.tripTicketEmployee.count({ where: { tripTicketId: id } })
    ).toBe(1);
  });

  it('re-runs the seat check — swapping one guide for five overflows the van', async () => {
    const s = await scaffold(); // capacity 5
    const guideD = await createTestEmployee(s.branch.id, 'Dee Guide');
    const guideE = await createTestEmployee(s.branch.id, 'Eve Guide');
    const created = await post(s, {
      participants: ['A', 'B', 'C'],
      participantsCount: 3,
      guideIds: [s.guideA.id],
      startTs: inDays(60, 8),
      endTs: inDays(60, 17)
    });
    expect(created.status).toBe(201); // 3 + 1 = 4 of 5
    await prisma.tripTicket.update({
      where: { id: created.body.id },
      data: { status: 'approved' }
    });

    const res = await request(app)
      .post(`/api/trip-tickets/${created.body.id}/guides`)
      .set('Authorization', s.header)
      .send({
        guideIds: [s.guideA.id, s.guideB.id, s.guideC.id, guideD.id, guideE.id]
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVER_CAPACITY');
    // The participants come off the STORED ticket — this endpoint does not
    // edit them, and reading them from the request would let a caller shrink
    // the party on paper to fit the guides they are adding.
    expect(res.body.error.message).toBe(
      'That vehicle seats 5; the trip is for 3 participant(s) and 5 guide(s)'
    );
  });

  it('404s on a ticket that does not exist', async () => {
    const s = await scaffold();
    const res = await request(app)
      .post('/api/trip-tickets/00000000-0000-4000-8000-000000000000/guides')
      .set('Authorization', s.header)
      .send({ guideIds: [s.guideB.id] });
    expect(res.status).toBe(404);
  });
});
