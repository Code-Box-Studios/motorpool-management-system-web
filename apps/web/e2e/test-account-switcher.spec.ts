import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

const trigger = (page: Page) =>
  page.getByRole('button', { name: /Switch test account\. Current:/ });
async function switchTo(page: Page, label: string) {
  await trigger(page).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click();
  await page.waitForURL(/\/dashboard$/);
  await expect(trigger(page)).toHaveAccessibleName(
    `Switch test account. Current: ${label === 'Return to Admin' ? 'Admin' : label}`
  );
}

test('test admin can switch every account and return, including focus shells and reload', async ({
  page
}) => {
  await login(page, 'admin');
  await expect(trigger(page)).toBeVisible();
  await expect(page.locator('[data-slot="sidebar-footer"]')).toContainText(
    'Test account'
  );
  await trigger(page).click();
  await expect(page.getByRole('menuitem')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(trigger(page)).toBeFocused();
  await page.screenshot({
    path: '/tmp/mms-test-switcher-admin.png',
    fullPage: true
  });
  for (const label of [
    'Requester',
    'Driver',
    'EVP Operations',
    'Security Guard'
  ]) {
    await switchTo(page, label);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.reload();
    await expect(trigger(page)).toHaveAccessibleName(
      `Switch test account. Current: ${label}`
    );
    if (label !== 'Driver')
      await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
    await page.screenshot({
      path: `/tmp/mms-test-switcher-${label.replaceAll(' ', '-').toLowerCase()}.png`,
      fullPage: true
    });
  }
  await switchTo(page, 'Return to Admin');
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' })
  ).toBeVisible();
});

test('test switcher works in icon rail and phone focus header without overflow', async ({
  page
}) => {
  await login(page, 'admin');
  await page.locator('[data-slot="sidebar-trigger"]').click();
  await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCSS(
    'width',
    '48px'
  );
  await expect(trigger(page)).toBeVisible();
  await trigger(page).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCSS('opacity', '1');
  await page.screenshot({
    path: '/tmp/mms-test-switcher-collapsed.png',
    animations: 'disabled',
    fullPage: false
  });
  await page.keyboard.press('Escape');
  await expect(trigger(page)).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-slot="sidebar-trigger"]').click();
  await switchTo(page, 'Security Guard');
  const header = page.locator('header');
  await expect(
    header.getByRole('button', { name: /Switch test account/ })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await trigger(page).click();
  const bounds = await page.getByRole('menu').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole('menu')).toHaveCSS('opacity', '1');
  await page.screenshot({
    path: '/tmp/mms-test-switcher-mobile.png',
    animations: 'disabled',
    fullPage: false
  });
  await page.getByRole('menuitem', { name: /^Return to Admin/ }).click();
  await expect(page.locator('[data-slot="sidebar-trigger"]')).toBeVisible();
});

test('ordinary demo login has no test controls or empty sidebar footer', async ({
  page
}) => {
  for (const role of ['requester', 'driver', 'evp', 'guard'] as const) {
    const decision = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/auth/test-accounts') &&
        response.request().method() === 'GET'
    );
    await login(page, role);
    expect((await (await decision).json()).enabled).toBe(false);
    await expect(trigger(page)).toHaveCount(0);
    await expect(page.locator('[data-slot="sidebar-footer"]')).toHaveCount(0);
    // A fresh normal login must end any prior test grant as well.
    await page.context().clearCookies();
  }
});
