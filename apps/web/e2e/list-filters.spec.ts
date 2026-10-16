import { chooseFilter, expectFilterValue } from './filter-controls';
import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('column filters compose, reset pagination, and preserve search, sorting, and Grid', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/vehicles?page=2&search=MMS&sortBy=make&sortOrder=asc');
  await page.getByRole('tab', { name: 'Grid', exact: true }).click();

  await chooseFilter(page, 'status', 'Ready');
  await expect(page).toHaveURL(/status=available/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page).toHaveURL(/search=MMS/);
  await expect(page).toHaveURL(/sortBy=make/);
  await expect(
    page.getByRole('tab', { name: 'Grid', exact: true })
  ).toHaveAttribute('data-state', 'active');

  await chooseFilter(page, 'fuel type', 'Diesel');
  await expect(page).toHaveURL(/fuelType=diesel/);
  await expect(page).toHaveURL(/status=available/);
  await page.getByRole('tab', { name: 'Table', exact: true }).click();
  await expectFilterValue(page, 'status', 'Ready');

  await page.reload();
  await expectFilterValue(page, 'fuel type', 'Diesel');
  await expectFilterValue(page, 'status', 'Ready');
  await chooseFilter(page, 'status', 'All');
  await expect(page).not.toHaveURL(/status=/);
  await expect(page).toHaveURL(/fuelType=diesel/);
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .first()
    .click();
  await expect(page).not.toHaveURL(/status=|fuelType=/);
  await expect(page).toHaveURL(/search=MMS/);
  await expect(page).toHaveURL(/sortBy=make/);
});

test('empty filtered lists let people clear filters without losing their search', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/vehicles?search=no-match-filter-check');
  await chooseFilter(page, 'status', 'Ready');
  await expect(
    page.getByText('No records match your search and filters.')
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .last()
    .click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(
    page.getByRole('searchbox', { name: 'Search vehicles', exact: true })
  ).toHaveValue('no-match-filter-check');
  await expect(page.getByText('No records match your search.')).toBeVisible();
});

test('unavailable dynamic filter options stay visible and clearable', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/vehicles?branchId=ffffffff-ffff-4fff-8fff-ffffffffffff');
  await expectFilterValue(page, 'branch', 'Unavailable option');
  await expect(page.getByText('No records match your filters.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .first()
    .click();
  await expect(page).not.toHaveURL(/branchId=/);
  await expectFilterValue(page, 'branch', 'All');
});

for (const check of [
  {
    route: 'drivers',
    api: 'drivers',
    label: 'status',
    option: 'Active',
    key: 'status',
    value: 'active'
  },
  {
    route: 'vehicles',
    api: 'vehicles',
    label: 'status',
    option: 'Ready',
    key: 'status',
    value: 'available'
  },
  {
    route: 'spare-parts',
    api: 'spare-parts',
    label: 'stock',
    option: 'Low stock',
    key: 'stock',
    value: 'low_stock'
  },
  {
    route: 'tools',
    api: 'tools',
    label: 'status',
    option: 'Borrowed',
    key: 'status',
    value: 'borrowed'
  },
  {
    route: 'user-management',
    api: 'users',
    label: 'role',
    option: 'Requester',
    key: 'role',
    value: 'requester'
  },
  {
    route: 'tracker-devices',
    api: 'tracker-devices',
    label: 'assignment',
    option: 'Unassigned',
    key: 'assignment',
    value: 'unassigned'
  },
  {
    route: 'job-order',
    api: 'job-orders',
    label: 'status',
    option: 'In repair',
    key: 'status',
    value: 'ongoing_repair'
  },
  {
    route: 'trip-tickets',
    api: 'trip-tickets',
    label: 'status',
    option: 'Cancelled',
    key: 'status',
    value: 'cancelled'
  },
  {
    route: 'maintenance',
    api: 'maintenance',
    label: 'type',
    option: 'Preventive',
    key: 'type',
    value: 'preventive'
  }
]) {
  test(`${check.route} sends its selected column filter to the list API`, async ({
    page
  }) => {
    await login(page, 'admin');
    await page.goto(`/${check.route}?page=2`);
    const response = page.waitForResponse((res) => {
      const url = new URL(res.url());
      return (
        url.pathname === `/api/${check.api}` &&
        url.searchParams.get(check.key) === check.value &&
        res.request().method() === 'GET'
      );
    });
    await chooseFilter(page, check.label, check.option);
    const result = await response;
    expect(result.ok()).toBeTruthy();
    await expect(page).not.toHaveURL(/page=2/);
    expect(new URL(page.url()).searchParams.get(check.key)).toBe(check.value);
    await expectFilterValue(page, check.label, check.option);
    await page
      .getByRole('button', { name: 'Clear filters', exact: true })
      .first()
      .click();
    await expect(page).not.toHaveURL(new RegExp(`${check.key}=`));
  });
}
