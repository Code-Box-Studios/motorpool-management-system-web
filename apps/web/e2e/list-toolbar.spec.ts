import { test, expect } from '@playwright/test';
import { login } from './helpers';

for (const width of [1280, 390]) {
  test(`filter drawer keeps list controls compact and usable at ${width}px`, async ({
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
    const drawer = page.getByRole('dialog', { name: 'Filters', exact: true });
    await drawer.getByRole('combobox', { name: 'Filter by status' }).click();
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
    await drawer.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(drawer).toBeHidden();
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
