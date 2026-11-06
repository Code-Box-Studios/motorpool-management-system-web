import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// HTTP response fixtures only: no tracker positions are written to a database.
const v1 = '11111111-1111-4111-8111-111111111111';
const v2 = '22222222-2222-4222-8222-222222222222';
const now = Date.now();
const vehicles = [v1, v2].map((id, i) => ({
  id,
  make: 'Toyota',
  model: 'Hiace',
  year: 2024,
  vin: `ROUTE-${i}`,
  licensePlate: `ROUTE-0${i + 1}`,
  capacity: 12,
  fuelType: 'diesel',
  mileage: 1234,
  status: 'available',
  images: [],
  branchId: null,
  maintenanceStandardId: null,
  insuranceExpiry: new Date(now).toISOString(),
  registrationExpiry: new Date(now).toISOString(),
  createdAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString()
}));
const latest = vehicles.map((v, i) => ({
  id: `latest-${i}`,
  vehicleId: v.id,
  latitude: 1.25 + i,
  longitude: 120.5,
  speed: i ? null : 0,
  heading: i ? null : 0,
  engineStatus: i ? null : 'off',
  createdAt: new Date(now).toISOString(),
  make: v.make,
  model: v.model,
  licensePlate: v.licensePlate,
  status: v.status,
  mileage: v.mileage,
  fuelType: v.fuelType
}));
const routePoints = [45, 44, 5, 4]
  .map((minutes, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    vehicleId: v1,
    tripId: null,
    latitude: 1.1 + index * 0.01,
    longitude: 120.1 + index * 0.01,
    speed: 20,
    heading: 45,
    engineStatus: 'on',
    createdAt: new Date(now - minutes * 60_000).toISOString()
  }))
  .reverse();

async function serveFleet(page: Page) {
  await page.route('**/api/gps/latest', (route) =>
    route.fulfill({ json: { data: latest, count: 2 } })
  );
  await page.route('**/api/vehicles', (route) =>
    route.fulfill({ json: { data: vehicles, count: 2 } })
  );
  await page.route('**/api/tracker-devices?**', (route) =>
    route.fulfill({
      json: {
        data: vehicles.map((v, i) => ({
          id: `tracker-${i}`,
          imei: `route-fixture-${i}`,
          vehicleId: v.id,
          label: `Route tracker ${i}`,
          simNumber: null,
          status: 'active',
          lastSeenAt: new Date(now - 10 * 60_000).toISOString(),
          notes: null,
          createdAt: new Date(now - 24 * 3600_000).toISOString(),
          updatedAt: new Date(now).toISOString()
        })),
        count: 2
      }
    })
  );
}

async function serveHistory(page: Page) {
  await page.route('**/api/gps/history?**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('vehicleId') === v2)
      return route.fulfill({
        json: {
          data: [
            {
              ...routePoints[0],
              id: 'other-point',
              vehicleId: v2,
              latitude: 2.2
            }
          ],
          count: 1,
          nextCursor: null
        }
      });
    const next = url.searchParams.has('cursor');
    return route.fulfill({
      json: {
        data: next ? routePoints.slice(2) : routePoints.slice(0, 2),
        count: 4,
        nextCursor: next ? null : routePoints[1].id
      }
    });
  });
}

test('main view exposes real telemetry without opening a map popup', async ({
  page
}) => {
  await serveFleet(page);
  await login(page, 'admin');
  await page.goto('/gps-map');
  const telemetry = page.getByRole('region', { name: 'Vehicle telemetry' });
  await expect(telemetry).toContainText('ROUTE-01');
  await expect(telemetry).toContainText('1.25000');
  await expect(telemetry).toContainText('120.50000');
  await expect(telemetry).toContainText('0 km/h');
  await expect(telemetry).toContainText('OFF');
  await expect(telemetry).toContainText('Online');
  await expect(telemetry).toContainText('Update age');
  await page.screenshot({
    path: '/tmp/mms-gps-main-live-desktop.png',
    fullPage: true
  });
  await page.locator('button').filter({ hasText: 'ROUTE-02' }).click();
  await expect(telemetry).toContainText('ROUTE-02');
  await expect(telemetry).toContainText('Unknown');
  await expect(telemetry).not.toContainText('0 km/h');
});

test('recorded routes load every cursor page and leave gaps in missing coverage', async ({
  page
}) => {
  await serveFleet(page);
  await serveHistory(page);
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.getByRole('tab', { name: 'Route history' }).click();
  await expect(
    page.getByText('4 recorded positions', { exact: true })
  ).toBeVisible();
  await expect(page.locator('path.gps-route-line')).toHaveCount(2);
  await expect(
    page.getByText('Route start', { exact: true }).first()
  ).toBeVisible();
  await expect(
    page.getByText('Route end', { exact: true }).first()
  ).toBeVisible();
  await page.screenshot({
    path: '/tmp/mms-gps-main-route-desktop.png',
    fullPage: true
  });
  await page.locator('button').filter({ hasText: 'ROUTE-02' }).click();
  await expect(
    page.getByText('1 recorded position', { exact: true })
  ).toBeVisible();
  await expect(page.locator('path.gps-route-line')).toHaveCount(0);
});

test('a failed route request offers retry rather than claiming there is no history', async ({
  page
}) => {
  await serveFleet(page);
  await page.route('**/api/gps/history?**', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } })
  );
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.getByRole('tab', { name: 'Route history' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Route history could not be loaded'
  );
  await expect(page.getByText('No GPS reports in this period')).toHaveCount(0);
  await page.unroute('**/api/gps/history?**');
  await page.route('**/api/gps/history?**', (route) =>
    route.fulfill({ json: { data: [], count: 0, nextCursor: null } })
  );
  await page.getByRole('button', { name: 'Retry route' }).click();
  await expect(page.getByText('No GPS reports in this period')).toBeVisible();
});

test('custom route dates reject reversed and oversized windows', async ({
  page
}) => {
  await serveFleet(page);
  await serveHistory(page);
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.getByRole('tab', { name: 'Route history' }).click();
  await page.getByLabel('From', { exact: true }).fill('2026-11-06T12:00');
  await page.getByLabel('To', { exact: true }).fill('2026-11-06T11:00');
  await page.getByRole('button', { name: 'Load route', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'End time must be after start time'
  );
  await page.getByLabel('From', { exact: true }).fill('2026-11-01T12:00');
  await page.getByRole('button', { name: 'Load route', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('24 hours or less');
});

test('route controls and telemetry fit a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await serveFleet(page);
  await serveHistory(page);
  await login(page, 'admin');
  await page.goto('/gps-map');
  await expect(
    page.getByRole('region', { name: 'Vehicle telemetry' })
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Route history' }).click();
  await expect(
    page.getByText('4 recorded positions', { exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: '/tmp/mms-gps-main-route-mobile.png',
    fullPage: true
  });
});

test('isolated recorded fixes remain visible between missing intervals', async ({
  page
}) => {
  await serveFleet(page);
  await page.route('**/api/gps/history?**', (route) =>
    route.fulfill({
      json: {
        data: [
          routePoints[0],
          {
            ...routePoints[1],
            createdAt: new Date(now - 20 * 60_000).toISOString()
          },
          routePoints[3]
        ],
        count: 3,
        nextCursor: null
      }
    })
  );
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.getByRole('tab', { name: 'Route history' }).click();
  await expect(
    page.getByText('3 recorded positions', { exact: true })
  ).toBeVisible();
  await expect(page.locator('path.gps-route-line')).toHaveCount(0);
  await expect(page.locator('path.gps-route-isolated')).toHaveCount(3);
});

test('an incomplete route fails visibly instead of silently showing a partial trail', async ({
  page
}) => {
  await serveFleet(page);
  await page.route('**/api/gps/history?**', (route) =>
    route.fulfill({
      json: {
        data: routePoints.slice(0, 2),
        count: 4,
        nextCursor: null
      }
    })
  );
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.getByRole('tab', { name: 'Route history' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'could not be loaded completely'
  );
  await expect(
    page.getByText('2 recorded positions', { exact: true })
  ).toHaveCount(0);
});

test('switching vehicles while history is loading never reuses the previous route', async ({
  page
}) => {
  await serveFleet(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/gps/history?**', async (route) => {
    const vehicleId = new URL(route.request().url()).searchParams.get(
      'vehicleId'
    );
    if (vehicleId === v1) await gate;
    try {
      await route.fulfill({
        json: {
          data:
            vehicleId === v1
              ? routePoints
              : [{ ...routePoints[0], vehicleId: v2 }],
          count: vehicleId === v1 ? 4 : 1,
          nextCursor: null
        }
      });
    } finally {
      if (vehicleId === v1) finish();
    }
  });
  await login(page, 'admin');
  await page.goto('/gps-map');
  const started = page.waitForRequest('**/api/gps/history?**');
  await page.getByRole('tab', { name: 'Route history' }).click();
  await started;
  await expect(
    page.getByRole('status').filter({ hasText: 'Loading route history' })
  ).toBeVisible();
  await page.locator('button').filter({ hasText: 'ROUTE-02' }).click();
  await expect(
    page.getByText('1 recorded position', { exact: true })
  ).toBeVisible();
  release();
  await finished;
  await expect(
    page.getByText('4 recorded positions', { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Vehicle telemetry' })
  ).toContainText('ROUTE-02');
});

test('fullscreen keeps live and recorded map controls usable', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await serveFleet(page);
  await serveHistory(page);
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await expect(
    page.getByRole('region', { name: 'Vehicle telemetry' })
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Route history' }).click();
  await expect(page.locator('path.gps-route-line')).toHaveCount(2);
  await page.getByRole('button', { name: 'Fit route' }).click();
  await page
    .getByRole('button', { name: 'Exit fullscreen', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
});
