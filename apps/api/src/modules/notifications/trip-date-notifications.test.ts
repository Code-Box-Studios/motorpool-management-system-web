import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import { approveEvp, checkIn, checkOut } from '../trip-tickets/transitions.js';
import * as events from './events.js';

describe('per-outing notifications', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  // Shared vehicle + driver builder. `n` disambiguates the unique columns
  // (vin, licensePlate, driver email) across the several tickets one test
  // may build — a fixed suffix would collide the second time a test calls
  // this, same reasoning as trip-ticket-transitions.test.ts's own seq counter.
  let seq = 0;
  async function scaffold(branchId: string) {
    const n = ++seq;
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: `N${n}`,
        licensePlate: `N${n}`,
        capacity: 5,
        fuelType: 'diesel',
        mileage: 1000,
        status: 'available',
        branchId,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    const { user: driverUser } = await createTestUser({
      role: 'driver',
      email: `dv${n}@test.local`
    });
    // The mechanic/driver link is what makes a Driver row reachable as a
    // person — a driver row without it receives nothing, by design.
    const driver = await prisma.driver.create({
      data: {
        email: `dv${n}@test.local`,
        fullName: 'DV',
        status: 'active',
        branchId,
        userId: driverUser.id
      }
    });
    return { vehicle, driver, driverUser };
  }

  it('tells the driver, the requester, and the admins — but not the acting admin — when one outing of their event is cancelled', async () => {
    const branch = await createTestBranch();
    const { vehicle, driver, driverUser } = await scaffold(branch.id);
    const { user: actingAdmin } = await createTestUser({
      role: 'admin',
      email: 'admin-actor@test.local'
    });
    const { user: bystanderAdmin } = await createTestUser({
      role: 'admin',
      email: 'admin-bystander@test.local'
    });
    const { user: requesterUser } = await createTestUser({
      role: 'requester',
      email: 'req@test.local'
    });

    const start = new Date(Date.now() + 30 * 86_400_000);
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: new Date(),
        // Required, no default (schema.prisma) — omitting it throws at
        // runtime. Brief defect #3.
        preparedBy: '',
        requestedById: requesterUser.id,
        status: 'approved',
        startTs: start,
        endTs: new Date(start.getTime() + 3_600_000)
      }
    });
    // A fixed boundary-straddling instant, not a `now`-relative one: 23:00
    // UTC on the 27th is 07:00 Manila on the 28th. A midday fixture renders
    // the same string under UTC and Manila and pins nothing; a day rendered
    // via `toISOString()` (UTC) would read "2026-08-27" here — only a real
    // Asia/Manila render (formatDisplayDate) reads "2026-08-28". Brief
    // defect #2. `tripDateCancelled` wants a full TripDate row (not the
    // brief's `{ startTs }`), so a real row is created here — Brief defect
    // #1, resolved by widening the fixture to match the real shape rather
    // than narrowing the function's signature.
    const outing = await prisma.tripDate.create({
      data: {
        tripTicketId: ticket.id,
        startTs: new Date('2026-08-27T23:00:00.000Z'),
        endTs: new Date('2026-08-28T02:00:00.000Z')
      }
    });

    const actor: AuthenticatedUser = {
      id: actingAdmin.id,
      email: actingAdmin.email,
      role: 'admin',
      branchId: branch.id
    };
    await events.tripDateCancelled(ticket, outing, actor, 'venue moved');

    const driverRows = await prisma.notification.findMany({
      where: { userId: driverUser.id }
    });
    expect(driverRows).toHaveLength(1);
    const [driverRow] = driverRows;
    if (!driverRow) throw new Error('unreachable: toHaveLength(1) above');
    expect(driverRow.type).toBe('trip_cancelled');
    expect(driverRow.title).toContain('2026-08-28');
    expect(driverRow.title).not.toContain('2026-08-27');
    expect(driverRow.title).toContain('is cancelled');
    expect(driverRow.body).toContain('venue moved');

    const requesterRows = await prisma.notification.findMany({
      where: { userId: requesterUser.id }
    });
    expect(requesterRows).toHaveLength(1);
    const [requesterRow] = requesterRows;
    if (!requesterRow) throw new Error('unreachable: toHaveLength(1) above');
    expect(requesterRow.type).toBe('trip_cancelled');
    expect(requesterRow.title).toContain('2026-08-28');
    expect(requesterRow.title).not.toContain('2026-08-27');
    expect(requesterRow.body).toContain('venue moved');

    // A second admin, not the one who acted, still hears about it — the
    // "others" fan-out is every admin, not just whoever happened to act.
    const bystanderRows = await prisma.notification.findMany({
      where: { userId: bystanderAdmin.id }
    });
    expect(bystanderRows).toHaveLength(1);

    // The admin who cancelled it was there — `exceptUserId` drops them.
    const actorRows = await prisma.notification.findMany({
      where: { userId: actingAdmin.id }
    });
    expect(actorRows).toHaveLength(0);
  });

  it('names the outing at the gate, and only calls the trip complete once every date is settled', async () => {
    const branch = await createTestBranch();
    const { user: requesterUser } = await createTestUser({
      role: 'requester',
      email: 'req2@test.local'
    });
    const { user: admin } = await createTestUser({
      role: 'admin',
      email: 'admin2@test.local'
    });
    // Standing in at the gate, same as the "admin may work the gate when no
    // guard is on duty" coverage in trip-ticket-guard.test.ts.
    const guardActor: AuthenticatedUser = {
      id: admin.id,
      email: admin.email,
      role: 'admin',
      branchId: branch.id
    };

    // --- a ONE-date ticket: check-in DOES complete it ---
    const { vehicle: v1, driver: d1 } = await scaffold(branch.id);
    const now1 = new Date();
    const ticket1 = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: d1.id,
        vehicleId: v1.id,
        destination: 'Solo Outing',
        purpose: 'P',
        dateRequested: now1,
        preparedBy: '',
        requestedById: requesterUser.id,
        status: 'approved'
      }
    });
    await prisma.tripDate.create({
      data: {
        tripTicketId: ticket1.id,
        startTs: new Date(now1.getTime() - 3_600_000),
        endTs: new Date(now1.getTime() + 6 * 3_600_000)
      }
    });

    await checkOut(ticket1.id, guardActor, { startMileage: 1000 });
    const outRows = await prisma.notification.findMany({
      where: {
        userId: requesterUser.id,
        type: 'trip_checked_out',
        linkTo: `/trip-tickets/${ticket1.id}`
      }
    });
    expect(outRows).toHaveLength(1);
    const [outRow] = outRows;
    if (!outRow) throw new Error('unreachable: toHaveLength(1) above');
    // Would fail if the outing's day were dropped from the copy entirely —
    // not a claim about which calendar day, just that one is named.
    expect(outRow.body).toMatch(/\(\d{4}-\d{2}-\d{2}\)/);

    await checkIn(ticket1.id, guardActor, { endMileage: 1100 });
    const inRows1 = await prisma.notification.findMany({
      where: {
        userId: requesterUser.id,
        type: 'trip_checked_in',
        linkTo: `/trip-tickets/${ticket1.id}`
      }
    });
    expect(inRows1).toHaveLength(1);
    const [inRow1] = inRows1;
    if (!inRow1) throw new Error('unreachable: toHaveLength(1) above');
    expect(inRow1.body).toContain('Trip completed.');
    const ticket1After = await prisma.tripTicket.findUniqueOrThrow({
      where: { id: ticket1.id }
    });
    expect(ticket1After.status).toBe('completed');

    // --- a TWO-date ticket: checking in the FIRST outing must NOT say the
    // trip is complete — a second date is still scheduled. This is the
    // events.ts:191 defect the brief calls out: check-in used to say
    // "Trip completed." unconditionally, which is simply false while
    // another outing on the same ticket is still ahead.
    const { vehicle: v2, driver: d2 } = await scaffold(branch.id);
    const now2 = new Date();
    const ticket2 = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: d2.id,
        vehicleId: v2.id,
        destination: 'Two-date event',
        purpose: 'P',
        dateRequested: now2,
        preparedBy: '',
        requestedById: requesterUser.id,
        status: 'approved'
      }
    });
    await prisma.tripDate.createMany({
      data: [
        {
          tripTicketId: ticket2.id,
          startTs: new Date(now2.getTime() - 3_600_000),
          endTs: new Date(now2.getTime() + 6 * 3_600_000)
        },
        {
          tripTicketId: ticket2.id,
          startTs: new Date(now2.getTime() + 7 * 86_400_000),
          endTs: new Date(now2.getTime() + 7 * 86_400_000 + 6 * 3_600_000)
        }
      ]
    });

    await checkOut(ticket2.id, guardActor, { startMileage: 1000 });
    await checkIn(ticket2.id, guardActor, { endMileage: 1100 });
    const inRows2 = await prisma.notification.findMany({
      where: {
        userId: requesterUser.id,
        type: 'trip_checked_in',
        linkTo: `/trip-tickets/${ticket2.id}`
      }
    });
    expect(inRows2).toHaveLength(1);
    const [inRow2] = inRows2;
    if (!inRow2) throw new Error('unreachable: toHaveLength(1) above');
    expect(inRow2.body).not.toContain('Trip completed.');
    expect(inRow2.body).toContain('still scheduled');

    // Confirms the premise the copy is asserting: the ticket really did NOT
    // derive to completed with a live date still ahead.
    const ticket2After = await prisma.tripTicket.findUniqueOrThrow({
      where: { id: ticket2.id }
    });
    expect(ticket2After.status).toBe('approved');
  });

  it('tells the driver how many outings they are taking on once EVP signs off', async () => {
    const branch = await createTestBranch();
    const { vehicle, driver, driverUser } = await scaffold(branch.id);
    const { user: admin } = await createTestUser({
      role: 'admin',
      email: 'admin3@test.local'
    });
    const { user: evp } = await createTestUser({
      role: 'evp_operations',
      email: 'evp3@test.local'
    });

    const now = new Date();
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'Multi-leg',
        purpose: 'P',
        dateRequested: now,
        preparedBy: '',
        status: 'pending_fuel_allocation_approval'
      }
    });
    await prisma.tripDate.createMany({
      data: [
        {
          tripTicketId: ticket.id,
          startTs: now,
          endTs: new Date(now.getTime() + 3_600_000)
        },
        {
          tripTicketId: ticket.id,
          startTs: new Date(now.getTime() + 7 * 86_400_000),
          endTs: new Date(now.getTime() + 7 * 86_400_000 + 3_600_000)
        }
      ]
    });
    await prisma.fuelAllocation.create({
      data: {
        tripTicketId: ticket.id,
        vehicleId: vehicle.id,
        branchId: branch.id,
        requestedById: admin.id,
        liters: 40,
        fuelType: 'diesel',
        date: now,
        purpose: 'p',
        tripTo: 't',
        status: 'pending'
      }
    });

    const evpActor: AuthenticatedUser = {
      id: evp.id,
      email: evp.email,
      role: 'evp_operations',
      branchId: branch.id
    };
    await approveEvp(ticket.id, evpActor);

    const rows = await prisma.notification.findMany({
      where: { userId: driverUser.id, type: 'trip_assigned' }
    });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    if (!row) throw new Error('unreachable: toHaveLength(1) above');
    expect(row.body).toContain('2 outings');
    expect(row.body).toContain('each time');
  });
});
