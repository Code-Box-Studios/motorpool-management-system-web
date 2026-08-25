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
    // person — a driver row without it receives nothing, by design (see the
    // "no linked user account" test below).
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

  // `noUncheckedIndexedAccess` types every array index as possibly
  // `undefined`, even right after a `.length` check — centralizes the narrow
  // this file otherwise repeated at each assertion site.
  function only<T>(rows: T[]): T {
    expect(rows).toHaveLength(1);
    const [row] = rows;
    if (!row) throw new Error('unreachable: toHaveLength(1) above');
    return row;
  }

  it('sends the driver exactly ONE message when they are also the requester, plus one to the admins', async () => {
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
        // The driver raised their own trip — the exact case
        // `others.filter(id => id !== driverUserId)` exists for. With a
        // requester who is a DIFFERENT person from the driver, that filter
        // is a no-op and `toHaveLength(1)` below would hold even with the
        // filter deleted — this fixture is what makes it a real assertion:
        // delete the filter and `others` still contains driverUserId (via
        // requestedById), so the driver gets a SECOND row from that notify()
        // call alongside their own pointed one.
        requestedById: driverUser.id,
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

    const driverRow = only(
      await prisma.notification.findMany({ where: { userId: driverUser.id } })
    );
    expect(driverRow.type).toBe('trip_cancelled');
    expect(driverRow.title).toContain('2026-08-28');
    expect(driverRow.title).not.toContain('2026-08-27');
    expect(driverRow.title).toContain('is cancelled');
    expect(driverRow.body).toContain('venue moved');

    // A second admin, not the one who acted, still hears about it — the
    // "others" fan-out is every admin, not just whoever happened to act.
    const bystanderRow = only(
      await prisma.notification.findMany({
        where: { userId: bystanderAdmin.id }
      })
    );
    expect(bystanderRow.title).toContain('2026-08-28');
    expect(bystanderRow.body).toContain('venue moved');

    // The admin who cancelled it was there — `exceptUserId` drops them.
    const actorRows = await prisma.notification.findMany({
      where: { userId: actingAdmin.id }
    });
    expect(actorRows).toHaveLength(0);
  });

  // Fix round 3, item 4: the ORDINARY case — a requester who is not the driver.
  // The test above only pins the degenerate one (driver IS requester), where
  // `others` is filtered down; it would still pass if the filter were inverted
  // to `id === driverUserId`, because it only counts the driver's own rows.
  // This one is the other side of that predicate: invert it and `others`
  // collapses to nothing, the requester and the admins hear nothing at all, and
  // the only person told is the driver.
  it('sends the requester and the admins the general copy, and the driver the pointed one', async () => {
    const branch = await createTestBranch();
    const { vehicle, driver, driverUser } = await scaffold(branch.id);
    // A requester who is a DIFFERENT person from the driver — the normal case.
    const { user: requesterUser } = await createTestUser({
      role: 'requester',
      email: 'req-split@test.local'
    });
    const { user: actingAdmin } = await createTestUser({
      role: 'admin',
      email: 'admin-split-actor@test.local'
    });
    const { user: bystanderAdmin } = await createTestUser({
      role: 'admin',
      email: 'admin-split-bystander@test.local'
    });

    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: new Date(),
        preparedBy: '',
        requestedById: requesterUser.id,
        status: 'approved'
      }
    });
    // Same boundary-straddling instant used elsewhere in this file: 23:00 UTC
    // on the 27th is 07:00 Manila on the 28th.
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

    // The requester gets the general copy — the row that goes missing entirely
    // if the `others` filter is inverted.
    const requesterRow = only(
      await prisma.notification.findMany({
        where: { userId: requesterUser.id }
      })
    );
    expect(requesterRow.type).toBe('trip_cancelled');
    expect(requesterRow.title).toContain('date was cancelled');
    expect(requesterRow.title).toContain('2026-08-28');
    expect(requesterRow.body).toContain('venue moved');

    // Every admin who was not the actor, likewise.
    const bystanderRow = only(
      await prisma.notification.findMany({
        where: { userId: bystanderAdmin.id }
      })
    );
    expect(bystanderRow.title).toContain('date was cancelled');

    // The driver gets the POINTED copy instead — "your outing", not "the date"
    // — and exactly one of them: they are not in `others`.
    const driverRow = only(
      await prisma.notification.findMany({ where: { userId: driverUser.id } })
    );
    expect(driverRow.title).toContain('your');
    expect(driverRow.title).toContain('outing is cancelled');
    expect(driverRow.title).not.toContain('date was cancelled');
    expect(driverRow.title).toContain('2026-08-28');

    // The admin who did it was there.
    expect(
      await prisma.notification.count({ where: { userId: actingAdmin.id } })
    ).toBe(0);
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
    const outRow = only(
      await prisma.notification.findMany({
        where: {
          userId: requesterUser.id,
          type: 'trip_checked_out',
          linkTo: `/trip-tickets/${ticket1.id}`
        }
      })
    );
    // Would fail if the outing's day were dropped from the copy entirely —
    // not a claim about which calendar day (see the dedicated Manila-render
    // test below for that), just that one is named at all.
    expect(outRow.body).toMatch(/\(\d{4}-\d{2}-\d{2}\)/);

    await checkIn(ticket1.id, guardActor, { endMileage: 1100 });
    const inRow1 = only(
      await prisma.notification.findMany({
        where: {
          userId: requesterUser.id,
          type: 'trip_checked_in',
          linkTo: `/trip-tickets/${ticket1.id}`
        }
      })
    );
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
    const inRow2 = only(
      await prisma.notification.findMany({
        where: {
          userId: requesterUser.id,
          type: 'trip_checked_in',
          linkTo: `/trip-tickets/${ticket2.id}`
        }
      })
    );
    expect(inRow2.body).not.toContain('Trip completed.');
    expect(inRow2.body).toContain('still scheduled');

    // Confirms the premise the copy is asserting: the ticket really did NOT
    // derive to completed with a live date still ahead.
    const ticket2After = await prisma.tripTicket.findUniqueOrThrow({
      where: { id: ticket2.id }
    });
    expect(ticket2After.status).toBe('approved');
  });

  // Fix round 1, item 1: neither Manila render this task ADDED
  // (tripCheckedOut / tripCheckedIn) had an assertion capable of catching a
  // reversion to `toISOString().slice(0,10)` — the guard test above only
  // matches the day's SHAPE (`\(\d{4}-\d{2}-\d{2}\)`), which a UTC render
  // would satisfy identically. `checkOut`'s real transition path can't be
  // driven with a fixed boundary date (`resolveOutingForCheckOut` always
  // reads the real clock, with no way to inject one through the public
  // `checkOut`/`checkIn` functions), so these are called directly instead,
  // exactly as `tripDateCancelled` is above.
  it('renders the gate notifications in Asia/Manila, not UTC', async () => {
    const branch = await createTestBranch();
    const { vehicle, driver } = await scaffold(branch.id);
    const { user: requesterUser } = await createTestUser({
      role: 'requester',
      email: 'req-gate@test.local'
    });
    const { user: admin } = await createTestUser({
      role: 'admin',
      email: 'admin-gate@test.local'
    });

    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: new Date(),
        preparedBy: '',
        requestedById: requesterUser.id,
        status: 'approved'
      }
    });
    // Same boundary-straddling instant as the first test: 23:00 UTC on the
    // 27th is 07:00 Manila on the 28th.
    const outing = await prisma.tripDate.create({
      data: {
        tripTicketId: ticket.id,
        startTs: new Date('2026-08-27T23:00:00.000Z'),
        endTs: new Date('2026-08-28T02:00:00.000Z')
      }
    });
    const actor: AuthenticatedUser = {
      id: admin.id,
      email: admin.email,
      role: 'admin',
      branchId: branch.id
    };

    await events.tripCheckedOut(ticket, outing, actor);
    const outRow = only(
      await prisma.notification.findMany({
        where: { userId: requesterUser.id, type: 'trip_checked_out' }
      })
    );
    expect(outRow.body).toContain('2026-08-28');
    expect(outRow.body).not.toContain('2026-08-27');

    await events.tripCheckedIn(ticket, outing, actor, true);
    const inRow = only(
      await prisma.notification.findMany({
        where: { userId: requesterUser.id, type: 'trip_checked_in' }
      })
    );
    expect(inRow.body).toContain('2026-08-28');
    expect(inRow.body).not.toContain('2026-08-27');
  });

  it('tells the driver how many outings they are taking on once EVP signs off, excluding a cancelled one', async () => {
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
    // Fix round 1, item 2: a third date that is already cancelled. Test 3
    // previously seeded only two live dates, so `'2 outings'` passed
    // identically against an unfiltered `count()` — this row turns it into a
    // real guard: without the `status: { not: 'cancelled' }` filter in
    // events.ts, this would count 3 and the driver would be told they have
    // three outings when one of them is already off.
    await prisma.tripDate.create({
      data: {
        tripTicketId: ticket.id,
        startTs: new Date(now.getTime() + 14 * 86_400_000),
        endTs: new Date(now.getTime() + 14 * 86_400_000 + 3_600_000),
        status: 'cancelled',
        cancellationReason: 'dropped'
      }
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

    const row = only(
      await prisma.notification.findMany({
        where: { userId: driverUser.id, type: 'trip_assigned' }
      })
    );
    expect(row.body).toContain('2 outings');
    expect(row.body).toContain('each time');
  });

  // Fix round 1, item 5: a Driver row with no linked user account is meant
  // to receive nothing rather than crash (userIdForDriver returns null, and
  // notify() drops falsy recipient ids) — true today, but unpinned. A future
  // change to notify()'s filter could silently try to write a row with
  // userId: null (an FK violation) or address it to the wrong person, and
  // nothing here would notice.
  it('sends nothing to a driver with no linked user account, and does not crash', async () => {
    const branch = await createTestBranch();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'NU1',
        licensePlate: 'NU1',
        capacity: 5,
        fuelType: 'diesel',
        mileage: 1000,
        status: 'available',
        branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    // No `userId` — a driver row that exists before anyone has signed in as
    // them.
    const driver = await prisma.driver.create({
      data: {
        email: 'no-user@test.local',
        fullName: 'No User',
        status: 'active',
        branchId: branch.id
      }
    });
    const { user: actingAdmin } = await createTestUser({
      role: 'admin',
      email: 'admin-nulldriver-actor@test.local'
    });
    const { user: bystanderAdmin } = await createTestUser({
      role: 'admin',
      email: 'admin-nulldriver-bystander@test.local'
    });
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: new Date(),
        preparedBy: '',
        status: 'approved'
      }
    });
    const outing = await prisma.tripDate.create({
      data: {
        tripTicketId: ticket.id,
        startTs: new Date(),
        endTs: new Date(Date.now() + 3_600_000)
      }
    });
    const actor: AuthenticatedUser = {
      id: actingAdmin.id,
      email: actingAdmin.email,
      role: 'admin',
      branchId: branch.id
    };

    // Must not throw despite the driver having no linked user account.
    await events.tripDateCancelled(ticket, outing, actor, 'x');

    // The "others" fan-out still reaches a real bystander admin, proving the
    // zero count below isn't because the whole call silently failed...
    expect(
      await prisma.notification.count({ where: { userId: bystanderAdmin.id } })
    ).toBe(1);
    // ...but the driver's own pointed message goes to nobody: total rows are
    // exactly the bystander's, none addressed to the (nonexistent) driver
    // recipient.
    expect(await prisma.notification.count()).toBe(1);
  });
});
