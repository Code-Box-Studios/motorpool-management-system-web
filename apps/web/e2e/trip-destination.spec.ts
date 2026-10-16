import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

async function openTripStep(page: Page) {
  await login(page, 'admin');
  await page.goto('/trip-tickets');
  await page.getByRole('button', { name: 'Create Trip Ticket' }).click();
  const booking = page.getByRole('dialog', { name: 'Request Trip Ticket' });
  const branch = booking.getByRole('group').filter({ hasText: /^Branch/ });
  await branch.getByRole('combobox').click();
  await page.getByRole('option').first().click();
  const office = booking
    .getByRole('group')
    .filter({ hasText: /^Department\/Office\/College/ });
  await office.getByRole('combobox').click();
  await page.getByRole('option').first().click();
  await booking.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(booking.locator('#destination')).toBeVisible();
  return booking;
}

test('typing a destination suggests places and selecting one sets the map pin', async ({
  page
}) => {
  await page.route('https://photon.komoot.io/api/**', (route) =>
    route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [125.8078, 7.4478] },
            properties: {
              name: 'Tagum City Hall',
              city: 'Tagum',
              state: 'Davao del Norte',
              countrycode: 'PH'
            }
          }
        ]
      }
    })
  );
  const booking = await openTripStep(page);
  const destination = booking.locator('#destination');
  await destination.fill('Tagum');
  await expect(
    booking.getByRole('option', {
      name: 'Tagum City Hall, Tagum, Davao del Norte'
    })
  ).toBeVisible();
  await destination.press('ArrowDown');
  await destination.press('Enter');
  await expect(destination).toHaveValue(
    'Tagum City Hall, Tagum, Davao del Norte'
  );
  await expect(
    booking.getByText('Pin selected · 7.44780, 125.80780')
  ).toBeVisible();
  await booking.getByRole('button', { name: 'Open map', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose destination' });
  await expect(picker.getByLabel('Selected coordinates')).toHaveText(
    '7.44780, 125.80780'
  );
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await destination.fill('A place without a map entry');
  await expect(booking.getByText(/Pin selected/)).toHaveCount(0);
});

test('map search, pin adjustment and cancel preserve the confirmed destination', async ({
  page
}) => {
  await page.route('https://photon.komoot.io/api/**', (route) =>
    route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [125.8078, 7.4478] },
            properties: {
              name: 'Tagum City Hall',
              city: 'Tagum',
              state: 'Davao del Norte',
              countrycode: 'PH'
            }
          }
        ]
      }
    })
  );
  const booking = await openTripStep(page);
  await booking.locator('#destination').fill('Previous destination');
  await booking
    .getByRole('button', { name: 'Open map', exact: true })
    .press('Enter');
  const picker = page.getByRole('dialog', { name: 'Choose destination' });
  const search = picker.getByRole('combobox', {
    name: 'Search destination map'
  });
  await search.fill('Tagum');
  await expect(
    picker.getByRole('option', {
      name: 'Tagum City Hall, Tagum, Davao del Norte'
    })
  ).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');
  const coordinates = picker.getByLabel('Selected coordinates');
  await expect(coordinates).toHaveText('7.44780, 125.80780');
  const zoomRequest = page.waitForRequest(
    (request) => /tile\.openstreetmap\.org\/15\//.test(request.url()),
    { timeout: 8_000 }
  );
  await picker
    .getByRole('button', { name: 'Zoom in', exact: true })
    .press('Enter');
  await zoomRequest;
  await picker.getByRole('button', { name: 'Use this destination' }).click();
  await expect(picker).toBeHidden();
  await expect(
    booking.getByRole('button', { name: 'Open map', exact: true })
  ).toBeFocused();
  await expect(booking.locator('#destination')).toHaveValue(
    'Tagum City Hall, Tagum, Davao del Norte'
  );
  await booking.getByRole('button', { name: 'Open map', exact: true }).click();
  await expect(coordinates).toHaveText('7.44780, 125.80780');
  const map = picker.getByRole('region', { name: 'Destination map' });
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  await map.click({ position: { x: box!.width * 0.7, y: box!.height * 0.65 } });
  await expect(coordinates).not.toHaveText('7.44780, 125.80780');
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(booking.locator('#destination')).toHaveValue(
    'Tagum City Hall, Tagum, Davao del Norte'
  );
  await booking.getByRole('button', { name: 'Open map', exact: true }).click();
  await expect(coordinates).toHaveText('7.44780, 125.80780');
  const marker = picker.locator('.leaflet-marker-icon');
  const markerBox = await marker.boundingBox();
  expect(markerBox).not.toBeNull();
  await page.mouse.move(markerBox!.x + markerBox!.width / 2, markerBox!.y + 12);
  await page.mouse.down();
  await page.mouse.move(markerBox!.x + 70, markerBox!.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect(coordinates).not.toHaveText('7.44780, 125.80780');
  const moved = await coordinates.textContent();
  await picker.getByRole('button', { name: 'Use this destination' }).click();
  await booking.getByRole('button', { name: 'Open map', exact: true }).click();
  await expect(coordinates).toHaveText(moved!);
});

test('map search failure still allows pinning and free-text destinations on mobile', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://photon.komoot.io/api/**', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' })
  );
  const booking = await openTripStep(page);
  await booking.getByRole('button', { name: 'Open map', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose destination' });
  await expect(
    picker.getByRole('button', { name: 'Use this destination' })
  ).toBeDisabled();
  await picker
    .getByRole('combobox', { name: 'Search destination map' })
    .fill('Tagum');
  await expect(picker.getByText(/Search is unavailable/)).toBeVisible();
  const map = picker.getByRole('region', { name: 'Destination map' });
  const box = await map.boundingBox();
  expect(box!.height).toBeGreaterThan(250);
  await map.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await picker.getByRole('button', { name: 'Use this destination' }).click();
  await expect(booking.locator('#destination')).toHaveValue('Tagum');
  await booking.locator('#destination').fill('Barangay meeting hall');
  await expect(booking.locator('#destination')).toHaveValue(
    'Barangay meeting hall'
  );
  await expect(booking.locator('.leaflet-container')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBeTruthy();
});
