import { test, expect } from '@playwright/test';
import {
  login, shot, CREDENTIALS,
  apiLogin, apiGet, apiPost, listData, tripStatus
} from './helpers';

// Full trip-ticket lifecycle. The EVP fuel approval is exercised through the real
// UI (the automatable transition). The earlier admin fuel-allocation step is a
// large multi-field form and the guard check-out/in is gated behind a physical
// camera QR scan — neither runs reliably headless, so those are staged/completed
// via the API, with each transition asserted. See notes inline.
test('trip lifecycle: requester → admin → EVP (UI) → guard → completed', async ({ page, request }) => {
  // ---------- Stage the trip via the API ----------
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const requester = await apiLogin(request, CREDENTIALS.requester);
  const driver = await apiLogin(request, CREDENTIALS.driver);
  const guard = await apiLogin(request, CREDENTIALS.guard);

  const branches = listData(await apiGet(request, '/api/branches', admin.token));
  const offices = listData(await apiGet(request, '/api/offices', admin.token));
  const heads = listData(await apiGet(request, '/api/office-heads', admin.token));
  const vehicles = listData(await apiGet(request, '/api/vehicles', admin.token));
  const drivers = listData(await apiGet(request, '/api/drivers', admin.token));

  const vehicle = vehicles.find((v) => v.status === 'available');
  expect(vehicle, 'a free vehicle is available for the sim').toBeTruthy();
  const linkedDriver = drivers.find((d) => d.userId === driver.user.id) ?? drivers[0];
  const destination = `UI-E2E ${Date.now()}`;

  // Requester submits → always born pending_admin_approval.
  const created = await apiPost(request, '/api/trip-tickets', requester.token, {
    branchId: branches[0].id as string,
    driverId: linkedDriver.id as string,
    vehicleId: vehicle!.id as string,
    officeId: (offices[0]?.id as string) ?? null,
    officeHeadId: (heads[0]?.id as string) ?? null,
    destination, purpose: 'E2E UI lifecycle',
    dateRequested: new Date().toISOString(),
    participants: ['E2E'], participantsCount: 1, preparedBy: 'E2E',
    requestedById: requester.user.id,
    startTs: new Date().toISOString(),
    endTs: new Date(Date.now() + 3_600_000).toISOString()
  });
  expect(created.ok, 'requester creates trip').toBeTruthy();
  const tripId = (created.body as { id: string }).id;
  expect(await tripStatus(request, tripId, admin.token)).toBe('pending_admin_approval');

  // Admin approve (prepares the fuel allocation) → pending_fuel_allocation_approval.
  const adminApprove = await apiPost(request, `/api/trip-tickets/${tripId}/approve`, admin.token, {
    liters: 25, fuelType: 'diesel', date: new Date().toISOString(), purpose: 'E2E', tripTo: destination
  });
  expect(adminApprove.ok, 'admin approve + fuel allocation').toBeTruthy();
  expect(await tripStatus(request, tripId, admin.token)).toBe('pending_fuel_allocation_approval');

  // ---------- The UI transition: EVP approves the fuel allocation ----------
  await login(page, 'evp');
  const evpRow = page.getByRole('row').filter({ hasText: destination });
  await expect(evpRow, 'trip appears in EVP approval table').toBeVisible({ timeout: 15_000 });
  await shot(page, 'lifecycle-1-evp-pending');

  await evpRow.getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();

  // The click really moved the ticket forward.
  await expect
    .poll(() => tripStatus(request, tripId, admin.token), { timeout: 15_000 })
    .toBe('approved');
  await shot(page, 'lifecycle-2-evp-approved');

  // ---------- Guard check-out / check-in via API ----------
  // (The guard UI requires scanning the trip QR with a physical camera, which
  // cannot run in headless Chromium — so these transitions go through the API.)
  const checkOut = await apiPost(request, `/api/trip-tickets/${tripId}/check-out`, guard.token, {});
  expect(checkOut.ok, 'guard check-out').toBeTruthy();
  expect(await tripStatus(request, tripId, admin.token)).toBe('in_progress');

  const checkIn = await apiPost(request, `/api/trip-tickets/${tripId}/check-in`, guard.token, {});
  expect(checkIn.ok, 'guard check-in').toBeTruthy();
  expect(await tripStatus(request, tripId, admin.token)).toBe('completed');

  // ---------- Verify the completed trip is visible in the admin UI ----------
  await page.context().clearCookies();
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Trip Tickets', exact: true }).first().click();
  await page.waitForURL(/\/trip-tickets/, { timeout: 15_000 });
  // Switch to the Table view for an unambiguous status-cell check.
  await page.getByRole('tab', { name: 'Table' }).click();
  const adminRow = page.getByRole('row').filter({ hasText: destination });
  await expect(adminRow, 'completed trip shows in admin table').toBeVisible({ timeout: 15_000 });
  await expect(adminRow).toContainText(/completed/i);
  await shot(page, 'lifecycle-3-admin-completed');
});
