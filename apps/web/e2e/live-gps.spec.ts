import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Browser-only API responses; these fixtures never write GPS history.
const livePoint = {
  id: 'live-point',
  vehicleId: 'live-vehicle',
  latitude: 1.390945,
  longitude: 123.761315,
  speed: null,
  heading: null,
  engineStatus: null,
  createdAt: new Date().toISOString(),
  make: 'Toyota',
  model: 'Hiace',
  licensePlate: 'LIVE-GPS',
  status: 'available',
  mileage: 12345,
  fuelType: 'diesel'
};

async function servePoint(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route('**/api/gps/latest', (route) =>
    route.fulfill({
      json: { data: [{ ...livePoint, ...overrides }], count: 1 }
    })
  );
}

async function serveTracker(page: Page, lastSeenAt: string) {
  await page.route('**/api/tracker-devices?**', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'tracker-live',
            imei: 'fixture-live',
            vehicleId: livePoint.vehicleId,
            label: 'Live tracker',
            simNumber: null,
            status: 'active',
            lastSeenAt,
            notes: null,
            createdAt: lastSeenAt,
            updatedAt: lastSeenAt
          }
        ],
        count: 1
      }
    })
  );
}

test('dashboard offers live tracking without GPS simulation controls', async ({
  page
}) => {
  await servePoint(page);
  await login(page, 'admin');
  await expect(
    page.getByText('Vehicle Tracking', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start Demo', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Stop Demo', exact: true })
  ).toHaveCount(0);
});

test('missing telemetry stays unknown instead of inventing stopped or engine states', async ({
  page
}) => {
  await servePoint(page);
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.locator('.custom-vehicle-marker').click();
  const popup = page.locator('.leaflet-popup-content');
  await expect(popup).toContainText(/Reported speed:\s*Unknown/);
  await expect(popup).toContainText(/Reported ignition:\s*Unknown/);
  await expect(popup).toContainText(/Reported heading:\s*Unknown/);
  await expect(popup).not.toContainText('Mileage:');
});

test('measured zero speed and north heading remain visible', async ({
  page
}) => {
  await servePoint(page, { speed: 0, heading: 0, engineStatus: 'off' });
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.locator('.custom-vehicle-marker').click();
  const popup = page.locator('.leaflet-popup-content');
  await expect(popup).toContainText(/Reported speed:\s*0 km\/h/);
  await expect(popup).toContainText(/Reported heading:\s*0°/);
  await expect(popup).toContainText(/Reported ignition:\s*OFF/);
});

test('out-of-range coordinates show the GPS empty state without a map marker', async ({
  page
}) => {
  await servePoint(page, { latitude: 95, longitude: 200 });
  await login(page, 'admin');
  await page.goto('/gps-map');
  await expect(
    page.getByText('No vehicle GPS data available', { exact: true })
  ).toBeVisible();
  await expect(page.locator('.custom-vehicle-marker')).toHaveCount(0);
});

test('booking availability stays separate from online tracker and reported ignition', async ({
  page
}) => {
  await servePoint(page, { speed: 0, engineStatus: 'off' });
  await serveTracker(page, new Date().toISOString());
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.locator('.custom-vehicle-marker').click();
  const popup = page.locator('.leaflet-popup-content');
  await expect(popup).toContainText(
    /Booking availability:\s*Available for booking/
  );
  await expect(popup).toContainText(/Tracker connection:\s*Online/);
  await expect(popup).toContainText(/Reported ignition:\s*OFF/);
});

test('an offline tracker keeps its old location with clearly historical readings', async ({
  page
}) => {
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await servePoint(page, { createdAt: old, speed: 0, engineStatus: 'off' });
  await serveTracker(page, old);
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.locator('.custom-vehicle-marker').click();
  const popup = page.locator('.leaflet-popup-content');
  await expect(popup).toContainText('Last known position');
  await expect(popup).toContainText(/Tracker connection:\s*Offline/);
  await expect(popup).toContainText(/Last reported ignition:\s*OFF/);
  await expect(popup).toContainText(/Last reported speed:\s*0 km\/h/);
  await expect(page.locator('.custom-vehicle-marker')).not.toContainText(
    '0 km/h'
  );
});

test('an online heartbeat does not make an old map position live', async ({
  page
}) => {
  await servePoint(page, {
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
  });
  await serveTracker(page, new Date().toISOString());
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.locator('.custom-vehicle-marker').click();
  const popup = page.locator('.leaflet-popup-content');
  await expect(popup).toContainText(/Tracker connection:\s*Online/);
  await expect(popup).toContainText('Last known position');
});

test('map tracker connection refreshes while the page stays open', async ({
  page
}) => {
  await page.clock.install();
  await servePoint(page);
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let offline = false;
  await page.route('**/api/tracker-devices?**', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'tracker-live',
            imei: 'fixture-live',
            vehicleId: livePoint.vehicleId,
            label: 'Live tracker',
            simNumber: null,
            status: 'active',
            lastSeenAt: offline ? old : new Date().toISOString(),
            notes: null,
            createdAt: old,
            updatedAt: old
          }
        ],
        count: 1
      }
    })
  );
  await login(page, 'admin');
  await page.goto('/gps-map');
  const tracker = page.locator('button').filter({ hasText: 'Live tracker' });
  await expect(tracker).toContainText('Online');
  offline = true;
  await page.clock.fastForward(16000);
  await expect(tracker).toContainText('Offline');
});

test('map resolves connections beyond the first hundred registrations', async ({
  page
}) => {
  await servePoint(page);
  const now = new Date().toISOString();
  const registrations = Array.from({ length: 101 }, (_, index) => ({
    id: `registry-${index}`,
    imei: `fixture-${index}`,
    vehicleId: index === 100 ? livePoint.vehicleId : null,
    label: index === 100 ? 'Live tracker' : `Spare ${index}`,
    simNumber: null,
    status: index === 100 ? 'active' : 'inactive',
    lastSeenAt: now,
    notes: null,
    createdAt: now,
    updatedAt: now
  }));
  await page.route('**/api/tracker-devices?**', (route) => {
    const limited = new URL(route.request().url()).searchParams.has('limit');
    return route.fulfill({
      json: {
        data: limited ? registrations.slice(0, 100) : registrations,
        count: 101
      }
    });
  });
  await login(page, 'admin');
  await page.goto('/gps-map');
  await page.locator('.custom-vehicle-marker').click();
  await expect(page.locator('.leaflet-popup-content')).toContainText(
    /Tracker connection:\s*Online/
  );
  await expect(
    page.locator('button').filter({ hasText: 'Live tracker' })
  ).toBeVisible();
});

test('a forbidden tracker read stays unknown without polling the denied endpoint', async ({
  page
}) => {
  await page.clock.install();
  await servePoint(page);
  let calls = 0;
  await page.route('**/api/tracker-devices?**', (route) => {
    calls++;
    return route.fulfill({
      status: 403,
      json: { error: { code: 'FORBIDDEN', message: 'Insufficient role' } }
    });
  });
  await login(page, 'admin');
  await page.goto('/gps-map');
  await expect(page.getByRole('alert')).toContainText('Tracker connection', {
    timeout: 15000
  });
  await page.locator('.custom-vehicle-marker').click();
  await expect(page.locator('.leaflet-popup-content')).toContainText(
    /Tracker connection:\s*Unknown/
  );
  const before = calls;
  await page.clock.fastForward(16000);
  expect(calls).toBe(before);
});
