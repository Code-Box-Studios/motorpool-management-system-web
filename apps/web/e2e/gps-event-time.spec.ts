import { test, expect } from '@playwright/test';

test('GPS-02 shows an old measurement as last known despite recent tracker contact', async ({
  page
}) => {
  const V = '70000000-0000-4000-8000-000000000001';
  const U = '70000000-0000-4000-8000-000000000007';
  const now = '2026-11-13T12:00:00.000Z';
  const fixTime = '2026-11-13T10:00:00.000Z';
  await page.clock.install({ time: new Date(now) });
  let loggedIn = false;
  const user = {
    id: U,
    email: 'gps@example.invalid',
    fullName: 'GPS Fixture',
    role: 'admin',
    branchId: null,
    avatarUrl: null
  };
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body });
    if (path === '/api/auth/login') {
      loggedIn = true;
      return json({ accessToken: 'fixture-token', user });
    }
    if (path === '/api/auth/me' || path === '/api/auth/refresh') {
      if (!loggedIn)
        return json(
          { error: { code: 'UNAUTHORIZED', message: 'Sign in required' } },
          401
        );
      return json(
        path.endsWith('/me') ? user : { accessToken: 'fixture-token', user }
      );
    }
    if (path === '/api/auth/test-accounts') return json({ enabled: false });
    if (path === '/api/users/me')
      return json({ ...user, status: 'active', createdAt: now });
    if (path === '/api/notifications') return json({ data: [], unread: 0 });
    if (path === '/api/gps/latest')
      return json({
        data: [
          {
            id: V,
            vehicleId: V,
            latitude: 7.1,
            longitude: 125.6,
            speed: 40,
            heading: 90,
            engineStatus: 'on',
            createdAt: now,
            lastContactAt: now,
            fixTime,
            make: 'GPS Fixture',
            model: 'Van',
            licensePlate: 'GPS-ONLY',
            status: 'available',
            mileage: 1000,
            fuelType: 'diesel'
          }
        ],
        count: 1
      });
    if (path === '/api/tracker-devices')
      return json({
        data: [
          {
            id: U,
            imei: 'gps-fixture',
            vehicleId: V,
            label: 'GPS Fixture',
            status: 'active',
            lastSeenAt: now,
            createdAt: fixTime,
            updatedAt: now
          }
        ],
        count: 1
      });
    return json({ data: [], count: 0 });
  });
  await page.goto('/login');
  await page.getByLabel('Email address').fill(user.email);
  await page
    .getByLabel('Password', { exact: true })
    .fill('FixturePassword123!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText('Last known position', { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText('Online', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Position · 2h/).first()).toBeVisible();
  await page.goto('/gps-map');
  const telemetry = page.getByRole('region', { name: 'Vehicle telemetry' });
  await expect(telemetry).toContainText('Online');
  await expect(telemetry).toContainText('Last known position');
  await expect(telemetry).toContainText('2h');
});
