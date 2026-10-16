import { test, expect } from '@playwright/test';
import { login } from './helpers';

for (const width of [1280, 390]) {
  test(`filter popover keeps list controls compact and usable at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, 'admin');
    await page.goto('/job-order');
    const trigger = page.getByRole('button', {
      name: /^Filters: Status, Repair type$/
    });
    await expect(
      page.getByRole('combobox', { name: 'Filter by status' })
    ).toHaveCount(0);
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Filters', exact: true });
    await panel.getByRole('combobox', { name: 'Filter by status' }).click();
    const options = page.getByRole('dialog', {
      name: 'Choose an option',
      exact: true
    });
    await options
      .getByRole('combobox', { name: 'Search options' })
      .fill('repair');
    await options
      .getByRole('option', { name: 'In repair', exact: true })
      .click();
    await expect(page).toHaveURL(/status=ongoing_repair/);
    await panel.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(trigger).toContainText('1');
    await expect(trigger).toBeFocused();
    await expect(
      page.getByRole('searchbox', { name: 'Search job orders' })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Clear filters', exact: true })
      .first()
      .click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(trigger).not.toContainText('1');
  });
}

test('outside click dismisses filters and lets the search field receive focus', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/job-order');
  await page.getByRole('button', { name: /^Filters:/ }).click();
  const panel = page.getByRole('dialog', { name: 'Filters', exact: true });
  await expect(panel).toBeVisible();
  const search = page.getByRole('searchbox', {
    name: 'Search job orders',
    exact: true
  });
  await search.click({ timeout: 3000 });
  await expect(panel).toBeHidden();
  await expect(search).toBeFocused();
  await page.getByRole('button', { name: /^Filters:/ }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: /^Filters:/ })).toBeFocused();
});

test('Escape closes a filter dropdown before closing the floating panel', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/job-order');
  const trigger = page.getByRole('button', { name: /^Filters:/ });
  await trigger.click();
  const panel = page.getByRole('dialog', { name: 'Filters', exact: true });
  await panel.getByRole('combobox', { name: 'Filter by status' }).click();
  const options = page.getByRole('dialog', {
    name: 'Choose an option',
    exact: true
  });
  await expect(options).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});
