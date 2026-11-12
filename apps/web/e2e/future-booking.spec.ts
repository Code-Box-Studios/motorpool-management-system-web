import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from '@playwright/test';
import {
  apiGet,
  apiLogin,
  CREDENTIALS,
  listData,
  login,
  pickDate
} from './helpers';

test.use({ timezoneId: 'Asia/Manila' });

// Real response templates keep the API adapters in this browser regression.
// Fleet/detail reads are fixtures; every business mutation is intercepted.
async function bookingFixture(request: APIRequestContext) {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const [vehicleRows, ticketRows] = await Promise.all([
    apiGet(request, '/api/vehicles', admin.token),
    apiGet(request, '/api/trip-tickets', admin.token)
  ]);
  const [vehicle] = listData(vehicleRows);
  const [ticket] = listData(ticketRows);
  expect(vehicle, 'Seeded vehicle is required').toBeTruthy();
  expect(ticket, 'Seeded trip ticket is required').toBeTruthy();
  const vehicles = [
    'available',
    'on_trip',
    'under_maintenance',
    'out_of_service'
  ].map((status, index) => ({
    ...vehicle,
    id: randomUUID(),
    make: 'Booking',
    model: status,
    licensePlate: `FUTURE-${index}`,
    status,
    capacity: 20
  }));
  const future = new Date(Date.now() + 14 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const startTs = `${future}T00:00:00.000Z`;
  const endTs = `${future}T09:00:00.000Z`;
  const employeeId = randomUUID();
  const record = {
    ...ticket,
    id: randomUUID(),
    vehicleId: vehicles[0]!.id,
    status: 'pending_admin_approval',
    participantType: 'employees',
    participants: ['Future booking employee'],
    participantsCount: 1,
    participantEmployees: [
      {
        employeeId,
        employee: {
          id: employeeId,
          name: 'Future booking employee',
          position: null,
          archivedAt: null
        }
      }
    ],
    guides: [],
    startTs,
    endTs,
    dates: [
      {
        ...(ticket!.dates as Record<string, unknown>[])[0],
        id: randomUUID(),
        status: 'scheduled',
        startTs,
        endTs
      }
    ]
  };
  return { vehicles, future, record };
}

async function interceptBooking(
  page: Page,
  fixture: Awaited<ReturnType<typeof bookingFixture>>
) {
  const submitted: { method: string; body: Record<string, unknown> }[] = [];
  const unexpectedWrites: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (path.startsWith('/api/auth/')) {
        await route.continue();
        return;
      }
      if (
        (method === 'POST' && path === '/api/trip-tickets') ||
        (method === 'PATCH' &&
          path === `/api/trip-tickets/${fixture.record.id}`)
      ) {
        submitted.push({ method, body: request.postDataJSON() });
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'VEHICLE_DOUBLE_BOOKED',
              message: 'This vehicle is already booked for the requested window'
            }
          }
        });
        return;
      }
      unexpectedWrites.push(`${method} ${path}`);
      await route.abort('blockedbyclient');
      return;
    }
    if (path === '/api/vehicles') {
      await route.fulfill({
        json: { data: fixture.vehicles, count: fixture.vehicles.length }
      });
      return;
    }
    if (path === `/api/trip-tickets/${fixture.record.id}`) {
      await route.fulfill({ json: fixture.record });
      return;
    }
    await route.continue();
  });
  return { submitted, unexpectedWrites };
}

test('future create offers current trip and maintenance vehicles and still surfaces reservation conflicts', async ({
  page,
  request
}, testInfo) => {
  const fixture = await bookingFixture(request);
  const { submitted, unexpectedWrites } = await interceptBooking(page, fixture);
  await login(page, 'admin');
  await page.goto('/trip-tickets');
  await page
    .getByRole('button', { name: 'Create Trip Ticket', exact: true })
    .click();
  const form = page.getByRole('dialog', {
    name: 'Request Trip Ticket',
    exact: true
  });
  for (const label of ['Branch', 'Department/Office/College']) {
    await form
      .getByRole('group')
      .filter({ hasText: label })
      .getByRole('combobox')
      .click();
    await page.getByRole('option').first().click();
  }
  await form.getByRole('button', { name: 'Continue', exact: true }).click();
  await form.locator('#vehicle_id').click();
  const picker = page.getByRole('dialog', {
    name: 'Choose a vehicle',
    exact: true
  });
  await picker.getByRole('option', { name: /Booking available/ }).click();
  await form.locator('#driver_id').click();
  await page
    .getByRole('dialog', { name: 'Choose a driver', exact: true })
    .getByRole('option')
    .first()
    .click();
  await form.locator('#destination').fill('Future booking destination');
  await form.locator('#purpose').fill('Future booking regression');
  await form.getByPlaceholder('Participant 1', { exact: true }).fill('Student');
  await form
    .getByRole('button', { name: 'Select guides', exact: true })
    .click();
  const guides = page.getByRole('dialog', {
    name: 'Choose guides',
    exact: true
  });
  await guides.getByRole('checkbox').first().check();
  await guides.getByRole('button', { name: 'Done', exact: true }).click();
  await form.getByRole('button', { name: 'Continue', exact: true }).click();
  await pickDate(
    page,
    form.locator('button[id="dates.0.date"]'),
    fixture.future
  );
  await form.getByRole('button', { name: 'Back', exact: true }).click();
  await form.locator('#vehicle_id').click();
  await expect(picker.getByRole('option')).toHaveCount(3);
  await expect(
    picker.getByRole('option', { name: /Booking under_maintenance/ })
  ).toContainText('Current status: In the shop');
  await expect(
    picker.getByRole('option', { name: /Booking on_trip/ })
  ).toContainText('Current status: On the road');
  await expect(picker).toContainText(
    'Availability is checked for your requested dates.'
  );
  await expect(
    picker.getByRole('option', { name: /Booking out_of_service/ })
  ).toHaveCount(0);
  await picker.getByRole('option', { name: /Booking on_trip/ }).click();
  await expect(form.locator('#vehicle_id')).toContainText('Booking on_trip');
  await expect(form).toContainText('2 of 20 seats (1 guide)');
  await form.getByRole('button', { name: 'Continue', exact: true }).click();
  await form.getByRole('button', { name: 'Continue', exact: true }).click();
  await form
    .getByRole('button', { name: 'Submit Request', exact: true })
    .click();
  await page
    .getByRole('alertdialog', { name: 'Submit Trip Ticket', exact: true })
    .getByRole('button', { name: 'Submit Request', exact: true })
    .click();
  await expect(page.getByText(/Failed to create trip ticket:/)).toContainText(
    'already booked for the requested window'
  );
  expect(submitted).toHaveLength(1);
  expect(submitted[0]!.body).toMatchObject({
    vehicleId: fixture.vehicles[1]!.id,
    participantType: 'students',
    participants: ['Student'],
    dates: [
      {
        startTs: `${fixture.future}T00:00:00.000Z`,
        endTs: `${fixture.future}T09:00:00.000Z`
      }
    ]
  });
  expect(submitted[0]!.body.guideIds).toHaveLength(1);
  await expect(form).toBeVisible();
  expect(unexpectedWrites).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('future-create-conflict.png'),
    fullPage: true
  });
});

for (const selectedStatus of ['available', 'out_of_service']) {
  test(`pending future edit offers trip and maintenance alternatives while keeping selected ${selectedStatus}`, async ({
    page,
    request
  }, testInfo) => {
    const fixture = await bookingFixture(request);
    fixture.record.vehicleId = fixture.vehicles.find(
      (vehicle) => vehicle.status === selectedStatus
    )!.id;
    const { submitted, unexpectedWrites } = await interceptBooking(
      page,
      fixture
    );
    await login(page, 'admin');
    await page.goto(`/trip-tickets/${fixture.record.id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('#start_ts')).toHaveValue(
      `${fixture.future}T08:00`
    );
    const vehicle = page
      .locator('#edit-trip-ticket-form')
      .getByRole('group')
      .filter({ hasText: /^Vehicle/ })
      .getByRole('combobox');
    await expect(vehicle).toContainText(`Booking ${selectedStatus}`);
    await vehicle.click();
    await expect(page.getByRole('option')).toHaveCount(
      selectedStatus === 'out_of_service' ? 4 : 3
    );
    await expect(
      page.getByRole('option', { name: /Booking on_trip/ })
    ).toContainText('Current status: On the road');
    await expect(
      page.getByRole('option', { name: /Booking under_maintenance/ })
    ).toContainText('Current status: In the shop');
    await expect(
      page.getByRole('option', { name: /Booking out_of_service/ })
    ).toHaveCount(selectedStatus === 'out_of_service' ? 1 : 0);
    await page
      .getByRole('option', { name: /Booking under_maintenance/ })
      .click();
    await expect(vehicle).toContainText('Booking under_maintenance');
    await page
      .getByRole('button', { name: 'Update Trip Ticket', exact: true })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Update Trip Ticket', exact: true })
      .click();
    await expect(page.getByText(/Failed to update trip ticket:/)).toContainText(
      'already booked for the requested window'
    );
    expect(submitted).toHaveLength(1);
    expect(submitted[0]!.body).toHaveProperty(
      'vehicleId',
      fixture.vehicles[2]!.id
    );
    expect(submitted[0]!.body).not.toHaveProperty('startTs');
    expect(submitted[0]!.body).not.toHaveProperty('endTs');
    expect(submitted[0]!.body).not.toHaveProperty('dates');
    expect(unexpectedWrites).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('future-edit-conflict.png'),
      fullPage: true
    });
  });
}
