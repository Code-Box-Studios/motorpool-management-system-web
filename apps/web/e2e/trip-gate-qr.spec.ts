import {
  expect,
  test as baseTest,
  type APIRequestContext
} from '@playwright/test';
import { apiGet, apiLogin, CREDENTIALS, listData, login } from './helpers';
import QRCode from 'qrcode';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A real Chromium camera stream decodes the printed ticket UUID. Generate its
// YUV frame before browser launch and remove it when the worker finishes.
const test = baseTest.extend<object, { qrCameraPath: string }>({
  qrCameraPath: [
    // Playwright requires destructured fixture dependencies.
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      const cameraDir = mkdtempSync(join(tmpdir(), 'mms-gate-camera-'));
      const cameraPath = join(cameraDir, 'ticket.y4m');
      const size = 640;
      const qr = QRCode.create('11111111-1111-4111-8111-111111111111');
      const scale = Math.floor(size / (qr.modules.size + 8));
      const inset = Math.floor((size - qr.modules.size * scale) / 2);
      const luminance = Buffer.alloc(size * size, 235);
      for (let row = 0; row < qr.modules.size; row++) {
        for (let col = 0; col < qr.modules.size; col++) {
          if (!qr.modules.get(row, col)) continue;
          for (let y = 0; y < scale; y++) {
            const start =
              (inset + row * scale + y) * size + inset + col * scale;
            luminance.fill(16, start, start + scale);
          }
        }
      }
      const frame = Buffer.concat([
        Buffer.from('FRAME\n'),
        luminance,
        Buffer.alloc((size * size) / 2, 128)
      ]);
      writeFileSync(
        cameraPath,
        Buffer.concat([
          Buffer.from(
            `YUV4MPEG2 W${size} H${size} F5:1 Ip A0:0 C420jpeg XYSCSS=420JPEG\n`
          ),
          frame,
          frame,
          frame,
          frame,
          frame
        ])
      );
      try {
        await provide(cameraPath);
      } finally {
        rmSync(cameraDir, { recursive: true, force: true });
      }
    },
    { scope: 'worker' }
  ],
  launchOptions: async ({ qrCameraPath }, provide) => {
    await provide({
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${qrCameraPath}`
      ]
    });
  }
});
test.use({ permissions: ['camera'] });

async function fixture(request: APIRequestContext) {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const drivers = listData(await apiGet(request, '/api/drivers', admin.token));
  const vehicles = listData(
    await apiGet(request, '/api/vehicles', admin.token)
  );
  const now = Date.now();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ticketNo: 7001,
    branchId: drivers[0]!.branchId,
    driverId: drivers[0]!.id,
    vehicleId: vehicles[0]!.id,
    destination: 'QR camera audit',
    purpose: 'Read-only browser probe',
    dateRequested: new Date(now).toISOString(),
    preparedBy: '',
    status: 'approved',
    guides: [],
    participants: [],
    fuelAllocation: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    startTs: new Date(now - 3600000).toISOString(),
    endTs: new Date(now + 3600000).toISOString(),
    dates: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        status: 'scheduled',
        startTs: new Date(now - 3600000).toISOString(),
        endTs: new Date(now + 3600000).toISOString(),
        startMileage: null,
        endMileage: null,
        preTripCheckedAt: null,
        postTripCheckedAt: null
      }
    ]
  };
}

test('real QR decoding allows confirm, sends one departure and one return, then removes completed ticket', async ({
  page,
  request
}) => {
  const base = await fixture(request);
  const calls: string[] = [];
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/api/trip-tickets?*', (route) =>
    route.fulfill({ json: { data: [base], count: 1 } })
  );
  await page.route(
    /\/api\/trip-tickets\/[^/]+\/check-(out|in)$/,
    async (route) => {
      const departure = route.request().url().endsWith('check-out');
      calls.push(departure ? 'out' : 'in');
      expect(route.request().postDataJSON()).toEqual({
        dateId: base.dates[0]!.id
      });
      base.status = departure ? 'in_progress' : 'completed';
      base.dates[0]!.status = base.status;
      await route.fulfill({ json: base });
    }
  );
  await login(page, 'guard');
  await page
    .getByRole('button', { name: 'Scan QR to time out', exact: true })
    .click();
  let dialog = page.getByRole('dialog', {
    name: 'Scan to time out',
    exact: true
  });
  await expect(dialog.getByText(/QR verified/)).toBeVisible({ timeout: 15000 });
  await dialog.getByRole('button', { name: 'Time out', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Scan QR to time in', exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Scan QR to time in', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Scan to time in', exact: true });
  await expect(dialog.getByText(/QR verified/)).toBeVisible({ timeout: 15000 });
  await dialog.getByRole('button', { name: 'Time in', exact: true }).click();
  await expect(page.getByText('No trips waiting at the gate.')).toBeVisible();
  expect(calls).toEqual(['out', 'in']);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
});

test('wrong QR keeps confirmation disabled and sends no gate request', async ({
  page,
  request
}) => {
  const base = await fixture(request);
  base.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let gateCalls = 0;
  await page.route('**/api/trip-tickets?*', (route) =>
    route.fulfill({ json: { data: [base], count: 1 } })
  );
  await page.route(
    /\/api\/trip-tickets\/[^/]+\/check-(out|in)$/,
    async (route) => {
      gateCalls++;
      await route.abort();
    }
  );
  await login(page, 'guard');
  await page
    .getByRole('button', { name: 'Scan QR to time out', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Scan to time out',
    exact: true
  });
  await expect(
    dialog.getByText('That QR code does not match the selected trip ticket.')
  ).toBeVisible({ timeout: 15000 });
  await expect(
    dialog.getByRole('button', { name: 'Time out', exact: true })
  ).toBeDisabled();
  expect(gateCalls).toBe(0);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Scan QR to time out', exact: true })
  ).toBeFocused();
});

for (const action of ['check-out', 'check-in'] as const) {
  test(`${action} keeps the selected outing through a query refresh`, async ({
    page,
    request
  }) => {
    const base = await fixture(request);
    if (action === 'check-in') {
      base.status = 'in_progress';
      base.dates[0]!.status = 'in_progress';
    }
    const originalDateId = base.dates[0]!.id;
    const replacement = structuredClone(base);
    replacement.dates[0]!.id = '33333333-3333-4333-8333-333333333333';
    replacement.destination = 'Refreshed outing at gate';
    let record = base;
    let captured: unknown;
    await page.route('**/api/trip-tickets?*', (route) =>
      route.fulfill({ json: { data: [record], count: 1 } })
    );
    await page.route(
      `**/api/trip-tickets/${base.id}/${action}`,
      async (route) => {
        captured = route.request().postDataJSON();
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'OUTING_CHANGED',
              message:
                'The selected outing is no longer eligible; reload before confirming'
            }
          }
        });
      }
    );
    await login(page, 'guard');
    const returnTrip = action === 'check-in';
    await page
      .getByRole('button', {
        name: returnTrip ? 'Scan QR to time in' : 'Scan QR to time out',
        exact: true
      })
      .click();
    const dialog = page.getByRole('dialog', {
      name: returnTrip ? 'Scan to time in' : 'Scan to time out',
      exact: true
    });
    await expect(dialog.getByText(/QR verified/)).toBeVisible({
      timeout: 15000
    });
    record = replacement;
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
      page.getByRole('cell', {
        name: replacement.destination,
        exact: true,
        includeHidden: true
      })
    ).toBeVisible();
    await dialog
      .getByRole('button', {
        name: returnTrip ? 'Time in' : 'Time out',
        exact: true
      })
      .click();
    await expect.poll(() => captured).toEqual({ dateId: originalDateId });
    await expect(dialog.getByRole('alert')).toContainText(
      'The selected outing is no longer eligible'
    );
    await expect(dialog).toBeVisible();
  });
}
