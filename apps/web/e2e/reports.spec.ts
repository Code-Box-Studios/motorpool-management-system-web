import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import type { ReportResult } from '@mms/shared';
import { login } from './helpers';
const fuelFixture: ReportResult = {
  type: 'fuel',
  title: 'GPS-based fuel requirement report',
  generatedAt: '2026-10-25T04:00:00Z',
  filters: {
    from: null,
    to: null,
    branch: null,
    vehicle: 'UM-001 · Toyota Hiace',
    status: null
  },
  columns: [
    { key: 'reference', label: 'Trip ticket' },
    { key: 'distance', label: 'GPS distance (km)' },
    { key: 'fuel', label: 'Fuel allocated (L)' }
  ],
  rows: [
    { reference: 'TT-0001', distance: 100, fuel: 15 },
    { reference: 'TT-0002', distance: 120, fuel: 18 },
    { reference: 'TT-0003', distance: 80, fuel: 12 }
  ],
  summary: [
    { label: 'Eligible completed trips', value: 3 },
    { label: 'Total GPS distance', value: 300, unit: 'km' },
    { label: 'Total fuel allocated', value: 45, unit: 'L' },
    { label: 'Historical allocation rate', value: 0.15, unit: 'L/km' }
  ],
  notes: ['Allocation estimate, not measured consumption.'],
  fuel: {
    vehicle: 'UM-001 · Toyota Hiace',
    totalLiters: 45,
    totalDistanceKm: 300,
    rate: 0.15,
    plannedDistanceKm: 40,
    proposedLiters: 10,
    estimate: {
      rate: 0.15,
      estimatedLiters: 6,
      proposedLiters: 10,
      difference: 4
    },
    selectedTrip: {
      reference: 'TT-0015',
      origin: 'UM Matina',
      destination: 'Tagum <script>bad()</script>',
      purpose: 'Field visit'
    },
    excluded: [
      { reference: 'TT-0004', reason: 'Insufficient valid GPS samples' }
    ]
  }
};
async function chooseReport(
  page: import('@playwright/test').Page,
  label: string
) {
  await page.getByRole('combobox', { name: 'Report', exact: true }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
test('report API-backed tables generate all five report types without page overflow', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/reports');
  await page.getByRole('button', { name: 'Use all dates' }).click();
  for (const label of [
    'Summary of trips',
    'Maintenance report',
    'Preventive maintenance report',
    'Job order summary',
    'Odometer report'
  ]) {
    await chooseReport(page, label);
    await page
      .getByRole('button', { name: 'Generate report', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'Generated report' })
    ).toBeVisible();
    await expect(
      page.getByRole('table', { name: label, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'CSV', exact: true })
    ).toBeEnabled();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  const response = await page.request.get(
    'http://localhost:3001/api/reports?type=trips'
  );
  // Browser requests without an Authorization bearer cannot read reports.
  expect(response.status()).toBe(401);
});
test('fuel image calculations, CSV, genuine Excel and clean printable output share one dataset', async ({
  page,
  context
}) => {
  await login(page, 'admin');
  await page.route('**/api/reports?**', (route) =>
    route.fulfill({ json: fuelFixture })
  );
  await page.goto('/reports');
  await chooseReport(page, 'GPS-based fuel requirement report');
  await page.getByRole('combobox', { name: 'Vehicle *', exact: true }).click();
  await page.getByRole('option').nth(1).click();
  await page.getByLabel('Planned route distance (km)').fill('40');
  await page.getByLabel('Proposed fuel allocation (L)').fill('10');
  await page
    .getByRole('button', { name: 'Generate report', exact: true })
    .click();
  await expect(
    page.getByText('4 L above estimate', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('6 L', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Excluded fuel history' })
  ).toContainText('Insufficient valid GPS samples');
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const csv = await csvDownload;
  const csvText = await readFile((await csv.path())!, 'utf8');
  expect(csvText).toContain('TT-0003');
  expect(csvText).toContain('Estimated requirement (L),6');
  expect(csvText).toContain('TT-0004');
  const excelDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel', exact: true }).click();
  const excel = await excelDownload;
  expect(excel.suggestedFilename()).toMatch(/\.xlsx$/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await excel.path())!);
  expect(workbook.getWorksheet('Records')!.rowCount).toBe(4);
  expect(workbook.getWorksheet('Records')!.getCell('B4').value).toBe(80);
  expect(
    workbook.getWorksheet('Report details')!.getSheetValues().flat()
  ).toContain(6);
  expect(workbook.getWorksheet('Excluded history')!.getCell('A2').value).toBe(
    'TT-0004'
  );
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(
    popup.getByRole('heading', { name: 'GPS-based fuel requirement report' })
  ).toBeVisible();
  await expect(popup.locator('body')).toContainText(
    'Tagum <script>bad()</script>'
  );
  expect(await popup.locator('script').count()).toBe(0);
  await popup.close();
  await page.getByLabel('Planned route distance (km)').fill('50');
  await expect(
    page.getByRole('button', { name: 'CSV', exact: true })
  ).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Filters changed');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: '/tmp/mms-fuel-report-mobile.png',
    fullPage: true
  });
});
test('missing fuel history shows no invented estimate and calendar Escape restores focus', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/reports');
  const from = page.getByRole('button', {
    name: 'Report from date',
    exact: true
  });
  await from.click();
  await page.keyboard.press('Escape');
  await expect(from).toBeFocused();
  await page.route('**/api/reports?**', (route) =>
    route.fulfill({
      json: {
        ...fuelFixture,
        rows: [],
        summary: [],
        fuel: {
          ...fuelFixture.fuel,
          totalLiters: 0,
          totalDistanceKm: 0,
          rate: null,
          estimate: null,
          excluded: []
        }
      }
    })
  );
  await chooseReport(page, 'GPS-based fuel requirement report');
  await page.getByRole('combobox', { name: 'Vehicle *', exact: true }).click();
  await page.getByRole('option').nth(1).click();
  await page
    .getByRole('button', { name: 'Generate report', exact: true })
    .click();
  await expect(
    page.getByText(
      'No eligible historical fuel/GPS data. An estimate cannot be calculated.'
    )
  ).toBeVisible();
});

test('repair completion prefills current metadata and sends explicit null when it is cleared', async ({
  page,
  request
}) => {
  const { apiLogin, apiGet, listData, CREDENTIALS } = await import('./helpers');
  const actor = await apiLogin(request, CREDENTIALS.admin);
  const vehicles = listData(
    await apiGet(request, '/api/vehicles', actor.token)
  );
  const vehicle = vehicles[0]!;
  const id = '99999999-9999-4999-8999-999999999999';
  const order = {
    id,
    orderNo: 9090,
    vehicleId: vehicle.id,
    branchId: vehicle.branchId,
    status: 'ongoing_repair',
    incidentDate: '2026-10-20T00:00:00Z',
    incidentDetails: 'Metadata regression',
    remarks: 'Keep this note',
    maintenanceType: 'preventive',
    serviceLocation: 'outside',
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z'
  };
  let payload: Record<string, unknown> | undefined;
  await page.route(`**/api/job-orders/${id}`, (route) =>
    route.fulfill({ json: order })
  );
  await page.route(`**/api/job-orders/${id}/complete-repair`, async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      json: {
        ...order,
        status: 'repaired',
        maintenanceType: null,
        serviceLocation: null
      }
    });
  });
  await login(page, 'admin');
  await page.goto(`/job-order/${id}`);
  await page
    .getByRole('button', { name: 'Mark as Repaired', exact: true })
    .click();
  const dialog = page.getByRole('alertdialog', { name: 'Complete Repair' });
  await expect(
    dialog.getByRole('combobox', { name: 'Maintenance type', exact: true })
  ).toContainText('Preventive');
  await expect(
    dialog.getByRole('combobox', { name: 'Service location', exact: true })
  ).toContainText('Done outside');
  for (const name of ['Maintenance type', 'Service location']) {
    await dialog.getByRole('combobox', { name, exact: true }).click();
    await page
      .getByRole('option', { name: 'Not recorded', exact: true })
      .click();
  }
  await dialog.getByRole('combobox').filter({ hasText: 'Select type' }).click();
  await page.getByRole('option', { name: 'Simple', exact: true }).click();
  await dialog
    .getByLabel('Odometer at completion *')
    .fill(String(vehicle.mileage ?? 0));
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect
    .poll(() => payload)
    .toMatchObject({ maintenanceType: null, serviceLocation: null });
});
