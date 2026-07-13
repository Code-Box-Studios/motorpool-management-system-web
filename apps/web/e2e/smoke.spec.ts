import { test, expect } from '@playwright/test';
import { login, shot, expectText } from './helpers';

// Every role should be able to sign in and land on its correct home screen.
// These assertions target the distinctive text each role's dashboard renders.
test.describe('per-role sign-in and landing screens', () => {
  test('admin lands on the fleet dashboard', async ({ page }) => {
    await login(page, 'admin');
    await expectText(page, 'Available Vehicles');
    await expectText(page, 'Vehicle Tracking');
    await shot(page, 'admin-dashboard');
  });

  test('requester lands on the fleet dashboard', async ({ page }) => {
    await login(page, 'requester');
    await expectText(page, 'Available Vehicles');
    await shot(page, 'requester-dashboard');
  });

  test('EVP lands on the approvals queue', async ({ page }) => {
    await login(page, 'evp');
    // The redesigned queue leads with what is waiting on them, not a page title.
    await expectText(page, /Awaiting your sign-off/i);
    await shot(page, 'evp-approvals');
  });

  test('security guard lands on the gate screen', async ({ page }) => {
    await login(page, 'guard');
    // The gate screen leads with the vehicle in front of them.
    await expectText(page, /At the gate now|Nothing at the gate/i);
    await shot(page, 'guard-confirmation');
  });

  test('driver lands on their own trip tickets', async ({ page }) => {
    await login(page, 'driver');
    // The phone-first screen leads with the next trip and the QR the guard scans.
    await expectText(page, /Show my QR at the gate|No trips assigned to you/i);
    await shot(page, 'driver-trips');
  });
});

// The admin can reach every area from the sidebar and each page renders.
// `content` is text only that page shows — never the sidebar link, which stays
// mounted across navigations. Waiting on it proves the destination actually
// painted (a settled URL alone does not), and it keeps the screenshots honest:
// without it the shot lands before the new page renders and captures the
// previous one.
test.describe('admin navigation', () => {
  const pages: Array<{ link: string; url: RegExp; content: string | RegExp }> = [
    {
      link: 'Trip Tickets',
      url: /\/trip-tickets/,
      content: 'Manage and view trip tickets.'
    },
    {
      link: 'Job Orders',
      url: /\/job-order/,
      content: 'Manage and view job orders.'
    },
    {
      link: 'Drivers',
      url: /\/drivers/,
      content: 'Manage and view driver details.'
    },
    {
      link: 'Maintenance',
      url: /\/maintenance/,
      content: 'Manage and view maintenance records.'
    },
    { link: 'Vehicles', url: /\/vehicles/, content: 'Add Vehicle' },
    { link: 'Spare Parts', url: /\/spare-parts/, content: 'Add Spare Part' },
    { link: 'Tools', url: /\/tools/, content: 'Add Tool' },
    {
      link: 'User Management',
      url: /\/user-management/,
      content: 'Manage and view user profiles.'
    }
  ];

  test('every sidebar destination loads', async ({ page }) => {
    await login(page, 'admin');
    for (const { link, url, content } of pages) {
      await page.getByRole('link', { name: link, exact: true }).first().click();
      await page.waitForURL(url, { timeout: 15_000 });
      await expect(page).toHaveURL(url);
      await expectText(page, content);
      await shot(page, `admin-nav-${link.toLowerCase().replace(/\s+/g, '-')}`);
    }
  });
});
