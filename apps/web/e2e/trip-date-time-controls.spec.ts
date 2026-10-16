import { expect, test, type Locator, type Page } from '@playwright/test';
import { login } from './helpers';

test.use({ timezoneId: 'Asia/Manila' });

async function firstOption(page: Page, trigger: Locator) {
  await trigger.click();
  await page.getByRole('option').first().click();
}

async function openTripDates(page: Page) {
  await login(page, 'admin');
  await page.goto('/trip-tickets');
  await page.getByRole('button', { name: 'Create Trip Ticket' }).click();
  const dialog = page.getByRole('dialog');
  const group = (name: string) =>
    dialog.getByRole('group').filter({ hasText: name });
  await firstOption(page, group('Branch').getByRole('combobox'));
  await firstOption(
    page,
    group('Department/Office/College').getByRole('combobox')
  );
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await firstOption(page, group('Vehicle').getByRole('combobox'));
  await firstOption(
    page,
    dialog.getByRole('combobox').filter({ hasText: /^Select a driver$/ })
  );
  await dialog.locator('#destination').fill('Calendar control verification');
  await dialog.locator('#purpose').fill('Check the booking date controls');
  await dialog.getByPlaceholder('Participant 1').fill('Test passenger');
  await firstOption(page, dialog.locator('[aria-label="Guide 1"]'));
  await dialog.getByRole('button', { name: 'Continue' }).click();
  return dialog;
}

test('booking calendar supports keyboard choice and preserves its selected day', async ({
  page
}) => {
  const booking = await openTripDates(page);
  const dateTrigger = booking.locator('button[id="dates.0.date"]');
  await expect(dateTrigger).toBeVisible();
  await dateTrigger.click();
  const calendar = page.getByRole('dialog', { name: 'Choose date' });
  await expect(calendar.getByRole('grid')).toBeVisible();
  await expect(
    calendar.getByRole('button', { name: 'Previous month' })
  ).toBeDisabled();
  const initialDay = await calendar
    .locator('button:focus')
    .getAttribute('aria-label');
  await page.keyboard.press('ArrowLeft');
  await expect(calendar.locator('button:focus')).toHaveAttribute(
    'aria-label',
    initialDay!
  );
  // Tomorrow is always enabled, including when the next day changes month.
  await page.keyboard.press('ArrowRight');
  const focusedDay = calendar.locator('button:focus');
  const chosenLabel = await focusedDay.getAttribute('aria-label');
  await page.keyboard.press('Enter');
  await expect(calendar).toBeHidden();
  await expect(dateTrigger).not.toContainText('Choose date');
  await dateTrigger.click();
  await expect(
    calendar.getByRole('button', { name: chosenLabel!, exact: true })
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dateTrigger).toBeFocused();
  await expect(booking.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('booking time controls preserve 24-hour values and enforce the return minimum', async ({
  page
}) => {
  const booking = await openTripDates(page);
  await booking
    .getByRole('combobox', { name: 'Departure time hour', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('option', { name: '08', exact: true })
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('option', { name: '09', exact: true })
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('option', { name: '10', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(booking.locator('input[name="dates.0.start"]')).toHaveValue(
    '10:00'
  );
  await booking
    .getByRole('combobox', { name: 'Departure time minute', exact: true })
    .click();
  await page.getByRole('option', { name: '35', exact: true }).click();
  await booking
    .getByRole('combobox', { name: 'Departure time period', exact: true })
    .click();
  await page.getByRole('option', { name: 'PM', exact: true }).click();
  await expect(booking.locator('input[name="dates.0.start"]')).toHaveValue(
    '22:35'
  );
  await booking
    .getByRole('combobox', { name: 'Return time period', exact: true })
    .click();
  await expect(
    page.getByRole('option', { name: 'AM', exact: true })
  ).toHaveAttribute('data-disabled');
  await page.keyboard.press('Escape');
  await booking
    .getByRole('combobox', { name: 'Return time hour', exact: true })
    .click();
  await page.getByRole('option', { name: '10', exact: true }).click();
  await expect(booking.locator('input[name="dates.0.end"]')).toHaveValue(
    '22:35'
  );
  await booking
    .getByRole('combobox', { name: 'Return time minute', exact: true })
    .click();
  await expect(
    page.getByRole('option', { name: '34', exact: true })
  ).toHaveAttribute('data-disabled');
  await expect(
    page.getByRole('option', { name: '35', exact: true })
  ).not.toHaveAttribute('data-disabled');
  await page.keyboard.press('Escape');
  await expect(booking.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('booking calendar stays inside a narrow mobile viewport', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const booking = await openTripDates(page);
  await booking.locator('button[id="dates.0.date"]').click();
  const calendar = page.getByRole('dialog', { name: 'Choose date' });
  await expect(calendar.getByRole('grid')).toBeVisible();
  const bounds = await calendar.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: testInfo.outputPath('mobile-calendar-light.png'),
    animations: 'disabled'
  });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({
    path: testInfo.outputPath('mobile-calendar-dark.png'),
    animations: 'disabled'
  });
  await page.keyboard.press('Escape');
  await expect(calendar).toBeHidden();
  await expect(
    booking.getByRole('combobox', { name: 'Departure time hour', exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('mobile-time-dark.png'),
    animations: 'disabled'
  });
});
