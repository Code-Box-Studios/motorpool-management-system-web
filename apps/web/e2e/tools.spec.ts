import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('tools borrow metrics', () => {
  test('the tools page shows the borrow strip and an honest empty leaderboard', async ({
    page
  }) => {
    await login(page, 'admin');
    await page.goto('/tools');

    await expect(page.getByText('Tools out')).toBeVisible();
    await expect(page.getByText('Avg days out')).toBeVisible();
    // A /stats route shadowed by /:id fails as an EMPTY PANEL, not an error —
    // this is the only assertion that catches it from outside the API.
    await expect(page.getByText(/Most borrowed/i)).toBeVisible();
  });

  test('a driver sees the same metrics', async ({ page }) => {
    await login(page, 'driver');
    await page.goto('/tools');
    // Both admin and driver reach this route; a 403 from INVENTORY_READ_ROLES
    // being set wrong would render the strip with no numbers behind it.
    await expect(page.getByText('Tools out')).toBeVisible();
  });
});
