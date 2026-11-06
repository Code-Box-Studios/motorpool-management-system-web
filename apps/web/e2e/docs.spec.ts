import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('Admin can find chapters, search instructions, and copy a setup message', async ({
  page,
  context
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Docs', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Docs' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Start here', exact: true })
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Install a new tracker', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Install a new tracker', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Copy MMS server message' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('8040000 104.198.172.49 5013');
  await page
    .getByRole('textbox', { name: 'Search this guide' })
    .fill('unregistered');
  await expect(
    page.getByRole('link', { name: 'Fix a problem', exact: true })
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search this guide' })
    .fill('nothing-matches-this-search');
  await expect(page.getByText('No chapters found')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(
    page.getByRole('link', { name: 'Start here', exact: true })
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Start here', exact: true })
  ).toBeVisible();
});

test('copy failure explains how to copy the message manually', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/docs#install');
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('Clipboard denied');
    };
  });
  await page.getByRole('button', { name: 'Copy MMS server message' }).click();
  await expect(
    page.getByText(
      'Copy is unavailable. Select the text below and copy it manually.'
    )
  ).toBeVisible();
});

test('Docs errors offer retry and recover', async ({ page }) => {
  await page.route('**/api/docs/gps', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } })
  );
  await login(page, 'admin');
  await page.goto('/docs');
  await expect(page.getByRole('alert')).toContainText(
    'The guide could not be loaded'
  );
  await page.unroute('**/api/docs/gps');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Start here', exact: true })
  ).toBeVisible();
});

for (const role of ['requester', 'driver', 'guard', 'evp'] as const) {
  test(`${role} cannot see Docs or open its URL`, async ({ page }) => {
    await login(page, role);
    await expect(
      page.getByRole('link', { name: 'Docs', exact: true })
    ).toHaveCount(0);
    let docsRequests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/docs/gps')) docsRequests++;
    });
    await page.goto('/docs');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'Start here', exact: true })
    ).toHaveCount(0);
    expect(docsRequests).toBe(0);
  });
}

test('phone chapter navigation and technician commands fit the viewport', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'admin');
  await page.goto('/docs');
  await page
    .getByRole('combobox', { name: 'Guide chapter' })
    .selectOption('technical');
  await expect(
    page.getByRole('heading', { name: 'For technical support', exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
});
