import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

// Expand read responses only. These checks never create or update fleet records.
async function openLargeRoster(page: Page) {
  await login(page, 'admin');
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET' && !path.startsWith('/api/auth/')) {
      throw new Error(`Unexpected business write: ${request.method()} ${path}`);
    }
    if (
      request.method() === 'GET' &&
      /^\/api\/(vehicles|drivers)$/.test(path)
    ) {
      const response = await route.fetch();
      const body = await response.json();
      const templates = body.data;
      const main = templates[0].branchId;
      const other = templates.find(
        (row: { branchId: string }) => row.branchId !== main
      )?.branchId;
      expect(other, 'Fixture needs two branches').toBeTruthy();
      const vehicles = path.endsWith('/vehicles');
      const data = Array.from({ length: 181 }, (_, index) => ({
        ...templates[0],
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        branchId: index < 90 ? main : other,
        ...(vehicles
          ? {
              make: 'Fleet',
              model: `Van ${String(index).padStart(3, '0')}`,
              licensePlate: `TEST-${index}`,
              capacity: 40,
              status: index === 180 ? 'maintenance' : 'available'
            }
          : {
              fullName: `Roster Driver ${String(index).padStart(3, '0')}`,
              status: index === 180 ? 'inactive' : 'active'
            })
      }));
      await route.fulfill({ response, json: { data, count: data.length } });
      return;
    }
    await route.continue();
  });
  await page.goto('/trip-tickets');
  await page.getByRole('button', { name: 'Create Trip Ticket' }).click();
  const form = page.getByRole('dialog', {
    name: 'Request Trip Ticket',
    exact: true
  });
  for (const label of ['Branch', 'Department/Office/College']) {
    await form
      .getByRole('group')
      .filter({ hasText: label })
      .getByRole('combobox')
      .click();
    await page.getByRole('option').first().click();
  }
  await form.getByRole('button', { name: 'Continue' }).click();
  return form;
}

test('large vehicle and driver rosters support search, paging, selection and dismissal', async ({
  page
}) => {
  const form = await openLargeRoster(page);
  const vehicle = form.locator('#vehicle_id');
  await vehicle.click();
  const picker = page.getByRole('dialog', {
    name: 'Choose a vehicle',
    exact: true
  });
  await expect(picker).toBeVisible();
  const search = picker.getByRole('searchbox', { name: 'Search vehicles' });
  await expect(search).toBeFocused();
  await expect(picker.getByRole('option')).toHaveCount(10);
  await expect(picker.getByRole('status')).toContainText('180 vehicles');
  await picker.getByRole('button', { name: /This branch/ }).click();
  await expect(picker.getByRole('status')).toContainText('90 vehicles');
  await picker.getByRole('button', { name: /Other branches/ }).click();
  await expect(picker.getByRole('status')).toContainText('90 vehicles');
  await expect(picker.getByRole('option').first()).toContainText('Borrow');
  await picker.getByRole('button', { name: /^All / }).click();
  await search.press('ArrowDown');
  await page.keyboard.press('End');
  await expect(picker.getByRole('option').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(picker.getByRole('option').first()).toBeFocused();
  await picker.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(picker.getByText('Page 2 of 18', { exact: true })).toBeVisible();
  await search.fill('test-179');
  await expect(picker.getByRole('option')).toHaveCount(1);
  await expect(picker.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await search.press('ArrowDown');
  await expect(picker.getByRole('option')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(vehicle).toContainText('Fleet Van 179');
  await vehicle.press('Enter');
  await search.fill('test-180');
  await expect(picker.getByRole('option')).toHaveCount(0);
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(vehicle).toBeFocused();
  await expect(vehicle).toContainText('Fleet Van 179');
  await expect(
    form.getByRole('heading', { name: 'The trip', exact: true })
  ).toBeVisible();
  await vehicle.click();
  await expect(search).toHaveValue('');
  await search.fill('test-179');
  await expect(picker.getByRole('option')).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await search.fill('not-a-vehicle');
  await expect(picker.getByRole('option')).toHaveCount(0);
  await expect(
    picker.getByText('No vehicles match your search.')
  ).toBeVisible();
  await picker
    .getByRole('button', { name: 'Clear search', exact: true })
    .click();
  await expect(picker.getByRole('option')).toHaveCount(10);
  await page.keyboard.press('Escape');
  await expect(vehicle).toBeFocused();
  await expect(vehicle).toContainText('Fleet Van 179');
  const driver = form.locator('#driver_id');
  await driver.click();
  const drivers = page.getByRole('dialog', {
    name: 'Choose a driver',
    exact: true
  });
  await expect(drivers.getByRole('status')).toContainText('180 drivers');
  await drivers.getByRole('button', { name: /Other branches/ }).click();
  await expect(drivers.getByRole('status')).not.toContainText('180 drivers');
  await drivers.getByRole('button', { name: /^All / }).click();
  await drivers.getByRole('searchbox').fill('roster driver 180');
  await expect(drivers.getByRole('option')).toHaveCount(0);
  await drivers.getByRole('searchbox').fill('roster driver 179');
  await drivers.getByRole('searchbox').press('Enter');
  await expect(drivers).toBeVisible(); // Search must not advance the booking wizard.
  await drivers.getByRole('searchbox').press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(driver).toContainText('Roster Driver 179');
  await expect(
    form.getByRole('heading', { name: 'The trip', exact: true })
  ).toBeVisible();
});

test('resource pickers stay bounded with visible search and paging across screen sizes and themes', async ({
  page
}, testInfo) => {
  test.setTimeout(60_000);
  const form = await openLargeRoster(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) =>
        document.documentElement.classList.toggle('dark', value === 'dark'),
      theme
    );
    for (const [width, height] of [
      [360, 640],
      [390, 844],
      [640, 360],
      [768, 700],
      [1280, 800],
      [1920, 1080]
    ]) {
      await page.setViewportSize({ width, height });
      for (const kind of ['vehicle', 'driver']) {
        await form.locator(`#${kind}_id`).click();
        const picker = page.getByRole('dialog', {
          name: `Choose a ${kind}`,
          exact: true
        });
        const bounds = await picker.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
        await expect(picker.getByRole('searchbox')).toBeInViewport();
        await expect(
          picker.getByRole('button', { name: 'Next page', exact: true })
        ).toBeInViewport();
        expect(
          await picker.evaluate(
            (element) => element.scrollWidth <= element.clientWidth
          )
        ).toBeTruthy();
        const first = await picker.getByRole('option').first().boundingBox();
        expect(first!.height).toBeGreaterThanOrEqual(44);
        await page.screenshot({
          path: testInfo.outputPath(`${kind}s-${theme}-${width}.png`),
          animations: 'disabled'
        });
        await picker.getByRole('option').last().scrollIntoViewIfNeeded();
        await expect(picker.getByRole('searchbox')).toBeInViewport();
        await expect(
          picker.getByRole('button', { name: 'Next page', exact: true })
        ).toBeInViewport();
        await page.keyboard.press('Escape');
        await expect(form.locator(`#${kind}_id`)).toBeFocused();
      }
    }
  }
});
