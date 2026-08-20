import { test, type Page } from '@playwright/test';
import { login, apiLogin, apiGet, listData, CREDENTIALS } from './helpers';

// Captures every screen in the app to e2e/screenshots/design/, for handing to a
// designer. Tagged @capture so the normal e2e run skips it — it is a capture
// tool, not an assertion suite.
//
//   pnpm --filter @mms/web capture:screens
//
// Screens are numbered in the order a person would meet them, so the folder
// reads as a walkthrough rather than an alphabetical jumble.

async function snap(page: Page, name: string): Promise<void> {
  // Let data land and any layout settle before the shutter.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `e2e/screenshots/design/${name}.png`,
    fullPage: true
  });
}

async function visit(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await snap(page, name);
}

// Clicks a tab by name, then captures — used for the views hidden behind tabs,
// which a designer would otherwise never see.
async function snapTab(page: Page, tab: string, name: string): Promise<void> {
  await page.getByRole('tab', { name: tab, exact: true }).first().click();
  await snap(page, name);
}

test.describe('@capture design screens', () => {
  // The admin walk alone is thirty-odd screens; the 30s default is nowhere near
  // enough and the page gets torn down mid-capture.
  test.describe.configure({ timeout: 10 * 60 * 1000 });

  // Real record ids, so the detail screens show real content rather than a
  // not-found state.
  let ids: Record<string, string | undefined> = {};

  test.beforeAll(async ({ request }) => {
    const { token } = await apiLogin(request, CREDENTIALS.admin);
    const pick = async (path: string) => {
      const rows = listData(await apiGet(request, path, token));
      return rows[0]?.id as string | undefined;
    };
    ids = {
      trip: await pick('/api/trip-tickets'),
      job: await pick('/api/job-orders'),
      driver: await pick('/api/drivers'),
      vehicle: await pick('/api/vehicles'),
      sparePart: await pick('/api/spare-parts'),
      tool: await pick('/api/tools'),
      maintenance: await pick('/api/maintenance'),
      tracker: await pick('/api/tracker-devices')
    };
  });

  test('public', async ({ page }) => {
    await visit(page, '/login', '00-login');
  });

  test('admin', async ({ page }) => {
    await login(page, 'admin');
    await snap(page, '01-admin-dashboard');

    // --- Trip tickets ---
    await visit(page, '/trip-tickets', '02-trip-tickets-table');
    await snapTab(page, 'Calendar', '03-trip-tickets-calendar');
    // Creating a trip is a stepped dialog now, not a page of its own.
    await visit(page, '/trip-tickets', '02b-trip-tickets-table');
    await page.getByRole('button', { name: 'Create Trip Ticket' }).click();
    await snap(page, '04-trip-ticket-create');
    await page.keyboard.press('Escape');
    if (ids.trip) {
      await visit(page, `/trip-tickets/${ids.trip}`, '05-trip-ticket-detail');
    }

    // --- Job orders ---
    await visit(page, '/job-order', '06-job-orders-table');
    await snapTab(page, 'Calendar', '07-job-orders-calendar');
    // Raising a repair is a stepped dialog now, not a page of its own.
    await visit(page, '/job-order', '07b-job-orders-table');
    await page.getByRole('button', { name: 'Create Job Order' }).click();
    await snap(page, '08-job-order-create');
    await page.keyboard.press('Escape');
    if (ids.job) {
      await visit(page, `/job-order/${ids.job}`, '09-job-order-detail');
    }

    // --- Maintenance (three tabs + two views) ---
    await visit(page, '/maintenance', '10-maintenance-schedule-calendar');
    await snapTab(page, 'Table', '11-maintenance-schedule-table');
    await snapTab(page, 'Preventive', '12-maintenance-preventive');
    await snapTab(page, 'Predictive', '13-maintenance-predictive');
    await visit(page, '/maintenance/add-maintenance', '14-maintenance-create');
    if (ids.maintenance) {
      await visit(
        page,
        `/maintenance/${ids.maintenance}`,
        '15-maintenance-detail'
      );
    }

    // --- Drivers ---
    await visit(page, '/drivers', '16-drivers-list');
    if (ids.driver) {
      await visit(page, `/drivers/${ids.driver}`, '17-driver-detail');
    }

    // --- Vehicles ---
    await visit(page, '/vehicles', '18-vehicles-grid');
    await visit(page, '/vehicles/add-vehicle', '19-vehicle-create');
    if (ids.vehicle) {
      await visit(page, `/vehicles/${ids.vehicle}`, '20-vehicle-detail');
    }

    // --- Spare parts ---
    await visit(page, '/spare-parts', '21-spare-parts-grid');
    await visit(page, '/spare-parts/add-spare-part', '22-spare-part-create');
    if (ids.sparePart) {
      await visit(
        page,
        `/spare-parts/${ids.sparePart}`,
        '23-spare-part-detail'
      );
    }

    // --- Tools ---
    await visit(page, '/tools', '24-tools-grid');
    await visit(page, '/tools/add-tools', '25-tool-create');
    if (ids.tool) {
      await visit(page, `/tools/${ids.tool}`, '26-tool-detail');
    }

    // --- Trackers ---
    await visit(page, '/tracker-devices', '27-trackers-list');
    await visit(page, '/tracker-devices/add-device', '28-tracker-create');
    if (ids.tracker) {
      await visit(page, `/tracker-devices/${ids.tracker}`, '29-tracker-detail');
    }

    // --- Users ---
    await visit(page, '/user-management', '30-user-management-list');
    await visit(page, '/user-management/add-user', '31-user-create');
  });

  // The four roles that see a different home screen than the admin does.
  // One screen, no rail: /trip-tickets is admin-only now, and a requester sent
  // there just bounces back to the screen below.
  test('requester', async ({ page }) => {
    await login(page, 'requester');
    await snap(page, '32-requester-dashboard');
  });

  test('evp', async ({ page }) => {
    await login(page, 'evp');
    await snap(page, '34-evp-approvals');
  });

  test('guard', async ({ page }) => {
    await login(page, 'guard');
    await snap(page, '35-guard-gate');
  });

  test('driver', async ({ page }) => {
    await login(page, 'driver');
    await snap(page, '36-driver-my-trips');
  });

  // The driver and the guard are on a phone, not a desktop. Capture their two
  // screens at phone width too — that is the size they will be redesigned for.
  test('driver on a phone', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }
    });
    const page = await context.newPage();
    await login(page, 'driver');
    await snap(page, '37-driver-my-trips-phone');
    await context.close();
  });

  test('guard on a phone', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }
    });
    const page = await context.newPage();
    await login(page, 'guard');
    await snap(page, '38-guard-gate-phone');
    await context.close();
  });
});
