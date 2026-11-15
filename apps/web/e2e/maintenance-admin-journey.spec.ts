import { expect, test, type Page } from '@playwright/test';

const ID = {
  user: '71000000-0000-4000-8000-000000000001',
  vehicle: '71000000-0000-4000-8000-000000000002',
  branch: '71000000-0000-4000-8000-000000000003',
  standard: '71000000-0000-4000-8000-000000000004',
  item: '71000000-0000-4000-8000-000000000005',
  tracking: '71000000-0000-4000-8000-000000000006'
};
const at = '2026-11-13T02:00:00.000Z';
const task = {
  id: ID.item,
  maintenanceStandardId: ID.standard,
  taskName: 'Oil change',
  taskDescription: 'Replace engine oil',
  intervalType: 'mileage',
  intervalMileage: 5000,
  intervalMonths: null
};
async function fixture(page: Page, role = 'admin', seeded = true) {
  page.on('pageerror', (error) => console.log('PAGE ERROR', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error')
      console.log('CONSOLE ERROR', message.text());
  });
  const user = {
    id: ID.user,
    email: 'maintenance@example.test',
    fullName: 'Maintenance Administrator',
    role,
    branchId: ID.branch,
    avatarUrl: null,
    status: 'active',
    createdAt: at
  };
  const vehicle = {
    id: ID.vehicle,
    make: 'Toyota',
    model: 'Hiace',
    licensePlate: 'MMS-ADMIN',
    vin: 'MAINTENANCEVIN1',
    capacity: 12,
    year: 2025,
    fuelType: 'diesel',
    mileage: 1000,
    status: 'available',
    branchId: ID.branch,
    images: [],
    maintenanceStandardId: seeded ? ID.standard : null,
    insuranceExpiry: '2027-12-31',
    registrationExpiry: '2027-12-31',
    createdAt: at,
    updatedAt: at
  };
  const fixtureTask = { ...task };
  const standard = {
    id: ID.standard,
    name: 'Fleet basic',
    description: 'Preventive fleet plan',
    scheduleItems: seeded ? [fixtureTask] : [],
    createdAt: at,
    updatedAt: at
  };
  const row = {
    id: ID.tracking,
    vehicleId: ID.vehicle,
    maintenanceScheduleItemId: ID.item,
    scheduleItem: fixtureTask,
    status: 'pending',
    displayStatus: 'pending',
    nextDueMileage: 6000,
    nextDueDate: null,
    lastCompletedDate: null,
    lastCompletedMileage: null
  };
  const state = {
    standards: seeded ? [standard] : [],
    tracking: seeded ? [row] : [],
    vehicle,
    writes: [] as {
      method: string;
      path: string;
      body: Record<string, unknown> | null;
    }[],
    trackingReads: 0,
    analyticsReads: 0,
    completeFailures: 0
  };
  let authenticated = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const method = request.method();
    const list = (data: unknown[]) => ({ data, count: data.length });
    let json: unknown = list([]);
    if (method !== 'GET')
      state.writes.push({
        method,
        path,
        body: request.postData() ? request.postDataJSON() : null
      });
    if (path === '/api/auth/me') {
      if (!authenticated)
        return route.fulfill({
          status: 401,
          json: { error: { code: 'UNAUTHORIZED', message: 'Refresh required' } }
        });
      json = user;
    } else if (path === '/api/auth/refresh') {
      authenticated = true;
      json = { user, accessToken: 'fixture-token' };
    } else if (path === '/api/auth/test-accounts') json = { enabled: false };
    else if (path === '/api/notifications') json = { data: [], unreadCount: 0 };
    else if (path === '/api/branches')
      json = list([{ id: ID.branch, name: 'Main', archivedAt: null }]);
    else if (path === '/api/vehicles') json = list([vehicle]);
    else if (path === `/api/vehicles/${ID.vehicle}`) json = vehicle;
    else if (path === '/api/analytics/predictive-maintenance') {
      state.analyticsReads++;
      json = list([]);
    } else if (path === '/api/maintenance-standards') {
      if (method === 'POST') {
        Object.assign(standard, request.postDataJSON());
        state.standards = [standard];
        json = standard;
      } else json = list(state.standards);
    } else if (path === `/api/maintenance-standards/${ID.standard}`) {
      if (method === 'PATCH') Object.assign(standard, request.postDataJSON());
      if (method === 'DELETE') {
        if (state.tracking.length)
          return route.fulfill({
            status: 409,
            json: {
              error: {
                code: 'STANDARD_IN_USE',
                message:
                  'Standard has schedule items still tracked on a vehicle'
              }
            }
          });
        state.standards = [];
        return route.fulfill({ status: 204 });
      }
      json = standard;
    } else if (
      path === `/api/maintenance-standards/${ID.standard}/schedule-items`
    ) {
      Object.assign(fixtureTask, request.postDataJSON());
      standard.scheduleItems = [{ ...fixtureTask }];
      json = fixtureTask;
    } else if (
      path === `/api/maintenance-standards/schedule-items/${ID.item}`
    ) {
      if (state.tracking.length)
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'SCHEDULE_ITEM_IN_USE',
              message: 'Schedule item is tracked on a vehicle'
            }
          }
        });
      standard.scheduleItems = [];
      return route.fulfill({ status: 204 });
    } else if (path === `/api/vehicles/${ID.vehicle}/maintenance-tracking`) {
      if (method === 'POST') {
        vehicle.maintenanceStandardId = ID.standard;
        state.tracking = [row];
      } else state.trackingReads++;
      json = list(state.tracking);
    } else if (path === `/api/maintenance-tracking/${ID.tracking}/complete`) {
      if (state.completeFailures > 0) {
        state.completeFailures--;
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'CONFLICT',
              message: 'Service record changed. Retry completion.'
            }
          }
        });
      }
      const body = request.postDataJSON();
      vehicle.mileage = body.completedMileage;
      Object.assign(row, {
        status: 'completed',
        displayStatus: 'completed',
        lastCompletedDate: at,
        lastCompletedMileage: body.completedMileage,
        nextDueMileage: body.completedMileage + 5000
      });
      json = row;
    }
    await route.fulfill({ json });
  });
  return state;
}

test('GAP-02 admin creates and edits a standard, adds/removes tasks, assigns it and records completion', async ({
  page
}) => {
  const state = await fixture(page, 'admin', false);
  await page.goto('/maintenance?tab=standards');
  await page.getByRole('button', { name: 'New standard', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'New standard', exact: true });
  await dialog.getByLabel('Standard name').fill('Fleet basic');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('Preventive fleet plan');
  await dialog
    .getByRole('button', { name: 'Save standard', exact: true })
    .click();
  const card = page.getByRole('region', { name: 'Fleet basic', exact: true });
  await expect(card).toBeVisible();
  await card
    .getByRole('button', { name: 'Edit standard', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Edit standard', exact: true });
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('Updated fleet plan');
  await dialog
    .getByRole('button', { name: 'Save standard', exact: true })
    .click();
  await expect(card).toContainText('Updated fleet plan');
  await card
    .getByRole('button', { name: 'Add schedule item', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Add schedule item', exact: true });
  await dialog.getByLabel('Task name').fill('Oil change');
  await dialog.getByLabel('Mileage interval (km)').fill('5000');
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(card).toContainText('Oil change');
  expect(
    state.writes.find((write) => write.path.endsWith('/schedule-items'))?.body
  ).toMatchObject({
    taskName: 'Oil change',
    intervalType: 'mileage',
    intervalMileage: 5000,
    intervalMonths: null
  });
  await page
    .getByRole('button', { name: 'Remove Oil change', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove schedule item', exact: true })
    .click();
  await expect(card).not.toContainText('Oil change');
  await card
    .getByRole('button', { name: 'Add schedule item', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Add schedule item', exact: true });
  await dialog.getByLabel('Task name').fill('Oil change');
  await dialog.getByLabel('Mileage interval (km)').fill('5000');
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(card).toContainText('Oil change');
  await page.goto(`/vehicles/${ID.vehicle}`);
  const tracking = page.getByRole('region', {
    name: 'Tracked maintenance',
    exact: true
  });
  await tracking
    .getByRole('combobox', { name: 'Maintenance standard', exact: true })
    .click();
  await page.getByRole('option', { name: 'Fleet basic', exact: true }).click();
  await tracking
    .getByRole('button', { name: 'Assign standard', exact: true })
    .click();
  await expect(tracking).toContainText('6,000 km');
  await tracking
    .getByRole('button', { name: 'Complete Oil change', exact: true })
    .click();
  dialog = page.getByRole('dialog', {
    name: 'Complete Oil change',
    exact: true
  });
  await dialog.getByLabel('Completed mileage (km)').fill('1200');
  await dialog.getByLabel('Completion notes').fill('Oil and filter replaced');
  await dialog
    .getByRole('button', { name: 'Record completion', exact: true })
    .click();
  await expect(tracking).toContainText('6,200 km');
  await expect(tracking).toContainText('Completed');
  expect(
    state.writes.find((write) => write.path.endsWith('/complete'))?.body
  ).toEqual({ completedMileage: 1200, notes: 'Oil and filter replaced' });
  expect(state.trackingReads).toBeGreaterThan(1);
  expect(state.analyticsReads).toBeGreaterThan(1);
});

test('GAP-02 completion failure retains draft and retry refreshes the next due', async ({
  page
}) => {
  const state = await fixture(page);
  state.completeFailures = 1;
  await page.goto(`/vehicles/${ID.vehicle}`);
  await page
    .getByRole('button', { name: 'Complete Oil change', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Complete Oil change',
    exact: true
  });
  await dialog.getByLabel('Completed mileage (km)').fill('1400');
  await dialog
    .getByLabel('Completion notes')
    .fill('Keep this draft after conflict');
  await dialog
    .getByRole('button', { name: 'Record completion', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Service record changed'
  );
  await expect(dialog.getByLabel('Completion notes')).toHaveValue(
    'Keep this draft after conflict'
  );
  await dialog
    .getByRole('button', { name: 'Record completion', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Tracked maintenance', exact: true })
  ).toContainText('6,400 km');
});

test('GAP-02 inventory readers see maintenance tasks without administration controls', async ({
  page
}) => {
  await fixture(page, 'requester');
  await page.goto(`/vehicles/${ID.vehicle}`);
  const tracking = page.getByRole('region', {
    name: 'Tracked maintenance',
    exact: true
  });
  await expect(tracking).toContainText('Oil change');
  await expect(tracking).toContainText('6,000 km');
  await expect(
    tracking.getByRole('button', { name: /Assign standard|Complete/ })
  ).toHaveCount(0);
  await expect(tracking.getByRole('combobox')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Edit vehicle', exact: true })
  ).toHaveCount(0);
});

test('GAP-02 phone standard dialog stays readable in both themes and rejects zero intervals', async ({
  page
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/maintenance?tab=standards');
  await page
    .getByRole('button', { name: 'Add schedule item', exact: true })
    .click();
  let dialog = page.getByRole('dialog', {
    name: 'Add schedule item',
    exact: true
  });
  await dialog.getByLabel('Task name').fill('Inspect brakes');
  await dialog.getByLabel('Mileage interval (km)').fill('0');
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Mileage interval (km)')).toHaveAttribute(
    'min',
    '1'
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Add schedule item', exact: true })
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Switch to dark mode', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Add schedule item', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Add schedule item', exact: true });
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    )
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
});

test('GAP-02 deletes an unused standard and retains tracked standards after a conflict', async ({
  page
}) => {
  const state = await fixture(page);
  await page.goto('/maintenance?tab=standards');
  await page
    .getByRole('button', { name: 'Delete standard', exact: true })
    .click();
  const confirm = page.getByRole('alertdialog');
  await confirm
    .getByRole('button', { name: 'Delete standard', exact: true })
    .click();
  await expect(confirm).toContainText(
    'Standard has schedule items still tracked on a vehicle'
  );
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  state.tracking = [];
  state.vehicle.maintenanceStandardId = null;
  await page
    .getByRole('button', { name: 'Delete standard', exact: true })
    .click();
  await confirm
    .getByRole('button', { name: 'Delete standard', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Fleet basic', exact: true })
  ).not.toBeVisible();
});

test('GAP-02 failed standard saves retain drafts and time intervals omit stale mileage', async ({
  page
}) => {
  const state = await fixture(page);
  await page.goto('/maintenance?tab=standards');
  await page.getByRole('button', { name: 'New standard', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'New standard', exact: true });
  await dialog.getByLabel('Standard name').fill('New fleet plan');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('Keep this standard draft');
  await page.route('**/api/maintenance-standards', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 500,
      json: { error: { code: 'ERROR', message: 'Standard save unavailable' } }
    });
  });
  await dialog
    .getByRole('button', { name: 'Save standard', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Standard save unavailable'
  );
  await expect(dialog.getByLabel('Standard name')).toHaveValue(
    'New fleet plan'
  );
  await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue(
    'Keep this standard draft'
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page
    .getByRole('button', { name: 'Add schedule item', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Add schedule item', exact: true });
  await dialog.getByLabel('Task name').fill('Inspect brakes');
  await dialog.getByLabel('Mileage interval (km)').fill('2000');
  await dialog
    .getByRole('combobox', { name: 'Interval type', exact: true })
    .click();
  await page.getByRole('option', { name: 'Time', exact: true }).click();
  await dialog.getByLabel('Time interval (months)').fill('6');
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    state.writes.find((write) => write.path.endsWith('/schedule-items'))?.body
  ).toMatchObject({
    intervalType: 'time',
    intervalMileage: null,
    intervalMonths: 6
  });
});

for (const width of [390, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`GAP-02 maintenance controls preview ${width} ${theme}`, async ({
      page
    }) => {
      await fixture(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto('/maintenance?tab=standards');
      await expect(
        page.getByRole('button', { name: 'New standard', exact: true })
      ).toBeVisible();
      if (theme === 'dark')
        await page
          .getByRole('button', { name: 'Switch to dark mode', exact: true })
          .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      await page.screenshot({
        path: `../../.lavish/audit-fixes-2026-11-13/maintenance-standards-${theme}-${width}.png`,
        fullPage: true,
        animations: 'disabled'
      });
      await page
        .getByRole('button', { name: 'Add schedule item', exact: true })
        .click();
      const dialog = page.getByRole('dialog', {
        name: 'Add schedule item',
        exact: true
      });
      await dialog.getByLabel('Task name').fill('Inspect tyres');
      await dialog.getByLabel('Mileage interval (km)').fill('5000');
      await page.screenshot({
        path: `../../.lavish/audit-fixes-2026-11-13/maintenance-task-dialog-${theme}-${width}.png`,
        fullPage: true,
        animations: 'disabled'
      });
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: 'Add schedule item', exact: true })
      ).toBeFocused();
      await page.goto(`/vehicles/${ID.vehicle}`);
      const tracking = page.getByRole('region', {
        name: 'Tracked maintenance',
        exact: true
      });
      await expect(tracking).toContainText('Oil change');
      await tracking.screenshot({
        animations: 'disabled',
        path: `../../.lavish/audit-fixes-2026-11-13/maintenance-tracking-${theme}-${width}.png`
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
    });
  }
}

test('GAP-02 closing completion returns keyboard focus and retained historical tasks stay visible', async ({
  page
}) => {
  const state = await fixture(page);
  state.vehicle.maintenanceStandardId = null;
  await page.goto(`/vehicles/${ID.vehicle}`);
  const tracking = page.getByRole('region', {
    name: 'Tracked maintenance',
    exact: true
  });
  await expect(tracking).toContainText('Retained from a previous standard');
  const trigger = tracking.getByRole('button', {
    name: 'Complete Oil change',
    exact: true
  });
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
