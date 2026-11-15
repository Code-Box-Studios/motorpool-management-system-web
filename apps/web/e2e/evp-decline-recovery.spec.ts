import { expect, test, type BrowserContext } from '@playwright/test';

const ids = {
  first: '11111111-1111-4111-8111-111111111111',
  second: '11111111-1111-4111-8111-111111111112',
  date: '22222222-2222-4222-8222-222222222222',
  branch: '33333333-3333-4333-8333-333333333333',
  vehicle: '77777777-7777-4777-8777-777777777777',
  driver: '88888888-8888-4888-8888-888888888888',
  user: '99999999-9999-4999-8999-999999999999'
};

// Only HTTP is mocked. The production queue, mutation, modal and cache run
// unchanged, and no request can reach a running API or shared database.
async function fixtures(context: BrowserContext) {
  const now = new Date().toISOString();
  const user = {
    id: ids.user,
    email: 'evp-recovery@example.test',
    fullName: 'Recovery EVP',
    role: 'evp_operations',
    branchId: ids.branch,
    avatarUrl: null,
    status: 'active',
    createdAt: now
  };
  const date = {
    id: ids.date,
    status: 'scheduled',
    startTs: now,
    endTs: new Date(Date.now() + 3600000).toISOString(),
    startMileage: null,
    endMileage: null,
    preTripGuardId: null,
    postTripGuardId: null,
    preTripCheckedById: null,
    postTripCheckedById: null,
    preTripCheckedAt: null,
    postTripCheckedAt: null,
    cancellationReason: null
  };
  const records = [ids.first, ids.second].map((id, index) => ({
    id,
    ticketNo: 9911 + index,
    branchId: ids.branch,
    driverId: ids.driver,
    vehicleId: ids.vehicle,
    officeId: null,
    officeHeadId: null,
    destination:
      index === 0 ? 'First recovery campus' : 'Second recovery campus',
    purpose: 'Fuel sign-off recovery',
    dateRequested: now,
    preparedBy: '',
    requestedById: ids.user,
    participantType: 'students',
    participants: ['Participant One'],
    participantsCount: 1,
    participantEmployees: [],
    guides: [],
    status: 'pending_fuel_allocation_approval',
    remarks: null,
    qrId: null,
    approvedByAdminId: null,
    disapprovedReason: null as string | null,
    cancellationReason: null,
    fuelAllocation: {
      id: index === 0 ? ids.first : ids.second,
      date: now,
      liters: 10,
      fuelType: 'diesel',
      purpose: 'Visit',
      tripTo: 'Campus',
      vehicleId: ids.vehicle,
      createdAt: now,
      updatedAt: now
    },
    startTs: date.startTs,
    endTs: date.endTs,
    dates: [date],
    createdAt: now,
    updatedAt: now
  }));
  let authenticated = false;
  let fail = false;
  let barrier: Promise<void> = Promise.resolve();
  let release = () => {};
  const mutations: { id: string; reason: string }[] = [];
  const unexpected: string[] = [];
  await context.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const decline = path.match(/^\/api\/trip-tickets\/([^/]+)\/disapprove$/);
    if (req.method() === 'POST' && decline) {
      const id = decline[1];
      const { reason } = req.postDataJSON();
      mutations.push({ id, reason });
      await barrier;
      if (fail)
        return route.fulfill({
          status: 503,
          json: {
            error: { code: 'UNAVAILABLE', message: 'Temporary decline failure' }
          }
        });
      const record = records.find((candidate) => candidate.id === id);
      if (!record) throw new Error(`Unknown decline target ${id}`);
      record.status = 'disapproved';
      record.disapprovedReason = reason;
      return route.fulfill({ json: record });
    }
    const list = (data: unknown[]) => ({ data, count: data.length });
    if (path === '/api/auth/me')
      return authenticated
        ? route.fulfill({ json: user })
        : route.fulfill({
            status: 401,
            json: {
              error: { code: 'UNAUTHORIZED', message: 'Refresh required' }
            }
          });
    if (path === '/api/auth/refresh') {
      authenticated = true;
      return route.fulfill({
        json: { accessToken: 'evp-recovery-fixture', user }
      });
    }
    if (path === '/api/auth/test-accounts')
      return route.fulfill({ json: { enabled: false } });
    if (path === '/api/users/me')
      return route.fulfill({ json: { ...user, phone: null } });
    if (path === '/api/trip-tickets')
      return route.fulfill({ json: list(records) });
    if (path === '/api/notifications')
      return route.fulfill({ json: { data: [], unreadCount: 0 } });
    if (path === '/api/analytics/dashboard') return route.fulfill({ json: {} });
    if (
      [
        '/api/branches',
        '/api/users',
        '/api/drivers',
        '/api/vehicles',
        '/api/offices',
        '/api/office-heads',
        '/api/job-orders',
        '/api/approvals/history'
      ].includes(path)
    )
      return route.fulfill({ json: list([]) });
    unexpected.push(`${req.method()} ${path}`);
    return route.fulfill({
      status: 500,
      json: { error: { code: 'UNEXPECTED_FIXTURE_REQUEST', message: path } }
    });
  });
  return {
    mutations,
    unexpected,
    fail: (value: boolean) => {
      fail = value;
    },
    hold: () => {
      barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release: () => release()
  };
}

for (const display of [
  {
    name: 'desktop light',
    viewport: { width: 1280, height: 900 },
    theme: 'light'
  },
  { name: 'phone dark', viewport: { width: 390, height: 844 }, theme: 'dark' }
] as const) {
  test.describe(display.name, () => {
    test.use({ viewport: display.viewport });

    test.beforeEach(async ({ context, page }) => {
      await context.addInitScript(
        (theme) => localStorage.setItem('theme', theme),
        display.theme
      );
      page.on('pageerror', (error) => {
        throw error;
      });
    });

    test('a 503 keeps the decline reason and target available for retry', async ({
      context,
      page
    }) => {
      const server = await fixtures(context);
      server.fail(true);
      await page.goto('/dashboard');
      const card = page
        .getByRole('article')
        .filter({ hasText: 'First recovery campus' });
      await card.getByRole('button', { name: 'Decline', exact: true }).click();
      const dialog = page.getByRole('alertdialog');
      const reason = 'Fuel budget exceeds the route allowance. Please revise.';
      await dialog.getByLabel('Reason for declining').fill(reason);
      await dialog
        .getByRole('button', { name: 'Decline', exact: true })
        .click();
      await expect(
        page.getByText(
          'Failed to disapprove trip ticket: Temporary decline failure'
        )
      ).toBeVisible();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('Reason for declining')).toHaveValue(
        reason
      );
      await expect
        .poll(async () => {
          const error = page.getByText(
            'Failed to disapprove trip ticket: Temporary decline failure'
          );
          return (await error.boundingBox())?.y ?? -1;
        })
        .toBeGreaterThan(8);
      await page.screenshot({
        path: test.info().outputPath('decline-retry.png'),
        animations: 'disabled'
      });
      await expect(
        page
          .getByRole('article', { includeHidden: true })
          .filter({ hasText: 'First recovery campus' })
      ).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Decline', exact: true })
      ).toBeEnabled();
      server.fail(false);
      await dialog
        .getByRole('button', { name: 'Decline', exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(card).toHaveCount(0);
      expect(server.mutations).toEqual([
        { id: ids.first, reason },
        { id: ids.first, reason }
      ]);
      expect(server.unexpected).toEqual([]);
    });

    test('a pending decline prevents duplicate submission and dismissal', async ({
      context,
      page
    }) => {
      const server = await fixtures(context);
      server.hold();
      await page.goto('/dashboard');
      await page
        .getByRole('article')
        .filter({ hasText: 'First recovery campus' })
        .getByRole('button', { name: 'Decline', exact: true })
        .click();
      const dialog = page.getByRole('alertdialog');
      const reason = 'Budget unavailable until the route is revised.';
      await dialog.getByLabel('Reason for declining').fill(reason);
      await dialog
        .getByRole('button', { name: 'Decline', exact: true })
        .click();
      try {
        await expect.poll(() => server.mutations.length).toBe(1);
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole('button', { name: /declin/i })
        ).toBeDisabled();
        await expect(
          dialog.getByRole('button', { name: 'Cancel', exact: true })
        ).toBeDisabled();
        await expect(dialog.getByLabel('Reason for declining')).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();
        // Even a programmatic second click must not enqueue another request.
        await dialog
          .getByRole('button', { name: /declin/i })
          .evaluate((button: HTMLButtonElement) => button.click());
        expect(server.mutations).toEqual([{ id: ids.first, reason }]);
      } finally {
        server.release();
      }
      await expect(dialog).toHaveCount(0);
      expect(server.unexpected).toEqual([]);
    });

    test('a successful decline closes and clears the next ticket draft', async ({
      context,
      page
    }) => {
      const server = await fixtures(context);
      await page.goto('/dashboard');
      const first = page
        .getByRole('article')
        .filter({ hasText: 'First recovery campus' });
      await first.getByRole('button', { name: 'Decline', exact: true }).click();
      const dialog = page.getByRole('alertdialog');
      const reason = 'Use the standard fuel budget for this visit.';
      await dialog.getByLabel('Reason for declining').fill(reason);
      await dialog
        .getByRole('button', { name: 'Decline', exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(first).toHaveCount(0);
      await page
        .getByRole('article')
        .filter({ hasText: 'Second recovery campus' })
        .getByRole('button', { name: 'Decline', exact: true })
        .click();
      await expect(dialog.getByLabel('Reason for declining')).toHaveValue('');
      await expect(
        dialog.getByRole('button', { name: 'Decline', exact: true })
      ).toBeDisabled();
      expect(server.mutations).toEqual([{ id: ids.first, reason }]);
      expect(server.unexpected).toEqual([]);
    });
  });
}
