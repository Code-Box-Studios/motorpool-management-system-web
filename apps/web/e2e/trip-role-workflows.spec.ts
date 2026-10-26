import {
  expect,
  test,
  type Page,
  type APIRequestContext
} from '@playwright/test';
import { login, apiLogin, apiGet, listData, CREDENTIALS } from './helpers';

async function fixtures(request: APIRequestContext) {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const driverSession = await apiLogin(request, CREDENTIALS.driver);
  const vehicles = listData(
    await apiGet(request, '/api/vehicles', admin.token)
  );
  const drivers = listData(await apiGet(request, '/api/drivers', admin.token));
  const driver = drivers.find((item) => item.userId === driverSession.user.id)!;
  expect(driver).toBeTruthy();
  const now = new Date().toISOString();
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    ticketNo: 7001,
    branchId: driver.branchId,
    driverId: driver.id,
    vehicleId: vehicles[0]!.id,
    destination: 'Overnight campus trip',
    purpose: 'Role workflow verification',
    dateRequested: now,
    preparedBy: '',
    status: 'approved',
    guides: [],
    participants: [],
    createdAt: now,
    updatedAt: now,
    fuelAllocation: null,
    startTs: new Date(Date.now() - 3600000).toISOString(),
    endTs: new Date(Date.now() + 3600000).toISOString(),
    dates: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        status: 'scheduled',
        startTs: new Date(Date.now() - 3600000).toISOString(),
        endTs: new Date(Date.now() + 3600000).toISOString(),
        startMileage: null,
        endMileage: null,
        preTripCheckedAt: null,
        postTripCheckedAt: null
      }
    ]
  };
  return { base };
}
async function narrowBounds(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
}

test('requester waiting/history cards support independent search, paging, cancellation and mobile overflow', async ({
  page,
  request
}) => {
  const { base } = await fixtures(request);
  const records = Array.from({ length: 12 }, (_, index) => ({
    ...base,
    id: `request-${index}`,
    ticketNo: 7001 + index,
    status: 'pending_admin_approval',
    destination: `Waiting destination${index}`
  }));
  records.push({
    ...base,
    id: 'historical',
    ticketNo: 8001,
    status: 'completed',
    destination: 'Historical destination'
  });
  await page.route('**/api/trip-tickets?*', (route) =>
    route.fulfill({ json: { data: records, count: records.length } })
  );
  await login(page, 'requester');
  const waiting = page.getByRole('region', {
    name: 'Waiting on approval',
    exact: true
  });
  const history = page.getByRole('region', {
    name: 'Request history',
    exact: true
  });
  await expect(waiting.getByRole('article')).toHaveCount(10);
  await waiting.getByRole('button', { name: 'Next page' }).click();
  await expect(waiting.getByRole('article')).toHaveCount(2);
  await waiting.getByRole('searchbox').fill('destination11');
  await expect(waiting.getByRole('article')).toHaveCount(1);
  const cancel = waiting
    .getByRole('button', { name: /Cancel request/ })
    .first();
  await cancel.click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(cancel).toBeFocused();
  const create = page.getByRole('button', {
    name: 'Request a trip',
    exact: true
  });
  await create.click();
  await expect(
    page.getByRole('dialog', { name: 'Request Trip Ticket' })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(create).toBeFocused();
  await page.setViewportSize({ width: 375, height: 812 });
  await narrowBounds(page);
  await expect(waiting.getByRole('article')).toBeVisible();
  await page.getByRole('tab', { name: /^History/ }).click();
  await expect(history.getByText('Historical destination')).toBeVisible();
  await expect(history.getByRole('searchbox')).toHaveValue('');
  await page.getByRole('tab', { name: /^Waiting/ }).click();
  await expect(waiting.getByRole('searchbox')).toHaveValue('destination11');
});

test('driver odometer dialog sends assigned outing/phase and restores focus after cancel on mobile', async ({
  page,
  request
}) => {
  const { base } = await fixtures(request);
  let recorded = false;
  await page.route('**/api/trip-tickets?*', (route) =>
    route.fulfill({
      json: {
        data: [
          recorded
            ? { ...base, dates: [{ ...base.dates[0], startMileage: 1550 }] }
            : base
        ],
        count: 1
      }
    })
  );
  let payload: unknown;
  await page.route(
    `**/api/trip-tickets/${base.id}/dates/${base.dates[0].id}/odometer`,
    async (route) => {
      payload = route.request().postDataJSON();
      recorded = true;
      await route.fulfill({
        json: { ...base, dates: [{ ...base.dates[0], startMileage: 1550 }] }
      });
    }
  );
  await login(page, 'driver');
  const before = page.getByRole('button', {
    name: 'Before trip odometer',
    exact: true
  });
  await expect(before).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await before.click();
  const dialog = page.getByRole('dialog', {
    name: 'Before trip odometer',
    exact: true
  });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.getByRole('button', { name: 'Save reading' }).isEnabled()
  ).toBe(false);
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await dialog.getByRole('spinbutton', { name: 'Odometer (km)' }).fill('1550');
  await page.keyboard.press('Escape');
  await expect(before).toBeFocused();
  await before.click();
  await expect(dialog.getByRole('spinbutton')).toHaveValue('');
  await dialog.getByRole('spinbutton').fill('1550');
  await dialog.getByRole('button', { name: 'Save reading' }).click();
  await expect(dialog).toBeHidden();
  expect(payload).toEqual({ phase: 'before', mileage: 1550 });
  await expect(
    page.getByText('Before: 1,550 km · After: Not recorded', { exact: true })
  ).toBeVisible();
  await narrowBounds(page);
});

test('guard table has QR-only scan actions and restores focus on Escape without requiring mileage', async ({
  page,
  request
}) => {
  const { base } = await fixtures(request);
  base.dates.unshift({
    ...base.dates[0],
    id: 'missed-yesterday',
    startTs: new Date(Date.now() - 86400000).toISOString(),
    endTs: new Date(Date.now() - 82800000).toISOString()
  });
  await page.route('**/api/trip-tickets?*', (route) =>
    route.fulfill({ json: { data: [base], count: 1 } })
  );
  await login(page, 'guard');
  await expect(
    page.getByRole('heading', { name: 'Next at gate', exact: true })
  ).toBeVisible();
  const windowCell = page
    .getByRole('row')
    .filter({ hasText: 'Overnight campus trip' })
    .getByRole('cell')
    .nth(1);
  await expect(windowCell).toContainText(
    new Date(base.dates[1].startTs).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
    })
  );
  const scan = page.getByRole('button', {
    name: 'Scan QR to time out',
    exact: true
  });
  await scan.click();
  const dialog = page.getByRole('dialog', {
    name: 'Scan to time out',
    exact: true
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Time out', exact: true })
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(scan).toBeFocused();
  await page.setViewportSize({ width: 375, height: 812 });
  await narrowBounds(page);
  await scan.click();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(scan).toBeFocused();
});

test('odometer draft keeps its outing through a query refresh and locks while saving', async ({
  page,
  request
}) => {
  const { base } = await fixtures(request);
  const replacement = structuredClone(base);
  replacement.id = '33333333-3333-4333-8333-333333333333';
  replacement.destination = 'New primary outing';
  replacement.dates[0].id = '44444444-4444-4444-8444-444444444444';
  replacement.dates[0].startTs = new Date(Date.now() + 86400000).toISOString();
  replacement.dates[0].endTs = new Date(Date.now() + 90000000).toISOString();
  let records = [base];
  let captured: { url: string; body: unknown } | undefined;
  let finishSave = () => {};
  const saving = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  await page.route('**/api/trip-tickets?*', (route) =>
    route.fulfill({ json: { data: records, count: records.length } })
  );
  // Every odometer POST is intercepted so this race test cannot write a reading.
  await page.route('**/api/trip-tickets/*/dates/*/odometer', async (route) => {
    captured = {
      url: route.request().url(),
      body: route.request().postDataJSON()
    };
    await saving;
    await route.fulfill({ json: base });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'driver');
  await page
    .getByRole('button', { name: 'Before trip odometer', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Before trip odometer',
    exact: true
  });
  const input = dialog.getByRole('spinbutton', { name: 'Odometer (km)' });
  await input.fill('1550');
  const originalCaption = await dialog.getByText(/Outing:/).innerText();
  records = [replacement];
  // Simulate returning to the app, which triggers its normal stale-query refetch.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    window.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    window.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(
    page.getByRole('heading', {
      name: 'New primary outing',
      exact: true,
      includeHidden: true
    })
  ).toBeVisible();
  await expect(input).toHaveValue('1550');
  await expect(dialog.getByText(/Outing:/)).toHaveText(originalCaption);
  try {
    await dialog
      .getByRole('button', { name: 'Save reading', exact: true })
      .click();
    await expect.poll(() => captured).toBeTruthy();
    expect(new URL(captured!.url).pathname).toBe(
      `/api/trip-tickets/${base.id}/dates/${base.dates[0].id}/odometer`
    );
    expect(captured!.body).toEqual({ phase: 'before', mileage: 1550 });
    await expect(input).toBeDisabled();
    for (const name of ['Cancel', 'Close', 'Saving…']) {
      await expect(
        dialog.getByRole('button', { name, exact: true })
      ).toBeDisabled();
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
  } finally {
    finishSave();
  }
  await expect(dialog).toBeHidden();
});
