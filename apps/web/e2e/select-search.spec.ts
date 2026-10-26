import { expect, test, type Locator, type Page } from '@playwright/test';
import { login } from './helpers';

const search = (page: Page) =>
  page.getByRole('combobox', { name: 'Search options', exact: true });

async function firstOption(page: Page, trigger: Locator) {
  await trigger.click();
  await page.getByRole('option').first().click();
}

async function booking(page: Page) {
  await login(page, 'admin');
  await page.goto('/trip-tickets');
  await page.getByRole('button', { name: 'Create Trip Ticket' }).click();
  return page.getByRole('dialog', { name: 'Request Trip Ticket', exact: true });
}

test('selection search filters without losing the selected label and resets on reopen', async ({
  page
}) => {
  const form = await booking(page);
  const branch = form
    .getByRole('group')
    .filter({ hasText: 'Branch' })
    .getByRole('combobox');
  await branch.click();
  await expect(search(page)).toBeVisible();
  const originalCount = await page.getByRole('option').count();
  const label = (await page.getByRole('option').first().innerText()).trim();
  await expect(page.getByRole('option').first()).toBeFocused();
  await page.keyboard.type(label.toUpperCase());
  await expect(search(page)).toHaveValue(label.toUpperCase());
  await expect(page.getByRole('option')).toHaveCount(1);
  await search(page).press('ArrowDown');
  await expect(page.getByRole('option')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(branch).toContainText(label);
  await expect(
    form.getByRole('heading', { name: "Who it's for" })
  ).toBeVisible();
  await branch.click();
  await expect(search(page)).toHaveValue('');
  await search(page).fill('no-such-selection');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'No options found.' })
  ).toBeVisible();
  // Radix hides the booking dialog from accessibility while its popup is open.
  await expect(
    page.locator('#add-trip-ticket-form [data-slot="select-trigger"]').first()
  ).toContainText(label);
  await search(page).press('Tab');
  await expect(
    page.getByRole('button', { name: 'Clear search', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(search(page)).toHaveValue('');
  await expect(page.getByRole('option')).toHaveCount(originalCount);
  await search(page).fill('no-such-selection');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search(page)).toHaveValue('');
  await expect(page.getByRole('option')).toHaveCount(originalCount);
  await search(page).press('Escape');
  await expect(branch).toBeFocused();
});

test('grouped booking and guide choices and mobile time selectors are searchable', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const form = await booking(page);
  const group = (label: string) =>
    form.getByRole('group').filter({ hasText: label });
  await firstOption(page, group('Branch').getByRole('combobox'));
  await firstOption(
    page,
    group('Department/Office/College').getByRole('combobox')
  );
  await form.getByRole('button', { name: 'Continue' }).click();
  const vehicle = form
    .getByRole('combobox')
    .filter({ hasText: /^Select a vehicle$/ });
  await vehicle.click();
  const vehiclePicker = page.getByRole('dialog', {
    name: 'Choose a vehicle',
    exact: true
  });
  const labels = (await vehiclePicker.getByRole('option').first().innerText())
    .trim()
    .split('\n');
  const vehicleName = labels[0];
  const vehiclePlate = labels[1].split(' · ')[0];
  const vehicleSearch = vehiclePicker.getByRole('searchbox', {
    name: 'Search vehicles'
  });
  await vehicleSearch.fill(vehiclePlate.toLowerCase());
  await expect(vehiclePicker.getByRole('option')).toHaveCount(1);
  await vehicleSearch.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(group('Vehicle').getByRole('combobox')).toContainText(
    vehicleName
  );
  await expect(group('Vehicle').getByRole('combobox')).toContainText(
    vehiclePlate
  );
  await firstOption(
    page,
    form.getByRole('combobox').filter({ hasText: /^Select a driver$/ })
  );
  const guide = form.locator('[aria-label="Guide 1"]');
  await guide.click();
  await search(page).fill('REQUESTER');
  await expect(page.getByRole('option').first()).toContainText(/requester/i);
  await search(page).press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(guide).toContainText(/requester/i);
  await form.locator('#destination').fill('Searchable controls verification');
  await form.locator('#purpose').fill('Check shared selection controls');
  await form.getByPlaceholder('Participant 1').fill('Test passenger');
  await form.getByRole('button', { name: 'Continue' }).click();
  const minute = form.getByRole('combobox', {
    name: 'Departure time minute',
    exact: true
  });
  await minute.click();
  await search(page).fill('35');
  await expect(page.getByRole('option')).toHaveCount(1);
  await search(page).press('Enter');
  await expect(minute).toContainText('35');
  await expect(form.locator('input[name="dates.0.start"]')).toHaveValue(
    '08:35'
  );
  await expect(
    form.getByRole('heading', { name: 'When', exact: true })
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await minute.click();
    const popup = page.getByRole('dialog', { name: 'Choose an option' });
    const list = popup.getByRole('listbox');
    const metrics = await list.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));
    await testInfo.attach(`minute-scroll-${width}.json`, {
      body: JSON.stringify(metrics),
      contentType: 'application/json'
    });
    expect(metrics.clientHeight).toBeGreaterThan(0);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    await list.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(
      page.getByRole('option', { name: '00', exact: true })
    ).toBeInViewport();
    await list.hover();
    await page.mouse.wheel(0, 2500);
    await expect(
      page.getByRole('option', { name: '59', exact: true })
    ).toBeInViewport();
    await expect(search(page)).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(`searchable-minutes-${width}.png`),
      animations: 'disabled'
    });
    await page.getByRole('option', { name: '59', exact: true }).click();
    await expect(minute).toContainText('59');
  }
});

test('account role selections share the same case-insensitive search', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/user-management/add-user');
  const role = page.locator('#signup-role');
  await role.click();
  await search(page).fill('requester');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toHaveText('Requester');
  await search(page).press('Enter');
  await expect(role).toContainText('Requester');
});

test.describe('touch selection search', () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 }
  });

  test('touch opens search and chooses a filtered option', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/user-management/add-user');
    const role = page.locator('#signup-role');
    await role.tap();
    await expect(search(page)).toBeVisible();
    await search(page).tap();
    await search(page).fill('requester');
    await page.getByRole('option', { name: 'Requester', exact: true }).tap();
    await expect(role).toContainText('Requester');
  });
});
