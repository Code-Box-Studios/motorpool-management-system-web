import { test, expect } from '@playwright/test';
import { login } from './helpers';

const filters = [
  'report-type',
  'report-branch',
  'report-vehicle',
  'report-from',
  'report-to',
  'report-status'
];

test('report filters align across desktop, tablet and phone widths', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/reports');
  for (const [width, columns] of [
    [1920, 6],
    [1280, 3],
    [900, 2],
    [390, 1]
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    const boxes = await Promise.all(
      filters.map((id) => page.locator(`#${id}`).boundingBox())
    );
    for (let row = 0; row < boxes.length; row += columns) {
      const tops = boxes.slice(row, row + columns).map((box) => box!.y);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    }
    for (const id of filters) {
      const label = (await page.locator(`label[for="${id}"]`).boundingBox())!;
      const control = (await page.locator(`#${id}`).boundingBox())!;
      expect(control.y - (label.y + label.height)).toBe(8);
      expect(control.height).toBe(44);
      expect(control.x).toBeGreaterThanOrEqual(0);
      expect(control.x + control.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    if (width !== 900)
      await page.screenshot({
        path: `/tmp/mms-reports-${width}.png`,
        fullPage: true
      });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page
    .getByRole('button', { name: 'Generate report', exact: true })
    .click();
  const report = page.getByRole('region', { name: 'Generated report' });
  await expect(report).toBeVisible();
  await expect(report.getByRole('definition').first()).toBeVisible();
  await page.screenshot({
    path: '/tmp/mms-reports-generated-1920.png',
    fullPage: true
  });
});

test('sidebar keeps current resource active on detail routes and supports the icon rail', async ({
  page
}) => {
  await login(page, 'admin');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(
    nav.getByRole('link', { name: 'Dashboard', exact: true })
  ).toHaveAttribute('aria-current', 'page');
  await page.goto('/vehicles/add-vehicle');
  const vehicles = nav.getByRole('link', { name: 'Vehicles', exact: true });
  await expect(vehicles).toHaveAttribute('aria-current', 'page');
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(
    page
      .locator('[data-slot="sidebar-footer"]')
      .getByRole('button', { name: /Switch test account/ })
  ).toBeVisible();
  await expect(
    page
      .locator('[data-slot="sidebar-footer"]')
      .getByRole('button', { name: /Collapse navigation|Expand navigation/ })
  ).toHaveCount(0);
  const toggle = page.locator('[data-slot="sidebar-trigger"]');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAccessibleName('Collapse navigation');
  await toggle.click();
  await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCSS(
    'width',
    '48px'
  );
  await vehicles.focus();
  await expect(vehicles).toBeFocused();
  await expect(page.getByRole('tooltip')).toContainText('Vehicles');
  await nav.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(
    nav.getByRole('link', { name: 'Reports', exact: true })
  ).toHaveAttribute('aria-current', 'page');
  await page.mouse.move(500, 150);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toBeHidden();
  await page.screenshot({
    path: '/tmp/mms-sidebar-collapsed.png',
    fullPage: true
  });
  await expect(
    page
      .locator('[data-slot="sidebar-footer"]')
      .getByRole('button', { name: /Switch test account/ })
  ).toBeVisible();
  await expect(
    page
      .locator('[data-slot="sidebar-footer"]')
      .getByRole('button', { name: /Collapse navigation|Expand navigation/ })
  ).toHaveCount(0);
  await expect(toggle).toHaveAccessibleName('Expand navigation');
  await toggle.click();
  await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCSS(
    'width',
    '256px'
  );
});

test('phone navigation closes after navigation and Escape restores trigger focus', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'admin');
  const trigger = page.getByRole('button', {
    name: 'Open navigation',
    exact: true
  });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Sidebar', exact: true });
  await expect(drawer).toBeVisible();
  await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);
  const drawerBox = (await drawer.boundingBox())!;
  expect(drawerBox.width).toBe(288);
  expect(drawerBox.x + drawerBox.width).toBeLessThan(390);
  await page.screenshot({
    path: '/tmp/mms-sidebar-mobile.png',
    fullPage: false
  });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(
    drawer.getByRole('link', { name: 'Reports', exact: true })
  ).toHaveAttribute('aria-current', 'page');
  await drawer
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click();
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('sidebar preserves driver permissions and omits empty navigation groups', async ({
  page
}) => {
  await login(page, 'driver');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveCount(3);
  await expect(
    nav.getByRole('link', { name: 'Job Orders', exact: true })
  ).toBeVisible();
  await expect(
    nav.getByRole('link', { name: 'Tools', exact: true })
  ).toBeVisible();
  await expect(
    nav.getByRole('link', { name: 'Reports', exact: true })
  ).toHaveCount(0);
  await expect(
    nav.getByRole('link', { name: 'Dashboard', exact: true })
  ).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByText('Administration', { exact: true })).toHaveCount(0);
});
