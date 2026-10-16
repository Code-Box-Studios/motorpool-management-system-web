import { test, expect, type Page, type Locator } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import {
  login,
  apiLogin,
  apiGet,
  CREDENTIALS,
  listData,
  pickDate
} from './helpers';

// These fixtures exercise the running API, not mocked HTTP responses. Refuse
// fixture writes anywhere except the disposable audit database.
const databaseUrl = process.env.E2E_AUDIT_DATABASE_URL;
if (
  databaseUrl &&
  !/^\/mms_fix(?:_\d+)?$/.test(new URL(databaseUrl).pathname)
) {
  throw new Error('Audit fixtures require a disposable mms_fix database');
}
const requireApi = createRequire(
  new URL('../../api/package.json', import.meta.url)
);
const { PrismaClient } = requireApi(
  '@prisma/client'
) as typeof import('../../api/node_modules/@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const marker = `Audit-${randomUUID()}`;
const ticketIds: string[] = [];
const driverIds: string[] = [];
const vehicleIds: string[] = [];
const employeeIds: string[] = [];
const toolIds: string[] = [];
let branchId: string;
let requesterId: string;
let linkedDriverId: string;
let originalEmail: string;

const group = (scope: Locator, name: string) =>
  scope.getByRole('group').filter({ hasText: name });
async function firstOption(page: Page, trigger: Locator) {
  await trigger.click();
  await page.getByRole('option').first().click();
}
async function fixtureTrip(
  status:
    | 'pending_admin_approval'
    | 'pending_fuel_allocation_approval'
    | 'approved'
    | 'cancelled',
  driverId = linkedDriverId,
  destination = marker
) {
  const vehicle = await db.vehicle.findFirstOrThrow({
    where: { id: { in: vehicleIds } }
  });
  const day = new Date(Date.now() + (150 + ticketIds.length) * 86400000);
  const trip = await db.tripTicket.create({
    data: {
      branchId,
      driverId,
      vehicleId: vehicle.id,
      requestedById: requesterId,
      preparedBy: requesterId,
      dateRequested: new Date(),
      destination,
      purpose: 'Audit browser regression',
      participants: ['Dela Cruz, Juan'],
      participantsCount: 1,
      status,
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
  ticketIds.push(trip.id);
  return trip;
}

test.describe('audit regressions', () => {
  test.use({ timezoneId: 'Asia/Manila' });
  test.skip(!databaseUrl, 'Requires disposable E2E_AUDIT_DATABASE_URL');
  test.beforeAll(async () => {
    if (!/^\/mms_fix(?:_\d+)?$/.test(new URL(databaseUrl!).pathname))
      throw new Error('Audit fixtures require mms_fix');
    const requester = await db.user.findUniqueOrThrow({
      where: { email: CREDENTIALS.requester }
    });
    requesterId = requester.id;
    branchId = requester.branchId!;
    const driver = await db.driver.findFirstOrThrow({
      where: { user: { email: CREDENTIALS.driver } }
    });
    linkedDriverId = driver.id;
    originalEmail = driver.email;
    const vehicle = await db.vehicle.create({
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
    vehicleIds.push(vehicle.id);
  });
  test.afterAll(async () => {
    try {
      if (linkedDriverId && originalEmail)
        await db.driver.update({
          where: { id: linkedDriverId },
          data: { email: originalEmail }
        });
      await db.tripTicket.deleteMany({
        where: {
          OR: [
            { id: { in: ticketIds } },
            { destination: { startsWith: marker } }
          ]
        }
      });
      await db.jobOrder.deleteMany({
        where: { incidentDetails: { startsWith: marker } }
      });
      await db.tool.deleteMany({ where: { id: { in: toolIds } } });
      await db.gpsData.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
      await db.employee.deleteMany({ where: { id: { in: employeeIds } } });
      await db.driver.deleteMany({ where: { id: { in: driverIds } } });
      await db.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    } finally {
      await db.$disconnect();
    }
  });

  test('F01 valid GPS points keep dashboard and map stable', async ({
    page
  }) => {
    await db.gpsData.create({
      data: { vehicleId: vehicleIds[0], latitude: 7.0731, longitude: 125.6128 }
    });
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, 'admin');
    for (const path of ['/dashboard', '/gps-map']) {
      await page.goto(path);
      await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
      await page.waitForTimeout(500);
      expect(errors.filter((e) => /Maximum update depth/.test(e))).toEqual([]);
    }
  });

  test('F08 sparse driver edits succeed and optional dates can be cleared', async ({
    page,
    request
  }) => {
    const driver = await db.driver.create({
      data: {
        email: `${marker}@example.test`,
        fullName: marker,
        licenseNumber: marker
      }
    });
    driverIds.push(driver.id);
    await login(page, 'admin');
    await page.goto(`/drivers/${driver.id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#full_name').fill(`${marker} updated`);
    await page.getByRole('button', { name: 'Save Details' }).click();
    const confirm = page.getByRole('alertdialog');
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/drivers/${driver.id}`) &&
        r.request().method() === 'PATCH'
    );
    await confirm.getByRole('button', { name: 'Save Details' }).click();
    expect((await saved).status()).toBe(200);
    await expect(confirm).toBeHidden();
    await db.driver.update({
      where: { id: driver.id },
      data: {
        dateOfBirth: new Date('1990-01-01'),
        hireDate: new Date('2020-01-01'),
        licenseExpiry: new Date('2030-01-01')
      }
    });
    await page.reload();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    for (const input of await page.locator('input[type=date]').all())
      await input.fill('');
    await page.getByRole('button', { name: 'Save Details' }).click();
    const cleared = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/drivers/${driver.id}`) &&
        r.request().method() === 'PATCH'
    );
    await confirm.getByRole('button', { name: 'Save Details' }).click();
    expect((await cleared).status()).toBe(200);
    const admin = await apiLogin(request, CREDENTIALS.admin);
    const row = (await apiGet(
      request,
      `/api/drivers/${driver.id}`,
      admin.token
    )) as Record<string, unknown>;
    expect([row.dateOfBirth, row.hireDate, row.licenseExpiry]).toEqual([
      null,
      null,
      null
    ]);
  });

  test('F09 requester booking preserves a participant comma', async ({
    page,
    request
  }) => {
    const requesterSession = await apiLogin(request, CREDENTIALS.requester);
    const guides = listData(
      await apiGet(
        request,
        '/api/trip-tickets/guide-options',
        requesterSession.token
      )
    );
    const guide = guides.find((user) => user.role === 'requester') ?? guides[0];
    expect(guide, 'an eligible user exists to guide the trip').toBeTruthy();
    await login(page, 'requester');
    await page.getByRole('button', { name: /Request a trip/i }).click();
    const dialog = page.getByRole('dialog');
    if (await group(dialog, 'Branch').getByRole('combobox').isEnabled())
      await firstOption(page, group(dialog, 'Branch').getByRole('combobox'));
    await firstOption(
      page,
      group(dialog, 'Department/Office/College').getByRole('combobox')
    );
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await group(dialog, 'Vehicle').getByRole('combobox').click();
    await page.getByRole('option', { name: new RegExp(marker) }).click();
    await firstOption(
      page,
      dialog.getByRole('combobox').filter({ hasText: /^Select a driver$/ })
    );
    await dialog.locator('#destination').fill(`${marker} booked`);
    await dialog.locator('#purpose').fill('Audit comma booking');
    await dialog
      .getByPlaceholder('Participant 1', { exact: true })
      .fill('Dela Cruz, Juan');
    await dialog.getByRole('combobox', { name: 'Guide 1' }).click();
    const roleLabel = guide.role === 'driver' ? 'Driver' : 'Requester';
    await page
      .getByRole('option', {
        name: `${guide.fullName} — ${roleLabel}`,
        exact: true
      })
      .click();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await pickDate(
      page,
      dialog.locator('button[id="dates.0.date"]'),
      '2034-01-20'
    );
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('button', { name: 'Submit Request' }).click();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/trip-tickets') && r.request().method() === 'POST'
    );
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Submit Request' })
      .click();
    expect((await response).status()).toBe(201);
    const requester = await apiLogin(request, CREDENTIALS.requester);
    const ticket = listData(
      await apiGet(request, '/api/trip-tickets', requester.token)
    ).find((t) => t.destination === `${marker} booked`)!;
    expect(ticket.participants).toEqual(['Dela Cruz, Juan']);
    expect(ticket.participantsCount).toBe(1);
  });

  test('F10 driver tools stay readable without admin write actions', async ({
    page
  }) => {
    const tool = await db.tool.create({ data: { name: marker } });
    toolIds.push(tool.id);
    await login(page, 'driver');
    await page.goto('/tools');
    await expect(
      page.getByRole('heading', { name: 'Tools', exact: true })
    ).toBeVisible();
    await expect
      .soft(page.getByRole('link', { name: 'Add Tool' }))
      .toHaveCount(0);
    await page.goto(`/tools/${tool.id}`);
    await expect(page.getByRole('heading', { name: marker })).toBeVisible();
    await expect
      .soft(page.getByRole('button', { name: 'Edit', exact: true }))
      .toHaveCount(0);
    await page.goto('/tools/add-tools');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('F11 linked driver remains identified after contact-email change', async ({
    page
  }) => {
    await fixtureTrip('approved', linkedDriverId, `${marker} linked trip`);
    await db.driver.update({
      where: { id: linkedDriverId },
      data: { email: `${marker}-contact@example.test` }
    });
    try {
      await login(page, 'driver');
      await expect(page.getByText(/couldn't find a driver record/)).toHaveCount(
        0
      );
      await expect(
        page.getByText(`${marker} linked trip`, { exact: true })
      ).toBeVisible();
    } finally {
      await db.driver.update({
        where: { id: linkedDriverId },
        data: { email: originalEmail }
      });
    }
  });

  test('F12 operational screens retain older action behind 101 terminal rows', async ({
    page
  }) => {
    const actionable = await fixtureTrip(
      'pending_fuel_allocation_approval',
      linkedDriverId,
      `${marker} older action`
    );
    await db.tripTicket.update({
      where: { id: actionable.id },
      data: {
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01')
      }
    });
    await db.tripTicket.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        branchId,
        driverId: linkedDriverId,
        vehicleId: vehicleIds[0],
        requestedById: requesterId,
        preparedBy: requesterId,
        dateRequested: new Date(),
        destination: `${marker} terminal ${i}`,
        purpose: 'Audit queue boundary',
        status: 'cancelled' as const,
        participants: ['Passenger'],
        participantsCount: 1
      }))
    });
    await db.jobOrder.create({
      data: {
        branchId,
        vehicleId: vehicleIds[0],
        requestedById: requesterId,
        incidentDetails: `${marker} older repair`,
        status: 'assigned_mechanic',
        assignedMechanicId: linkedDriverId,
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01')
      }
    });
    await db.jobOrder.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        branchId,
        vehicleId: vehicleIds[0],
        incidentDetails: `${marker} terminal repair ${i}`,
        status: 'repaired' as const
      }))
    });
    for (const role of ['evp', 'requester', 'driver'] as const) {
      await page.context().clearCookies();
      await login(page, role);
      await expect
        .soft(page.getByText(`${marker} older action`, { exact: true }))
        .toBeVisible();
      if (role === 'evp')
        await expect(
          page.getByRole('heading', {
            name: new RegExp(`${marker} older repair`)
          })
        ).toBeVisible();
      if (role === 'requester') {
        await expect(
          page.getByRole('button', { name: 'Next page' })
        ).toHaveCount(1);
        await page.getByRole('button', { name: 'Next page' }).click();
        await expect(page.getByText(/^2 of \d+$/)).toBeVisible();
      }
    }
    const gate = await fixtureTrip(
      'approved',
      linkedDriverId,
      `${marker} gate action`
    );
    await db.tripTicket.update({
      where: { id: gate.id },
      data: {
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2020-01-01')
      }
    });
    await db.tripDate.updateMany({
      where: { tripTicketId: gate.id },
      data: { startTs: new Date(), endTs: new Date(Date.now() + 3600000) }
    });
    await page.context().clearCookies();
    await login(page, 'guard');
    await expect(page.getByText(`${marker} gate action`).first()).toBeVisible();
  });

  test('F13 pending owner and admin edit preserves comma; frozen tickets cannot edit', async ({
    page
  }) => {
    const pending = await fixtureTrip(
      'pending_admin_approval',
      linkedDriverId,
      `${marker} pending edit`
    );
    const originalDates = await db.tripDate.findMany({
      where: { tripTicketId: pending.id }
    });
    for (const role of ['requester', 'admin'] as const) {
      await page.context().clearCookies();
      await login(page, role);
      await page.goto(`/trip-tickets/${pending.id}`);
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByPlaceholder('Participant 1 name').fill('Dela Cruz, Juan');
      await page.locator('#purpose').fill(`Edited by ${role}`);
      await page
        .getByRole('button', { name: 'Update Trip Ticket', exact: true })
        .click();
      const saved = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/trip-tickets/${pending.id}`) &&
          r.request().method() === 'PATCH'
      );
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Update Trip Ticket' })
        .click();
      const response = await saved;
      expect(response.status()).toBe(200);
      expect(response.request().postDataJSON()).not.toHaveProperty(
        'dateRequested'
      );
      expect(
        (await db.tripTicket.findUniqueOrThrow({ where: { id: pending.id } }))
          .participants
      ).toEqual(['Dela Cruz, Juan']);
      expect(
        await db.tripDate.findMany({ where: { tripTicketId: pending.id } })
      ).toEqual(originalDates);
      expect(
        (await db.tripTicket.findUniqueOrThrow({ where: { id: pending.id } }))
          .dateRequested
      ).toEqual(pending.dateRequested);
      if (role === 'requester') {
        await page.waitForURL(/\/dashboard$/);
        await page
          .locator('li')
          .filter({ hasText: `${marker} pending edit` })
          .getByRole('link', { name: 'View request details' })
          .click();
        await expect(
          page.getByText('Edited by requester', { exact: true })
        ).toBeVisible();
      }
    }
    await page.goto(`/trip-tickets/${pending.id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#start_ts').fill('2034-06-15T09:00');
    await page.locator('#end_ts').fill('2034-06-15T17:00');
    await page
      .getByRole('button', { name: 'Update Trip Ticket', exact: true })
      .click();
    const rescheduled = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/trip-tickets/${pending.id}`) &&
        r.request().method() === 'PATCH'
    );
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Update Trip Ticket' })
      .click();
    expect((await rescheduled).status()).toBe(200);
    const updatedDate = await db.tripDate.findFirstOrThrow({
      where: { tripTicketId: pending.id }
    });
    expect(updatedDate.startTs.toISOString()).toBe('2034-06-15T01:00:00.000Z');
    expect(updatedDate.endTs.toISOString()).toBe('2034-06-15T09:00:00.000Z');
    await db.tripTicket.update({
      where: { id: pending.id },
      data: { status: 'approved' }
    });
    await page.goto(`/trip-tickets/${pending.id}`);
    await expect(
      page.getByRole('heading', { name: `${marker} pending edit` })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Edit', exact: true })
    ).toHaveCount(0);
  });

  test('F14 requester resource children and trailing slash are denied; shared routes remain open', async ({
    page
  }) => {
    test.setTimeout(90000);
    await login(page, 'requester');
    for (const path of [
      '/maintenance/',
      '/maintenance/add-maintenance',
      `/maintenance/${randomUUID()}`,
      '/vehicles/add-vehicle',
      `/drivers/${randomUUID()}`,
      '/spare-parts/add-spare-part',
      '/user-management/add-user',
      '/tracker-devices/add-device'
    ]) {
      await page.goto(path);
      await expect.soft(page).toHaveURL(/\/dashboard$/);
    }
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile$/);
    await page.context().clearCookies();
    await login(page, 'guard');
    await expect(page.getByText('Gate check').first()).toBeVisible();
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('F14 shared detail and profile access follows all five API roles', async ({
    page
  }) => {
    test.setTimeout(90000);
    const trip = await fixtureTrip(
      'pending_admin_approval',
      linkedDriverId,
      `${marker} shared trip`
    );
    const job = await db.jobOrder.create({
      data: {
        branchId,
        vehicleId: vehicleIds[0],
        requestedById: requesterId,
        assignedMechanicId: linkedDriverId,
        incidentDetails: `${marker} shared repair`
      }
    });
    const tool = await db.tool.create({
      data: { name: `${marker} shared tool` }
    });
    toolIds.push(tool.id);
    for (const role of [
      'admin',
      'requester',
      'driver',
      'evp',
      'guard'
    ] as const) {
      await page.context().clearCookies();
      await login(page, role);
      await page.goto('/profile');
      await expect(
        page.getByRole('heading', { name: 'My Profile' })
      ).toBeVisible();
      await page.goto(`/trip-tickets/${trip.id}`);
      await expect(
        page.getByRole('heading', {
          name: `${marker} shared trip`,
          exact: true
        })
      ).toBeVisible();
      if (role !== 'admin' && role !== 'requester')
        await expect(
          page.getByRole('button', { name: 'Edit', exact: true })
        ).toHaveCount(0);
      await page.goto(`/job-order/${job.id}`);
      if (role === 'guard') await expect(page).toHaveURL(/\/dashboard$/);
      else
        await expect(
          page.getByRole('heading', {
            name: `${marker} shared repair`,
            exact: true
          })
        ).toBeVisible();
      await page.goto(`/tools/${tool.id}`);
      if (role === 'admin' || role === 'driver')
        await expect(
          page.getByRole('heading', {
            name: `${marker} shared tool`,
            exact: true
          })
        ).toBeVisible();
      else await expect(page).toHaveURL(/\/dashboard$/);
    }
  });

  test('F15 missing details resolve into clear errors', async ({ page }) => {
    test.setTimeout(90000);
    await login(page, 'admin');
    for (const resource of [
      'tools',
      'vehicles',
      'spare-parts',
      'trip-tickets'
    ]) {
      await page.goto(`/${resource}/${randomUUID()}`);
      await expect
        .soft(page.getByText(/not found|Unable to load/i).first())
        .toBeVisible({ timeout: 15000 });
      await expect
        .soft(page.getByText('Loading...', { exact: true }))
        .toHaveCount(0);
    }
  });

  test('F16 maintenance calendar day initializes form date and rejects invalid search', async ({
    page
  }) => {
    await login(page, 'admin');
    await page.goto('/maintenance');
    await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
    const day = page
      .locator('.fc-daygrid-day[data-date]')
      .filter({ has: page.locator('.fc-daygrid-day-number') })
      .first();
    const date = await day.getAttribute('data-date');
    await day.click();
    await expect(page).toHaveURL(/maintenance\/add-maintenance/);
    await expect(page.locator('#date')).toHaveValue(date!);
    await page.goto(
      '/maintenance/add-maintenance?date=2034-06-15T09%3A00%3A00%2B08%3A00'
    );
    await expect(page.locator('#date')).toHaveValue('2034-06-15');
    await page.goto('/maintenance/add-maintenance?date=2026-02-31');
    await expect(page.locator('#date')).toHaveValue('');
  });
});
