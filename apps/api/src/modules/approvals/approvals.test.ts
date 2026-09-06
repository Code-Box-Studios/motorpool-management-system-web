import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

// TZ is pinned to UTC in vitest.config.ts, so these fixed instants mean the
// same thing on every machine and in every month.
const SAME_DAY_MORNING = new Date('2026-08-20T09:00:00.000Z');
const SAME_DAY_AFTERNOON = new Date('2026-08-20T15:00:00.000Z');
const EARLIER_DAY = new Date('2026-08-18T12:00:00.000Z');

async function evpHeader() {
  const { user } = await createTestUser({
    email: 'evp@test.local',
    role: 'evp_operations'
  });
  return { header: authHeader(user.id, user.email, 'evp_operations'), user };
}

// Driver.email and User.email are UNIQUE. Several tests below scaffold twice —
// once for a fuel decision, once for a repair — so every generated identity
// needs its own address. A counter, not Math.random(): the same test run twice
// must produce the same fixtures.
let seq = 0;
const nextId = () => `${++seq}`;

async function scaffold() {
  const n = nextId();
  const branch = await createTestBranch(`Branch ${n}`);
  // vin and licensePlate are NOT unique on Vehicle, so the factory defaults are
  // safe to repeat. The driver's email is not.
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(
    branch.id,
    'active',
    `driver-${n}@test.local`
  );
  return { branch, vehicle, driver, n };
}

async function seedAllocation(opts: {
  status: 'approved' | 'disapproved' | 'cancelled';
  decidedById?: string | null;
  decidedAt?: Date | null;
  disapprovedReason?: string | null;
  destination?: string;
}) {
  const { branch, vehicle, driver, n } = await scaffold();
  const { user: requester } = await createTestUser({
    email: `req-${n}@test.local`,
    role: 'requester'
  });
  const ticket = await prisma.tripTicket.create({
    data: {
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      destination: opts.destination ?? 'Iloilo depot',
      purpose: 'Parts run',
      dateRequested: new Date('2026-08-15'),
      preparedBy: '',
      requestedById: requester.id,
      status: opts.status === 'approved' ? 'approved' : 'disapproved'
    }
  });
  const allocation = await prisma.fuelAllocation.create({
    data: {
      tripTicketId: ticket.id,
      vehicleId: vehicle.id,
      branchId: branch.id,
      requestedById: requester.id,
      liters: 80,
      fuelType: 'diesel',
      date: new Date('2026-08-15'),
      purpose: 'Parts run',
      tripTo: 'Iloilo depot',
      status: opts.status,
      decidedById: opts.decidedById ?? null,
      decidedAt: opts.decidedAt ?? null,
      disapprovedReason: opts.disapprovedReason ?? null
    }
  });
  return { ticket, allocation };
}

async function seedJobOrder(opts: {
  approvedById: string;
  dateApproved: Date;
  incidentDetails?: string;
}) {
  const { branch, vehicle } = await scaffold();
  return prisma.jobOrder.create({
    data: {
      vehicleId: vehicle.id,
      branchId: branch.id,
      status: 'ongoing_repair',
      incidentDetails: opts.incidentDetails ?? 'Brake overhaul',
      approvedById: opts.approvedById,
      dateApproved: opts.dateApproved
    }
  });
}

describe('approvals history', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('returns an approved allocation with its decider, litres and reference', async () => {
    const { header, user } = await evpHeader();
    const { ticket } = await seedAllocation({
      status: 'approved',
      decidedById: user.id,
      decidedAt: SAME_DAY_MORNING
    });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      kind: 'fuel',
      outcome: 'approved',
      liters: 80,
      fuelType: 'diesel',
      title: 'Iloilo depot',
      // The headline fact of the History tab (round-4 review #6) — asserted by
      // no test before this, on either kind of record.
      decidedByName: 'Test User',
      decidedByRole: 'evp_operations',
      linkTo: `/trip-tickets/${ticket.id}`
    });
    expect(res.body.data[0].ref).toBe(`TT-${ticket.ticketNo}`);
  });

  it('returns a declined allocation WITH its reason', async () => {
    const { header, user } = await evpHeader();
    await seedAllocation({
      status: 'disapproved',
      decidedById: user.id,
      decidedAt: SAME_DAY_MORNING,
      disapprovedReason: 'Budget exhausted this quarter'
    });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.body.data[0]).toMatchObject({
      outcome: 'declined',
      reason: 'Budget exhausted this quarter'
    });
  });

  it('labels an admin override by role', async () => {
    const { header } = await evpHeader();
    const { user: admin } = await createTestUser({
      email: 'override@test.local',
      role: 'admin'
    });
    await seedAllocation({
      status: 'approved',
      decidedById: admin.id,
      decidedAt: SAME_DAY_MORNING
    });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.body.data[0].decidedByRole).toBe('admin');
  });

  it('orders a same-day repair and fuel decision by time of day', async () => {
    const { header, user } = await evpHeader();
    // The repair is LATER in the day, so it must come first. Under the old
    // @db.Date column it truncated to midnight and always sorted last — this
    // test is the one that fails if the widening in Task 1 is reverted.
    await seedAllocation({
      status: 'approved',
      decidedById: user.id,
      decidedAt: SAME_DAY_MORNING
    });
    const jobOrder = await seedJobOrder({
      approvedById: user.id,
      dateApproved: SAME_DAY_AFTERNOON
    });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.body.data.map((d: { kind: string }) => d.kind)).toEqual([
      'repair',
      'fuel'
    ]);
    // Round-4 review #6: `ref`, `linkTo`, `title`, `subtitle`, `decidedByName`
    // and `decidedByRole` were read by no test on the repair side — only
    // `kind`/`count`/ordering were. The shipped values are correct today;
    // this is the regression fence for service.ts:56-71's mapping.
    expect(res.body.data[0]).toMatchObject({
      kind: 'repair',
      outcome: 'approved',
      ref: `JO-${jobOrder.orderNo}`,
      linkTo: `/job-order/${jobOrder.id}`,
      title: 'Brake overhaul',
      subtitle: 'Toyota Hiace · GRD-0001',
      decidedByName: 'Test User',
      decidedByRole: 'evp_operations'
    });
  });

  it('sorts a record with no decision time last', async () => {
    const { header, user } = await evpHeader();
    await seedAllocation({
      status: 'approved',
      decidedById: null,
      decidedAt: null,
      destination: 'Pre-migration trip'
    });
    await seedAllocation({
      status: 'approved',
      decidedById: user.id,
      decidedAt: EARLIER_DAY,
      destination: 'Recorded trip'
    });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.body.data.map((d: { title: string }) => d.title)).toEqual([
      'Recorded trip',
      'Pre-migration trip'
    ]);
  });

  it('excludes a cancelled allocation', async () => {
    const { header } = await evpHeader();
    await seedAllocation({ status: 'cancelled' });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.body.count).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  it('filters by kind', async () => {
    const { header, user } = await evpHeader();
    await seedAllocation({
      status: 'approved',
      decidedById: user.id,
      decidedAt: SAME_DAY_MORNING
    });
    await seedJobOrder({
      approvedById: user.id,
      dateApproved: SAME_DAY_AFTERNOON
    });

    const fuelOnly = await request(app)
      .get('/api/approvals/history?kind=fuel')
      .set('Authorization', header);
    expect(fuelOnly.body.count).toBe(1);
    expect(fuelOnly.body.data[0].kind).toBe('fuel');

    const repairOnly = await request(app)
      .get('/api/approvals/history?kind=repair')
      .set('Authorization', header);
    expect(repairOnly.body.count).toBe(1);
    expect(repairOnly.body.data[0].kind).toBe('repair');
  });

  it('paginates across both sources', async () => {
    const { header, user } = await evpHeader();
    await seedAllocation({
      status: 'approved',
      decidedById: user.id,
      decidedAt: SAME_DAY_MORNING
    });
    await seedJobOrder({
      approvedById: user.id,
      dateApproved: SAME_DAY_AFTERNOON
    });

    const res = await request(app)
      .get('/api/approvals/history?page=2&limit=1')
      .set('Authorization', header);

    expect(res.body.count).toBe(2);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].kind).toBe('fuel');
  });

  it.each([
    ['requester', 'r@test.local'],
    ['driver', 'd@test.local'],
    ['security_guard', 'g@test.local']
  ])('refuses a %s', async (role, email) => {
    const { user } = await createTestUser({ email, role });
    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', authHeader(user.id, user.email, role));
    expect(res.status).toBe(403);
  });
});
