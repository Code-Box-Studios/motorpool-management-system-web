import { test, expect, type Page, type Route } from '@playwright/test';

const V = '70000000-0000-4000-8000-000000000001';
const B = '70000000-0000-4000-8000-000000000002';
const T = '70000000-0000-4000-8000-000000000003';
const P = '70000000-0000-4000-8000-000000000005';
const D = '70000000-0000-4000-8000-000000000006';
const U = '70000000-0000-4000-8000-000000000007';
const revision = '2026-11-12T01:00:00.000Z';
const nextRevision = '2026-11-12T01:01:00.000Z';
const vehicle = {
  id: V,
  make: 'Fixture',
  model: 'Van',
  year: 2024,
  vin: 'FIXTUREVIN',
  licensePlate: 'FIXTURE-ONLY',
  capacity: 10,
  fuelType: 'diesel',
  mileage: 1000,
  status: 'available',
  images: [],
  branchId: B,
  maintenanceStandardId: null,
  insuranceExpiry: '2027-01-01T00:00:00Z',
  registrationExpiry: '2027-01-01T00:00:00Z',
  createdAt: revision,
  updatedAt: revision
};
const part = {
  id: P,
  name: 'Fixture Part',
  brand: 'Fixture',
  quantity: 10,
  image: null,
  description: 'Stored description',
  createdAt: revision,
  updatedAt: revision
};

// All API requests, including authentication, are intercepted. No fixture writes
// or shared database resets are needed to exercise the real form components.
async function fixture(
  page: Page,
  custom: (route: Route, path: string) => Promise<boolean>
) {
  let loggedIn = false;
  const user = {
    id: U,
    email: 'operations@example.invalid',
    fullName: 'Operations Fixture',
    role: 'admin',
    branchId: B,
    avatarUrl: null
  };
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (await custom(route, path)) return;
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
      return json({ ...user, status: 'active', createdAt: revision });
    if (path === '/api/notifications') return json({ data: [], unread: 0 });
    if (path === '/api/branches')
      return json({
        data: [{ id: B, name: 'Fixture Branch', archivedAt: null }],
        count: 1
      });
    if (path === '/api/drivers')
      return json({
        data: [
          {
            id: D,
            fullName: 'Fixture Driver',
            status: 'active',
            createdAt: revision,
            updatedAt: revision
          }
        ],
        count: 1
      });
    if (path === '/api/vehicles') return json({ data: [vehicle], count: 1 });
    if (path === '/api/spare-parts') return json({ data: [part], count: 1 });
    if (path === '/api/tools/stats')
      return json({
        toolsOut: 1,
        overdue: 1,
        borrowsInWindow: 1,
        avgDaysOut: null,
        topBorrowed: []
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
}

function fields(route: Route): Record<string, string> {
  return Object.fromEntries(
    [
      ...(route.request().postData() ?? '').matchAll(
        /name="([^"]+)"\r\n\r\n([^\r]*)/g
      )
    ].map((m) => [m[1], m[2]])
  );
}
async function confirm(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: label, exact: true })
    .click();
}

test('OPS-02 model-only stale edit preserves newer odometer', async ({
  page
}) => {
  let currentMileage = 1000;
  let payload: Record<string, string> | undefined;
  await fixture(page, async (route, path) => {
    if (path !== `/api/vehicles/${V}`) return false;
    if (route.request().method() === 'PATCH') {
      payload = fields(route);
      if (payload.mileage !== undefined)
        currentMileage = Number(payload.mileage);
    }
    await route.fulfill({ json: { ...vehicle, mileage: currentMileage } });
    return true;
  });
  await page.goto(`/vehicles/${V}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('#mileage')).toHaveValue('1000');
  currentMileage = 1200; // A completed repair/trip advances the stored odometer.
  await page.locator('#model').fill('Metadata change');
  await confirm(page, 'Update Vehicle');
  await expect.poll(() => payload).toBeTruthy();
  expect(payload).not.toHaveProperty('mileage');
  expect(currentMileage).toBe(1200);
});

test('CR-01 refreshed stock baseline preserves adjustment back to original quantity', async ({
  page
}) => {
  let currentStock = 10;
  const payloads: Record<string, string>[] = [];
  await fixture(page, async (route, path) => {
    if (path !== `/api/spare-parts/${P}`) return false;
    if (route.request().method() === 'PATCH') {
      const payload = fields(route);
      payloads.push(payload);
      if (payloads.length === 1) {
        currentStock = 8;
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'STOCK_REVISION_CONFLICT',
              message: 'Stock changed.'
            }
          }
        });
        return true;
      }
      if (payload.quantity !== undefined)
        currentStock = Number(payload.quantity);
    }
    await route.fulfill({
      json: {
        ...part,
        quantity: currentStock,
        updatedAt:
          currentStock === 10 && payloads.length === 0 ? revision : nextRevision
      }
    });
    return true;
  });
  await page.goto(`/spare-parts/${P}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#quantity').fill('12');
  await page.locator('#description').fill('Preserve description draft');
  await confirm(page, 'Update Spare Part');
  await page
    .getByRole('button', { name: 'Refresh stock and keep draft' })
    .click();
  await expect(
    page.getByText('Current stock: 8.', { exact: false })
  ).toBeVisible();
  await expect(page.locator('#quantity')).toHaveValue('12');
  await expect(page.locator('#description')).toHaveValue(
    'Preserve description draft'
  );
  await page.locator('#quantity').fill('10');
  await confirm(page, 'Update Spare Part');
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1]).toMatchObject({
    quantity: '10',
    expectedUpdatedAt: nextRevision,
    description: 'Preserve description draft'
  });
  expect(currentStock).toBe(10);
});

test('OPS-06 tool detail uses Manila day even in a UTC browser', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-11-13T17:00:00Z') });
  await fixture(page, async (route, path) => {
    if (path !== `/api/tools/${T}`) return false;
    await route.fulfill({
      json: {
        id: T,
        name: 'Fixture Tool',
        status: 'borrowed',
        description: 'Fixture loan',
        image: null,
        borrowedById: D,
        borrowedDate: '2026-11-10',
        estimatedReturnDate: '2026-11-13',
        createdAt: revision,
        updatedAt: revision
      }
    });
    return true;
  });
  await page.goto(`/tools/${T}`);
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
});
