import { expect, type Page } from '@playwright/test';

export async function openFilters(page: Page, label: string) {
  const drawer = page.getByRole('dialog', { name: 'Filters', exact: true });
  if (!(await drawer.isVisible())) {
    await page
      .getByRole('button', { name: new RegExp(`^Filters:.*${label}`, 'i') })
      .click();
  }
  await expect(drawer).toBeVisible();
  return drawer;
}

export async function chooseFilter(page: Page, label: string, option: string) {
  const drawer = await openFilters(page, label);
  await drawer
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
  await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(drawer).toBeHidden();
}

export async function expectFilterValue(
  page: Page,
  label: string,
  value: string
) {
  const drawer = await openFilters(page, label);
  await expect(
    drawer.getByRole('combobox', {
      name: `Filter by ${label.toLowerCase()}`,
      exact: true
    })
  ).toContainText(value);
  await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(drawer).toBeHidden();
}
