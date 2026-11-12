import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

test.use({ locale: 'en-US', timezoneId: 'Asia/Manila' });

const VEHICLE = '71000000-0000-4000-8000-000000000001';
const BRANCH_A = '71000000-0000-4000-8000-000000000002';
const BRANCH_B = '71000000-0000-4000-8000-000000000003';
const OFFICE_A = '71000000-0000-4000-8000-000000000004';
const OFFICE_B = '71000000-0000-4000-8000-000000000005';
const now = '2026-11-12T01:00:00.000Z';
const vehicle = {
  id: VEHICLE,
  make: 'Deadline',
  model: 'Fixture Van',
  year: 2024,
  vin: 'DEADLINEFIXTURE',
  licensePlate: 'DEADLINE-ONLY',
  capacity: 10,
  fuelType: 'diesel',
  mileage: 25000,
  status: 'available',
  images: [],
  branchId: BRANCH_A,
  maintenanceStandardId: null,
  insuranceExpiry: '2030-01-01',
  registrationExpiry: '2030-01-01',
  createdAt: now,
  updatedAt: now
};
const prediction = {
  vehicleId: VEHICLE,
  make: vehicle.make,
  model: vehicle.model,
  licensePlate: vehicle.licensePlate,
  mileage: vehicle.mileage,
  kmSinceLastMaint: 10000,
  avgDailyKm: 40,
  maintFreq12m: 1,
  riskScore: 90,
  priority: 'high',
  usedFallback: false,
  scoringMethod: 'random_forest',
  lastMaintenanceDate: '2026-10-01',
  lastMaintenanceMileage: 15000,
  nextMaintenanceDueMileage: 20000,
  nextMaintenanceDueDate: null,
  preventiveStatus: 'overdue',
  preventiveSource: 'service_history'
};

// Only authentication reaches the running API. Business reads and writes are
// controlled so these regression cases never modify fleet records.
async function fixtures(
  page: Page,
  options: {
    row?: () => Record<string, unknown>;
    unavailable?: () => boolean;
    onSave?: (body: Record<string, unknown>) => void;
  } = {}
) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p.startsWith('/api/auth/')) return route.continue();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      if (p === '/api/office-heads' && options.onSave) {
        const body = req.postDataJSON();
        options.onSave(body);
        return route.fulfill({
          status: 201,
          json: { id: OFFICE_A, archivedAt: null, ...body }
        });
      }
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'FIXTURE_ONLY',
            message: 'Unexpected business write blocked'
          }
        }
      });
    }
    const send = (json: unknown) => route.fulfill({ json });
    const row = { ...prediction, ...options.row?.() };
    if (p === '/api/analytics/predictive-maintenance') {
      return options.unavailable?.()
        ? route.fulfill({
            status: 503,
            json: {
              error: {
                code: 'UNAVAILABLE',
                message: 'Fixture maintenance unavailable'
              }
            }
          })
        : send({ data: [row], count: 1 });
    }
    if (p === `/api/vehicles/${VEHICLE}`)
      return send({ ...vehicle, mileage: row.mileage });
    if (p === '/api/vehicles')
      return send({ data: [{ ...vehicle, mileage: row.mileage }], count: 1 });
    if (p === '/api/branches')
      return send({
        data: [
          {
            id: BRANCH_A,
            name: 'Deadline Branch A',
            location: null,
            archivedAt: null
          },
          {
            id: BRANCH_B,
            name: 'Deadline Branch B',
            location: null,
            archivedAt: null
          }
        ],
        count: 2
      });
    if (p === '/api/offices')
      return send({
        data: [
          {
            id: OFFICE_A,
            name: 'Deadline Office A',
            branchId: BRANCH_A,
            archivedAt: null
          },
          {
            id: OFFICE_B,
            name: 'Deadline Office B',
            branchId: BRANCH_B,
            archivedAt: null
          }
        ],
        count: 2
      });
    if (p === '/api/office-heads' || p === '/api/employees')
      return send({ data: [], count: 0 });
    if (p === '/api/notifications') return send({ data: [], unread: 0 });
    return route.continue();
  });
}

const preventiveCard = (page: Page) =>
  page.locator('[data-slot="card"]').filter({
    has: page.getByText('Next Service At', { exact: true })
  });

test('driving one kilometre preserves the recorded overdue deadline and service date', async ({
  page
}) => {
  let mileage = 25000;
  await fixtures(page, { row: () => ({ mileage }) });
  await login(page, 'admin');
  await page.goto(`/vehicles/${VEHICLE}`);
  const card = preventiveCard(page);
  for (const value of [25000, 25001]) {
    mileage = value;
    await page.reload();
    await expect(card.getByText('Overdue', { exact: true })).toBeVisible();
    await expect(card.getByText('20,000 km', { exact: true })).toBeVisible();
    await expect(card.getByText('10/1/2026', { exact: true })).toBeVisible();
    await expect(card.getByText('100%', { exact: true })).toBeVisible();
  }
});

test('missing service data remains Unknown with no invented deadline or progress', async ({
  page
}) => {
  await fixtures(page, {
    row: () => ({
      lastMaintenanceDate: null,
      lastMaintenanceMileage: null,
      nextMaintenanceDueMileage: null,
      preventiveStatus: 'unknown',
      preventiveSource: 'unknown'
    })
  });
  await login(page, 'admin');
  await page.goto(`/vehicles/${VEHICLE}`);
  const card = preventiveCard(page);
  await expect(card.getByText('Unknown', { exact: true })).toBeVisible();
  await expect(card.getByText('Not set', { exact: true })).toBeVisible();
  await expect(card.getByText('No records', { exact: true })).toBeVisible();
  await expect(card.getByText('Mileage progress', { exact: true })).toHaveCount(
    0
  );
  await page.goto('/maintenance?tab=preventive');
  const region = page.getByRole('region', {
    name: 'Preventive vehicles',
    exact: true
  });
  await expect(region.getByText('Unknown', { exact: true })).toBeVisible();
  await expect(region.getByRole('status')).toContainText(
    'need service history or a maintenance deadline'
  );
});

test('configured preventive deadlines are independent of high predictive risk', async ({
  page
}) => {
  await fixtures(page, {
    row: () => ({
      nextMaintenanceDueMileage: 27000,
      preventiveStatus: 'on_schedule',
      preventiveSource: 'configured_schedule'
    })
  });
  await login(page, 'admin');
  await page.goto(`/vehicles/${VEHICLE}`);
  const card = preventiveCard(page);
  await expect(card.getByText('On Schedule', { exact: true })).toBeVisible();
  await expect(card.getByText('27,000 km', { exact: true })).toBeVisible();
  await expect(page.getByText('High Risk', { exact: true })).toBeVisible();
  await expect(card.getByText('Mileage progress', { exact: true })).toHaveCount(
    0
  );
});

test('date-only maintenance deadlines render honestly on a narrow dark screen', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await fixtures(page, {
    row: () => ({
      nextMaintenanceDueMileage: null,
      nextMaintenanceDueDate: '2020-01-01',
      preventiveStatus: 'overdue',
      preventiveSource: 'configured_schedule'
    })
  });
  await login(page, 'admin');
  await page.goto(`/vehicles/${VEHICLE}`);
  const card = preventiveCard(page);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(card.getByText('Overdue', { exact: true })).toBeVisible();
  await expect(card.getByText('Not set', { exact: true })).toBeVisible();
  await expect(card.getByText('1/1/2020', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('maintenance-date-only-mobile.png'),
    fullPage: true
  });
});

test('maintenance fetch errors show a retry instead of an empty healthy state', async ({
  page
}) => {
  let fail = true;
  await fixtures(page, { unavailable: () => fail });
  await login(page, 'admin');
  await page.goto('/maintenance?tab=preventive');
  const region = page.getByRole('region', {
    name: 'Preventive vehicles',
    exact: true
  });
  await expect(region.getByRole('alert')).toContainText(
    'Fixture maintenance unavailable',
    { timeout: 15000 }
  );
  await expect(
    region.getByText('No vehicles currently due for preventive maintenance.')
  ).toHaveCount(0);
  fail = false;
  await region.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(region.getByText('Overdue', { exact: true })).toBeVisible();
});

test('office-head branch selection limits offices and clears an incompatible choice', async ({
  page
}) => {
  let saved: Record<string, unknown> | undefined;
  await fixtures(page, {
    onSave: (body) => {
      saved = body;
    }
  });
  await login(page, 'admin');
  await page.goto('/organization');
  await page.getByRole('tab', { name: 'Office Heads', exact: true }).click();
  await page
    .getByRole('button', { name: 'Add Office Head', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name *', { exact: true }).fill('Deadline Head');
  await dialog.getByRole('combobox', { name: 'Branch', exact: true }).click();
  await page
    .getByRole('option', { name: 'Deadline Branch A', exact: true })
    .click();
  await dialog.getByRole('combobox', { name: 'Office', exact: true }).click();
  await expect(
    page.getByRole('option', { name: 'Deadline Office B', exact: true })
  ).toHaveCount(0);
  await page
    .getByRole('option', { name: 'Deadline Office A', exact: true })
    .click();
  await dialog.getByRole('combobox', { name: 'Branch', exact: true }).click();
  await page
    .getByRole('option', { name: 'Deadline Branch B', exact: true })
    .click();
  await expect(
    dialog.getByRole('combobox', { name: 'Office', exact: true })
  ).toContainText('None');
  await dialog.getByRole('combobox', { name: 'Office', exact: true }).click();
  await expect(
    page.getByRole('option', { name: 'Deadline Office A', exact: true })
  ).toHaveCount(0);
  await page
    .getByRole('option', { name: 'Deadline Office B', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Add Office Head', exact: true })
    .click();
  await expect
    .poll(() => saved)
    .toEqual({ name: 'Deadline Head', branchId: BRANCH_B, officeId: OFFICE_B });
  await expect(dialog).toBeHidden();
});

test.describe('date-only deadlines in a western browser timezone', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('preserves recorded service and due calendar dates', async ({
    page
  }) => {
    await fixtures(page, {
      row: () => ({ nextMaintenanceDueDate: '2020-01-01' })
    });
    await login(page, 'admin');
    await page.goto(`/vehicles/${VEHICLE}`);
    const card = preventiveCard(page);
    await expect(card.getByText('10/1/2026', { exact: true })).toBeVisible();
    await expect(card.getByText('1/1/2020', { exact: true })).toBeVisible();
  });
});
