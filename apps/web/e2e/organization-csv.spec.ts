import { test, expect } from '@playwright/test';
import { login } from './helpers';

// These checks read the development roster and download files; no imports are confirmed.
test('organization CSV downloads and dialog dismissal preserve focus on desktop and mobile', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/organization');
  await page.getByRole('tab', { name: 'Employees', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Import CSV', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Import employees CSV' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  let template = '';
  for (const name of ['Download template', 'Export CSV']) {
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(/employees.*\.csv$/);
    const stream = await download.createReadStream();
    let text = '';
    for await (const chunk of stream!) text += chunk.toString();
    expect(text).toContain(
      'id,name,position,phone,branch_id,branch_name,archived_at'
    );
    if (name === 'Download template') template = text;
  }
  await trigger.click();
  await dialog.getByLabel('CSV file').setInputFiles({
    name: 'employees.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(template)
  });
  await dialog
    .getByRole('button', { name: 'Preview CSV', exact: true })
    .click();
  await expect(
    dialog.getByText('1 create · 0 update · 0 errors')
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Confirm import', exact: true })
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await trigger.click();
  await dialog.getByLabel('CSV file').setInputFiles({
    name: 'invalid.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('wrong,headers\ninvalid,row')
  });
  await dialog
    .getByRole('button', { name: 'Preview CSV', exact: true })
    .click();
  await expect(dialog.getByText(/Row 1: Expected headers/)).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Confirm import', exact: true })
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole('tab', { name: 'Office Heads', exact: true }).click();
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const headsDialog = page.getByRole('dialog', {
    name: 'Import office heads CSV'
  });
  await expect(headsDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(headsDialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Import CSV', exact: true })
  ).toBeFocused();
  for (const name of ['Download template', 'Export CSV']) {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const download = await event;
    expect(download.suggestedFilename()).toMatch(/office-heads.*\.csv$/);
    const stream = await download.createReadStream();
    let text = '';
    for await (const chunk of stream!) text += chunk.toString();
    expect(text).toContain(
      'id,name,branch_id,branch_name,office_id,office_name,archived_at'
    );
  }
});

test('CSV export includes every filtered record beyond a normal list page', async ({
  page
}) => {
  await login(page, 'admin');
  await page.route(/\/api\/employees(?:\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const records = Array.from({ length: 205 }, (_, index) => ({
      id: `fixture-${index}`,
      name: `CSV Fixture ${index}`,
      archivedAt: null,
      branchId: null,
      position: 'Test',
      phone: '+63912'
    }));
    await route.fulfill({ json: { data: records, count: 205 } });
  });
  await page.goto('/organization');
  await page.getByRole('tab', { name: 'Employees', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'CSV Fixture 204', exact: true })
  ).toBeVisible();
  for (const [search, expectedRows] of [
    ['', 205],
    ['CSV Fixture 204', 1]
  ] as const) {
    await page
      .getByRole('searchbox', { name: 'Search employees', exact: true })
      .fill(search);
    await page
      .getByRole('searchbox', { name: 'Search employees', exact: true })
      .press('Enter');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const download = await pending;
    const stream = await download.createReadStream();
    let text = '';
    for await (const chunk of stream!) text += chunk.toString();
    expect(text.trim().split('\r\n')).toHaveLength(expectedRows + 1);
    expect(text).toContain('CSV Fixture 204');
    expect(text).toContain("'+63912");
  }
});

for (const outcome of ['success', 'validation-error'] as const) {
  test(`a delayed ${outcome} import cannot change a reopened CSV dialog`, async ({
    page
  }) => {
    await login(page, 'admin');
    let releaseImport!: () => void;
    const importGate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    let releaseReview!: () => void;
    const reviewGate = new Promise<void>((resolve) => {
      releaseReview = resolve;
    });
    let previewCalls = 0;
    let employeeReads = 0;
    await page.route(/\/api\/employees(?:\?|$)/, async (route) => {
      employeeReads++;
      await route.fulfill({ json: { data: [], count: 0 } });
    });
    const preview = (name: string) => ({
      created: 1,
      updated: 0,
      total: 1,
      errors: [],
      previewToken: name,
      records: [{ row: 2, action: 'create', name }]
    });
    await page.route('**/api/employees/import/preview', async (route) => {
      previewCalls++;
      if (previewCalls === 3) await reviewGate;
      await route.fulfill({
        json: preview(previewCalls === 1 ? 'First Person' : 'Second Person')
      });
    });
    await page.route('**/api/employees/import', async (route) => {
      await importGate;
      if (outcome === 'success')
        await route.fulfill({ json: preview('First Person') });
      else
        await route.fulfill({
          status: 400,
          json: {
            error: {
              code: 'CSV_VALIDATION_ERROR',
              message: 'Old import failed',
              details: {
                ...preview('Old Error Person'),
                errors: [{ row: 2, message: 'Old row error' }]
              }
            }
          }
        });
    });
    await page.goto('/organization');
    await page.getByRole('tab', { name: 'Employees', exact: true }).click();
    const trigger = page.getByRole('button', {
      name: 'Import CSV',
      exact: true
    });
    const dialog = page.getByRole('dialog', { name: 'Import employees CSV' });
    const uploadAndReview = async (name: string) => {
      await dialog
        .getByLabel('CSV file')
        .setInputFiles({
          name: 'employees.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(
            `id,name,position,phone,branch_id,branch_name,archived_at\n,${name},,,,,`
          )
        });
      await dialog
        .getByRole('button', { name: 'Preview CSV', exact: true })
        .click();
      await expect(
        dialog.getByRole('cell', { name, exact: true })
      ).toBeVisible();
    };
    await trigger.click();
    await uploadAndReview('First Person');
    const firstRequest = page.waitForRequest('**/api/employees/import');
    await dialog
      .getByRole('button', { name: 'Confirm import', exact: true })
      .click();
    await firstRequest;
    await page.keyboard.press('Escape');
    await trigger.click();
    await uploadAndReview('Second Person');
    // A new preview remains pending while the old confirmation settles.
    await dialog
      .getByRole('button', { name: 'Preview CSV', exact: true })
      .click();
    const readsBeforeSettlement = employeeReads;
    const oldResponse = page.waitForResponse('**/api/employees/import');
    releaseImport();
    await (await oldResponse).finished();
    if (outcome === 'success') {
      await expect
        .poll(() => employeeReads)
        .toBeGreaterThan(readsBeforeSettlement);
      await expect(
        page.getByText('Imported 1 new and 0 updated employees', {
          exact: true
        })
      ).toBeVisible();
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Working...', exact: true })
    ).toBeDisabled();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(
      dialog.getByRole('cell', { name: 'Old Error Person', exact: true })
    ).toHaveCount(0);
    releaseReview();
    await expect(
      dialog.getByRole('cell', { name: 'Second Person', exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Confirm import', exact: true })
    ).toBeEnabled();
  });
}
