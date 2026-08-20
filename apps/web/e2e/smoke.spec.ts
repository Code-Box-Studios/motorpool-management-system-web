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

  test('requester lands on their own requests', async ({ page }) => {
    await login(page, 'requester');
    // Their screen leads with what is still out for approval, not the fleet
    // metrics — a requester has no read on any of those.
    await expectText(
      page,
      /requests? waiting|Nothing waiting on approval|No requests yet/i
    );
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
//
// Each page renders its name as an <h1> (PageHeader). Waiting for that heading
// proves the destination actually painted — a settled URL does not, and without
// this the screenshots captured the *previous* page. We assert the heading
// rather than the body copy so that rewording a page description does not break
// the navigation test.
test.describe('admin navigation', () => {
  const pages: Array<{ link: string; url: RegExp; heading: string }> = [
    { link: 'Trip Tickets', url: /\/trip-tickets/, heading: 'Trip Tickets' },
    { link: 'Job Orders', url: /\/job-order/, heading: 'Job Orders' },
    { link: 'Drivers', url: /\/drivers/, heading: 'Drivers' },
    { link: 'Maintenance', url: /\/maintenance/, heading: 'Maintenance' },
    { link: 'Vehicles', url: /\/vehicles/, heading: 'Vehicles' },
    { link: 'Spare Parts', url: /\/spare-parts/, heading: 'Spare Parts' },
    { link: 'Tools', url: /\/tools/, heading: 'Tools' },
    {
      link: 'User Management',
      url: /\/user-management/,
      heading: 'User Management'
    }
  ];

  test('every sidebar destination loads', async ({ page }) => {
    await login(page, 'admin');
    for (const { link, url, heading } of pages) {
      await page.getByRole('link', { name: link, exact: true }).first().click();
      await page.waitForURL(url, { timeout: 15_000 });
      await expect(page).toHaveURL(url);
      await expect(
        page.getByRole('heading', { level: 1, name: heading, exact: true })
      ).toBeVisible({ timeout: 15_000 });
      await shot(page, `admin-nav-${link.toLowerCase().replace(/\s+/g, '-')}`);
    }
  });
});
