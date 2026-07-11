import { test, expect } from '@playwright/test';
import { login, shot, CREDENTIALS, apiLogin, apiGet, listData } from './helpers';

test('admin registers a tracker device and it appears in the list', async ({
  page,
  request
}) => {
  const imei = `E2E${Date.now()}`;

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

test('non-admin cannot see or reach the Trackers page', async ({ page }) => {
  await login(page, 'driver');

  // Not surfaced in the sidebar for drivers.
  await expect(
    page.getByRole('link', { name: 'Trackers', exact: true })
  ).toHaveCount(0);

  // Direct navigation is redirected to the dashboard by the auth guard.
  await page.goto('/tracker-devices');
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
});
