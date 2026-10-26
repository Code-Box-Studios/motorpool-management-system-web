import {
  chooseFilter,
  expectFilterValue,
  openFilters
} from './filter-controls';
import { test, expect } from '@playwright/test';
import { login, apiLogin, apiGet, listData, CREDENTIALS } from './helpers';

test('organization combines archive and branch filters and preserves each tab', async ({
  page
}) => {
  await login(page, 'admin');
  await page.route('**/api/branches?**', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'north',
            name: 'North',
            location: 'North site',
            archivedAt: null
          },
          {
            id: 'south',
            name: 'South',
            location: 'South site',
            archivedAt: null
          }
        ],
        count: 2
      }
    })
  );
  await page.route('**/api/offices?**', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'a',
            name: 'North active',
            branchId: 'north',
            headId: null,
            archivedAt: null
          },
          {
            id: 'b',
            name: 'North archived',
            branchId: 'north',
            headId: null,
            archivedAt: '2026-01-01'
          },
          {
            id: 'c',
            name: 'South active',
            branchId: 'south',
            headId: null,
            archivedAt: null
          }
        ],
        count: 3
      }
    })
  );
  await page.goto('/organization');
  await page.getByRole('tab', { name: 'Offices', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'North archived Archived', exact: true })
  ).toBeVisible();
  await chooseFilter(page, 'Branch', 'North');
  await chooseFilter(page, 'Status', 'Archived');
  await page.reload();
  await expect(
    page.getByRole('tab', { name: 'Offices', exact: true })
  ).toHaveAttribute('data-state', 'active');
  await expect(
    page.getByRole('cell', { name: 'North archived Archived', exact: true })
  ).toBeVisible();
  await expect(page.getByText('North active', { exact: true })).toHaveCount(0);
  await expect(page.getByText('South active', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Employees', exact: true }).click();
  await page.getByRole('tab', { name: 'Offices', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'North archived Archived', exact: true })
  ).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Search offices' })
    .fill('no-match');
  await expect(page.getByText(/No records match your/)).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear search', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('cell', { name: 'North archived Archived', exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(page.getByText('South active', { exact: true })).toBeVisible();
});

test('requester status options include later pages and filter before pagination', async ({
  page
}) => {
  await login(page, 'requester');
  let completedOnly = false;
  await page.route('**/api/trip-tickets?**', (route) =>
    route.fulfill({
      json: {
        data: Array.from({ length: 12 }, (_, index) => ({
          id: `history-${index}`,
          ticketNo: index + 1,
          branchId: 'north',
          driverId: null,
          officeId: null,
          officeHeadId: null,
          destinationLatitude: null,
          destinationLongitude: null,
          dateRequested: '2026-01-01T00:00:00Z',
          participants: [],
          participantsCount: 0,
          guides: [],
          preparedBy: 'Requester',
          requestedById: null,
          remarks: null,
          qrId: null,
          approvedByAdminId: null,
          disapprovedReason: null,
          cancellationReason: null,
          fuelAllocation: null,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          destination:
            index === 11
              ? 'Completed destination'
              : `Approved destination ${index}`,
          purpose: 'History fixture',
          status: index === 11 ? 'completed' : 'approved',
          startTs: '2026-01-01T08:00:00Z',
          endTs: '2026-01-01T09:00:00Z',
          dates: [],
          vehicleId: null
        })).filter((ticket) => !completedOnly || ticket.status === 'completed'),
        count: completedOnly ? 1 : 12
      }
    })
  );
  await page.goto('/dashboard?requestTab=history');
  await expect(
    page.getByText('Approved destination 0', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await chooseFilter(page, 'Status', 'Completed');
  await expect(page).not.toHaveURL(/page=2/);
  await expect(
    page.getByText('Completed destination', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Approved destination 0', { exact: true })
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText('Completed destination', { exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(
    page.getByText('Approved destination 0', { exact: true })
  ).toBeVisible();
  completedOnly = true;
  await page.goto('/dashboard?requestStatus=approved');
  await expectFilterValue(page, 'status', 'Approved');
  await expect(page.getByText('No records match your filters.')).toBeVisible();
  const panel = await openFilters(page, 'status');
  await panel.getByRole('combobox', { name: 'Filter by status' }).click();
  await expect(
    page.getByRole('option', { name: 'On the road', exact: true })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .first()
    .click();
  await expect(
    page.getByText('Completed destination', { exact: true })
  ).toBeVisible();
});

test('maintenance filters match priority badges and confidence without changing dashboard previews', async ({
  page
}) => {
  await login(page, 'admin');
  await page.route('**/api/analytics/predictive-maintenance', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            vehicleId: 'high',
            licensePlate: 'TEST-HIGH',
            make: 'High',
            model: 'Vehicle',
            mileage: 10000,
            kmSinceLastMaint: 6000,
            avgDailyKm: 40,
            maintFreq12m: 1,
            riskScore: 90,
            priority: 'high',
            usedFallback: true
          },
          {
            vehicleId: 'low',
            licensePlate: 'TEST-LOW',
            make: 'Low',
            model: 'Vehicle',
            mileage: 1000,
            kmSinceLastMaint: 1000,
            avgDailyKm: 20,
            maintFreq12m: 3,
            riskScore: 10,
            priority: 'low',
            usedFallback: true
          }
        ],
        count: 2
      }
    })
  );
  await page.route(
    '**/api/analytics/association-models?algorithm=fp_growth',
    (route) =>
      route.fulfill({
        json: {
          algorithm: 'fp_growth',
          modelName: 'FP-Growth',
          sourceFile: 'mms_fpgrowth_model.pkl',
          sourceSha256: '0'.repeat(64),
          trainingTransactions: 21,
          minSupport: 2 / 21,
          data: [
            {
              antecedent: 'Strong oil',
              consequent: 'Strong filter',
              confidence: 0.9,
              support: 4 / 21,
              lift: 3,
              coOccurrences: 4
            },
            {
              antecedent: 'Weak belt',
              consequent: 'Weak filter',
              confidence: 0.35,
              support: 2 / 21,
              lift: 1.5,
              coOccurrences: 2
            }
          ],
          count: 2
        }
      })
  );
  await page.goto('/maintenance?tab=preventive');
  await chooseFilter(page, 'Priority', 'Low Priority');
  await expect(page.getByText('TEST-LOW', { exact: true })).toBeVisible();
  await expect(page.getByText('TEST-HIGH', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Predictive', exact: true }).click();
  await chooseFilter(page, 'Risk', 'High Risk');
  await expect(page.getByText('TEST-HIGH', { exact: true })).toBeVisible();
  await expect(page.getByText('TEST-LOW', { exact: true })).toHaveCount(0);
  await chooseFilter(page, 'Confidence', '80% and above');
  await expect(
    page.getByRole('cell', { name: 'Strong oil', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Weak belt', exact: true })
  ).toHaveCount(0);
  await page.goto('/dashboard?predictiveRisk=low&preventivePriority=low');
  await expect(page.getByText('TEST-HIGH', { exact: true })).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: /^Filters:.*Risk/ })
  ).toHaveCount(0);
});

test('approval request and outcome filters preserve the pending action count', async ({
  page,
  request
}) => {
  // Demo approvals change during manual testing. Supply pending read fixtures
  // without changing real trips or job orders in the shared local database.
  const actor = await apiLogin(request, CREDENTIALS.admin);
  const [trips, jobs] = await Promise.all([
    apiGet(request, '/api/trip-tickets', actor.token).then(listData),
    apiGet(request, '/api/job-orders', actor.token).then(listData)
  ]);
  expect(trips.length).toBeGreaterThan(0);
  expect(jobs.length).toBeGreaterThan(0);
  await page.route(
    (url) => url.pathname === '/api/trip-tickets',
    (route) =>
      route.fulfill({
        json: {
          data: [{ ...trips[0], status: 'pending_fuel_allocation_approval' }],
          count: 1
        }
      })
  );
  await page.route(
    (url) => url.pathname === '/api/job-orders',
    (route) =>
      route.fulfill({
        json: {
          data: [{ ...jobs[0], status: 'assigned_mechanic' }],
          count: 1
        }
      })
  );
  await login(page, 'evp');
  await expect(page.getByText(/Fuel sign-off · Trip tickets/)).toBeVisible();
  const headline = await page.getByRole('heading', { level: 1 }).innerText();
  await chooseFilter(page, 'Request type', 'Fuel · Trip ticket');
  await expect(page.getByText(/Repair sign-off · Job orders/)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline);
  await chooseFilter(page, 'Request type', 'Repair · Job order');
  await expect(page.getByText(/Fuel sign-off · Trip tickets/)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline);
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await chooseFilter(page, 'Request type', 'Repair · Job order');
  await chooseFilter(page, 'Outcome', 'Declined');
  await expect(page.getByText('0 decisions · Newest first')).toBeVisible();
  await expect(page.getByText('No records match your filters.')).toBeVisible();
  await expect(page).toHaveURL(/approvalKind=repair/);
  await expect(page).toHaveURL(/approvalOutcome=declined/);
  await page.reload();
  await expect(
    page.getByRole('tab', { name: 'History', exact: true })
  ).toHaveAttribute('data-state', 'active');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline);
  await page.getByRole('tab', { name: /Needs you/ }).click();
  await expectFilterValue(page, 'request type', 'Repair · Job order');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline);
});

test('trip dates filter keeps every outing status available and clears without changing the ticket', async ({
  page,
  request
}) => {
  const actor = await apiLogin(request, CREDENTIALS.admin);
  const [ticket] = listData(
    await apiGet(request, '/api/trip-tickets?page=1&limit=1', actor.token)
  );
  expect(ticket).toBeTruthy();
  const dateBase = {
    tripTicketId: ticket.id,
    startMileage: null,
    endMileage: null,
    preTripGuardId: null,
    preTripCheckedById: null,
    preTripCheckedAt: null,
    postTripGuardId: null,
    postTripCheckedById: null,
    postTripCheckedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };
  const displayedTicket = {
    ...ticket,
    status: 'approved',
    dates: [
      {
        ...dateBase,
        id: 'scheduled-date',
        status: 'scheduled',
        startTs: '2026-01-01T08:00:00Z',
        endTs: '2026-01-01T09:00:00Z',
        cancellationReason: null
      },
      {
        ...dateBase,
        id: 'cancelled-date',
        status: 'cancelled',
        startTs: '2026-01-02T08:00:00Z',
        endTs: '2026-01-02T09:00:00Z',
        cancellationReason: 'Cancelled outing fixture'
      }
    ]
  };
  await login(page, 'admin');
  await page.route(`**/api/trip-tickets/${ticket.id}`, (route) =>
    route.fulfill({ json: displayedTicket })
  );
  await page.goto(`/trip-tickets/${ticket.id}`);
  const dates = page.getByRole('table').filter({
    has: page.getByRole('columnheader', { name: 'Odometer Out', exact: true })
  });
  await expect(dates.getByText('Cancelled outing fixture')).toBeVisible();
  await chooseFilter(page, 'Status', 'Scheduled');
  await expect(dates.getByText('Cancelled outing fixture')).toHaveCount(0);
  await expect(
    dates.getByRole('button', { name: 'Cancel', exact: true })
  ).toBeVisible();
  await chooseFilter(page, 'Status', 'Cancelled');
  await expect(dates.getByText('Cancelled outing fixture')).toBeVisible();
  await expect(
    dates.getByRole('button', { name: 'Cancel', exact: true })
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(dates.getByRole('row')).toHaveCount(3);
});
