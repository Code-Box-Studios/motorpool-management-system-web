import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Browser response fixtures only. These never write tracker or GPS data.
const now = new Date().toISOString();
const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const vehicles = ['FLEET-01', 'FLEET-02', 'FLEET-03'].map((plate, i) => ({
  id: `fleet-${i}`,
  make: 'Toyota',
  model: 'Hiace',
  year: 2024,
  vin: `fixture-${i}`,
  licensePlate: plate,
  capacity: 12,
  fuelType: 'diesel',
  mileage: 12345,
  status: 'available',
  images: [],
  branchId: null,
  maintenanceStandardId: null,
  insuranceExpiry: now,
  registrationExpiry: now,
  createdAt: old,
  updatedAt: now
}));
const points = vehicles.slice(0, 2).map((v, i) => ({
  id: `point-${i}`,
  vehicleId: v.id,
  latitude: 7.45 + i * 0.1,
  longitude: 125.81 + i * 0.1,
  speed: i ? 43 : 0,
  heading: 0,
  engineStatus: i ? null : 'off',
  createdAt: i ? old : now,
  make: v.make,
  model: v.model,
  licensePlate: v.licensePlate,
  status: v.status,
  mileage: v.mileage,
  fuelType: v.fuelType
}));
const trackers = vehicles.map((v, i) => ({
  id: `tracker-${i}`,
  imei: `fixture-${i}`,
  vehicleId: v.id,
  label: `Tracker ${i}`,
  simNumber: null,
  status: 'active',
  lastSeenAt: i === 1 ? old : now,
  notes: null,
  createdAt: old,
  updatedAt: now
}));

async function serveFleet(
  page: Page,
  options: {
    noPoints?: boolean;
    gpsError?: boolean;
    trackerError?: boolean;
  } = {}
) {
  await page.route('**/api/gps/latest', (route) =>
    route.fulfill({
      status: options.gpsError ? 503 : 200,
      json: options.gpsError
        ? { message: 'Unavailable' }
        : {
            data: options.noPoints ? [] : points,
            count: options.noPoints ? 0 : 2
          }
    })
  );
  await page.route('**/api/tracker-devices?**', (route) =>
    route.fulfill({
      status: options.trackerError ? 503 : 200,
      json: options.trackerError
        ? { message: 'Unavailable' }
        : { data: trackers, count: 3 }
    })
  );
  await page.route('**/api/vehicles', (route) =>
    route.fulfill({ json: { data: vehicles, count: 3 } })
  );
}

test('fleet overview separates fresh positions from offline and waiting trackers', async ({
  page
}) => {
  await serveFleet(page);
  await login(page, 'admin');
  const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
  await expect(
    panel.locator('button').filter({ hasText: /FLEET-01/ })
  ).toContainText('Stopped');
  await expect(
    panel.locator('button').filter({ hasText: /FLEET-02/ })
  ).toContainText('Offline');
  await expect(
    panel.locator('button').filter({ hasText: /FLEET-03/ })
  ).toContainText('No location');
  await panel.getByRole('button', { name: /Needs attention/ }).click();
  await expect(
    panel.locator('button').filter({ hasText: /FLEET-01/ })
  ).toHaveCount(0);
  await expect(
    panel.locator('button').filter({ hasText: /FLEET-02/ })
  ).toBeVisible();
  await expect(
    panel.locator('button').filter({ hasText: /FLEET-03/ })
  ).toBeVisible();
});

test('selection shows measured zeros and labels old speed as historical', async ({
  page
}) => {
  await serveFleet(page);
  await login(page, 'admin');
  const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
  await panel
    .locator('button')
    .filter({ hasText: /FLEET-01/ })
    .click();
  const detail = panel.getByRole('region', { name: 'Selected vehicle' });
  await expect(detail).toContainText('0 km/h');
  await expect(detail).toContainText('OFF');
  await expect(detail).toContainText('0°');
  await panel
    .locator('button')
    .filter({ hasText: /FLEET-02/ })
    .click();
  await expect(detail).toContainText('Last reported speed');
  await expect(detail).toContainText('43 km/h');
  await expect(detail).toContainText('Unknown');
  await expect(detail).toContainText('Last known position');
});

test('markers select a vehicle and fit fleet restores the overview', async ({
  page
}) => {
  await serveFleet(page);
  await login(page, 'admin');
  const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
  await panel.locator('.custom-vehicle-marker').first().click();
  await expect(
    panel.locator('button').filter({ hasText: /FLEET-01/ })
  ).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Fit fleet' }).click();
  await expect(
    panel.locator('button').filter({ hasText: /FLEET-01/ })
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(
    panel.getByRole('link', { name: 'Open GPS map' })
  ).toHaveAttribute('href', '/gps-map');
});

test('a tracker without a fix remains visible without invented telemetry', async ({
  page
}) => {
  await serveFleet(page, { noPoints: true });
  await login(page, 'admin');
  const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
  await panel
    .locator('button')
    .filter({ hasText: /FLEET-03/ })
    .click();
  const detail = panel.getByRole('region', { name: 'Selected vehicle' });
  await expect(detail).toContainText('No location received');
  await expect(
    detail.getByRole('button', { name: 'Locate vehicle' })
  ).toBeDisabled();
  await expect(panel.locator('.custom-vehicle-marker')).toHaveCount(0);
});

test('GPS failure does not hide dashboard metrics or claim an empty fleet', async ({
  page
}) => {
  await serveFleet(page, { gpsError: true });
  await login(page, 'admin');
  await expect(
    page.getByText('Available Vehicles', { exact: true })
  ).toBeVisible();
  const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
  await expect(panel.getByRole('alert')).toContainText(
    'GPS positions could not be updated',
    { timeout: 15000 }
  );
  await expect(panel.getByText('No active trackers')).toHaveCount(0);
  await expect(
    panel.getByRole('alert').getByRole('button', { name: 'Retry tracking' })
  ).toBeVisible();
  await expect(panel.getByText('Waiting for a GPS fix')).toHaveCount(0, {
    timeout: 0
  });
});

test('tracker failure shows unknown connectivity instead of offline', async ({
  page
}) => {
  await serveFleet(page, { trackerError: true });
  await login(page, 'admin');
  const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
  await expect(panel.getByRole('alert')).toContainText(
    'Tracker status is unavailable',
    { timeout: 15000 }
  );
  await expect(
    panel.locator('button').filter({ hasText: /FLEET-01/ })
  ).toContainText('Connection unknown');
});

test('phone layout keeps fleet controls usable without horizontal overflow', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await serveFleet(page);
  await login(page, 'admin');
  const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
  await panel.scrollIntoViewIfNeeded();
  await panel
    .locator('button')
    .filter({ hasText: /FLEET-02/ })
    .click();
  await expect(
    panel.getByRole('region', { name: 'Selected vehicle' })
  ).toContainText('FLEET-02');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
});

test('GPS polling preserves a manually panned map', async ({ page }) => {
  await serveFleet(page);
  await login(page, 'admin');
  const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
  const marker = panel.locator('.custom-vehicle-marker').first();
  await panel.scrollIntoViewIfNeeded();
  await expect(marker).toBeVisible();
  const map = await panel.locator('.leaflet-container').boundingBox();
  if (!map) throw new Error('Expected visible map');
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    map.x + map.width / 2 + 60,
    map.y + map.height / 2 + 40,
    { steps: 20 }
  );
  await page.mouse.up();
  // Wait for Leaflet's drag inertia to settle before comparing the viewport.
  await page.waitForTimeout(500);
  const before = await marker.boundingBox();
  const refreshed = page.waitForResponse((response) =>
    response.url().includes('/api/gps/latest')
  );
  await refreshed;
  await page.waitForTimeout(100);
  const after = await marker.boundingBox();
  if (!before || !after)
    throw new Error('Expected marker before and after polling');
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
});

test('a recent heartbeat does not make an old position current', async ({
  page
}) => {
  await serveFleet(page);
  await page.route('**/api/tracker-devices?**', (route) =>
    route.fulfill({
      json: { data: trackers.map((t) => ({ ...t, lastSeenAt: now })), count: 3 }
    })
  );
  await login(page, 'admin');
  const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
  const row = panel.locator('button').filter({ hasText: /FLEET-02/ });
  await expect(row).toContainText('Online');
  await expect(row).toContainText('Last known position');
  await row.click();
  await expect(
    panel.getByRole('region', { name: 'Selected vehicle' })
  ).toContainText('Last reported speed');
});

test('paginated trackers stay complete when heartbeat ordering changes', async ({
  page
}) => {
  await serveFleet(page);
  const many = Array.from({ length: 101 }, (_, index) => ({
    ...trackers[0],
    id: `many-${index}`,
    vehicleId: `many-vehicle-${index}`,
    imei: String(1000000000 + index),
    label: index === 100 ? 'LAST-FLEET' : `Tracker ${index}`
  }));
  await page.route('**/api/tracker-devices?**', (route) => {
    const url = new URL(route.request().url());
    const stable =
      url.searchParams.get('sortBy') === 'imei' &&
      url.searchParams.get('sortOrder') === 'asc';
    const data =
      url.searchParams.get('page') === '1'
        ? many.slice(0, 100)
        : stable
          ? [many[100]]
          : [many[0]];
    return route.fulfill({ json: { data, count: 101 } });
  });
  await login(page, 'admin');
  const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
  await panel
    .getByRole('textbox', { name: 'Search tracked vehicles' })
    .fill('LAST-FLEET');
  await expect(
    panel.locator('button').filter({ hasText: 'LAST-FLEET' })
  ).toBeVisible();
});

test('pending GPS does not report zero movement or false tracker alerts', async ({
  page
}) => {
  await serveFleet(page);
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/gps/latest', async (route) => {
    await pending;
    await route.fulfill({ json: { data: points, count: 2 } });
  });
  try {
    await login(page, 'admin');
    const panel = page.getByRole('region', { name: 'Vehicle Tracking' });
    await expect(panel.getByText('3 assigned', { exact: true })).toBeVisible();
    for (const name of ['Moving', 'Stopped', 'Needs attention']) {
      const statistic = panel
        .locator('p')
        .filter({ hasText: new RegExp(`^${name}$`) })
        .locator('..');
      await expect(statistic).toContainText('—');
    }
  } finally {
    release();
  }
});
