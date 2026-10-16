import { expect, test, type Locator, type Page } from '@playwright/test';
import { login } from './helpers';

const vehicleId = '99999999-9999-4999-8999-999999999991';
const branchId = '88888888-8888-4888-8888-888888888881';
const vehicle = {
  id: vehicleId,
  make: 'Toyota',
  model: 'Hiace',
  year: 2022,
  licensePlate: 'LAY-2022',
  vin: 'JTFSS22P500123456',
  capacity: 15,
  fuelType: 'diesel',
  mileage: 42350,
  status: 'available',
  images: [] as string[],
  branchId,
  maintenanceStandardId: null,
  insuranceExpiry: '2027-05-12T00:00:00.000Z',
  registrationExpiry: '2027-06-14T00:00:00.000Z',
  latitude: null,
  longitude: null,
  lastLocationUpdate: null,
  createdAt: '2022-01-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z'
};

// Only reads are replaced. The real page, auth and image interactions run in
// the browser, without creating or changing records in the development DB.
async function fixture(
  page: Page,
  images: string[] = [],
  missingPhotoResponse?: Promise<void>
) {
  await page.route(`**/api/vehicles/${vehicleId}`, (route) =>
    route.fulfill({ json: { ...vehicle, images } })
  );
  await page.route(/\/api\/branches(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: branchId,
            name: 'Main Campus',
            location: 'Davao City',
            archivedAt: null
          }
        ],
        count: 1
      }
    })
  );
  await page.route('**/api/analytics/predictive-maintenance*', (route) =>
    route.fulfill({ json: { data: [], count: 0 } })
  );
  await page.route(/\/api\/tracker-devices(?:\?|$)/, (route) =>
    route.fulfill({ json: { data: [], count: 0 } })
  );
  await page.route('**/vehicle-layout-photo-*.svg', async (route) => {
    if (route.request().url().endsWith('missing.svg')) {
      await missingPhotoResponse;
      await route.fulfill({ status: 404, body: 'Image not found' });
    } else {
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#9aa7af"/><path d="M120 280V170h350l50 110z" fill="#fff"/></svg>'
      });
    }
  });
  await page.goto(`/vehicles/${vehicleId}`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Toyota Hiace 2022',
      exact: true
    })
  ).toBeVisible();
}

async function expectField(scope: Locator, label: string, value: string) {
  const field = scope.locator('dl > div').filter({
    has: scope.page().locator('dt', { hasText: new RegExp(`^${label}$`) })
  });
  await expect(field.locator('dd')).toHaveText(value);
}

async function expectFrameFillsHeader(overview: Locator, frame: Locator) {
  const content = await overview.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      top:
        box.top +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.paddingTop),
      bottom:
        box.bottom -
        parseFloat(style.borderBottomWidth) -
        parseFloat(style.paddingBottom)
    };
  });
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.y - content.top)).toBeLessThan(2);
  expect(Math.abs(box!.y + box!.height - content.bottom)).toBeLessThan(2);
}

test('missing photos reserve the UM logo frame and all vehicle facts remain readable', async ({
  page
}) => {
  await login(page, 'admin');
  await fixture(page);
  const overview = page.getByRole('region', { name: 'Vehicle overview' });
  const placeholder = overview.getByRole('img', {
    name: /no vehicle photo available.*University of Mindanao logo/i
  });
  await expect(placeholder).toHaveAttribute('src', '/logo/mms-logo.png');
  await expect(placeholder).toHaveCSS('object-fit', 'contain');
  expect(
    await placeholder.evaluate((image) =>
      parseFloat(getComputedStyle(image).paddingTop)
    )
  ).toBeGreaterThan(0);
  await expect(
    overview.getByRole('button', { name: /View vehicle photo/ })
  ).toHaveCount(0);
  await expect(overview.getByText('Ready', { exact: true })).toBeVisible();
  await expectField(overview, 'Mileage', '42,350 km');
  await expectField(overview, 'Fuel Type', 'Diesel');
  await expectField(overview, 'Seats', '15');
  const details = page.getByRole('region', {
    name: 'Vehicle details',
    exact: true
  });
  for (const [label, value] of [
    ['Make', 'Toyota'],
    ['Model', 'Hiace'],
    ['Year', '2022'],
    ['Plate', 'LAY-2022'],
    ['VIN', 'JTFSS22P500123456'],
    ['Branch', 'Main Campus']
  ]) {
    await expectField(details, label, value);
  }
  const documents = page.getByRole('region', {
    name: 'Documents',
    exact: true
  });
  await expectField(documents, 'Insurance Expiry', '5/12/2027');
  await expectField(documents, 'Registration Expiry', '6/14/2027');
  await expect(
    page.getByRole('heading', { name: 'GPS Tracker' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Delete vehicle', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(
    overview.getByRole('button', { name: /Remove photo/ })
  ).toHaveCount(0);
  await placeholder.click();
  await expect(
    page.getByRole('dialog', { name: 'Vehicle photos' })
  ).toHaveCount(0);
});

test('photos can be viewed and removing a photo stays local until an edit is saved', async ({
  page
}) => {
  await login(page, 'admin');
  await fixture(page, [
    '/vehicle-layout-photo-1.svg',
    '/vehicle-layout-photo-2.svg'
  ]);
  await page
    .getByRole('button', { name: 'View vehicle photo 1', exact: true })
    .click();
  const gallery = page.getByRole('dialog', { name: 'Vehicle photos' });
  await expect(gallery.getByText('1 of 2', { exact: true })).toBeVisible();
  await gallery.getByRole('button', { name: 'Next photo' }).click();
  await expect(gallery.getByRole('img')).toHaveAttribute(
    'src',
    /photo-2\.svg$/
  );
  await expect(gallery.getByText('2 of 2', { exact: true })).toBeVisible();
  await gallery.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('button', { name: 'Remove photo 1', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'View vehicle photo 2', exact: true })
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('button', { name: 'View vehicle photo 1', exact: true })
      .locator('img')
  ).toHaveAttribute('src', /photo-2\.svg$/);
  await expect(page.getByLabel('Add New Images')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'View vehicle photo 2', exact: true })
  ).toBeVisible();
});

test('gallery skips a failed photo in both directions and preserves the current valid photo', async ({
  page
}) => {
  await login(page, 'admin');
  let failPhoto!: () => void;
  const missingPhotoResponse = new Promise<void>((resolve) => {
    failPhoto = resolve;
  });
  await fixture(
    page,
    [
      '/vehicle-layout-photo-1.svg',
      '/vehicle-layout-photo-missing.svg',
      '/vehicle-layout-photo-3.svg'
    ],
    missingPhotoResponse
  );
  await page
    .getByRole('button', { name: 'View vehicle photo 1', exact: true })
    .click();
  const gallery = page.getByRole('dialog', { name: 'Vehicle photos' });
  await expect(gallery.getByRole('img')).toHaveAttribute(
    'src',
    /photo-1\.svg$/
  );
  failPhoto();
  await expect(
    page.locator(
      'section[aria-label="Vehicle overview"] img[alt*="no vehicle photo available"]'
    )
  ).toBeAttached();
  await expect(gallery.getByRole('img')).toHaveAttribute(
    'src',
    /photo-1\.svg$/
  );
  await gallery.getByRole('button', { name: 'Next photo' }).click();
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole('img')).toHaveAttribute(
    'src',
    /photo-3\.svg$/
  );
  await expect(gallery.getByText('2 of 2', { exact: true })).toBeVisible();
  await gallery.getByRole('button', { name: 'Previous photo' }).click();
  await expect(gallery.getByRole('img')).toHaveAttribute(
    'src',
    /photo-1\.svg$/
  );
  await expect(
    gallery.getByRole('button', { name: 'Previous photo' })
  ).toBeDisabled();
});

test('an unavailable stored photo uses the same noninteractive UM logo fallback', async ({
  page
}) => {
  await login(page, 'admin');
  await fixture(page, ['/vehicle-layout-photo-missing.svg']);
  const overview = page.getByRole('region', { name: 'Vehicle overview' });
  const placeholder = overview.getByRole('img', {
    name: /no vehicle photo available.*University of Mindanao logo/i
  });
  await expect(placeholder).toHaveAttribute('src', '/logo/mms-logo.png');
  await expect(placeholder).toHaveCSS('object-fit', 'contain');
  await expectFrameFillsHeader(overview, placeholder);
  await expect(
    overview.getByRole('button', { name: /View vehicle photo/ })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(
    overview.getByRole('button', { name: /Remove photo/ })
  ).toHaveCount(0);
  await placeholder.click();
  await expect(
    page.getByRole('dialog', { name: 'Vehicle photos' })
  ).toHaveCount(0);
});

test('non-admin users cannot enter vehicle or tracker management', async ({
  page
}) => {
  await login(page, 'evp');
  await page.goto(`/vehicles/${vehicleId}`);
  await page.waitForURL(/\/dashboard/);
  await expect(
    page.getByRole('region', { name: 'Vehicle overview' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Delete vehicle', exact: true })
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'GPS Tracker' })).toHaveCount(
    0
  );
});

for (const width of [1280, 900]) {
  test(`vehicle photo and logo frames fill the identity header height at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, 'admin');
    await fixture(page);
    const overview = page.getByRole('region', { name: 'Vehicle overview' });
    const placeholder = overview.getByRole('img', {
      name: /no vehicle photo available.*University of Mindanao logo/i
    });
    await expect(placeholder).toBeVisible();
    await expectFrameFillsHeader(overview, placeholder);
    await fixture(page, ['/vehicle-layout-photo-1.svg']);
    const photo = overview.getByRole('button', {
      name: 'View vehicle photo 1',
      exact: true
    });
    await expectFrameFillsHeader(overview, photo);
    await expect(photo.locator('img')).toHaveCSS('object-fit', 'cover');
    await overview.screenshot({
      path: `/tmp/mms-vehicle-photo-height-${width}.png`
    });

    await fixture(page, [
      '/vehicle-layout-photo-1.svg',
      '/vehicle-layout-photo-2.svg',
      '/vehicle-layout-photo-3.svg',
      '/vehicle-layout-photo-4.svg',
      '/vehicle-layout-photo-5.svg',
      '/vehicle-layout-photo-6.svg'
    ]);
    await expect(
      overview.getByRole('button', {
        name: 'View vehicle photo 6',
        exact: true
      })
    ).toBeAttached();
    const galleryBox = await overview.boundingBox();
    expect(galleryBox).not.toBeNull();
    expect(galleryBox!.height).toBeLessThan(360);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await overview.screenshot({
      path: `/tmp/mms-vehicle-photo-thumbnails-${width}.png`
    });
  });
}

for (const [width, theme] of [
  [1280, 'light'],
  [390, 'dark']
] as const) {
  test(`vehicle overview stays compact and fits the ${width}px ${theme} viewport`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      (value) => localStorage.setItem('theme', value),
      theme
    );
    await login(page, 'admin');
    await fixture(page);
    const overview = page.getByRole('region', { name: 'Vehicle overview' });
    const placeholder = overview.getByRole('img', {
      name: /no vehicle photo available.*University of Mindanao logo/i
    });
    await expect(placeholder).toBeVisible();
    const box = await overview.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(width > 640 ? 320 : 560);
    if (width < 640) {
      const placeholderBox = await placeholder.boundingBox();
      expect(placeholderBox!.height).toBeLessThan(180);
    }
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/mms-vehicle-details-${width}.png`,
      fullPage: true
    });

    await fixture(page, [
      '/vehicle-layout-photo-1.svg',
      '/vehicle-layout-photo-2.svg',
      '/vehicle-layout-photo-3.svg',
      '/vehicle-layout-photo-4.svg',
      '/vehicle-layout-photo-5.svg',
      '/vehicle-layout-photo-6.svg'
    ]);
    await expect(
      overview.getByRole('button', {
        name: 'View vehicle photo 1',
        exact: true
      })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/mms-vehicle-details-photos-${width}.png`,
      fullPage: true
    });
  });
}
