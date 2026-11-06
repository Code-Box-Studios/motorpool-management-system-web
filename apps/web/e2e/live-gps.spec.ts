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
  await expect(popup).toContainText(/Speed:\s*Unknown/);
  await expect(popup).toContainText(/Engine:\s*Unknown/);
  await expect(popup).toContainText(/Heading:\s*Unknown/);
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
  await expect(popup).toContainText(/Speed:\s*0 km\/h/);
  await expect(popup).toContainText(/Heading:\s*0°/);
  await expect(popup).toContainText(/Engine:\s*OFF/);
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
