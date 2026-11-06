import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Browser fixtures only. These receipts never enter tracker or GPS storage.
const packet = {
  id: '00000000-0000-4000-8000-000000000001',
  revision: 1,
  receivedAt: '2026-11-06T06:31:20.000Z',
  storedAt: '2026-11-06T06:31:21.000Z',
  connectionId: '00000000-0000-4000-8000-000000000002',
  peer: '192.0.2.10:43210',
  deviceId: 'BROWSER-TRACKER-01',
  vehicleId: null,
  messageType: 'V1',
  kind: 'position',
  outcome: 'invalid_fix',
  rawHex:
    Buffer.from('<script>alert(1)</script>\r\n\0', 'utf8').toString('hex') +
    'ff',
  fixTime: '2026-11-06T06:30:00.000Z',
  latitude: 95,
  longitude: 200,
  speed: 0,
  heading: 0,
  ignition: false,
  reason: 'Tracker reported an invalid fix.'
};
const older = {
  ...packet,
  id: '00000000-0000-4000-8000-000000000003',
  deviceId: 'OLDER-TRACKER',
  receivedAt: '2026-11-05T06:31:20.000Z'
};
const fragment = {
  ...packet,
  id: '00000000-0000-4000-8000-000000000004',
  deviceId: null,
  kind: 'fragment',
  messageType: null,
  outcome: 'incomplete',
  latitude: null,
  longitude: null,
  reason: 'Socket closed with an unfinished message.'
};
const unavailable = {
  ...packet,
  id: '00000000-0000-4000-8000-000000000005',
  deviceId: 'UNREGISTERED-TRACKER',
  outcome: 'device_unavailable',
  latitude: 7.07,
  longitude: 125.61,
  reason: 'No registered device or active vehicle assignment.'
};

async function serveLogs(page: Page) {
  await page.route('**/api/gps/packet-logs*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    const source = query.has('cursor')
      ? [older]
      : [packet, fragment, unavailable];
    const data = source.filter(
      (row) =>
        (!query.get('deviceId') || row.deviceId === query.get('deviceId')) &&
        (!query.get('search') ||
          row.deviceId?.includes(query.get('search')!)) &&
        (!query.get('kind') || row.kind === query.get('kind')) &&
        (!query.get('outcome') || row.outcome === query.get('outcome'))
    );
    return route.fulfill({
      json: {
        data,
        count: 26,
        nextCursor: query.has('cursor') ? null : 'older-cursor'
      }
    });
  });
}
async function openLogs(page: Page) {
  await login(page, 'admin');
  await page.goto('/tracker-logs');
  await expect(
    page.getByRole('heading', { name: 'Tracker Logs', exact: true })
  ).toBeVisible();
}

test('admin opens packet logs through tracker list and exact observed-ID detail links', async ({
  page
}) => {
  await serveLogs(page);
  const device = {
    id: '00000000-0000-4000-8000-000000000011',
    imei: packet.deviceId,
    vehicleId: null,
    label: 'Browser tracker',
    status: 'active',
    lastSeenAt: null,
    simNumber: null,
    notes: null,
    createdAt: packet.receivedAt,
    updatedAt: packet.receivedAt
  };
  await page.route(/\/api\/tracker-devices(?:\?|\/|$)/, (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith(device.id)
        ? device
        : { data: [device], count: 1 }
    })
  );
  await login(page, 'admin');
  await page.goto('/tracker-devices');
  await page.getByRole('link', { name: 'Tracker Logs', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tracker Logs', exact: true })
  ).toBeVisible();
  await page.goto(`/tracker-devices/${device.id}`);
  await page
    .getByRole('link', { name: 'View packet logs', exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`tracker-logs\\?deviceId=${packet.deviceId}`)
  );
  await expect(
    page.getByRole('row').filter({ hasText: packet.deviceId })
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: unavailable.deviceId })
  ).toHaveCount(0);
});

test('driver cannot render packet logs or request packet data', async ({
  page
}) => {
  let reads = 0;
  await page.route('**/api/gps/packet-logs*', (route) => {
    reads++;
    return route.fulfill({ json: { data: [], count: 0, nextCursor: null } });
  });
  await login(page, 'driver');
  await page.goto('/tracker-logs?deviceId=BROWSER-TRACKER-01');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole('heading', { name: 'Tracker Logs', exact: true })
  ).toHaveCount(0);
  expect(reads).toBe(0);
});

test('packet inspector preserves binary bytes, labels invalid fixes, and returns keyboard focus', async ({
  page
}) => {
  await serveLogs(page);
  await openLogs(page);
  const inspect = page
    .getByRole('row')
    .filter({ hasText: packet.deviceId })
    .getByRole('button', { name: /Inspect/ });
  await inspect.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Packet details' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Invalid fix');
  await expect(dialog).toContainText('95.000000, 200.000000');
  await expect(dialog).toContainText(packet.connectionId);
  await expect(dialog).toContainText(packet.peer);
  await expect(dialog).toContainText('Vehicle at processing');
  await expect(dialog).toContainText('GMT');
  await expect(dialog.locator('pre')).toHaveText(
    '<script>alert(1)</script>\\r\\n\\x00\\xff'
  );
  await expect(dialog.locator('script')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Hex bytes', exact: true }).click();
  expect((await dialog.locator('pre').innerText()).replace(/\s/g, '')).toBe(
    packet.rawHex
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(inspect).toBeFocused();
  await expect(
    page.getByRole('row').filter({ hasText: 'Unknown' })
  ).toContainText('Fragment');
  await page
    .getByRole('row')
    .filter({ hasText: unavailable.deviceId })
    .getByRole('button', { name: /Inspect/ })
    .click();
  await expect(dialog).toContainText(unavailable.reason);
});

test('older pages pause automatic refresh and manual refresh retains the cursor', async ({
  page
}) => {
  await serveLogs(page);
  await openLogs(page);
  await page.clock.install();
  await page
    .getByRole('checkbox', { name: 'Auto-refresh every 5 seconds' })
    .check();
  await page.getByRole('button', { name: 'Older', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: older.deviceId })
  ).toBeVisible();
  await expect(
    page.getByText('Automatic refresh paused on older pages.')
  ).toBeVisible();
  let reads = 0;
  page.on('request', (request) => {
    if (request.url().includes('/gps/packet-logs')) reads++;
  });
  await page.clock.fastForward(16000);
  expect(reads).toBe(0);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
  await page.clock.fastForward(1000);
  expect(reads).toBe(0);
  const refresh = page.waitForRequest((request) =>
    request.url().includes('/gps/packet-logs')
  );
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  expect(new URL((await refresh).url()).searchParams.get('cursor')).toBe(
    'older-cursor'
  );
  await expect(
    page.getByRole('row').filter({ hasText: older.deviceId })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Newest', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: packet.deviceId })
  ).toBeVisible();
  const auto = page.waitForRequest((request) =>
    request.url().includes('/gps/packet-logs')
  );
  await page.clock.fastForward(5000);
  expect(new URL((await auto).url()).searchParams.has('cursor')).toBe(false);
});

test('filters reset pagination and exact tracker changes never show another tracker cache', async ({
  page
}) => {
  await serveLogs(page);
  await openLogs(page);
  await page.getByRole('button', { name: 'Older', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: older.deviceId })
  ).toBeVisible();
  await page.getByLabel('Search tracker ID', { exact: true }).fill('BROWSER');
  await expect(
    page.getByRole('row').filter({ hasText: packet.deviceId })
  ).toBeVisible();
  await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
  await page.getByLabel('Outcome', { exact: true }).click();
  await page.getByRole('option', { name: 'Invalid fix', exact: true }).click();
  await page.getByLabel('Message kind', { exact: true }).click();
  await page.getByRole('option', { name: 'Position', exact: true }).click();
  await page
    .getByLabel('Received from', { exact: false })
    .fill('2026-11-06T00:00');
  const changed = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname.endsWith('/gps/packet-logs') &&
      new URL(request.url()).searchParams.has('to')
  );
  await page
    .getByLabel('Received to', { exact: false })
    .fill('2026-11-07T00:00');
  const query = new URL((await changed).url()).searchParams;
  expect(Object.fromEntries(query)).toMatchObject({
    search: 'BROWSER',
    outcome: 'invalid_fix',
    kind: 'position',
    limit: '25'
  });
  expect(query.has('cursor')).toBe(false);
  expect(query.get('from')).toMatch(/Z$/);
  await page.goto(`/tracker-logs?deviceId=${packet.deviceId}`);
  await expect(
    page.getByRole('row').filter({ hasText: packet.deviceId })
  ).toBeVisible();
  await page.route('**/api/gps/packet-logs*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      json: { data: [unavailable], count: 1, nextCursor: null }
    });
  });
  await page.goto(`/tracker-logs?deviceId=${unavailable.deviceId}`);
  await expect(
    page.getByRole('row').filter({ hasText: packet.deviceId })
  ).toHaveCount(0);
  await expect(
    page.getByRole('row').filter({ hasText: unavailable.deviceId })
  ).toBeVisible();
});

test('refresh errors retain rows and last successful time; an empty response has its own state', async ({
  page
}) => {
  await serveLogs(page);
  await openLogs(page);
  const successful = page.getByText(/Last successful refresh:/);
  await expect(successful).toBeVisible();
  const before = await successful.innerText();
  await page.route('**/api/gps/packet-logs*', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'OFFLINE', message: 'Packet API unavailable' } }
    })
  );
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Packet API unavailable');
  await expect(
    page.getByRole('row').filter({ hasText: packet.deviceId })
  ).toBeVisible();
  await expect(successful).toHaveText(before);
  await expect(
    page.getByText('No matching packets', { exact: true })
  ).toHaveCount(0);
  await page.route('**/api/gps/packet-logs*', (route) =>
    route.fulfill({ json: { data: [], count: 0, nextCursor: null } })
  );
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    page.getByText('No packets received yet', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Capture starts after the updated gateway is deployed/)
  ).toBeVisible();
  await page.getByLabel('Search tracker ID', { exact: true }).fill('NO-MATCH');
  await expect(
    page.getByText('No matching packets', { exact: true })
  ).toBeVisible();
});

test('initial request failure is visible and mobile packet content stays inside scroll containers', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/gps/packet-logs*', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'OFFLINE', message: 'Packet API unavailable' } }
    })
  );
  await openLogs(page);
  await expect(page.getByRole('alert')).toContainText(
    'Could not load tracker logs'
  );
  await expect(
    page.getByText('No packets received yet', { exact: true })
  ).toHaveCount(0);
  await serveLogs(page);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: packet.deviceId })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  const table = page.locator('[data-slot="table-container"]').first();
  expect(
    await table.evaluate((element) => element.scrollWidth > element.clientWidth)
  ).toBe(true);
  await page
    .getByRole('row')
    .filter({ hasText: packet.deviceId })
    .getByRole('button', { name: /Inspect/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Packet details' });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({
    path: 'e2e/screenshots/tracker-packet-logs-mobile.png',
    fullPage: true
  });
});

test('partially decoded coordinates remain visible in the row and inspector', async ({
  page
}) => {
  await page.route('**/api/gps/packet-logs*', (route) =>
    route.fulfill({
      json: {
        data: [{ ...packet, longitude: null }],
        count: 1,
        nextCursor: null
      }
    })
  );
  await openLogs(page);
  const row = page.getByRole('row').filter({ hasText: packet.deviceId });
  await expect(row).toContainText('95.000000, Unknown longitude');
  await row.getByRole('button', { name: /Inspect/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Packet details' })
  ).toContainText('95.000000, Unknown longitude');
});
