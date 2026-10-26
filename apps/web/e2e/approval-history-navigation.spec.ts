import { expect, test } from '@playwright/test';
import { apiGet, apiLogin, CREDENTIALS, listData, login } from './helpers';

test('approval history opens trip and repair details from rows and keyboard links without View buttons', async ({
  page,
  request
}) => {
  const actor = await apiLogin(request, CREDENTIALS.admin);
  const [trips, jobs] = await Promise.all([
    apiGet(request, '/api/trip-tickets', actor.token).then(listData),
    apiGet(request, '/api/job-orders', actor.token).then(listData)
  ]);
  expect(trips.length).toBeGreaterThan(0);
  expect(jobs.length).toBeGreaterThan(0);
  const decisions = [
    {
      kind: 'fuel',
      id: trips[0].id,
      ref: 'TT-ROW',
      title: 'Trip row navigation',
      linkTo: `/trip-tickets/${trips[0].id}`,
      liters: 20,
      fuelType: 'diesel'
    },
    {
      kind: 'repair',
      id: jobs[0].id,
      ref: 'JO-ROW',
      title: 'Repair row navigation',
      linkTo: `/job-order/${jobs[0].id}`,
      liters: null,
      fuelType: null
    }
  ].map((item) => ({
    ...item,
    subtitle: 'Vehicle row target',
    outcome: 'approved',
    decidedAt: null,
    decidedByName: null,
    decidedByRole: null,
    reason: null
  }));
  await page.route('**/api/approvals/history?*', (route) =>
    route.fulfill({ json: { data: decisions, count: decisions.length } })
  );
  await login(page, 'evp');
  for (const decision of decisions) {
    await page.goto('/dashboard?approvalTab=history');
    const row = page.getByRole('row').filter({ hasText: decision.ref });
    await expect(row).toBeVisible();
    await row
      .getByRole('cell', { name: 'Vehicle row target', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${decision.linkTo}$`));
    await page.goto('/dashboard?approvalTab=history');
    const link = page.getByRole('link', { name: decision.title, exact: true });
    await expect(
      page.getByRole('columnheader', { name: 'View', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /View .* details/ })
    ).toHaveCount(0);
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${decision.linkTo}$`));
  }
});
