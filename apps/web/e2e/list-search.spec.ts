import { test, expect } from '@playwright/test';
import { login } from './helpers';

for (const route of ['spare-parts', 'tools', 'vehicles']) {
  test(`${route} retains Grid while searching, clearing, and changing views`, async ({
    page
  }) => {
    await login(page, 'admin');
    const sortBy = route === 'vehicles' ? 'make' : 'name';
    await page.goto(`/${route}?page=2&sortBy=${sortBy}&sortOrder=asc`);
    await page.getByRole('tab', { name: 'Grid', exact: true }).click();
    const input = page.getByRole('searchbox');
    const term = `no-match-${Date.now()}`;
    await input.fill(term);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page).toHaveURL(new RegExp(`sortBy=${sortBy}`));
    await expect(page.getByText('No records match your search.')).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Grid', exact: true })
    ).toHaveAttribute('data-state', 'active');
    await page.getByRole('tab', { name: 'Table', exact: true }).click();
    await expect(input).toHaveValue(term);
    await page.getByRole('tab', { name: 'Grid', exact: true }).click();
    await page.locator('button[aria-label="Clear search"]').click();
    await expect(input).toHaveValue('');
    await expect(page).not.toHaveURL(/search=/);
    await expect(
      page.getByRole('tab', { name: 'Grid', exact: true })
    ).toHaveAttribute('data-state', 'active');
  });
}

test('maintenance search filters the table and retains the selected view', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/maintenance');
  const tableTab = page.getByRole('tab', { name: 'Table', exact: true });
  await tableTab.click();
  await expect(tableTab).toHaveAttribute('data-state', 'active');
  await page.getByRole('searchbox').fill('no-match-maintenance-audit');
  await expect(page.getByText('No records match your search.')).toBeVisible();
  await expect(tableTab).toHaveAttribute('data-state', 'active');
});

test('approval history shows decision details in a searchable table with working links', async ({
  page
}) => {
  await login(page, 'evp');
  await expect(page.getByText(/Fuel sign-off · Trip tickets/)).toBeVisible();
  const headline = await page.getByRole('heading', { level: 1 }).innerText();
  await page
    .getByRole('searchbox', { name: 'Search pending approvals' })
    .fill('no-match-pending-approval-audit');
  await expect(page.getByText('No records match your search.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline);
  await page.locator('button[aria-label="Clear search"]').click();
  await page
    .getByRole('button', { name: 'Decline', exact: true })
    .first()
    .click();
  const declineDialog = page.getByRole('alertdialog');
  await expect(declineDialog.getByLabel('Reason for declining')).toBeVisible();
  await declineDialog
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  for (const heading of [
    'Reference',
    'Request',
    'Vehicle',
    'Outcome',
    'Decided by',
    'Date',
    'Details'
  ]) {
    await expect(
      table.getByRole('columnheader', { name: heading, exact: true })
    ).toBeVisible();
  }
  await page.screenshot({
    path: '/tmp/mms-approval-history.png',
    fullPage: true
  });
  const input = page.getByRole('searchbox', {
    name: 'Search approval history'
  });
  await input.fill('no-match-approval-history-audit');
  await expect(page.getByText('No records match your search.')).toBeVisible();
  await page.locator('button[aria-label="Clear search"]').click();
  await expect(table).toBeVisible();
  await table
    .getByRole('link', { name: /^View / })
    .first()
    .click();
  await expect(page).toHaveURL(/\/(trip-tickets|job-order)\/[0-9a-f-]+/);
});

test('all Organization resource tabs support search and clear', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/organization');
  for (const name of ['Branches', 'Offices', 'Office Heads', 'Employees']) {
    await page.getByRole('tab', { name, exact: true }).click();
    const input = page.getByRole('searchbox', {
      name: `Search ${name.toLowerCase()}`
    });
    await input.fill('no-match-organization-audit');
    await expect(page.getByText('No records match your search.')).toBeVisible();
    await page.locator('button[aria-label="Clear search"]').click();
    await expect(input).toHaveValue('');
    await expect(page.getByText('No records match your search.')).toHaveCount(
      0
    );
  }
});

test('requester can search and clear their trip history', async ({ page }) => {
  await login(page, 'requester');
  const input = page.getByRole('searchbox', { name: 'Search request history' });
  await input.fill('no-match-request-history-audit');
  await expect(page.getByText('No records match your search.')).toBeVisible();
  await page.locator('button[aria-label="Clear search"]').click();
  await expect(input).toHaveValue('');
  await expect(page.getByText('No records match your search.')).toHaveCount(0);
});
