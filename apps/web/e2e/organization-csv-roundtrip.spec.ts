import { writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import {
  login,
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiPost,
  listData
} from './helpers';
import { chooseFilter } from './filter-controls';

// Export a scoped CSV through the UI, then feed that exact file back through
// Import → Preview. A clean round trip previews as "0 create · N update ·
// 0 errors".

const RUN = `Rt${Date.now()}`;

// Archive every active record this spec (or an earlier run of it) created.
test.afterAll(async ({ request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  // Offices close before their heads (a head heading an active office is
  // blocked) and branches close last. A second pass retries anything a
  // remaining child still blocked on the first.
  for (const last of [false, true]) {
    for (const resource of [
      'employees',
      'offices',
      'office-heads',
      'branches'
    ]) {
      const rows = listData(
        await apiGet(
          request,
          `/api/${resource}?includeArchived=true`,
          admin.token
        )
      ).filter((r) => !r.archivedAt && /^Rt\d{13} /.test(String(r.name)));
      for (const row of rows) {
        const r = await apiPost(
          request,
          `/api/${resource}/${row.id}/archive`,
          admin.token,
          {}
        );
        if (!r.ok && last)
          console.error(`cleanup ${resource} ${row.id}: ${r.status}`);
      }
    }
  }
});

async function exportThenPreview(page: Page, tab: string): Promise<string[]> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const file = await (await pending).path();
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('CSV file').setInputFiles(file!);
  await dialog.getByRole('button', { name: 'Preview CSV' }).click();
  const summary = dialog.getByText(/\d+ create · \d+ update · \d+ errors/);
  await expect(summary).toBeVisible({ timeout: 15_000 });
  const lines = [
    `${tab}: ${await summary.textContent()}`,
    ...(await dialog.locator('ul li').allTextContents())
  ];
  console.log(lines.join('\n  '));
  return lines;
}

test('active employees with commas, quotes, +63 phones and formula-like text round-trip', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const main = listData(
    await apiGet(request, '/api/branches', admin.token)
  ).find((b) => b.name === 'Main Branch')!;
  for (const body of [
    {
      name: `${RUN} Dela Cruz, "Jun"`,
      position: '=Lead Guide',
      phone: '+639171234567'
    },
    { name: `${RUN} Santos`, position: "'Acting Head", phone: '09171234567' }
  ]) {
    const r = await apiPost(request, '/api/employees', admin.token, {
      ...body,
      branchId: main.id
    });
    expect(r.ok, `create employee (HTTP ${r.status})`).toBe(true);
  }

  await login(page, 'admin');
  await page.goto('/organization?orgTab=employees');
  await page
    .getByRole('searchbox', { name: 'Search employees', exact: true })
    .fill(RUN);
  await expect(page.locator('tbody tr')).toHaveCount(2, { timeout: 15_000 });
  const lines = await exportThenPreview(page, 'employees');
  expect(lines[0]).toContain('0 create · 2 update · 0 errors');
});

test('an archived employee whose branch is also archived round-trips', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const branch = await apiPost(request, '/api/branches', admin.token, {
    name: `${RUN} Closed Branch`,
    location: null
  });
  expect(branch.ok, `create branch (HTTP ${branch.status})`).toBe(true);
  const branchId = (branch.body as { id: string }).id;
  const employee = await apiPost(request, '/api/employees', admin.token, {
    name: `${RUN} Former Guide`,
    position: 'Guide',
    phone: null,
    branchId
  });
  expect(employee.ok, `create employee (HTTP ${employee.status})`).toBe(true);
  const employeeId = (employee.body as { id: string }).id;
  expect(
    (
      await apiPost(
        request,
        `/api/employees/${employeeId}/archive`,
        admin.token,
        {}
      )
    ).ok
  ).toBe(true);
  expect(
    (
      await apiPost(
        request,
        `/api/branches/${branchId}/archive`,
        admin.token,
        {}
      )
    ).ok
  ).toBe(true);

  await login(page, 'admin');
  await page.goto('/organization?orgTab=employees');
  await chooseFilter(page, 'Status', 'Archived');
  await page
    .getByRole('searchbox', { name: 'Search employees', exact: true })
    .fill(`${RUN} Former`);
  await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });
  const lines = await exportThenPreview(page, 'archived employee');
  expect(lines[0]).toContain('0 create · 1 update · 0 errors');
});

test('office heads round-trip', async ({ page, request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const main = listData(
    await apiGet(request, '/api/branches', admin.token)
  ).find((b) => b.name === 'Main Branch')!;
  const r = await apiPost(request, '/api/office-heads', admin.token, {
    name: `${RUN} Head, "Chief"`,
    branchId: main.id,
    officeId: null
  });
  expect(r.ok, `create office head (HTTP ${r.status})`).toBe(true);

  await login(page, 'admin');
  await page.goto('/organization?orgTab=office-heads');
  await page
    .getByRole('searchbox', { name: 'Search office heads', exact: true })
    .fill(RUN);
  await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });
  const lines = await exportThenPreview(page, 'office heads');
  expect(lines[0]).toContain('0 create · 1 update · 0 errors');
});

test('branches round-trip', async ({ page, request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const r = await apiPost(request, '/api/branches', admin.token, {
    name: `${RUN} Branch, "North"`,
    location: '=Davao'
  });
  expect(r.ok, `create branch (HTTP ${r.status})`).toBe(true);

  await login(page, 'admin');
  await page.goto('/organization');
  await page
    .getByRole('searchbox', { name: 'Search branches', exact: true })
    .fill(RUN);
  await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });
  const lines = await exportThenPreview(page, 'branches');
  expect(lines[0]).toContain('0 create · 1 update · 0 errors');
});

test('offices round-trip with their head', async ({ page, request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const main = listData(
    await apiGet(request, '/api/branches', admin.token)
  ).find((b) => b.name === 'Main Branch')!;
  const head = await apiPost(request, '/api/office-heads', admin.token, {
    name: `${RUN} Chief`,
    branchId: main.id,
    officeId: null
  });
  expect(head.ok, `create office head (HTTP ${head.status})`).toBe(true);
  const office = await apiPost(request, '/api/offices', admin.token, {
    name: `${RUN} Records`,
    branchId: main.id,
    headId: (head.body as { id: string }).id
  });
  expect(office.ok, `create office (HTTP ${office.status})`).toBe(true);

  await login(page, 'admin');
  await page.goto('/organization?orgTab=offices');
  await page
    .getByRole('searchbox', { name: 'Search offices', exact: true })
    .fill(RUN);
  await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });
  const lines = await exportThenPreview(page, 'offices');
  expect(lines[0]).toContain('0 create · 1 update · 0 errors');
});

test('confirming a branch import adds the branch to the table', async ({
  page
}, testInfo) => {
  const name = `${RUN} Imported Branch`;
  const file = testInfo.outputPath('branches-import.csv');
  writeFileSync(file, `id,name,location,archived_at\r\n,${name},Tagum,\r\n`);

  await login(page, 'admin');
  await page.goto('/organization');
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('CSV file').setInputFiles(file);
  await dialog.getByRole('button', { name: 'Preview CSV' }).click();
  await expect(dialog.getByText('1 create · 0 update · 0 errors')).toBeVisible({
    timeout: 15_000
  });
  await dialog.getByRole('button', { name: 'Confirm import' }).click();
  await expect(
    page.getByText('Imported 1 new and 0 updated branches')
  ).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toBeHidden();

  await page
    .getByRole('searchbox', { name: 'Search branches', exact: true })
    .fill(name);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('Tagum');
});
