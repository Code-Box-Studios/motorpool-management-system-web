import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiPost,
  apiDelete,
  listData,
  tripStatus
} from './helpers';

// An event on two non-consecutive dates is ONE trip ticket carrying two
// TripDate rows, each its own outing/gate cycle, under one admin approval and
// one EVP fuel sign-off. This spec proves that end to end through the real
// HTTP API. It deliberately does NOT exercise guard check-out/check-in: the
// server only releases an outing scheduled for *today* (dates.ts,
// resolveOutingForCheckOut), and this spec — like the rest of this suite —
// must use far-future, distinct windows so it can never collide with the
// seeded demo data or other specs sharing this database. Faking "today" would
// mean booking near-term windows, which is exactly the collision risk this
// spec is designed to avoid, so the per-date gate-cycle guarantee is left to
// be proven by other, narrower coverage instead of contorted here.

// Best-effort teardown for a ticket this spec created. `DELETE` only works
// while a ticket is still `pending_admin_approval` (service.remove refuses
// anything further along); a ticket this spec pushed to `approved` has no
// hard-delete path at all, so cancel it instead — that stops it from holding
// its vehicle/driver window for later runs. A ticket already terminal
// (completed/cancelled/disapproved) is left alone; nothing more to do.
async function cleanupTicket(
  request: APIRequestContext,
  id: string,
  adminToken: string
): Promise<void> {
  const status = await tripStatus(request, id, adminToken);
  if (!status) return; // already gone
  if (status === 'pending_admin_approval') {
    await apiDelete(request, `/api/trip-tickets/${id}`, adminToken);
    return;
  }
  if (
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'disapproved'
  ) {
    return; // terminal — nothing more the API lets us do
  }
  // cancel()'s own legal-from set (transitions.ts:123-127) is exactly
  // pending_admin_approval / pending_fuel_allocation_approval / approved — it
  // does NOT include in_progress. This spec never drives a ticket to
  // in_progress (no check-out call), so this branch is defensive only, but if
  // it ever did run, failing loudly beats posting to `/cancel` and silently
  // no-oping on the 409 — that would leave a live row behind with no signal.
  if (status !== 'pending_fuel_allocation_approval' && status !== 'approved') {
    throw new Error(
      `cleanupTicket: don't know how to clean up ${id} (status=${status}) — ` +
        `cancel() does not accept this status; a live row may remain`
    );
  }
  const cancelled = await apiPost(
    request,
    `/api/trip-tickets/${id}/cancel`,
    adminToken,
    { reason: 'e2e cleanup' }
  );
  if (!cancelled.ok) {
    throw new Error(
      `cleanupTicket: cancel failed for ${id} (HTTP ${cancelled.status}) — a live row may remain`
    );
  }
}

test('an event on two non-consecutive dates: one approval, two gate cycles', async ({
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const requester = await apiLogin(request, CREDENTIALS.requester);
  const evp = await apiLogin(request, CREDENTIALS.evp);
  const driver = await apiLogin(request, CREDENTIALS.driver);

  // ---------- Resolve fixtures the same way trip-lifecycle.spec.ts does ----------
  const branches = listData(
    await apiGet(request, '/api/branches', admin.token)
  );
  const offices = listData(await apiGet(request, '/api/offices', admin.token));
  const heads = listData(
    await apiGet(request, '/api/office-heads', admin.token)
  );
  const vehicles = listData(
    await apiGet(request, '/api/vehicles', admin.token)
  );
  const drivers = listData(await apiGet(request, '/api/drivers', admin.token));

  const vehicle = vehicles.find((v) => v.status === 'available');
  expect(vehicle, 'a free vehicle is available for the sim').toBeTruthy();
  const linkedDriver =
    drivers.find((d) => d.userId === driver.user.id) ?? drivers[0];

  // Far-future, distinct windows: the seeded demo data and every other spec
  // share this database, and an overlapping window fails with
  // VEHICLE_DOUBLE_BOOKED (409) — a fixture collision, not a product bug.
  const DAY = 86_400_000;
  const day1 = new Date(Date.now() + 60 * DAY);
  const gapDay = new Date(Date.now() + 62 * DAY);
  const day2 = new Date(Date.now() + 64 * DAY);
  const destination = `MD-E2E ${Date.now()}`;

  const createdIds: string[] = [];
  try {
    // ---------- Book a two-date event ----------
    const created = await apiPost(
      request,
      '/api/trip-tickets',
      requester.token,
      {
        branchId: branches[0].id as string,
        driverId: linkedDriver.id as string,
        vehicleId: vehicle!.id as string,
        officeId: (offices[0]?.id as string) ?? null,
        officeHeadId: (heads[0]?.id as string) ?? null,
        destination,
        purpose: 'E2E multi-date event',
        dateRequested: new Date().toISOString(),
        participants: ['E2E'],
        participantsCount: 1,
        preparedBy: 'E2E',
        requestedById: requester.user.id,
        dates: [
          {
            startTs: day1.toISOString(),
            endTs: new Date(day1.getTime() + 6 * 3_600_000).toISOString()
          },
          {
            startTs: day2.toISOString(),
            endTs: new Date(day2.getTime() + 6 * 3_600_000).toISOString()
          }
        ]
      }
    );
    expect(created.ok, 'requester books a two-date event').toBeTruthy();
    const ticket = created.body as {
      id: string;
      dates: { id: string; startTs: string; status: string }[];
    };
    const tripId = ticket.id;
    createdIds.push(tripId);

    // Booking produced two TripDate rows, both scheduled — one ticket, two
    // outings.
    expect(ticket.dates, 'two TripDate rows were created').toHaveLength(2);
    for (const d of ticket.dates) {
      expect(d.status, 'each date starts out scheduled').toBe('scheduled');
    }

    // ---------- ONE approval + ONE EVP sign-off covers the whole event ----------
    const adminApprove = await apiPost(
      request,
      `/api/trip-tickets/${tripId}/approve`,
      admin.token,
      {
        liters: 20,
        fuelType: 'diesel',
        date: day1.toISOString(),
        purpose: 'E2E',
        tripTo: destination
      }
    );
    expect(adminApprove.ok, 'admin approve + fuel allocation').toBeTruthy();
    expect(await tripStatus(request, tripId, admin.token)).toBe(
      'pending_fuel_allocation_approval'
    );

    const evpApprove = await apiPost(
      request,
      `/api/trip-tickets/${tripId}/approve-evp`,
      evp.token,
      {}
    );
    expect(evpApprove.ok, 'EVP fuel sign-off').toBeTruthy();
    expect(
      await tripStatus(request, tripId, admin.token),
      'one approval chain covers both dates — no per-date approval exists'
    ).toBe('approved');

    // ---------- The gap day is free for somebody else on the same van ----------
    // A single 60→64-day continuous window would have refused this outright
    // (VEHICLE_DOUBLE_BOOKED); per-date booking is what leaves it free.
    const gap = await apiPost(request, '/api/trip-tickets', requester.token, {
      branchId: branches[0].id as string,
      driverId: linkedDriver.id as string,
      vehicleId: vehicle!.id as string,
      officeId: (offices[0]?.id as string) ?? null,
      officeHeadId: (heads[0]?.id as string) ?? null,
      destination: `${destination} GAP`,
      purpose: 'E2E gap-day booking',
      dateRequested: new Date().toISOString(),
      participants: ['E2E'],
      participantsCount: 1,
      preparedBy: 'E2E',
      requestedById: requester.user.id,
      dates: [
        {
          startTs: gapDay.toISOString(),
          endTs: new Date(gapDay.getTime() + 3_600_000).toISOString()
        }
      ]
    });
    expect(gap.ok, 'the days between two dates stay bookable').toBeTruthy();
    const gapTripId = (gap.body as { id: string }).id;
    createdIds.push(gapTripId);

    // ---------- Cancel one date; the event survives ----------
    // Read `dates` off the ticket detail body (not listData — it's a field on
    // the ticket, not a paginated list) to get the per-date id.
    const detail = (await apiGet(
      request,
      `/api/trip-tickets/${tripId}`,
      admin.token
    )) as {
      dates: { id: string; startTs: string; status: string }[];
    };
    expect(detail.dates).toHaveLength(2);
    // The detail include orders dates by startTs asc (repository.ts), but match
    // by timestamp rather than array position to stay correct even if that ever
    // changes.
    const dateOne = detail.dates.find(
      (d) => new Date(d.startTs).getTime() === day1.getTime()
    );
    const dateTwo = detail.dates.find(
      (d) => new Date(d.startTs).getTime() === day2.getTime()
    );
    expect(dateOne, 'day-one row resolved from the ticket detail').toBeTruthy();
    expect(dateTwo, 'day-two row resolved from the ticket detail').toBeTruthy();

    const cancelDateTwo = await apiPost(
      request,
      `/api/trip-tickets/${tripId}/dates/${dateTwo!.id}/cancel`,
      admin.token,
      { reason: 'E2E: cancel one date only' }
    );
    expect(cancelDateTwo.ok, 'a single date can be cancelled').toBeTruthy();
    expect(
      await tripStatus(request, tripId, admin.token),
      'cancelling one date does not void the rest of the event'
    ).toBe('approved');

    // ---------- A cancelled date frees its window for other bookings ----------
    const freed = await apiPost(request, '/api/trip-tickets', requester.token, {
      branchId: branches[0].id as string,
      driverId: linkedDriver.id as string,
      vehicleId: vehicle!.id as string,
      officeId: (offices[0]?.id as string) ?? null,
      officeHeadId: (heads[0]?.id as string) ?? null,
      destination: `${destination} FREED`,
      purpose: 'E2E freed-window booking',
      dateRequested: new Date().toISOString(),
      participants: ['E2E'],
      participantsCount: 1,
      preparedBy: 'E2E',
      requestedById: requester.user.id,
      dates: [
        {
          startTs: day2.toISOString(),
          endTs: new Date(day2.getTime() + 6 * 3_600_000).toISOString()
        }
      ]
    });
    expect(
      freed.ok,
      'a cancelled date frees its window for other bookings'
    ).toBeTruthy();
    const freedTripId = (freed.body as { id: string }).id;
    createdIds.push(freedTripId);

    // ---------- Cancelling the LAST live date cancels the whole ticket ----------
    const cancelDateOne = await apiPost(
      request,
      `/api/trip-tickets/${tripId}/dates/${dateOne!.id}/cancel`,
      admin.token,
      { reason: 'E2E: cancel the last live date' }
    );
    expect(cancelDateOne.ok, 'cancel the remaining date').toBeTruthy();
    expect(
      await tripStatus(request, tripId, admin.token),
      'cancelling the last live date cancels the whole ticket'
    ).toBe('cancelled');
  } finally {
    // ---------- Cleanup: leave no rows behind in the shared dev database ----------
    // Each id gets its own try/catch: a Playwright APIRequestContext throws on
    // connection-level failures (distinct from an HTTP error status, which
    // resolves normally rather than throwing) — without per-id isolation, one
    // bad id would abort the loop and strand every id after it, which is
    // exactly the failure-path case this cleanup exists to cover.
    for (const id of createdIds) {
      try {
        await cleanupTicket(request, id, admin.token);
      } catch (err) {
        console.error(`multi-date-trip cleanup failed for ${id}:`, err);
      }
    }
  }
});
