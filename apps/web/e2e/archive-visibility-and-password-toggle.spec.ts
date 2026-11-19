import {
  test,
  expect,
  type APIRequestContext,
  type Page
} from '@playwright/test';
import {
  login,
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiPost,
  listData
} from './helpers';
import { chooseFilter, expectFilterValue } from './filter-controls';

// Two admin-facing regressions:
//
// 1. Archiving a record on /organization used to leave it in the table. Every
//    tab fetches ?includeArchived=true (Restore needs the row), and the Status
//    filter defaulted to "All", so the archived row stayed put with a badge.
//    The default view is now Active; archived rows are one filter away.
//
// 2. The User Management password fields (add user, reset password) had no
//    way to reveal what was typed.

const createdEmployeeIds: string[] = [];

test.afterAll(async ({ request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  for (const id of createdEmployeeIds) {
    // 409 only means the test already left it archived.
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

// API calls go through the standalone `request` fixture, never page.request:
// the latter shares the browser's cookie jar, so an API login there signs the
// page in and /login redirects straight past the form.
async function createEmployee(
  request: APIRequestContext,
  name: string
): Promise<string> {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const branches = listData(
    await apiGet(request, '/api/branches', admin.token)
  );
  const main = branches.find((b) => b.name === 'Main Branch');
  expect(main, 'seeded Main Branch exists').toBeTruthy();
  const created = await apiPost(request, '/api/employees', admin.token, {
    name,
    position: 'E2E archive check',
    branchId: main!.id
  });
  expect(created.ok, `employee created (HTTP ${created.status})`).toBe(true);
  const id = (created.body as { id: string }).id;
  createdEmployeeIds.push(id);
  return id;
}

test('archiving an employee removes it from the default table; Status → Archived lists it for restore', async ({
  page,
  request
}) => {
  const name = `E2E Archive ${Date.now()}`;
  await createEmployee(request, name);

  await login(page, 'admin');
  await page.goto('/organization?orgTab=employees');
  // The roster pages at 10 rows; searching keeps this record on screen in
  // every Status view below.
  await page
    .getByRole('searchbox', { name: 'Search employees', exact: true })
    .fill(name);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expectFilterValue(page, 'Status', 'Active');

  await row.getByRole('button', { name: 'Archive' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(`Archive "${name}"?`);
  await confirm.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(confirm).toBeHidden({ timeout: 15_000 });

  // The bug: the row stayed here, muted, with an Archived badge.
  await expect(row).toHaveCount(0, { timeout: 15_000 });

  await chooseFilter(page, 'Status', 'Archived');
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText('Archived')).toBeVisible();

  await chooseFilter(page, 'Status', 'All');
  await expect(row).toBeVisible();

  await chooseFilter(page, 'Status', 'Archived');
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });

  await chooseFilter(page, 'Status', 'Active');
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText('Archived')).toHaveCount(0);
});

async function expectToggle(page: Page, inputId: string, label: string) {
  const input = page.locator(`#${inputId}`);
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill('Secret-123');

  const show = page.getByRole('button', { name: `Show ${label}`, exact: true });
  await expect(show).toHaveAttribute('aria-controls', inputId);
  await show.click();
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveValue('Secret-123');

  const hide = page.getByRole('button', { name: `Hide ${label}`, exact: true });
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await hide.click();
  await expect(input).toHaveAttribute('type', 'password');
}

test('User Management password fields can be shown and hidden', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const users = listData(await apiGet(request, '/api/users', admin.token));
  const requester = users.find((u) => u.email === CREDENTIALS.requester);
  const self = users.find((u) => u.email === CREDENTIALS.admin);
  expect(requester && self, 'seeded users resolve').toBeTruthy();

  await login(page, 'admin');

  // Set-up password on Add User.
  await page.goto('/user-management/add-user');
  await expectToggle(page, 'signup-password', 'password');

  // Reset another user's password.
  await page.goto(`/user-management/${requester!.id as string}`);
  await expectToggle(page, 'new-password', 'new password');

  // Reset your own password: both fields get their own toggle.
  await page.goto(`/user-management/${self!.id as string}`);
  await expectToggle(page, 'current-password', 'current password');
  await expectToggle(page, 'new-password', 'new password');
});
