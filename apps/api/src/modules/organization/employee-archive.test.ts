import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { TripTicketStatus } from '@prisma/client';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

// Design §10: `IN_USE` keeps the rule the rest of this module already keeps —
// history never blocks. A LIVE ticket holds its guide; a completed, cancelled
// or disapproved one is a record of who went, and a record must never stop an
// admin retiring somebody who has left. Getting this backwards is invisible
// until the day an employee resigns and cannot be archived, ever.
//
// One live-ticket IN_USE case already lives in employees.test.ts (Task 2, on
// an explicit ruling — see its comment above that test). It covers `approved`.
// This file owns the rest of the sweep: the OTHER three live statuses
// (pending_admin_approval, pending_fuel_allocation_approval, in_progress) that
// must block, the three history statuses (completed, cancelled, disapproved)
// that must not, plus sibling isolation. All seven of TripTicketStatus are
// accounted for across the two files — anything less and a status could be
// dropped from LIVE_TRIP_STATUSES with every suite still green.
const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({
    email: 'boss@test.local',
    role: 'admin'
  });
  return authHeader(user.id, user.email, 'admin');
}

// One branch, one employee, one ticket in the requested status, with the
// employee guiding it. Everything is fresh per call — truncateAll runs before
// each test — so a blocker count below can only have come from here.
//
// `TripTicketStatus` is the generated Prisma enum, not a hand-rolled union: the
// union this used to spell out was already stale-able, and a status added to
// schema.prisma should widen this parameter automatically rather than wait for
// someone to remember. Same import the sibling suites in trip-tickets/ use.
async function guideOnTicket(status: TripTicketStatus) {
  const branch = await createTestBranch('Rostered');
  const vehicle = await createTestVehicle(branch.id);
  // Inactive on purpose: this suite is about the EMPLOYEE's blockers, and the
  // ticket only needs a driverId to exist.
  const driver = await createTestDriver(branch.id, 'inactive');
  const employee = await createTestEmployee(branch.id, 'Ramon Dela Cruz');
  const ticket = await createTestTicket({
    branchId: branch.id,
    driverId: driver.id,
    vehicleId: vehicle.id,
    status
  });
  // createTestTicket writes the ticket row only. The join row is what makes
  // this employee a guide — and it is written straight through Prisma so the
  // fixture can put the ticket in statuses the booking route would refuse.
  await prisma.tripTicketEmployee.create({
    data: { tripTicketId: ticket.id, employeeId: employee.id }
  });
  return { branch, employee, ticket };
}

describe('archiving an employee who is guiding a trip', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  // NOT a duplicate of employees.test.ts's "refuses to archive an employee
  // guiding a live trip" (which pins the route + the `details.blockers`
  // shape against `approved`). This one exists for the OTHER live status:
  // narrowing `liveTicket` to `{ in: ['approved'] }` would leave that test
  // green while quietly letting an `in_progress` guide be archived out from
  // under a trip that is literally still on the road. Only this test notices.
  // The two PENDING statuses. A trip is booked long before it is approved, and
  // the guide is committed to it from the moment it is filed — archiving them
  // out from under a booked-but-unapproved trip leaves the ticket naming
  // somebody who is off the roster, with nobody told. Remove either status from
  // LIVE_TRIP_STATUSES and, until these two tests, the whole organization suite
  // stayed green while exactly that became possible.
  it('is refused while the trip is still awaiting ADMIN approval', async () => {
    const header = await adminHeader();
    const { employee } = await guideOnTicket('pending_admin_approval');

    const res = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
  });

  it('is refused while the trip is awaiting FUEL ALLOCATION approval', async () => {
    const header = await adminHeader();
    const { employee } = await guideOnTicket(
      'pending_fuel_allocation_approval'
    );

    const res = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
  });

  it('is still refused once the trip is out on the road (in_progress)', async () => {
    const header = await adminHeader();
    const { employee } = await guideOnTicket('in_progress');

    const res = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
  });

  it('is allowed once the trip is completed, and the trip still names them', async () => {
    const header = await adminHeader();
    const { employee, ticket } = await guideOnTicket('completed');

    const res = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).not.toBeNull();

    // Design §8: archiving hides someone from future bookings; it never
    // rewrites history. The guide is read through the join with the employee
    // included, so the finished trip keeps the name of who was on it.
    const fetched = await request(app)
      .get(`/api/trip-tickets/${ticket.id}`)
      .set('Authorization', header);
    expect(fetched.status).toBe(200);
    expect(
      (fetched.body.guides as { employee: { name: string } }[]).map(
        (g) => g.employee.name
      )
    ).toEqual(['Ramon Dela Cruz']);
  });

  it('is allowed for a cancelled trip, and for a disapproved one', async () => {
    const header = await adminHeader();
    const { employee, ticket } = await guideOnTicket('cancelled');

    const first = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(first.status).toBe(200);

    // Restore, then repeat against `disapproved`. `completed` used to be the
    // only history status any of these suites exercised — if LIVE_TRIP_STATUSES
    // quietly grew `cancelled` or `disapproved`, nothing above would fail.
    const restored = await request(app)
      .post(`/api/employees/${employee.id}/restore`)
      .set('Authorization', header);
    expect(restored.status).toBe(200);

    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { status: 'disapproved' }
    });
    const second = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(second.status).toBe(200);
  });

  it("does not count a colleague's live trip", async () => {
    const header = await adminHeader();
    const { branch } = await guideOnTicket('approved');
    // A second employee on the SAME branch, guiding nothing. Drop the
    // `employeeId` filter from employeeBlockers and this is the only test that
    // notices — every other one in this file uses exactly one employee.
    const bystander = await createTestEmployee(branch.id, 'Never Rostered');

    const res = await request(app)
      .post(`/api/employees/${bystander.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).not.toBeNull();
  });
});
