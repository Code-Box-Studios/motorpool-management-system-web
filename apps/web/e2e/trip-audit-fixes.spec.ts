import { test, expect, type Page } from '@playwright/test';
import { updateTripTicketBodySchema } from '@mms/shared';
import { pickDate } from './helpers';

test.use({ timezoneId: 'Europe/Malta' });
const ids = {
  ticket: '11111111-1111-4111-8111-111111111111',
  date: '22222222-2222-4222-8222-222222222222',
  branchA: '33333333-3333-4333-8333-333333333333',
  branchB: '44444444-4444-4444-8444-444444444444',
  officeA: '55555555-5555-4555-8555-555555555555',
  headA: '66666666-6666-4666-8666-666666666666',
  vehicle: '77777777-7777-4777-8777-777777777777',
  driver: '88888888-8888-4888-8888-888888888888',
  admin: '99999999-9999-4999-8999-999999999999',
  employee: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
};
const now = '2026-11-13T03:00:00.000Z';
const admin = {
  id: ids.admin,
  email: 'audit-admin@example.test',
  fullName: 'Audit Administrator',
  role: 'admin',
  branchId: ids.branchA,
  avatarUrl: null,
  status: 'active',
  createdAt: now
};
const branches = [
  { id: ids.branchA, name: 'Branch A', archivedAt: null, location: 'A' },
  { id: ids.branchB, name: 'Branch B', archivedAt: null, location: 'B' }
];
const office = {
  id: ids.officeA,
  name: 'Branch A Office',
  branchId: ids.branchA,
  headId: ids.headA,
  archivedAt: null
};
const employee = {
  id: ids.employee,
  name: 'Employee Passenger',
  position: 'Staff',
  branchId: ids.branchA,
  archivedAt: null
};
const vehicle = {
  id: ids.vehicle,
  make: 'Audit',
  model: 'Van',
  licensePlate: 'AUDIT-001',
  vin: 'AUDITVIN0001',
  capacity: 8,
  year: 2025,
  fuelType: 'diesel',
  mileage: 1000,
  status: 'available',
  branchId: ids.branchA,
  images: [],
  insuranceExpiry: '2027-12-31',
  registrationExpiry: '2027-12-31',
  createdAt: now,
  updatedAt: now
};
const driver = {
  id: ids.driver,
  userId: null,
  email: 'audit-driver@example.test',
  fullName: 'Audit Driver',
  phone: null,
  status: 'active',
  branchId: ids.branchA,
  photo: null,
  createdAt: now,
  updatedAt: now
};

function fixture(multiple = false) {
  const date = {
    id: ids.date,
    status: 'scheduled',
    startTs: '2026-12-01T00:00:00.000Z',
    endTs: '2026-12-01T09:00:00.000Z',
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
  return {
    id: ids.ticket,
    ticketNo: 9911,
    branchId: ids.branchA,
    driverId: ids.driver,
    vehicleId: ids.vehicle,
    officeId: ids.officeA,
    officeHeadId: ids.headA,
    destination: 'Audit Campus',
    purpose: 'Audit journey',
    dateRequested: '2026-11-13T00:00:00.000Z',
    preparedBy: '',
    requestedById: ids.admin,
    participantType: 'employees',
    participants: [employee.name],
    participantsCount: 1,
    participantEmployees: [{ employeeId: ids.employee, employee }],
    guides: [],
    status: 'pending_admin_approval',
    remarks: null,
    qrId: null,
    approvedByAdminId: null,
    disapprovedReason: null,
    cancellationReason: null,
    fuelAllocation: null,
    startTs: date.startTs,
    endTs: multiple ? '2026-12-03T09:00:00.000Z' : date.endTs,
    dates: multiple
      ? [
          date,
          {
            ...date,
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            startTs: '2026-12-03T00:00:00.000Z',
            endTs: '2026-12-03T09:00:00.000Z'
          }
        ]
      : [date],
    createdAt: now,
    updatedAt: now
  };
}

async function mockApi(page: Page, multiple = false, role = 'admin') {
  page.on('pageerror', (error) => console.log('BROWSER ERROR', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error')
      console.log('BROWSER CONSOLE', message.text());
  });
  const record = fixture(multiple);
  let authenticated = false;
  const currentUser = { ...admin, role };
  const patches: Record<string, unknown>[] = [];
  const paths: string[] = [];
  // All API reads and writes are intercepted. These probes never reach a database.
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    paths.push(`${request.method()} ${path}`);
    const list = (data: unknown[]) => ({ data, count: data.length });
    let json: unknown = list([]);
    if (path === '/api/auth/me') {
      if (!authenticated)
        return route.fulfill({
          status: 401,
          json: { error: { code: 'UNAUTHORIZED', message: 'Refresh required' } }
        });
      json = currentUser;
    } else if (path === '/api/auth/refresh') {
      authenticated = true;
      json = { accessToken: 'fixture-token', user: currentUser };
    } else if (path === '/api/auth/test-accounts') json = { enabled: false };
    else if (path === '/api/branches') json = list(branches);
    else if (path === '/api/offices') json = list([office]);
    else if (path === '/api/office-heads')
      json = list([
        {
          id: ids.headA,
          name: 'Branch A Head',
          branchId: ids.branchA,
          officeId: ids.officeA,
          archivedAt: null
        }
      ]);
    else if (path === '/api/users')
      json = list([
        admin,
        {
          ...admin,
          id: ids.employee,
          fullName: 'Jane Requester',
          role: 'requester'
        }
      ]);
    else if (path === '/api/drivers') json = list([driver]);
    else if (path === '/api/vehicles') json = list([vehicle]);
    else if (path === '/api/trip-tickets/guide-options') json = [employee];
    else if (path === '/api/trip-tickets') {
      if (request.method() === 'POST') {
        record.dateRequested = request.postDataJSON().dateRequested;
        json = record;
      } else json = list([record]);
    } else if (path === `/api/trip-tickets/${ids.ticket}`) {
      if (request.method() === 'PATCH') patches.push(request.postDataJSON());
      json = record;
    } else if (path === '/api/notifications')
      json = { data: [], unreadCount: 0 };
    await route.fulfill({ json });
  });
  return { record, patches, paths };
}

async function openEditor(page: Page, multiple = false) {
  const fixture = await mockApi(page, multiple);
  await page.goto(`/trip-tickets/${ids.ticket}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('#purpose')).toHaveValue('Audit journey');
  return fixture;
}

async function save(page: Page) {
  await page
    .getByRole('button', { name: 'Update Trip Ticket', exact: true })
    .click();
  const request = page.waitForRequest(
    (item) =>
      item.method() === 'PATCH' &&
      new URL(item.url()).pathname === `/api/trip-tickets/${ids.ticket}`
  );
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Update Trip Ticket', exact: true })
    .click();
  return (await request).postDataJSON() as Record<string, unknown>;
}

test('TRIP-01 branch changes clear stored office and head references', async ({
  page
}) => {
  await openEditor(page);
  const branch = page
    .getByRole('group')
    .filter({ has: page.getByText('Branch *', { exact: true }) });
  await branch.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Branch B', exact: true }).click();
  const body = await save(page);
  expect(body.branchId).toBe(ids.branchB);
  expect(body.officeId).toBeNull();
  expect(body.officeHeadId).toBeNull();
});

test('TRIP-02 pending edits cannot accept fuel values that PATCH drops', async ({
  page
}) => {
  await openEditor(page);
  const controls = page.locator('[id^="allocation_"]');
  for (const control of await controls.all())
    await expect(control).toBeDisabled();
  await expect(
    page.getByText(/fuel allocation.*approv|approv.*fuel allocation/i).first()
  ).toBeVisible();
});

test('TRIP-03 admin chooses a named requester and submits its UUID', async ({
  page
}) => {
  await openEditor(page);
  const requester = page.getByRole('combobox', { name: /^Requested By/ });
  await expect(requester).toContainText('Audit Administrator');
  await requester.click();
  await page
    .getByRole('option', { name: 'Jane Requester', exact: true })
    .click();
  const body = await save(page);
  expect(body.requestedById).toBe(ids.employee);
  expect(updateTripTicketBodySchema.safeParse(body).success).toBe(true);
});

test('TRIP-04 request date uses Manila calendar before 08:00 on a Malta device', async ({
  page
}) => {
  await page.clock.setFixedTime(new Date('2026-11-12T16:30:00.000Z'));
  await mockApi(page);
  await page.goto('/trip-tickets');
  await page
    .getByRole('button', { name: 'Create Trip Ticket', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Request Trip Ticket',
    exact: true
  });
  await dialog
    .getByRole('group')
    .filter({ has: page.getByText('Branch *', { exact: true }) })
    .getByRole('combobox')
    .click();
  await page.getByRole('option', { name: 'Branch A', exact: true }).click();
  await dialog
    .getByRole('group')
    .filter({ hasText: 'Department/Office/College' })
    .getByRole('combobox')
    .click();
  await page
    .getByRole('option', { name: 'Branch A Office', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.locator('#vehicle_id').click();
  await page.getByRole('option', { name: /Audit Van/ }).click();
  await dialog.locator('#driver_id').click();
  await page.getByRole('option', { name: /Audit Driver/ }).click();
  await dialog.locator('#destination').fill('Audit Campus');
  await dialog.locator('#purpose').fill('Midnight request date audit');
  await dialog
    .getByRole('combobox', { name: 'Participant type', exact: true })
    .click();
  await page.getByRole('option', { name: 'Employees', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Select employee participants', exact: true })
    .click();
  const picker = page.getByRole('dialog', {
    name: 'Choose employee participants',
    exact: true
  });
  await picker.getByRole('checkbox', { name: /Employee Passenger/ }).check();
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await pickDate(page, dialog.locator('[id="dates.0.date"]'), '2026-11-13');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Submit Request', exact: true })
    .click();
  const submitted = page.waitForRequest(
    (item) =>
      item.method() === 'POST' &&
      new URL(item.url()).pathname === '/api/trip-tickets'
  );
  await page
    .getByRole('alertdialog', { name: 'Submit Trip Ticket', exact: true })
    .getByRole('button', { name: 'Submit Request', exact: true })
    .click();
  const body = (await submitted).postDataJSON();
  await expect(
    page.getByText('Trip ticket created successfully!')
  ).toBeVisible();
  const localDate = await page.evaluate(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())
  );
  expect(localDate).toBe('2026-11-13');
  expect(body.dateRequested).toBe('2026-11-13');
});

test('CR-02 upcoming outing becomes primary when the previous outing ends without navigation', async ({
  page
}) => {
  const { record } = await mockApi(page, true, 'driver');
  record.status = 'approved';
  record.destination = 'Clock boundary trip';
  record.dates[0].startTs = '2026-11-13T01:00:00Z';
  record.dates[0].endTs = '2026-11-13T04:00:00Z';
  record.dates[1].startTs = '2026-11-13T05:00:00Z';
  record.dates[1].endTs = '2026-11-13T06:00:00Z';
  await page.route(/\/api\/drivers(?:\?|$)/, (route) =>
    route.fulfill({
      json: { data: [{ ...driver, userId: ids.admin }], count: 1 }
    })
  );
  const tickets = record.dates.map((date, index) => ({
    ...record,
    id: index === 0 ? ids.ticket : ids.employee,
    destination: index === 0 ? 'Morning A' : 'Afternoon B',
    startTs: date.startTs,
    endTs: date.endTs,
    dates: [date]
  }));
  await page.route(/\/api\/trip-tickets(?:\?|$)/, (route) =>
    route.fulfill({ json: { data: tickets, count: tickets.length } })
  );
  await page.clock.install({ time: new Date('2026-11-13T03:59:59.000Z') });
  await page.goto('/dashboard');
  const primary = page.getByRole('region', { name: 'Next trip', exact: true });
  await expect(
    primary.getByRole('heading', { name: 'Morning A' })
  ).toBeVisible();
  await page.clock.fastForward(2000);
  await expect(
    page
      .getByRole('region', { name: 'Next trip', exact: true })
      .getByRole('heading', { name: 'Afternoon B' })
  ).toBeVisible();
});

async function openOutings(page: Page) {
  const state = await mockApi(page, true);
  await page.goto(`/trip-tickets/${ids.ticket}`);
  await page.getByRole('button', { name: 'Edit outings', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Edit outings',
    exact: true
  });
  return { ...state, dialog };
}

test('GAP-01 closing outing edits restores keyboard focus to its trigger', async ({
  page
}) => {
  await openOutings(page);
  const trigger = page.getByRole('button', {
    name: 'Edit outings',
    exact: true
  });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Edit outings', exact: true })
  ).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('GAP-01 pending outing edits add and remove independent intervals without collapsing gaps', async ({
  page
}) => {
  const { dialog, patches } = await openOutings(page);
  await dialog.getByLabel('Outing 1 start').fill('2026-12-01T09:00');
  await dialog
    .getByRole('button', { name: 'Remove outing 2', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Add outing', exact: true }).click();
  await dialog.getByLabel('Outing 2 start').fill('2026-12-05T08:00');
  await dialog.getByLabel('Outing 2 end').fill('2026-12-05T17:00');
  await dialog
    .getByRole('button', { name: 'Save outings', exact: true })
    .click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toEqual({
    dates: [
      {
        startTs: '2026-12-01T01:00:00.000Z',
        endTs: '2026-12-01T09:00:00.000Z'
      },
      { startTs: '2026-12-05T00:00:00.000Z', endTs: '2026-12-05T09:00:00.000Z' }
    ]
  });
});

test('GAP-01 invalid intervals are blocked and failed valid edits retain their drafts', async ({
  page
}) => {
  const { dialog, patches } = await openOutings(page);
  await dialog.getByLabel('Outing 2 start').fill('2026-12-01T08:30');
  await dialog.getByLabel('Outing 2 end').fill('2026-12-01T09:30');
  await dialog
    .getByRole('button', { name: 'Save outings', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(/overlap/i);
  expect(patches).toHaveLength(0);
  await dialog.getByLabel('Outing 2 end').fill('2026-12-01T07:30');
  await dialog
    .getByRole('button', { name: 'Save outings', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(/end.*after.*start/i);
  expect(patches).toHaveLength(0);
  await dialog.getByLabel('Outing 2 start').fill('2026-12-05T08:00');
  await dialog.getByLabel('Outing 2 end').fill('2026-12-05T17:00');
  await page.route(`**/api/trip-tickets/${ids.ticket}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({
      status: 409,
      json: {
        error: {
          code: 'VEHICLE_UNAVAILABLE',
          message: 'Vehicle already booked'
        }
      }
    });
  });
  await dialog
    .getByRole('button', { name: 'Save outings', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Outing 2 start')).toHaveValue(
    '2026-12-05T08:00'
  );
  await expect(page.getByText('Vehicle already booked').first()).toBeVisible();
});

test('TRIP-03 requester sees a read-only human name and cannot reassign ownership', async ({
  page
}) => {
  await mockApi(page, false, 'requester');
  await page.goto(`/trip-tickets/${ids.ticket}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel(/^Requested By/)).toBeDisabled();
  await expect(page.getByLabel(/^Requested By/)).toHaveValue(
    'Audit Administrator'
  );
  await page.locator('#purpose').fill('Requester purpose edit');
  expect(await save(page)).not.toHaveProperty('requestedById');
});

test('GAP-01 unchanged intervals retain precise instants and saving no changes preserves identities', async ({
  page
}) => {
  const { record, patches } = await mockApi(page, true);
  record.dates[0].startTs = '2026-12-01T00:00:12.345Z';
  record.dates[0].endTs = '2026-12-01T09:00:45.678Z';
  await page.goto(`/trip-tickets/${ids.ticket}`);
  await page.getByRole('button', { name: 'Edit outings', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Edit outings', exact: true });
  await dialog
    .getByRole('button', { name: 'Save outings', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(patches).toHaveLength(0);
  await page.getByRole('button', { name: 'Edit outings', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit outings', exact: true });
  await dialog.getByLabel('Outing 2 start').fill('2026-12-03T09:30');
  await dialog
    .getByRole('button', { name: 'Save outings', exact: true })
    .click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].dates).toEqual([
    { startTs: '2026-12-01T00:00:12.345Z', endTs: '2026-12-01T09:00:45.678Z' },
    { startTs: '2026-12-03T01:30:00.000Z', endTs: '2026-12-03T09:00:00.000Z' }
  ]);
});

test('GAP-01 last outing cannot be removed and a new blank interval cannot save', async ({
  page
}) => {
  const { dialog, patches } = await openOutings(page);
  await dialog
    .getByRole('button', { name: 'Remove outing 2', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Remove outing 1', exact: true })
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Add outing', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Save outings', exact: true })
    .click();
  expect(patches).toHaveLength(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Outing 2 start')).toBeFocused();
});
