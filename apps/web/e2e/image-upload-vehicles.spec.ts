import { expect, test, type Page } from '@playwright/test';

const branchId = '83000000-0000-4000-8000-000000000001';
const vehicleId = '83000000-0000-4000-8000-000000000002';
const actor = {
  id: '83000000-0000-4000-8000-000000000003',
  email: 'image-admin@example.test',
  fullName: 'Image Administrator',
  role: 'admin',
  status: 'active',
  branchId,
  avatarUrl: null,
  createdAt: '2026-11-12T00:00:00.000Z'
};
const vehicle = {
  id: vehicleId,
  make: 'Toyota',
  model: 'Hiace',
  year: 2024,
  licensePlate: 'PHOTO-001',
  vin: 'PHOTO-ONLY',
  capacity: 10,
  fuelType: 'diesel',
  mileage: 25000,
  status: 'available',
  images: [],
  branchId,
  maintenanceStandardId: null,
  insuranceExpiry: '2027-11-12T00:00:00.000Z',
  registrationExpiry: '2027-11-12T00:00:00.000Z',
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z'
};
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5u8AAAAASUVORK5CYII=',
  'base64'
);
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: png });
async function fixture(page: Page) {
  const writes: string[] = [];
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const send = (json: unknown) => route.fulfill({ json });
    if (path === '/api/auth/me') return send(actor);
    if (path === '/api/auth/refresh')
      return send({ accessToken: 'image-fixture-token' });
    if (path === '/api/auth/test-accounts') return send({ enabled: false });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      if (
        path === `/api/vehicles/${vehicleId}` &&
        request.method() === 'PATCH'
      ) {
        writes.push(request.postDataBuffer()!.toString('latin1'));
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'CONFLICT',
              message: 'Keep the selected photos and retry.'
            }
          }
        });
      }
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'WRITE_BLOCKED',
            message: 'Unexpected business write blocked.'
          }
        }
      });
    }
    if (path === '/api/branches')
      return send({
        data: [
          {
            id: branchId,
            name: 'Fixture Branch',
            location: null,
            archivedAt: null
          }
        ],
        count: 1
      });
    if (path === `/api/vehicles/${vehicleId}`) return send(vehicle);
    if (path === '/api/vehicles') return send({ data: [vehicle], count: 1 });
    if (path === '/api/notifications') return send({ data: [], unread: 0 });
    return send({ data: [], count: 0 });
  });
  return writes;
}

test('vehicle photos preview, append by drop, remove and release temporary previews', async ({
  page
}) => {
  await fixture(page);
  await page.addInitScript(() => {
    const live = new Set<string>();
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      const url = create(value);
      live.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      live.delete(url);
      revoke(url);
    };
    Object.assign(window, { imagePreviewUrls: live });
  });
  await page.goto('/vehicles/add-vehicle');
  await page.locator('#images').setInputFiles(photo('front.png'));
  const uploader = page.locator('[data-slot="image-upload"]');
  await expect(
    uploader.getByRole('img', { name: 'Preview of front.png' })
  ).toBeVisible();
  const transfer = await page.evaluateHandle((data) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File(
        [Uint8Array.from(atob(data), (c) => c.charCodeAt(0))],
        'side.png',
        { type: 'image/png' }
      )
    );
    return dt;
  }, png.toString('base64'));
  await uploader
    .getByRole('button', { name: 'Add photos', exact: true })
    .locator('..')
    .dispatchEvent('drop', { dataTransfer: transfer });
  await expect(
    uploader.getByRole('img', { name: 'Preview of side.png' })
  ).toBeVisible();
  await uploader
    .getByRole('button', { name: 'Remove front.png', exact: true })
    .click();
  await expect(
    uploader.getByRole('img', { name: 'Preview of front.png' })
  ).toHaveCount(0);
  await expect(
    uploader.getByRole('img', { name: 'Preview of side.png' })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { imagePreviewUrls: Set<string> })
            .imagePreviewUrls.size
      )
    )
    .toBe(1);
  // The visible button must also open the native picker with the keyboard.
  const chooser = page.waitForEvent('filechooser');
  await uploader
    .getByRole('button', { name: 'Add photos', exact: true })
    .press('Enter');
  await (await chooser).setFiles(photo('front.png'));
  await expect(
    uploader.getByRole('img', { name: 'Preview of front.png' })
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Vehicles', exact: true })
    .first()
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { imagePreviewUrls: Set<string> })
            .imagePreviewUrls.size
      )
    )
    .toBe(0);
});

test('vehicle photo validation preserves valid choices and enforces upload limits', async ({
  page
}) => {
  await fixture(page);
  await page.goto('/vehicles/add-vehicle');
  await page.locator('#images').setInputFiles(photo('keep.png'));
  const uploader = page.locator('[data-slot="image-upload"]');
  await expect(
    uploader.getByRole('img', { name: 'Preview of keep.png' })
  ).toBeVisible();
  await page.locator('#images').setInputFiles({
    name: 'document.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image')
  });
  await expect(uploader.getByRole('alert')).toContainText('JPG, PNG or WebP');
  await expect(
    uploader.getByRole('img', { name: 'Preview of keep.png' })
  ).toBeVisible();
  await page.locator('#images').setInputFiles({
    name: 'huge.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1)
  });
  await expect(uploader.getByRole('alert')).toContainText('5 MB');
  await expect(
    uploader.getByRole('img', { name: 'Preview of huge.png' })
  ).toHaveCount(0);
  await page
    .locator('#images')
    .setInputFiles(
      Array.from({ length: 11 }, (_, i) => photo(`photo-${i}.png`))
    );
  await expect(uploader.getByRole('alert')).toContainText('10 photos');
  await expect(
    uploader.locator('[data-slot="image-upload-preview"]')
  ).toHaveCount(10);
});

test('vehicle editor keeps top photo preview and exact multipart selection after save failure', async ({
  page
}) => {
  const writes = await fixture(page);
  await page.goto(`/vehicles/${vehicleId}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const uploader = page.locator('[data-slot="image-upload"]');
  await expect(
    page
      .getByRole('region', { name: 'Vehicle overview' })
      .locator('[data-slot="image-upload"]')
  ).toBeVisible();
  await page
    .locator('#newImages')
    .setInputFiles([photo('front.png'), photo('side.png')]);
  await uploader
    .getByRole('button', { name: 'Remove front.png', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Update Vehicle', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Update Vehicle', exact: true })
    .click();
  await expect(
    page.getByText('Keep the selected photos and retry.')
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toContain('name="images"; filename="side.png"');
  expect(writes[0]).not.toContain('filename="front.png"');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(
    uploader.getByRole('img', { name: 'Preview of side.png' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('[data-slot="image-upload-preview"]')).toHaveCount(
    0
  );
});
