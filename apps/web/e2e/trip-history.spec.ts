import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from '@playwright/test';
import { apiGet, apiLogin, CREDENTIALS, listData, login } from './helpers';

async function fixtures(request: APIRequestContext) {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const driver = await apiLogin(request, CREDENTIALS.driver);
  const guard = await apiLogin(request, CREDENTIALS.guard);
  const [original] = listData(
    await apiGet(request, '/api/trip-tickets', admin.token)
  );
  const drivers = listData(await apiGet(request, '/api/drivers', admin.token));
  const assignedDriver = drivers.find((row) => row.userId === driver.user.id)!;
  const date = (overrides: Record<string, unknown> = {}) => {
    const departure =
      typeof overrides.preTripCheckedAt === 'string'
        ? Date.parse(overrides.preTripCheckedAt)
        : undefined;
    const returned =
      typeof overrides.postTripCheckedAt === 'string'
        ? Date.parse(overrides.postTripCheckedAt)
        : undefined;
    return {
      id: randomUUID(),
      status: 'scheduled',
      startTs: new Date(
        departure ?? (returned ? returned - 7200000 : Date.now() - 3600000)
      ).toISOString(),
      endTs: new Date(
        returned ?? (departure ? departure + 7200000 : Date.now() + 3600000)
      ).toISOString(),
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
    };
  };
  const base = {
    ...original,
    id: randomUUID(),
    ticketNo: 9901,
    driverId: assignedDriver.id,
    status: 'approved',
    destination: 'Current campus outing',
    dates: [date()]
  };
  return { base, date, guardId: guard.user.id, driverUserId: driver.user.id };
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
}

for (const role of ['driver', 'guard'] as const) {
  test(`history details stay read-only when a ${role} previously requested the same ticket`, async ({
    page,
    request
  }) => {
    const { base, date, driverUserId, guardId } = await fixtures(request);
    const historical = {
      ...base,
      requestedById: role === 'driver' ? driverUserId : guardId,
      dates: [
        date({
          status: 'completed',
          startMileage: 1000,
          endMileage: 1025,
          preTripCheckedById: guardId,
          preTripCheckedAt: '2026-10-01T08:00:00Z',
          postTripCheckedById: guardId,
          postTripCheckedAt: '2026-10-01T10:00:00Z'
        }),
        base.dates[0]
      ]
    };
    await page.route('**/api/trip-tickets?*', (route) =>
      route.fulfill({ json: { data: [historical], count: 1 } })
    );
    await page.route(`**/api/trip-tickets/${base.id}`, (route) =>
      route.fulfill({ json: historical })
    );
    await login(page, role);
    await page.getByRole('tab', { name: /^History/ }).click();
    await page
      .getByRole('region', {
        name: role === 'driver' ? 'Trip history' : 'My scan history',
        exact: true
      })
      .getByRole('link', { name: 'Trip details', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('region', { name: 'Trip progress', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Cancel|Edit|Approve|Disapprove/ })
    ).toHaveCount(0);
  });
}

test('driver history includes completed and cancelled outings without hiding future dates or leaking other assignments', async ({
  page,
  request
}, testInfo) => {
  const { base, date } = await fixtures(request);
  const records = [
    {
      ...base,
      dates: [
        base.dates[0],
        date({
          startTs: new Date(Date.now() + 86400000).toISOString(),
          endTs: new Date(Date.now() + 90000000).toISOString()
        }),
        date({
          status: 'completed',
          startMileage: 1000,
          endMileage: 1025,
          postTripCheckedAt: '2026-10-01T10:00:00Z'
        }),
        date({ status: 'cancelled', cancellationReason: 'Campus closed' })
      ]
    },
    {
      ...base,
      id: randomUUID(),
      ticketNo: 9902,
      status: 'cancelled',
      destination: 'Z cancelled assignment',
      cancellationReason: 'Event cancelled',
      dates: [date()]
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      ...base,
      id: randomUUID(),
      ticketNo: 9910 + index,
      status: 'completed',
      destination: `Finished outing ${index}`,
      dates: [
        date({
          status: 'completed',
          startMileage: 2000,
          endMileage: 2050,
          postTripCheckedAt: `2026-10-${String(index + 2).padStart(2, '0')}T10:00:00Z`
        })
      ]
    })),
    {
      ...base,
      id: randomUUID(),
      driverId: randomUUID(),
      destination: 'Another driver private trip',
      status: 'completed',
      dates: [date({ status: 'completed' })]
    },
    {
      ...base,
      id: randomUUID(),
      destination: 'Declined proposal',
      status: 'disapproved',
      dates: [date()]
    }
  ];
  await page.route('**/api/trip-tickets?*', (route) =>
    route.fulfill({ json: { data: records, count: records.length } })
  );
  await login(page, 'driver');
  await expect(
    page.getByRole('region', { name: 'Other assigned outings', exact: true })
  ).toBeVisible();
  await page.getByRole('tab', { name: /^History/ }).click();
  const history = page.getByRole('region', {
    name: 'Trip history',
    exact: true
  });
  await expect(history.getByRole('article')).toHaveCount(10);
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle('dark', value === 'dark'),
        theme
      );
      await noOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`driver-history-${theme}-${width}.png`),
        animations: 'disabled'
      });
    }
  await expect(history).not.toContainText('Another driver private trip');
  await expect(history).not.toContainText('Declined proposal');
  await history.getByRole('button', { name: 'Next page' }).click();
  await expect(history.getByRole('article')).toHaveCount(3);
  await history.getByRole('searchbox').fill('Z cancelled assignment');
  await expect(history.getByRole('article')).toHaveCount(1);
  await expect(history).toContainText('Cancelled');
  await expect(history).toContainText('Event cancelled');
  await expect(
    history.getByRole('link', { name: /Trip details/ })
  ).toHaveAttribute('href', /viewOnly=true/);
  await expect(
    history.getByRole('button', { name: /QR|odometer/i })
  ).toHaveCount(0);
  await history.getByRole('searchbox').fill('');
  await history.getByRole('button', { name: 'Filters: Status' }).click();
  await page.getByRole('combobox', { name: 'Filter by status' }).click();
  await page.getByRole('option', { name: 'Cancelled', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(history.getByRole('article')).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('tab', { name: /^History/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
});

test('driver outing actions stay grouped with compact mileage controls on desktop and phones in both themes', async ({
  page,
  request
}, testInfo) => {
  const { base, date } = await fixtures(request);
  base.dates.push(
    date({
      startTs: new Date(Date.now() + 86400000).toISOString(),
      endTs: new Date(Date.now() + 90000000).toISOString()
    })
  );
  await page.route('**/api/trip-tickets?*', (route) =>
    route.fulfill({ json: { data: [base], count: 1 } })
  );
  await login(page, 'driver');
  const other = page.getByRole('region', {
    name: 'Other assigned outings',
    exact: true
  });
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle('dark', value === 'dark'),
        theme
      );
      const reading = other.getByRole('button', {
        name: 'Before trip odometer',
        exact: true
      });
      await expect(reading).toBeVisible();
      const bounds = await reading.boundingBox();
      expect(bounds!.width).toBeLessThan(200);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      const footer = other.getByRole('group', {
        name: 'Trip actions',
        exact: true
      });
      await expect(
        footer.getByRole('button', { name: 'Show QR', exact: true })
      ).toBeVisible();
      await expect(
        footer.getByRole('link', { name: /Trip details/ })
      ).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`driver-actions-${theme}-${width}.png`),
        animations: 'disabled',
        fullPage: true
      });
    }
});

test('guard history lists only their confirmed departures and returns, including completed tickets and legacy stamps', async ({
  page,
  request
}, testInfo) => {
  const { base, date, guardId } = await fixtures(request);
  const someoneElse = randomUUID();
  const records = [
    {
      ...base,
      status: 'completed',
      destination: 'Shared gate duty',
      dates: [
        date({
          status: 'completed',
          preTripCheckedById: guardId,
          preTripCheckedAt: '2026-10-01T08:00:00Z',
          postTripCheckedById: someoneElse,
          postTripCheckedAt: '2026-10-01T10:00:00Z'
        })
      ]
    },
    {
      ...base,
      id: randomUUID(),
      ticketNo: 9902,
      status: 'completed',
      destination: 'Both my scans',
      dates: [
        date({
          status: 'completed',
          preTripCheckedById: guardId,
          preTripCheckedAt: '2026-10-02T08:00:00Z',
          postTripCheckedById: guardId,
          postTripCheckedAt: '2026-10-02T10:00:00Z'
        })
      ]
    },
    {
      ...base,
      id: randomUUID(),
      destination: 'Other guard only',
      status: 'completed',
      dates: [
        date({
          status: 'completed',
          preTripCheckedById: someoneElse,
          preTripCheckedAt: '2026-10-03T08:00:00Z'
        })
      ]
    },
    {
      ...base,
      id: randomUUID(),
      destination: 'Never confirmed',
      dates: [date({ preTripCheckedById: guardId })]
    },
    {
      ...base,
      id: randomUUID(),
      ticketNo: 9903,
      destination: 'Legacy gate record',
      status: 'cancelled',
      dates: [
        date({
          status: 'completed',
          preTripGuardId: guardId,
          preTripCheckedAt: '2026-10-04T08:00:00Z'
        })
      ]
    }
  ];
  let actorFilteredRequest = false;
  await page.route('**/api/trip-tickets?*', (route) => {
    actorFilteredRequest ||=
      new URL(route.request().url()).searchParams.get('scannedByMe') === 'true';
    return route.fulfill({ json: { data: records, count: records.length } });
  });
  await login(page, 'guard');
  await page.getByRole('tab', { name: /^History/ }).click();
  const history = page.getByRole('region', {
    name: 'My scan history',
    exact: true
  });
  await expect(history.getByRole('article')).toHaveCount(4);
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle('dark', value === 'dark'),
        theme
      );
      await noOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`guard-history-${theme}-${width}.png`),
        animations: 'disabled'
      });
    }
  expect(actorFilteredRequest).toBe(true);
  await expect(history).not.toContainText('Other guard only');
  await expect(history).not.toContainText('Never confirmed');
  await expect(history.getByRole('article').first()).toContainText(
    'Legacy gate record'
  );
  await expect(history).toContainText('Departure confirmed');
  await expect(history).toContainText('Return confirmed');
  await history.getByRole('button', { name: 'Filters: Scan type' }).click();
  await page.getByRole('combobox', { name: 'Filter by scan type' }).click();
  await page.getByRole('option', { name: 'Returns', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(history.getByRole('article')).toHaveCount(1);
  await expect(history).toContainText('Both my scans');
  await history
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await history.getByRole('searchbox').fill('Shared gate duty');
  await expect(history.getByRole('article')).toHaveCount(1);
  await expect(history.getByRole('article')).toContainText(
    'Departure confirmed'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await expect(
    history.getByRole('button', { name: /Scan QR|Time in|Time out/ })
  ).toHaveCount(0);
});

test('guard history reports failed reads and can retry without showing a false empty history', async ({
  page,
  request
}) => {
  const { base, date, guardId } = await fixtures(request);
  let failing = true;
  const completed = {
    ...base,
    status: 'completed',
    dates: [
      date({
        status: 'completed',
        preTripCheckedById: guardId,
        preTripCheckedAt: '2026-10-01T08:00:00Z'
      })
    ]
  };
  await page.route('**/api/trip-tickets?*', (route) => {
    if (
      new URL(route.request().url()).searchParams.has('scannedByMe') &&
      failing
    )
      return route.fulfill({
        status: 403,
        json: { error: { code: 'FORBIDDEN', message: 'History unavailable' } }
      });
    return route.fulfill({ json: { data: [completed], count: 1 } });
  });
  await login(page, 'guard');
  await page.getByRole('tab', { name: /^History/ }).click();
  const history = page.getByRole('region', {
    name: 'My scan history',
    exact: true
  });
  await expect(history.getByRole('alert')).toBeVisible();
  failing = false;
  await history.getByRole('button', { name: 'Try again' }).click();
  await expect(history.getByRole('article')).toHaveCount(1);
});
