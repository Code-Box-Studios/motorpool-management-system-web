import { test, expect } from '@playwright/test';
import { login, CREDENTIALS, apiLogin, apiGet, listData } from './helpers';

// A vehicle's status is moved by trips, repairs and maintenance, so Edit
// Vehicle shows it but never changes it — and never sends it.
test('edit vehicle shows status read-only and leaves it out of the update', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const vehicle = listData(
    await apiGet(request, '/api/vehicles', admin.token)
  )[0];
  expect(vehicle, 'a seeded vehicle exists').toBeTruthy();

  await login(page, 'admin');
  await page.goto(`/vehicles/${vehicle.id as string}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const status = page.getByRole('group', { name: 'Status', exact: true });
  await expect(status).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole('combobox', { name: 'Status', exact: true })
  ).toHaveCount(0);

  const patched = page.waitForRequest(
    (req) =>
      req.method() === 'PATCH' &&
      req.url().endsWith(`/api/vehicles/${vehicle.id as string}`)
  );
  // Capture the real form's body without changing the shared vehicle.
  await page.route(`**/api/vehicles/${vehicle.id as string}`, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'FIXTURE_ONLY',
              message: 'Fixture request captured.'
            }
          }
        })
      : route.fallback()
  );
  await page.getByRole('button', { name: 'Update Vehicle' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Update Vehicle' })
    .click();
  const body = (await patched).postData() ?? '';
  expect(body).toContain('name="make"');
  expect(body).not.toContain('name="status"');
});
