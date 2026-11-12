import { test, expect, type Page, type Route } from '@playwright/test';
import { login } from './helpers';

// All business writes are intercepted. Only seeded authentication reaches the API.
const V = '70000000-0000-4000-8000-000000000001';
const B = '70000000-0000-4000-8000-000000000002';
const T = '70000000-0000-4000-8000-000000000003';
const P = '70000000-0000-4000-8000-000000000005';
const D = '70000000-0000-4000-8000-000000000006';
const U = '70000000-0000-4000-8000-000000000007';
const R = '70000000-0000-4000-8000-000000000008';
const M = '70000000-0000-4000-8000-000000000009';
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
  mileage: 25000,
  status: 'available',
  images: [],
  branchId: B,
  maintenanceStandardId: null,
  insuranceExpiry: '2027-01-01T00:00:00Z',
  registrationExpiry: '2027-01-01T00:00:00Z',
  createdAt: revision,
  updatedAt: revision
};
const tool = {
  id: T,
  name: 'Fixture Tool',
  description: 'Stored description',
  status: 'available',
  image: null,
  borrowedById: null,
  borrowedDate: null,
  estimatedReturnDate: null,
  createdAt: revision,
  updatedAt: revision
};
const part = {
  id: P,
  name: 'Fixture Part',
  brand: 'Fixture',
  quantity: 10,
  image: null,
  description: 'Stored part description',
  createdAt: revision,
  updatedAt: revision
};
const driver = {
  id: D,
  fullName: 'Fixture Driver',
  email: 'fixture@example.test',
  status: 'active',
  licenseNumber: 'FIXTURE-LICENSE',
  photo: null,
  createdAt: revision,
  updatedAt: revision
};
const user = {
  id: U,
  fullName: 'Fixture User',
  email: 'fixture-user@example.test',
  status: 'active',
  role: 'admin',
  branchId: B,
  avatarUrl: null,
  createdAt: revision
};
const maintenance = {
  id: M,
  vehicleId: V,
  type: 'preventive',
  date: '2026-11-12',
  description: '',
  cost: 10,
  mileage: 100,
  nextDue: null,
  createdAt: revision,
  updatedAt: revision
};

async function fixtures(
  page: Page,
  mutate?: (route: Route, path: string) => Promise<boolean>
) {
  const reads: Record<string, number> = {};
  const state = { changed: false };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/auth/')) return route.continue();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      if (await mutate?.(route, path)) return;
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'FIXTURE_WRITE_BLOCKED',
            message: 'Unexpected business write blocked by fixture.'
          }
        }
      });
    }
    reads[path] = (reads[path] ?? 0) + 1;
    const send = (json: unknown) => route.fulfill({ json });
    if (path === '/api/branches')
      return send({
        data: [
          {
            id: B,
            name: state.changed ? 'Refetched Branch' : 'Fixture Branch',
            location: null,
            archivedAt: null
          }
        ],
        count: 1
      });
    if (path === '/api/roles')
      return send({ data: [{ id: R, name: 'admin' }], count: 1 });
    if (path === '/api/vehicles') return send({ data: [vehicle], count: 1 });
    if (path === `/api/vehicles/${V}`)
      return send({
        ...vehicle,
        make: state.changed ? 'Refetched Vehicle' : vehicle.make
      });
    if (path === `/api/tools/${T}`)
      return send({
        ...tool,
        name: state.changed ? 'Refetched Tool' : tool.name
      });
    if (path === '/api/tools') return send({ data: [tool], count: 1 });
    if (path === '/api/tools/stats')
      return send({
        toolsOut: 0,
        overdue: 0,
        borrowsInWindow: 0,
        avgDaysOut: null,
        topBorrowed: []
      });
    if (path === `/api/spare-parts/${P}`)
      return send(
        state.changed ? { ...part, quantity: 7, updatedAt: nextRevision } : part
      );
    if (path === '/api/spare-parts') return send({ data: [part], count: 1 });
    if (path === `/api/drivers/${D}`)
      return send({
        ...driver,
        fullName: state.changed ? 'Refetched Driver' : driver.fullName
      });
    if (path === '/api/drivers') return send({ data: [driver], count: 1 });
    if (path === '/api/users')
      return send({
        data: [
          {
            ...user,
            fullName: state.changed ? 'Refetched User' : user.fullName
          }
        ],
        count: 1
      });
    if (path === `/api/maintenance/${M}`) return send(maintenance);
    if (path === '/api/maintenance') return send({ data: [], count: 0 });
    if (path === '/api/notifications') return send({ data: [], unread: 0 });
    // Other dashboard/insight queries are read-only and may use seeded data.
    return route.continue();
  });
  return { state, reads };
}

function fields(route: Route): Record<string, string> {
  return Object.fromEntries(
    [
      ...(route.request().postData() ?? '').matchAll(
        /name="([^"]+)"\r\n\r\n([^\r]*)/g
      )
    ].map((match) => [match[1], match[2]])
  );
}

async function confirm(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: label, exact: true })
    .click();
}

test('user editor waits for delayed lookup hydration and keeps later drafts', async ({
  page
}) => {
  const fixture = await fixtures(page);
  await login(page, 'admin');
  let releaseRoles!: () => void;
  let releaseBranches!: () => void;
  const rolesHeld = new Promise<void>((resolve) => {
    releaseRoles = resolve;
  });
  const branchesHeld = new Promise<void>((resolve) => {
    releaseBranches = resolve;
  });
  let rolesRequested = 0;
  let branchesRequested = 0;
  await page.route('**/api/roles', async (route) => {
    rolesRequested++;
    await rolesHeld;
    await route.fallback();
  });
  await page.route('**/api/branches*', async (route) => {
    if (
      new URL(route.request().url()).searchParams.get('includeArchived') ===
      'true'
    ) {
      return route.fallback();
    }
    branchesRequested++;
    await branchesHeld;
    await route.fallback();
  });
  try {
    await page.goto(`/user-management/${U}`);
    await expect(
      page.getByRole('heading', { name: user.fullName, exact: true })
    ).toBeVisible();
    await expect.poll(() => rolesRequested).toBeGreaterThan(0);
    await expect.poll(() => branchesRequested).toBeGreaterThan(0);
    const edit = page.getByRole('button', { name: 'Edit', exact: true });
    await expect(edit).toBeDisabled();
    releaseRoles();
    await expect.poll(() => fixture.reads['/api/roles']).toBeGreaterThan(0);
    await expect(edit).toBeDisabled();
    releaseBranches();
    await expect(edit).toBeEnabled();
    await edit.click();
    await expect(page.locator('#fullName')).toHaveValue(user.fullName);
    await expect(page.locator('#user-role')).toContainText('Admin');
    await expect(page.locator('#user-branch')).toContainText('Fixture Branch');
    await page.locator('#fullName').fill('Preserve delayed-lookup draft');
    const before = fixture.reads['/api/users'];
    fixture.state.changed = true;
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden'
      });
      window.dispatchEvent(new Event('visibilitychange'));
      Reflect.deleteProperty(document, 'visibilityState');
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await expect
      .poll(() => fixture.reads['/api/users'])
      .toBeGreaterThan(before);
    await expect(page.locator('#fullName')).toHaveValue(
      'Preserve delayed-lookup draft'
    );
  } finally {
    releaseRoles();
    releaseBranches();
  }
});

test('description-only spare part edit never resends concurrent stock', async ({
  page
}) => {
  let payload: Record<string, string> | undefined;
  const fixture = await fixtures(page, async (route, path) => {
    if (path !== `/api/spare-parts/${P}`) return false;
    payload = fields(route);
    await route.fulfill({
      status: 409,
      json: {
        error: { code: 'FIXTURE_CAPTURE', message: 'Captured without saving.' }
      }
    });
    return true;
  });
  await login(page, 'admin');
  await page.goto(`/spare-parts/${P}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('#quantity')).toHaveValue('10');
  fixture.state.changed = true;
  await page.locator('#description').fill('Description draft');
  await confirm(page, 'Update Spare Part');
  await expect.poll(() => payload).toBeTruthy();
  expect(payload).toEqual({ description: 'Description draft' });
});

test('stock conflict keeps draft and requires explicit refresh before retry', async ({
  page
}) => {
  const payloads: Record<string, string>[] = [];
  const fixture = await fixtures(page, async (route, path) => {
    if (path !== `/api/spare-parts/${P}`) return false;
    payloads.push(fields(route));
    await route.fulfill(
      payloads.length === 1
        ? {
            status: 409,
            json: {
              error: {
                code: 'STOCK_REVISION_CONFLICT',
                message:
                  'Stock changed. Refresh this spare part before adjusting its quantity.'
              }
            }
          }
        : { json: { ...part, quantity: 12, updatedAt: nextRevision } }
    );
    return true;
  });
  await login(page, 'admin');
  await page.goto(`/spare-parts/${P}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#quantity').fill('12');
  await page.locator('#description').fill('Keep this draft');
  fixture.state.changed = true;
  await confirm(page, 'Update Spare Part');
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(page.locator('#quantity')).toHaveValue('12');
  await expect(page.locator('#description')).toHaveValue('Keep this draft');
  expect(payloads[0]).toMatchObject({
    quantity: '12',
    expectedUpdatedAt: revision
  });
  await page
    .getByRole('button', { name: 'Refresh stock and keep draft' })
    .click();
  await expect(
    page.getByText('Current stock: 7.', { exact: false })
  ).toBeVisible();
  await expect(page.locator('#quantity')).toHaveValue('12');
  await confirm(page, 'Update Spare Part');
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1]).toMatchObject({
    quantity: '12',
    expectedUpdatedAt: nextRevision,
    description: 'Keep this draft'
  });
  await expect(page).toHaveURL(/\/spare-parts$/);
});

for (const edit of [false, true]) {
  test(`maintenance ${edit ? 'edit' : 'create'} rejects negative cost and non-integer mileage`, async ({
    page
  }) => {
    let writes = 0;
    await fixtures(page, async (route, path) => {
      if (!path.startsWith('/api/maintenance')) return false;
      writes++;
      await route.fulfill({
        status: 422,
        json: {
          error: { code: 'UNEXPECTED', message: 'Invalid form submitted.' }
        }
      });
      return true;
    });
    await login(page, 'admin');
    await page.goto(
      edit ? `/maintenance/${M}` : '/maintenance/add-maintenance'
    );
    if (edit)
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
    else {
      await page.getByRole('combobox').first().click();
      await page.getByRole('option', { name: /Fixture Van/ }).click();
      await page.locator('#date').fill('2026-11-12');
    }
    const form = page.locator(
      edit ? '#update-maintenance-form' : '#add-maintenance-form'
    );
    await page.locator('#cost').fill('-1');
    await form.evaluate((element) =>
      element.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      )
    );
    await expect(
      page.getByText('Cost must be 0 or greater', { exact: true })
    ).toBeVisible();
    await page.locator('#cost').fill('0');
    for (const value of ['-1', '1.5']) {
      await page.locator('#mileage').fill(value);
      await form.evaluate((element) =>
        element.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true })
        )
      );
      await expect(
        page.getByText('Mileage must be a whole number 0 or greater', {
          exact: true
        })
      ).toBeVisible();
    }
    await expect(page.getByRole('alertdialog')).toBeHidden();
    expect(writes).toBe(0);
  });
}

for (const entity of [
  {
    route: `/tools/${T}`,
    read: `/api/tools/${T}`,
    input: '#name',
    saved: tool.name,
    refreshed: 'Refetched Tool',
    file: '#newImage'
  },
  {
    route: `/spare-parts/${P}`,
    read: `/api/spare-parts/${P}`,
    input: '#name',
    saved: part.name,
    refreshed: part.name,
    file: '#newImage'
  },
  {
    route: `/drivers/${D}`,
    read: `/api/drivers/${D}`,
    input: '#full_name',
    saved: driver.fullName,
    refreshed: 'Refetched Driver',
    file: '#driver_photo'
  },
  {
    route: `/user-management/${U}`,
    read: '/api/users',
    input: '#fullName',
    saved: user.fullName,
    refreshed: 'Refetched User',
    file: '#user-avatar'
  }
]) {
  test(`${entity.route.split('/')[1]} keeps active draft across refetch and discards it on Cancel`, async ({
    page
  }) => {
    const fixture = await fixtures(page);
    await login(page, 'admin');
    await page.goto(entity.route);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator(entity.input)).toHaveValue(entity.saved);
    await page.locator(entity.input).fill('Discard this draft');
    await page.locator(entity.file).setInputFiles({
      name: 'draft.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
        'base64'
      )
    });
    const before = fixture.reads[entity.read];
    fixture.state.changed = true;
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden'
      });
      window.dispatchEvent(new Event('visibilitychange'));
      Reflect.deleteProperty(document, 'visibilityState');
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => fixture.reads[entity.read]).toBeGreaterThan(before);
    await expect(page.locator(entity.input)).toHaveValue('Discard this draft');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator(entity.input)).toHaveValue(entity.refreshed);
    await expect(page.locator(entity.file)).toHaveValue('');
  });
}

for (const values of [
  { cost: '', mileage: '' },
  { cost: '0', mileage: '0' },
  { cost: '12.35', mileage: '123' }
]) {
  for (const edit of [false, true]) {
    test(`maintenance ${edit ? 'edit' : 'create'} preserves ${JSON.stringify(values)}`, async ({
      page
    }) => {
      let payload: Record<string, unknown> | undefined;
      await fixtures(page, async (route, path) => {
        if (path !== (edit ? `/api/maintenance/${M}` : '/api/maintenance'))
          return false;
        payload = route.request().postDataJSON();
        await route.fulfill({
          status: 422,
          json: {
            error: {
              code: 'FIXTURE_CAPTURE',
              message: 'Captured without saving.'
            }
          }
        });
        return true;
      });
      await login(page, 'admin');
      await page.goto(
        edit ? `/maintenance/${M}` : '/maintenance/add-maintenance'
      );
      if (edit)
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
      else {
        await page.getByRole('combobox').first().click();
        await page.getByRole('option', { name: /Fixture Van/ }).click();
        await page.locator('#date').fill('2026-11-12');
      }
      await page.locator('#cost').fill('99');
      await page.locator('#cost').fill(values.cost);
      await page.locator('#mileage').fill('99');
      await page.locator('#mileage').fill(values.mileage);
      await confirm(page, edit ? 'Update Maintenance' : 'Create Maintenance');
      await expect.poll(() => payload).toBeTruthy();
      expect(payload?.cost).toBe(
        values.cost === '' ? (edit ? null : undefined) : Number(values.cost)
      );
      expect(payload?.mileage).toBe(
        values.mileage === ''
          ? edit
            ? null
            : undefined
          : Number(values.mileage)
      );
    });
  }
}

for (const entity of [
  {
    route: `/tools/${T}`,
    path: `/api/tools/${T}`,
    input: '#name',
    label: 'Update Tool',
    draft: 'Retry Tool'
  },
  {
    route: `/vehicles/${V}`,
    path: `/api/vehicles/${V}`,
    input: '#make',
    label: 'Update Vehicle',
    draft: 'Retry Vehicle'
  },
  {
    route: '/tools/add-tools',
    path: '/api/tools',
    input: '#name',
    label: 'Add Tool',
    draft: 'Retry New Tool'
  },
  {
    route: '/vehicles/add-vehicle',
    path: '/api/vehicles',
    input: '#make',
    label: 'Add Vehicle',
    draft: 'Retry New Vehicle'
  },
  {
    route: `/drivers/${D}`,
    path: `/api/drivers/${D}`,
    input: '#full_name',
    label: 'Save Details',
    draft: 'Retry Driver'
  },
  {
    route: `/user-management/${U}`,
    path: `/api/users/${U}`,
    input: '#fullName',
    label: 'Save Changes',
    draft: 'Retry User'
  }
]) {
  test(`${entity.route} shows save conflict once and keeps a retryable draft`, async ({
    page
  }) => {
    let attempts = 0;
    const message = 'Fixture conflict: review this record and retry.';
    await fixtures(page, async (route, path) => {
      if (path !== entity.path) return false;
      attempts++;
      await route.fulfill({
        status: 409,
        json: { error: { code: 'CONFLICT', message } }
      });
      return true;
    });
    await login(page, 'admin');
    await page.goto(entity.route);
    if (!entity.route.includes('/add-'))
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
    if (entity.route === '/vehicles/add-vehicle') {
      await page.locator('#model').fill('New Fixture Van');
      await page.locator('#license_plate').fill('NEW-FIXTURE');
      await page.locator('#vin').fill('NEWFIXTUREVIN');
      await page.locator('#insurance_expiry').fill('2027-01-01');
      await page.locator('#registration_expiry').fill('2027-01-01');
      await page.getByRole('combobox').nth(0).click();
      await page.getByRole('option', { name: 'Diesel', exact: true }).click();
      await page.getByRole('combobox').nth(1).click();
      await page
        .getByRole('option', { name: 'Fixture Branch', exact: true })
        .click();
    }
    await page.locator(entity.input).fill(entity.draft);
    await confirm(page, entity.label);
    await expect.poll(() => attempts).toBe(1);
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: message })
    ).toHaveCount(1);
    const dialog = page.getByRole('alertdialog');
    if (entity.label === 'Update Tool' || entity.label === 'Update Vehicle') {
      await expect(
        dialog.getByRole('button', { name: entity.label, exact: true })
      ).toBeEnabled();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    } else {
      await expect(dialog).toBeHidden();
    }
    await expect(page.locator(entity.input)).toHaveValue(entity.draft);
    await confirm(page, entity.label);
    await expect.poll(() => attempts).toBe(2);
  });
}
