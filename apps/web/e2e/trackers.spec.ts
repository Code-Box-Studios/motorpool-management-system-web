import { test, expect } from '@playwright/test';
import {
  login,
  shot,
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiDelete,
  listData
} from './helpers';

// A well-formed uuid that is not a real device — used to prove the dynamic
// detail route is role-gated before it ever queries the API.
const UNKNOWN_DEVICE_ID = '00000000-0000-4000-8000-000000000000';

// IMEIs this spec registered; torn down after each test so runs don't pile up
// permanent rows in the shared dev database. Resolved to ids at teardown time
// so a test that fails *after* creating still cleans up after itself.
const registeredImeis: string[] = [];

test.afterEach(async ({ request }) => {
  const imeis = registeredImeis.splice(0);
  if (!imeis.length) return;

  const admin = await apiLogin(request, CREDENTIALS.admin);
  const devices = listData(
    await apiGet(request, '/api/tracker-devices?limit=100', admin.token)
  );

  for (const imei of imeis) {
    const id = devices.find((d) => d.imei === imei)?.id;
    if (typeof id === 'string') {
      await apiDelete(request, `/api/tracker-devices/${id}`, admin.token);
    }
  }
});

test('admin registers a tracker device and it appears in the list', async ({
  page,
  request
}) => {
  const imei = `E2E${Date.now()}`;
  registeredImeis.push(imei);

  await login(page, 'admin');

  // Trackers lives under the Settings group in the sidebar (admin-only).
  await page.getByRole('link', { name: 'Trackers', exact: true }).first().click();
  await page.waitForURL(/\/tracker-devices/, { timeout: 15_000 });
  // CardTitle renders a plain <div> (no heading role), so match on text.
  await expect(
    page.getByText('Tracker Devices', { exact: true })
  ).toBeVisible({ timeout: 15_000 });

  // Register a new device.
  await page.getByRole('link', { name: 'Register Device' }).click();
  await page.waitForURL(/\/tracker-devices\/add-device/, { timeout: 15_000 });
  await page.locator('#imei').fill(imei);
  await page.locator('#label').fill('E2E Unit');
  // Leave status (defaults to Active) and vehicle (defaults to Unassigned) as-is
  // so reruns never collide with the "one active tracker per vehicle" rule.
  await page.getByRole('button', { name: 'Register Device' }).click();

  // Two-step confirm modal.
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Register Device' }).click();

  // Back on the list, the new IMEI is visible with the expected status/connectivity.
  await page.waitForURL(/\/tracker-devices$/, { timeout: 15_000 });
  const row = page.getByRole('row').filter({ hasText: imei });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('Active'); // default status
  await expect(row).toContainText('Offline'); // never pinged yet
  await shot(page, 'trackers-1-registered');

  // The API confirms it persisted.
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const devices = listData(
    await apiGet(request, '/api/tracker-devices', admin.token)
  );
  expect(
    devices.some((d) => d.imei === imei),
    'device persisted via API'
  ).toBeTruthy();
});

test('non-admin cannot see or reach the Trackers pages', async ({ page }) => {
  await login(page, 'driver');

  // Not surfaced in the sidebar for drivers.
  await expect(
    page.getByRole('link', { name: 'Trackers', exact: true })
  ).toHaveCount(0);

  // Direct navigation is redirected to the dashboard by the auth guard.
  await page.goto('/tracker-devices');
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

  // The register sub-route is gated too — the form must never render.
  await page.goto('/tracker-devices/add-device');
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await expect(
    page.getByRole('heading', { name: 'Register Tracker Device' })
  ).toHaveCount(0);

  // ...as is the dynamic detail sub-route (which the pathname-keyed auth guard
  // structurally cannot match). Any id works: the gate runs before the fetch.
  await page.goto(`/tracker-devices/${UNKNOWN_DEVICE_ID}`);
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Tracker Device' })).toHaveCount(
    0
  );
});
