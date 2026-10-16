import { expect, type Page } from '@playwright/test';

export async function openFilters(page: Page, label: string) {
  const panel = page.getByRole('dialog', { name: 'Filters', exact: true });
  if (!(await panel.isVisible())) {
    await page
      .getByRole('button', { name: new RegExp(`^Filters:.*${label}`, 'i') })
      .click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

export async function chooseFilter(page: Page, label: string, option: string) {
  const panel = await openFilters(page, label);
  await panel
    .getByRole('combobox', {
      name: `Filter by ${label.toLowerCase()}`,
      exact: true
    })
    .click();
  const options = page.getByRole('dialog', {
    name: 'Choose an option',
    exact: true
  });
  await options.getByRole('option', { name: option, exact: true }).click();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel).toBeHidden();
}

export async function expectFilterValue(
  page: Page,
  label: string,
  value: string
) {
  const panel = await openFilters(page, label);
  await expect(
    panel.getByRole('combobox', {
      name: `Filter by ${label.toLowerCase()}`,
      exact: true
    })
  ).toContainText(value);
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel).toBeHidden();
}
