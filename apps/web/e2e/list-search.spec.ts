import { test, expect } from '@playwright/test';
import { login, CREDENTIALS } from './helpers';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

for (const route of ['spare-parts', 'tools', 'vehicles']) {
  test(`${route} retains Grid while searching, clearing, and changing views`, async ({
    page
  }) => {
    await login(page, 'admin');
    const sortBy = route === 'vehicles' ? 'make' : 'name';
    await page.goto(`/${route}?page=2&sortBy=${sortBy}&sortOrder=asc`);
    await page.getByRole('tab', { name: 'Grid', exact: true }).click();
    const input = page.getByRole('searchbox');
    const term = `no-match-${Date.now()}`;
    await input.fill(term);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page).toHaveURL(new RegExp(`sortBy=${sortBy}`));
    await expect(page.getByText('No records match your search.')).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Grid', exact: true })
    ).toHaveAttribute('data-state', 'active');
    await page.getByRole('tab', { name: 'Table', exact: true }).click();
    await expect(input).toHaveValue(term);
    await page.getByRole('tab', { name: 'Grid', exact: true }).click();
    await page.locator('button[aria-label="Clear search"]').click();
    await expect(input).toHaveValue('');
    await expect(page).not.toHaveURL(/search=/);
    await expect(
      page.getByRole('tab', { name: 'Grid', exact: true })
    ).toHaveAttribute('data-state', 'active');
  });
}

test('maintenance search filters the table and retains the selected view', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/maintenance');
  const tableTab = page.getByRole('tab', { name: 'Table', exact: true });
  await tableTab.click();
  await expect(tableTab).toHaveAttribute('data-state', 'active');
  await page.getByRole('searchbox').fill('no-match-maintenance-audit');
  await expect(page.getByText('No records match your search.')).toBeVisible();
  await expect(tableTab).toHaveAttribute('data-state', 'active');
});

test('approval history shows decision details with current row and keyboard navigation', async ({
  page
}) => {
  const databaseUrl = process.env.E2E_AUDIT_DATABASE_URL;
  test.skip(!databaseUrl, 'Requires disposable E2E_AUDIT_DATABASE_URL');
  if (
    !['localhost', '127.0.0.1'].includes(new URL(databaseUrl!).hostname) ||
    !/^\/mms_fix(?:_\d+)?$/.test(new URL(databaseUrl!).pathname)
  ) {
    throw new Error(
      'Approval fixtures require an isolated local mms_fix database'
    );
  }
  const requireApi = createRequire(
    new URL('../../api/package.json', import.meta.url)
  );
  const { PrismaClient } = requireApi(
    '@prisma/client'
  ) as typeof import('../../api/node_modules/@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const marker = `Search-${randomUUID()}`;
  try {
    const fixture = await db.$transaction(async (tx) => {
      const requester = await tx.user.findUniqueOrThrow({
        where: { email: CREDENTIALS.requester }
      });
      const evp = await tx.user.findUniqueOrThrow({
        where: { email: CREDENTIALS.evp }
      });
      const driver = await tx.driver.findFirstOrThrow({
        where: { user: { email: CREDENTIALS.driver } }
      });
      const branchId = requester.branchId!;
      const employee = await tx.employee.create({
        data: { name: `${marker} guide`, branchId }
      });
      const vehicle = await tx.vehicle.create({
        data: {
          make: marker,
          model: 'Regression',
          year: 2026,
          vin: marker,
          licensePlate: marker,
          capacity: 10,
          fuelType: 'diesel',
          mileage: 100,
          insuranceExpiry: new Date('2035-01-01'),
          registrationExpiry: new Date('2035-01-01'),
          branchId
        }
      });
      const trips = [];
      for (const [index, status] of [
        'pending_fuel_allocation_approval',
        'approved'
      ].entries()) {
        const day = new Date(Date.now() + (180 + index) * 86400000);
        const trip = await tx.tripTicket.create({
          data: {
            branchId,
            driverId: driver.id,
            vehicleId: vehicle.id,
            requestedById: requester.id,
            preparedBy: requester.id,
            dateRequested: new Date(),
            destination: `${marker} ${index === 0 ? 'pending fuel' : 'history decision'}`,
            purpose: 'Search navigation fixture',
            participants: ['Passenger'],
            participantsCount: 1,
            guides: { create: { employeeId: employee.id } },
            status: status as 'pending_fuel_allocation_approval' | 'approved',
            startTs: day,
            endTs: new Date(+day + 3600000),
            dates: {
              create: {
                startTs: day,
                endTs: new Date(+day + 3600000),
                status: 'scheduled'
              }
            }
          }
        });
        await tx.fuelAllocation.create({
          data: {
            tripTicketId: trip.id,
            vehicleId: vehicle.id,
            branchId,
            requestedById: requester.id,
            liters: 20,
            fuelType: 'diesel',
            date: day,
            purpose: 'Search history fixture',
            tripTo: trip.destination,
            status: index === 0 ? 'pending' : 'approved',
            ...(index === 1
              ? {
                  decidedById: evp.id,
                  approvedByEvpId: evp.id,
                  decidedAt: new Date()
                }
              : {})
          }
        });
        trips.push(trip);
      }
      return {
        pending: trips[0]!,
        decided: trips[1]!,
        vehicleId: vehicle.id,
        employeeId: employee.id
      };
    });
    const { pending, decided } = fixture;
    try {
      await login(page, 'evp');
      await expect(
        page.getByText(/Fuel sign-off · Trip tickets/)
      ).toBeVisible();
      const headline = await page
        .getByRole('heading', { level: 1 })
        .innerText();
      const pendingSearch = page.getByRole('searchbox', {
        name: 'Search pending approvals'
      });
      await pendingSearch.fill('no-match-pending-approval-audit');
      await expect(
        page.getByText('No records match your search.')
      ).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        headline
      );
      await page.locator('button[aria-label="Clear search"]').click();
      await page
        .getByRole('article')
        .filter({ hasText: pending.destination })
        .getByRole('button', { name: 'Decline', exact: true })
        .click();
      const declineDialog = page.getByRole('alertdialog');
      await expect(
        declineDialog.getByLabel('Reason for declining')
      ).toBeVisible();
      await declineDialog
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
      expect(
        (await db.tripTicket.findUniqueOrThrow({ where: { id: pending.id } }))
          .status
      ).toBe('pending_fuel_allocation_approval');
      await page.getByRole('tab', { name: 'History', exact: true }).click();
      const table = page.getByRole('table');
      await expect(table).toBeVisible();
      for (const heading of [
        'Reference',
        'Request',
        'Vehicle',
        'Outcome',
        'Decided by',
        'Date',
        'Details'
      ]) {
        await expect(
          table.getByRole('columnheader', { name: heading, exact: true })
        ).toBeVisible();
      }
      const historySearch = page.getByRole('searchbox', {
        name: 'Search approval history'
      });
      await historySearch.fill('no-match-approval-history-audit');
      await expect(
        page.getByText('No records match your search.')
      ).toBeVisible();
      await page.locator('button[aria-label="Clear search"]').click();
      await historySearch.fill(decided.destination);
      const row = table
        .getByRole('row')
        .filter({ hasText: decided.destination });
      await expect(row).toBeVisible();
      await expect(
        row.getByRole('cell', { name: 'Approved', exact: true })
      ).toBeVisible();
      await expect(
        row.getByRole('cell', { name: /20 L diesel/ })
      ).toBeVisible();
      await expect(table.getByRole('link', { name: /^View / })).toHaveCount(0);
      await page.screenshot({
        path: test.info().outputPath('approval-history-current-links.png'),
        fullPage: true
      });
      await row
        .getByRole('cell', { name: new RegExp(marker + ' Regression') })
        .click();
      await expect(page).toHaveURL(new RegExp(`/trip-tickets/${decided.id}$`));
      await page.goto('/dashboard?approvalTab=history');
      await page
        .getByRole('searchbox', { name: 'Search approval history' })
        .fill(decided.destination);
      const titleLink = page.getByRole('link', {
        name: decided.destination,
        exact: true
      });
      await titleLink.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/trip-tickets/${decided.id}$`));
    } finally {
      await db.$transaction([
        db.tripTicket.deleteMany({
          where: { id: { in: [pending.id, decided.id] } }
        }),
        db.employee.delete({ where: { id: fixture.employeeId } }),
        db.vehicle.delete({ where: { id: fixture.vehicleId } })
      ]);
    }
  } finally {
    await db.$disconnect();
  }
});

test('all Organization resource tabs support search and clear', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/organization');
  for (const name of ['Branches', 'Offices', 'Office Heads', 'Employees']) {
    await page.getByRole('tab', { name, exact: true }).click();
    const input = page.getByRole('searchbox', {
      name: `Search ${name.toLowerCase()}`
    });
    await input.fill('no-match-organization-audit');
    await expect(page.getByText('No records match your search.')).toBeVisible();
    await page.locator('button[aria-label="Clear search"]').click();
    await expect(input).toHaveValue('');
    await expect(page.getByText('No records match your search.')).toHaveCount(
      0
    );
  }
});

test('requester can search and clear their trip history', async ({ page }) => {
  await login(page, 'requester');
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  const input = page.getByRole('searchbox', { name: 'Search request history' });
  await input.fill('no-match-request-history-audit');
  await expect(page.getByText('No records match your search.')).toBeVisible();
  await page.locator('button[aria-label="Clear search"]').click();
  await expect(input).toHaveValue('');
  await expect(page.getByText('No records match your search.')).toHaveCount(0);
});
