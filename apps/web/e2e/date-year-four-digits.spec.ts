import { test, expect } from '@playwright/test';
import { login, CREDENTIALS, apiLogin, apiGet, listData } from './helpers';

// Native date fields let a year run to six digits ("202611") unless a max
// caps it. Every date and date-time field takes a four-digit year.
test('date fields stop the year at four digits', async ({ page, request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const vehicle = listData(
    await apiGet(request, '/api/vehicles', admin.token)
  )[0];

  await login(page, 'admin');
  await page.goto(`/vehicles/${vehicle.id as string}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const expiry = page.locator('#insurance_expiry');
  await expect(expiry).toHaveAttribute('max', '9999-12-31');
  // Type month, day, then a six-digit year; the year segment keeps four.
  await expiry.click();
  await expiry.press('Control+a');
  await page.keyboard.type('11192026119');
  await expect(expiry).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);

  // Date-time fields too (Tracker Logs' "to" has no max of its own).
  await page.goto('/tracker-logs');
  await expect(page.locator('#packet-to')).toHaveAttribute(
    'max',
    '9999-12-31T23:59',
    { timeout: 15_000 }
  );
});
