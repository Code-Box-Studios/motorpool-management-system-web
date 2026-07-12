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

  test('EVP lands on the approvals screen', async ({ page }) => {
    await login(page, 'evp');
    await expectText(page, /EVP Operations/);
    await shot(page, 'evp-approvals');
  });

  test('security guard lands on the guard confirmation screen', async ({ page }) => {
    await login(page, 'guard');
    await expectText(page, /Guard Confirmation/);
    await shot(page, 'guard-confirmation');
  });

  test('driver lands on their own trip tickets', async ({ page }) => {
    await login(page, 'driver');
    await expectText(page, /My Trip Tickets/);
    await shot(page, 'driver-trips');
  });
});

// The admin can reach every area from the sidebar and each page renders.
test.describe('admin navigation', () => {
  const pages: Array<{ link: string; url: RegExp }> = [
    { link: 'Trip Tickets', url: /\/trip-tickets/ },
    { link: 'Job Orders', url: /\/job-order/ },
    { link: 'Drivers', url: /\/drivers/ },
    { link: 'Maintenance', url: /\/maintenance/ },
    { link: 'Vehicles', url: /\/vehicles/ },
    { link: 'Spare Parts', url: /\/spare-parts/ },
    { link: 'Tools', url: /\/tools/ },
    { link: 'User Management', url: /\/user-management/ }
  ];

  test('every sidebar destination loads', async ({ page }) => {
    await login(page, 'admin');
    for (const { link, url } of pages) {
      await page.getByRole('link', { name: link, exact: true }).first().click();
      await page.waitForURL(url, { timeout: 15_000 });
      // The page shell stays mounted, so a settled URL + no crash is the check.
      await expect(page).toHaveURL(url);
      await shot(page, `admin-nav-${link.toLowerCase().replace(/\s+/g, '-')}`);
    }
  });
});
