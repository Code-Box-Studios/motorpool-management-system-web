import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from '@playwright/test';
import { apiGet, apiLogin, CREDENTIALS, listData, login } from './helpers';

test.use({ timezoneId: 'Europe/Malta' });

async function fixtures(request: APIRequestContext) {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const [original] = listData(
    await apiGet(request, '/api/trip-tickets', admin.token)
  );
  expect(original, 'Seeded trip fixture is required').toBeTruthy();
  const driver = await apiLogin(request, CREDENTIALS.driver);
  const drivers = listData(await apiGet(request, '/api/drivers', admin.token));
  const assigned = drivers.find((row) => row.userId === driver.user.id);
  expect(
    assigned,
    'Seeded driver must have an assigned driver record'
  ).toBeTruthy();
  const date = (overrides: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    status: 'scheduled',
    startTs: '2026-11-12T23:00:00Z',
    endTs: '2026-11-13T01:00:00Z',
    startMileage: null,
    endMileage: null,
    preTripGuardId: null,
    preTripCheckedById: null,
    preTripCheckedAt: null,
    postTripGuardId: null,
    postTripCheckedById: null,
    postTripCheckedAt: null,
    cancellationReason: null,
    ...overrides
  });
  const ticket = (overrides: Record<string, unknown> = {}) => ({
    ...original,
    id: randomUUID(),
    ticketNo: 9911,
    driverId: assigned!.id,
    status: 'approved',
    destination: 'Fixture outing',
    startTs: '2026-11-12T23:00:00Z',
    endTs: '2026-11-13T01:00:00Z',
    dates: [date()],
    ...overrides
  });
  return { ticket, date };
}

async function openPendingEditor(page: Page, record: { id: string }) {
  await page.route(`**/api/trip-tickets/${record.id}`, (route) =>
    route.fulfill({ json: record })
  );
  await login(page, 'admin');
  await page.goto(`/trip-tickets/${record.id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
}

async function submitEdit(page: Page, ticketId: string) {
  await page
    .getByRole('button', { name: 'Update Trip Ticket', exact: true })
    .click();
  const submitted = page.waitForRequest(
    (request) =>
      request.method() === 'PATCH' &&
      new URL(request.url()).pathname === `/api/trip-tickets/${ticketId}`
  );
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Update Trip Ticket', exact: true })
    .click();
  return (await submitted).postDataJSON() as Record<string, unknown>;
}

function employeeFields() {
  const employeeId = randomUUID();
  return {
    participantType: 'employees',
    participants: ['Timezone fixture employee'],
    participantsCount: 1,
    participantEmployees: [
      {
        employeeId,
        employee: {
          id: employeeId,
          name: 'Timezone fixture employee',
          position: null,
          archivedAt: null
        }
      }
    ],
    guides: []
  };
}

test('single-outing schedule edits use Manila wall time on a Malta device and submit explicit UTC instants', async ({
  page,
  request
}) => {
  const { ticket } = await fixtures(request);
  const record = ticket({
    status: 'pending_admin_approval',
    ...employeeFields()
  });
  await openPendingEditor(page, record);
  await expect(page.locator('#start_ts')).toHaveValue('2026-11-13T07:00');
  await expect(page.locator('#end_ts')).toHaveValue('2026-11-13T09:00');
  await page.locator('#start_ts').fill('2026-11-13T09:30');
  await page.locator('#end_ts').fill('2026-11-13T11:00');
  expect(await submitEdit(page, record.id)).toMatchObject({
    startTs: '2026-11-13T01:30:00.000Z',
    endTs: '2026-11-13T03:00:00.000Z'
  });
});

test('an unchanged single-outing schedule omits both update keys and preserves its precise instants', async ({
  page,
  request
}) => {
  const { ticket, date } = await fixtures(request);
  const record = ticket({
    status: 'pending_admin_approval',
    startTs: '2026-11-12T23:00:12.345Z',
    endTs: '2026-11-13T01:00:45.678Z',
    dates: [
      date({
        startTs: '2026-11-12T23:00:12.345Z',
        endTs: '2026-11-13T01:00:45.678Z'
      })
    ],
    ...employeeFields()
  });
  await openPendingEditor(page, record);
  await page.locator('#purpose').fill('Unrelated purpose edit');
  const update = await submitEdit(page, record.id);
  expect(update).toHaveProperty('purpose', 'Unrelated purpose edit');
  expect(update).not.toHaveProperty('startTs');
  expect(update).not.toHaveProperty('endTs');
  expect(update).not.toHaveProperty('dates');
});

test('multi-outing schedule fields stay locked and unrelated edits omit the derived span', async ({
  page,
  request
}) => {
  const { ticket, date } = await fixtures(request);
  const record = ticket({
    status: 'pending_admin_approval',
    endTs: '2026-11-15T01:00:00Z',
    dates: [
      date(),
      date({ startTs: '2026-11-14T23:00:00Z', endTs: '2026-11-15T01:00:00Z' })
    ],
    ...employeeFields()
  });
  await openPendingEditor(page, record);
  await expect(page.locator('#start_ts')).toBeDisabled();
  await expect(page.locator('#end_ts')).toBeDisabled();
  await page.locator('#purpose').fill('Preserve separate outings');
  const update = await submitEdit(page, record.id);
  expect(update).toHaveProperty('purpose', 'Preserve separate outings');
  expect(update).not.toHaveProperty('startTs');
  expect(update).not.toHaveProperty('endTs');
  expect(update).not.toHaveProperty('dates');
});

test('fuel approval displays and submits the Manila day from a UTC previous-day departure', async ({
  page,
  request
}) => {
  const { ticket } = await fixtures(request);
  const record = ticket({ status: 'pending_admin_approval' });
  await page.route(`**/api/trip-tickets/${record.id}`, (route) =>
    route.fulfill({ json: record })
  );
  await page.route(`**/api/trip-tickets/${record.id}/approve`, (route) =>
    route.fulfill({
      json: { ...record, status: 'pending_fuel_allocation_approval' }
    })
  );
  await login(page, 'admin');
  await page.goto(`/trip-tickets/${record.id}`);
  const dates = page.getByRole('table').filter({ hasText: 'Odometer Out' });
  await expect(dates).toContainText('Nov 13, 2026');
  await expect(dates).toContainText('07:00');
  await page
    .getByRole('button', { name: /Approve/ })
    .first()
    .click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Fuel Allocation Details'
  });
  await expect(dialog.locator('#fuel-allocation-date')).toHaveValue(
    '2026-11-13'
  );
  await expect(dialog.locator('#fuel-allocation-date')).toBeDisabled();
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Diesel', exact: true }).click();
  await dialog.locator('#fuel-allocation-liters').fill('15');
  const submitted = page.waitForRequest(
    `**/api/trip-tickets/${record.id}/approve`
  );
  await dialog
    .getByRole('button', { name: 'Submit for Fuel Allocation Approval' })
    .click();
  expect((await submitted).postDataJSON()).toMatchObject({
    date: '2026-11-13'
  });
});

test('current outing takes priority over missed, upcoming and returned outings', async ({
  page,
  request
}) => {
  const { ticket, date } = await fixtures(request);
  const now = Date.now();
  const records = [
    ticket({
      destination: 'MISSED OUTING',
      dates: [
        date({
          startTs: new Date(now - 90000000).toISOString(),
          endTs: new Date(now - 86400000).toISOString()
        })
      ]
    }),
    ticket({
      destination: 'UPCOMING OUTING',
      dates: [
        date({
          startTs: new Date(now + 86400000).toISOString(),
          endTs: new Date(now + 90000000).toISOString()
        })
      ]
    }),
    ticket({
      destination: 'RETURNED OUTING',
      status: 'completed',
      dates: [date({ status: 'completed' })]
    }),
    ticket({
      destination: 'CURRENT OUTING',
      status: 'in_progress',
      dates: [
        date({
          status: 'in_progress',
          startTs: new Date(now - 3600000).toISOString(),
          endTs: new Date(now + 3600000).toISOString(),
          preTripCheckedAt: new Date(now - 3600000).toISOString()
        })
      ]
    })
  ];
  await page.route('**/api/trip-tickets?*', (route) =>
    route.fulfill({ json: { data: records, count: records.length } })
  );
  await login(page, 'driver');
  await expect(
    page.getByRole('region', { name: 'Current trip', exact: true })
  ).toContainText('CURRENT OUTING');
  const later = page
    .getByRole('region', { name: 'Other assigned outings', exact: true })
    .getByRole('listitem');
  await expect(later.nth(0)).toContainText('UPCOMING OUTING');
  await expect(later.nth(1)).toContainText('MISSED OUTING');
  await expect(later.nth(1)).toContainText('Missed');
  await expect(later.nth(2)).toContainText('RETURNED OUTING');
});

test('history recovers the selected completed date after parent cancellation and forbids cancelled dates', async ({
  page,
  request
}) => {
  const { ticket, date } = await fixtures(request);
  const first = date({
    status: 'completed',
    startMileage: 1000,
    preTripCheckedAt: '2026-10-01T00:00:00Z',
    postTripCheckedAt: '2026-10-01T02:00:00Z',
    startTs: '2026-10-01T00:00:00Z',
    endTs: '2026-10-01T02:00:00Z'
  });
  const second = date({
    status: 'completed',
    startMileage: 1100,
    preTripCheckedAt: '2026-10-02T00:00:00Z',
    postTripCheckedAt: '2026-10-02T02:00:00Z',
    startTs: '2026-10-02T00:00:00Z',
    endTs: '2026-10-02T02:00:00Z'
  });
  const cancelled = date({
    status: 'cancelled',
    startTs: '2026-10-03T00:00:00Z',
    endTs: '2026-10-03T02:00:00Z'
  });
  const record = ticket({
    status: 'cancelled',
    dates: [first, second, cancelled]
  });
  await page.route('**/api/trip-tickets?*', (route) =>
    route.fulfill({ json: { data: [record], count: 1 } })
  );
  await page.route(
    `**/api/trip-tickets/${record.id}/dates/*/odometer`,
    (route) => route.fulfill({ json: record })
  );
  await login(page, 'driver');
  await page.getByRole('tab', { name: /^History/ }).click();
  const history = page.getByRole('region', {
    name: 'Trip history',
    exact: true
  });
  const articles = history.getByRole('article');
  await expect(articles).toHaveCount(3);
  await expect(
    articles.nth(0).getByRole('button', { name: /trip odometer/ })
  ).toHaveCount(0);
  const selected = articles.filter({ hasText: '1,000 km' });
  await selected
    .getByRole('button', { name: 'After trip odometer', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'After trip odometer',
    exact: true
  });
  await expect(dialog).toContainText('Oct 1, 2026');
  await dialog.getByLabel('Odometer (km)', { exact: true }).fill('1020');
  const submitted = page.waitForRequest(
    `**/api/trip-tickets/${record.id}/dates/${first.id}/odometer`
  );
  await dialog
    .getByRole('button', { name: 'Save reading', exact: true })
    .click();
  expect((await submitted).postDataJSON()).toEqual({
    phase: 'after',
    mileage: 1020
  });
});

for (const failed of ['fuel', 'repair'] as const) {
  test(`${failed} failure keeps the successful section and retries the failed read`, async ({
    page,
    request
  }) => {
    const { ticket } = await fixtures(request);
    const fuel = ticket({
      status: 'pending_fuel_allocation_approval',
      destination: 'SUCCESSFUL FUEL SECTION'
    });
    const repair = {
      id: randomUUID(),
      orderNo: 9912,
      status: 'assigned_mechanic',
      incidentDetails: 'SUCCESSFUL REPAIR SECTION',
      spareParts: []
    };
    let recovered = false;
    await page.route(/\/api\/trip-tickets(?:\?.*)?$/, (route) =>
      failed === 'fuel' && !recovered
        ? route.fulfill({
            status: 403,
            json: { error: { code: 'FORBIDDEN', message: 'Fuel unavailable' } }
          })
        : route.fulfill({
            json: {
              data: failed === 'fuel' ? [] : [fuel],
              count: failed === 'fuel' ? 0 : 1
            }
          })
    );
    await page.route(/\/api\/job-orders(?:\?.*)?$/, (route) =>
      failed === 'repair' && !recovered
        ? route.fulfill({
            status: 503,
            json: {
              error: { code: 'UNAVAILABLE', message: 'Repairs unavailable' }
            }
          })
        : route.fulfill({
            json: {
              data: failed === 'repair' ? [] : [repair],
              count: failed === 'repair' ? 0 : 1
            }
          })
    );
    await login(page, 'evp');
    await expect(
      page.getByRole('alert').filter({ hasText: `Unable to load ${failed}` })
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText(
        failed === 'fuel'
          ? 'SUCCESSFUL REPAIR SECTION'
          : 'SUCCESSFUL FUEL SECTION',
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      page.getByText(/Nothing is waiting on your sign-off/)
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Nothing needs you', exact: true })
    ).toHaveCount(0);
    recovered = true;
    await page
      .getByRole('button', { name: `Retry ${failed} sign-offs`, exact: true })
      .click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(
      page.getByText(
        failed === 'fuel'
          ? 'SUCCESSFUL REPAIR SECTION'
          : 'SUCCESSFUL FUEL SECTION',
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '1 thing needs you', exact: true })
    ).toBeVisible();
  });
}

test('all failed approval reads show separate retries without claiming an empty workload', async ({
  page
}) => {
  const recovered = new Set<string>();
  await page.route(/\/api\/(?:trip-tickets|job-orders)(?:\?.*)?$/, (route) => {
    const kind = new URL(route.request().url()).pathname.includes(
      'trip-tickets'
    )
      ? 'fuel'
      : 'repair';
    return recovered.has(kind)
      ? route.fulfill({ json: { data: [], count: 0 } })
      : route.fulfill({
          status: 403,
          json: {
            error: { code: 'FORBIDDEN', message: 'Sign-offs unavailable' }
          }
        });
  });
  await login(page, 'evp');
  await expect(page.getByRole('alert')).toHaveCount(2, { timeout: 20000 });
  await expect(
    page.getByRole('button', { name: 'Retry fuel sign-offs' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry repair sign-offs' })
  ).toBeVisible();
  await expect(
    page.getByText(/Nothing is waiting on your sign-off/)
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Nothing needs you', exact: true })
  ).toHaveCount(0);
  recovered.add('fuel');
  await page.getByRole('button', { name: 'Retry fuel sign-offs' }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(
    page.getByText(/Nothing is waiting on your sign-off/)
  ).toHaveCount(0);
  recovered.add('repair');
  await page.getByRole('button', { name: 'Retry repair sign-offs' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByText(/Nothing is waiting on your sign-off/)
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Nothing needs you', exact: true })
  ).toBeVisible();
});
