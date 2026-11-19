import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  login,
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiPost,
  listData
} from './helpers';

// The Organization tables rendered every record on one page. Production holds
// hundreds of employees, so the Employees tab became one endless scroll while
// every other list in the app pages at 10 rows. All four tabs share
// ResourceTab, so the Employees tab stands in for Branches, Offices and
// Office Heads.

const PAGE_SIZE = 10;
const RUN = `Pager${Date.now()}`;
// Zero-padded so the API's alphabetical order matches the numbering.
const NAMES = Array.from(
  { length: 12 },
  (_, i) => `${RUN} A${String(i + 1).padStart(2, '0')}`
);
const createdEmployeeIds: string[] = [];

// API calls go through the standalone `request` fixture, never page.request:
// the latter shares the browser's cookie jar and would sign the page in.
async function createEmployees(request: APIRequestContext): Promise<void> {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const branches = listData(
    await apiGet(request, '/api/branches', admin.token)
  );
  const main = branches.find((b) => b.name === 'Main Branch');
  expect(main, 'seeded Main Branch exists').toBeTruthy();
  for (const name of NAMES) {
    const created = await apiPost(request, '/api/employees', admin.token, {
      name,
      position: 'E2E pagination check',
      branchId: main!.id
    });
    expect(created.ok, `employee created (HTTP ${created.status})`).toBe(true);
    createdEmployeeIds.push((created.body as { id: string }).id);
  }
}

test.beforeAll(async ({ request }) => {
  await createEmployees(request);
});

test.afterAll(async ({ request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  for (const id of createdEmployeeIds) {
    const r = await apiPost(
      request,
      `/api/employees/${id}/archive`,
      admin.token,
      {}
    );
    if (!r.ok && r.status !== 409) {
      console.error(`cleanup: archiving employee ${id} failed (${r.status})`);
    }
  }
});

test('organization employees table pages at 10 rows with a prev/next pager', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/organization?orgTab=employees');
  await page.getByLabel('Search employees').fill(RUN);

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(PAGE_SIZE, { timeout: 15_000 });
  await expect(rows.first()).toContainText(NAMES[0]);
  await expect(page.getByText('1 of 2', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Previous page' })
  ).toBeDisabled();

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(NAMES[10]);
  await expect(rows.last()).toContainText(NAMES[11]);
  await expect(page.getByText('2 of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();

  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(rows).toHaveCount(PAGE_SIZE);
  await expect(rows.first()).toContainText(NAMES[0]);
});

test('a new organization search starts again from page 1', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/organization?orgTab=employees');
  const searchBox = page.getByLabel('Search employees');
  await searchBox.fill(RUN);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 of 2', { exact: true })).toBeVisible({
    timeout: 15_000
  });

  // A changed search is a new result set; staying on page 2 would hide its
  // first ten matches.
  await searchBox.fill(`${RUN} A`);
  const rows = page.locator('tbody tr');
  await expect(page.getByText('1 of 2', { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(PAGE_SIZE);
  await expect(rows.first()).toContainText(NAMES[0]);
});
