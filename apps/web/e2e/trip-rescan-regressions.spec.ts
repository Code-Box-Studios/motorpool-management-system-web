import { test, expect, type Browser } from '@playwright/test';

const ids = {
  ticket: '11111111-1111-4111-8111-111111111111',
  date: '22222222-2222-4222-8222-222222222222',
  branch: '33333333-3333-4333-8333-333333333333',
  vehicle: '77777777-7777-4777-8777-777777777777',
  driver: '88888888-8888-4888-8888-888888888888',
  user: '99999999-9999-4999-8999-999999999999',
  employee: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
};

async function setup(
  browser: Browser,
  role = 'security_guard',
  clock = '2026-11-13T15:59:55.000Z'
) {
  const context = await browser.newContext({
    timezoneId: 'Europe/Malta',
    viewport: { width: 1280, height: 900 },
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:5183'
  });
  const page = await context.newPage();
  // Leave a minute for navigation, then pause boundary tests once data renders.
  const initialTime = new Date(new Date(clock).getTime() - 60000);
  await page.clock.install({ time: initialTime });
  const user = {
    id: ids.user,
    email: 'rescan@example.test',
    fullName: 'Rescan Guard',
    role,
    branchId: ids.branch,
    avatarUrl: null,
    status: 'active',
    createdAt: clock
  };
  const employee = {
    id: ids.employee,
    name: 'Employee One',
    position: 'Staff',
    branchId: ids.branch,
    archivedAt: null
  };
  const vehicle = {
    id: ids.vehicle,
    make: 'Audit',
    model: 'Van',
    licensePlate: 'AUDIT-001',
    vin: 'AUDITVIN',
    capacity: 8,
    year: 2025,
    fuelType: 'diesel',
    mileage: 1000,
    status: 'available',
    branchId: ids.branch,
    images: [],
    insuranceExpiry: '2027-12-31',
    registrationExpiry: '2027-12-31',
    createdAt: clock,
    updatedAt: clock
  };
  const driver = {
    id: ids.driver,
    userId: null,
    email: 'driver@example.test',
    fullName: 'Audit Driver',
    phone: null,
    status: 'active',
    branchId: ids.branch,
    photo: null,
    createdAt: clock,
    updatedAt: clock
  };
  const date = {
    id: ids.date,
    status: 'scheduled',
    startTs: '2026-11-14T00:00:00.000Z',
    endTs: '2026-11-14T09:00:00.000Z',
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
  const record = {
    id: ids.ticket,
    ticketNo: 9911,
    branchId: ids.branch,
    driverId: ids.driver,
    vehicleId: ids.vehicle,
    officeId: null,
    officeHeadId: null,
    destination: 'Rescan Campus',
    purpose: 'Original purpose',
    dateRequested: '2026-11-13T00:00:00.000Z',
    preparedBy: '',
    requestedById: ids.user,
    participantType: 'employees',
    participants: [employee.name],
    participantsCount: 1,
    participantEmployees: [{ employeeId: ids.employee, employee }],
    guides: [] as { employeeId: string; employee: typeof employee }[],
    status: role === 'admin' ? 'pending_admin_approval' : 'approved',
    remarks: null as string | null,
    qrId: null,
    approvedByAdminId: null,
    disapprovedReason: null,
    cancellationReason: null,
    fuelAllocation: null,
    startTs: date.startTs,
    endTs: date.endTs,
    dates: [date],
    createdAt: clock,
    updatedAt: clock
  };
  let authenticated = false;
  const paths: string[] = [];
  const unmatched: string[] = [];
  const mutations: Record<string, unknown>[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    paths.push(`${req.method()} ${path}`);
    if (req.method() === 'PATCH' && path === `/api/trip-tickets/${ids.ticket}`)
      mutations.push(req.postDataJSON());
    const list = (data: unknown[]) => ({ data, count: data.length });
    let json: unknown = list([]);
    if (path === '/api/auth/me') {
      if (!authenticated)
        return route.fulfill({
          status: 401,
          json: { error: { code: 'UNAUTHORIZED', message: 'Refresh required' } }
        });
      json = user;
    } else if (path === '/api/auth/refresh') {
      authenticated = true;
      json = { accessToken: 'rescan-fixture-token', user };
    } else if (path === '/api/auth/test-accounts') json = { enabled: false };
    else if (path === '/api/branches')
      json = list([
        { id: ids.branch, name: 'Branch A', location: 'A', archivedAt: null }
      ]);
    else if (path === '/api/users/me') json = { ...user, phone: null };
    else if (path === '/api/users') json = list([user]);
    else if (path === '/api/drivers') json = list([driver]);
    else if (path === '/api/vehicles') json = list([vehicle]);
    else if (path === '/api/trip-tickets/guide-options') json = [employee];
    else if (path === '/api/trip-tickets') json = list([record]);
    else if (path === `/api/trip-tickets/${ids.ticket}`) json = record;
    else if (path === '/api/notifications') json = { data: [], unreadCount: 0 };
    else if (!['/api/offices', '/api/office-heads'].includes(path))
      unmatched.push(`${req.method()} ${path}`);
    return route.fulfill({ json });
  });
  return {
    context,
    page,
    record,
    paths,
    unmatched,
    employee,
    mutations,
    clock
  };
}

async function refreshRecord(s: Awaited<ReturnType<typeof setup>>) {
  const count = () =>
    s.paths.filter((path) => path === `GET /api/trip-tickets/${ids.ticket}`)
      .length;
  const before = count();
  await s.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    window.dispatchEvent(new Event('visibilitychange'));
  });
  await s.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    window.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(count).toBeGreaterThan(before);
}

test('guard enables a next-day departure at Manila midnight without interaction', async ({
  browser
}) => {
  const s = await setup(browser);
  try {
    // Model slow module/navigation loading without waiting on wall-clock time.
    await s.page.clock.runFor(10000);
    await s.page.goto('/dashboard');
    const scan = s.page
      .getByRole('button', { name: 'Scan QR to time out', exact: true })
      .filter({ visible: true });
    await expect(scan).toBeVisible();
    await s.page.clock.pauseAt(new Date(s.clock));
    await expect(scan).toBeDisabled();
    await s.page.clock.runFor(10000);
    await expect(scan).toBeEnabled();
    expect(s.unmatched).toEqual([]);
  } finally {
    await s.context.close();
  }
});

test('guard catches up on focus after a suspended midnight boundary', async ({
  browser
}) => {
  const s = await setup(browser);
  try {
    await s.page.goto('/dashboard');
    const scan = s.page
      .getByRole('button', { name: 'Scan QR to time out', exact: true })
      .filter({ visible: true });
    await expect(scan).toBeVisible();
    await s.page.clock.pauseAt(new Date(s.clock));
    await expect(scan).toBeDisabled();
    await s.page.clock.setSystemTime(new Date('2026-11-13T16:01:00.000Z'));
    await s.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(scan).toBeEnabled();
  } finally {
    await s.context.close();
  }
});

test('guard disables a scheduled outing at its end boundary without interaction', async ({
  browser
}) => {
  const s = await setup(browser);
  s.record.dates[0].startTs = '2026-11-13T14:00:00.000Z';
  s.record.dates[0].endTs = '2026-11-13T16:00:00.000Z';
  try {
    await s.page.goto('/dashboard');
    const scan = s.page
      .getByRole('button', { name: 'Scan QR to time out', exact: true })
      .filter({ visible: true });
    await expect(scan).toBeVisible();
    await s.page.clock.pauseAt(new Date(s.clock));
    await expect(scan).toBeEnabled();
    await s.page.clock.runFor(10000);
    await expect(scan).toBeDisabled();
    await expect(
      s.page.getByText('No eligible outing today').filter({ visible: true })
    ).toBeVisible();
  } finally {
    await s.context.close();
  }
});

test('trip refetch preserves dirty fields and requires an explicit merge or discard', async ({
  browser
}) => {
  const s = await setup(browser, 'admin', '2026-11-13T03:00:00.000Z');
  try {
    await s.page.goto(`/trip-tickets/${ids.ticket}`);
    await s.page.getByRole('button', { name: 'Edit', exact: true }).click();
    await s.page.locator('#purpose').fill('My unsaved purpose');
    s.record.remarks = 'Other administrator changed remarks';
    s.record.updatedAt = '2026-11-13T03:01:00.000Z';
    await refreshRecord(s);
    await expect(s.page.locator('#purpose')).toHaveValue('My unsaved purpose');
    await expect(s.page.getByRole('alert')).toContainText('changed');
    const save = s.page.getByRole('button', {
      name: 'Update Trip Ticket',
      exact: true
    });
    await expect(save).toBeDisabled();
    await s.page
      .getByRole('button', {
        name: 'Keep my edits and load other updates',
        exact: true
      })
      .click();
    await expect(s.page.locator('#purpose')).toHaveValue('My unsaved purpose');
    await expect(s.page.locator('#remarks')).toHaveValue(
      'Other administrator changed remarks'
    );
    await expect(save).toBeEnabled();
    s.record.purpose = 'Another saved purpose';
    s.record.updatedAt = '2026-11-13T03:02:00.000Z';
    await refreshRecord(s);
    await expect(save).toBeDisabled();
    await s.page
      .getByRole('button', { name: 'Discard my edits and reload', exact: true })
      .click();
    await expect(s.page.locator('#purpose')).toHaveValue(
      'Another saved purpose'
    );
    await expect(save).toBeEnabled();
    expect(
      s.paths.filter(
        (path) => !path.startsWith('GET') && !path.includes('/auth/')
      )
    ).toEqual([]);
    expect(s.unmatched).toEqual([]);
  } finally {
    await s.context.close();
  }
});

test('a cached detail reentry initializes the edit form', async ({
  browser
}) => {
  const s = await setup(browser, 'admin', '2026-11-13T03:00:00.000Z');
  try {
    await s.page.goto(`/trip-tickets/${ids.ticket}`);
    await s.page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
    await s.page
      .getByRole('link', { name: 'Trip Tickets', exact: true })
      .first()
      .click();
    await expect(s.page).toHaveURL(/\/trip-tickets$/);
    await s.page.goBack();
    await s.page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(s.page.locator('#purpose')).toHaveValue('Original purpose');
    await expect(s.page.locator('#destination')).toHaveValue('Rescan Campus');
  } finally {
    await s.context.close();
  }
});

test('student names remain in the local draft when other server fields are merged', async ({
  browser
}) => {
  const s = await setup(browser, 'admin', '2026-11-13T03:00:00.000Z');
  s.record.participantType = 'students';
  s.record.participants = ['Saved Student'];
  s.record.participantEmployees = [];
  s.record.guides = [{ employeeId: ids.employee, employee: s.employee }];
  try {
    await s.page.goto(`/trip-tickets/${ids.ticket}`);
    await s.page.getByRole('button', { name: 'Edit', exact: true }).click();
    const name = s.page.getByPlaceholder('Participant 1 name');
    await name.fill('Draft Student');
    s.record.remarks = 'Server remarks';
    s.record.participants = ['Changed Student'];
    s.record.updatedAt = '2026-11-13T03:01:00.000Z';
    await refreshRecord(s);
    await expect(name).toHaveValue('Draft Student');
    await s.page
      .getByRole('button', {
        name: 'Keep my edits and load other updates',
        exact: true
      })
      .click();
    await expect(name).toHaveValue('Draft Student');
    await expect(s.page.locator('#remarks')).toHaveValue('Server remarks');
  } finally {
    await s.context.close();
  }
});

for (const dirty of [false, true]) {
  test(`a source refetch invalidates a ${dirty ? 'dirty' : 'pristine'} pending edit confirmation`, async ({
    browser
  }) => {
    const s = await setup(browser, 'admin', '2026-11-13T03:00:00.000Z');
    const errors: string[] = [];
    s.page.on('pageerror', (error) => errors.push(error.message));
    try {
      await s.page.goto(`/trip-tickets/${ids.ticket}`);
      await s.page.getByRole('button', { name: 'Edit', exact: true }).click();
      if (dirty) await s.page.locator('#purpose').fill('My pending purpose');
      await s.page
        .getByRole('button', { name: 'Update Trip Ticket', exact: true })
        .click();
      const dialog = s.page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();

      s.record.destination = 'Updated server destination';
      s.record.purpose = 'Updated server purpose';
      s.record.updatedAt = '2026-11-13T03:01:00.000Z';
      await refreshRecord(s);

      await expect(dialog).toHaveCount(0);
      expect(s.mutations).toEqual([]);
      if (dirty) {
        await expect(s.page.getByRole('alert')).toContainText('changed');
        await expect(s.page.locator('#purpose')).toHaveValue(
          'My pending purpose'
        );
        await s.page
          .getByRole('button', {
            name: 'Keep my edits and load other updates',
            exact: true
          })
          .click();
      }
      await expect(s.page.locator('#destination')).toHaveValue(
        'Updated server destination'
      );
      await expect(s.page.locator('#purpose')).toHaveValue(
        dirty ? 'My pending purpose' : 'Updated server purpose'
      );
      await s.page.screenshot({
        path: test.info().outputPath('refreshed-confirmation.png'),
        animations: 'disabled'
      });

      await s.page
        .getByRole('button', { name: 'Update Trip Ticket', exact: true })
        .click();
      await dialog
        .getByRole('button', { name: 'Update Trip Ticket', exact: true })
        .click();
      await expect.poll(() => s.mutations.length).toBe(1);
      expect(s.mutations[0]).toMatchObject({
        destination: 'Updated server destination',
        purpose: dirty ? 'My pending purpose' : 'Updated server purpose'
      });
      expect(s.unmatched).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await s.context.close();
    }
  });
}
