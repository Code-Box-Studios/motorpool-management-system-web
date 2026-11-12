import { expect, test, type Locator, type Page } from '@playwright/test';

// Real route/components/query caches, with every API request intercepted. These
// fixtures never authenticate against or write to a database.
const ids = {
  user: '82000000-0000-4000-8000-000000000001',
  order: '82000000-0000-4000-8000-000000000002',
  vehicle: '82000000-0000-4000-8000-000000000003',
  branch: '82000000-0000-4000-8000-000000000004',
  mechanic: '82000000-0000-4000-8000-000000000005',
  part: '82000000-0000-4000-8000-000000000006',
  secondPart: '82000000-0000-4000-8000-000000000007'
};
const revision = '2026-11-12T00:00:00.000Z';
const actor = {
  id: ids.user,
  email: 'repair-admin@example.test',
  fullName: 'Repair Fixture Administrator',
  avatarUrl: null,
  role: 'admin',
  branchId: ids.branch,
  status: 'active',
  createdAt: revision
};
const vehicle = {
  id: ids.vehicle,
  make: 'Fixture',
  model: 'Repair Van',
  year: 2024,
  vin: 'REPAIRFIXTUREVIN',
  licensePlate: 'REPAIR-ONLY',
  capacity: 10,
  fuelType: 'diesel',
  mileage: 25000,
  status: 'under_maintenance',
  images: [],
  branchId: ids.branch,
  maintenanceStandardId: null,
  insuranceExpiry: '2027-11-12T00:00:00.000Z',
  registrationExpiry: '2027-11-12T00:00:00.000Z',
  createdAt: revision,
  updatedAt: revision
};
const mechanic = {
  id: ids.mechanic,
  userId: null,
  email: 'mechanic@example.test',
  fullName: 'Fixture Mechanic',
  phone: null,
  address: null,
  dateOfBirth: null,
  licenseNumber: null,
  licenseType: null,
  licenseExpiry: null,
  status: 'active',
  assignedVehicleId: null,
  branchId: ids.branch,
  sssNumber: null,
  tin: null,
  hireDate: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  notes: null,
  photo: null,
  createdAt: revision,
  updatedAt: revision
};
const parts = [
  { id: ids.part, name: 'Fixture Coolant', quantity: 10 },
  { id: ids.secondPart, name: 'Fixture Filter', quantity: 20 }
].map((part) => ({
  ...part,
  brand: 'OEM',
  description: null,
  image: null,
  createdAt: revision,
  updatedAt: revision
}));
const conflict = 'Another operator changed this record. Retry your draft.';
type Transition = 'note' | 'complete-repair';
type Entry = 'list' | 'detail';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function fixtures(page: Page, transition: Transition) {
  const pendingRetry = gate();
  const payloads: unknown[] = [];
  const unexpectedWrites: string[] = [];
  const order = {
    id: ids.order,
    orderNo: 98002,
    vehicleId: ids.vehicle,
    branchId: ids.branch,
    status: transition === 'note' ? 'pending' : 'ongoing_repair',
    incidentDate: revision,
    incidentDetails: 'Fixture repair request',
    requestedById: ids.user,
    notedById: transition === 'note' ? null : ids.user,
    approvedById: transition === 'note' ? null : ids.user,
    assignedMechanicId: transition === 'note' ? null : ids.mechanic,
    dateOfRequest: transition === 'note' ? null : revision,
    dateApproved: transition === 'note' ? null : revision,
    targetDate: transition === 'note' ? null : '2026-11-20T16:30:00Z',
    actualDateOfRelease: null,
    repairDone: null,
    maintenanceType: 'corrective',
    serviceLocation: 'motorpool',
    remarks: null,
    createdAt: revision,
    updatedAt: revision,
    vehicle: {
      id: ids.vehicle,
      make: vehicle.make,
      model: vehicle.model,
      licensePlate: vehicle.licensePlate
    },
    spareParts: []
  };
  const state = { changed: false };
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const send = (json: unknown) => route.fulfill({ json });
    if (path === '/api/auth/me') return send(actor);
    if (path === '/api/auth/refresh')
      return send({ accessToken: 'repair-fixture-token' });
    if (path === '/api/auth/test-accounts') return send({ enabled: false });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      if (
        request.method() === 'POST' &&
        path === `/api/job-orders/${ids.order}/${transition}`
      ) {
        payloads.push(request.postDataJSON());
        if (payloads.length === 1)
          return route.fulfill({
            status: 409,
            json: { error: { code: 'REPAIR_CONFLICT', message: conflict } }
          });
        await pendingRetry.promise;
        order.status = transition === 'note' ? 'assigned_mechanic' : 'repaired';
        return send(order);
      }
      unexpectedWrites.push(`${request.method()} ${path}`);
      return route.fulfill({
        status: 409,
        json: {
          error: { code: 'FIXTURE_WRITE_BLOCKED', message: 'Write blocked.' }
        }
      });
    }
    if (path === `/api/job-orders/${ids.order}`)
      return send({
        ...order,
        maintenanceType: state.changed ? 'inspection' : order.maintenanceType,
        serviceLocation: state.changed ? 'outside' : order.serviceLocation
      });
    if (path === '/api/job-orders')
      return send({
        data: [
          {
            ...order,
            maintenanceType: state.changed
              ? 'inspection'
              : order.maintenanceType,
            serviceLocation: state.changed ? 'outside' : order.serviceLocation
          }
        ],
        count: 1
      });
    if (path === '/api/drivers') return send({ data: [mechanic], count: 1 });
    if (path === '/api/vehicles') return send({ data: [vehicle], count: 1 });
    if (path === '/api/spare-parts') return send({ data: parts, count: 2 });
    if (path === '/api/users') return send({ data: [actor], count: 1 });
    if (path === '/api/branches')
      return send({
        data: [
          {
            id: ids.branch,
            name: 'Fixture Branch',
            location: null,
            archivedAt: null
          }
        ],
        count: 1
      });
    if (path === '/api/notifications') return send({ data: [], unread: 0 });
    return send({ data: [], count: 0 });
  });
  return { pendingRetry, payloads, unexpectedWrites, state };
}

async function open(page: Page, entry: Entry, transition: Transition) {
  await page.goto(entry === 'list' ? '/job-order' : `/job-order/${ids.order}`);
  await page
    .getByRole('button', {
      name: transition === 'note' ? 'Note Job Order' : 'Mark as Repaired',
      exact: true
    })
    .click();
  const dialog = page.getByRole('alertdialog', {
    name: transition === 'note' ? 'Note Job Order' : 'Complete Repair',
    exact: true
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillNote(page: Page, dialog: Locator) {
  await dialog.locator('#date_of_request').fill('2026-11-12T10:15');
  await dialog.locator('#target_date').fill('2026-11-20T16:30');
  await dialog.getByRole('combobox').click();
  await page
    .getByRole('option', { name: 'Fixture Mechanic', exact: true })
    .click();
  await dialog.getByText('Select spare parts...', { exact: true }).click();
  await dialog
    .locator('div.cursor-pointer')
    .filter({ hasText: 'Fixture Coolant - OEM · 10 on hand' })
    .click();
  await dialog
    .locator('div.cursor-pointer')
    .filter({ hasText: 'Fixture Filter - OEM · 20 on hand' })
    .click();
  await dialog.locator('#date_of_request').click();
  await dialog.locator('input[type="number"]').nth(0).fill('2');
  await dialog.locator('input[type="number"]').nth(1).fill('3');
}

async function assertNote(dialog: Locator) {
  await expect(dialog.locator('#date_of_request')).toHaveValue(
    '2026-11-12T10:15'
  );
  await expect(dialog.locator('#target_date')).toHaveValue('2026-11-20T16:30');
  await expect(dialog.getByRole('combobox')).toHaveText('Fixture Mechanic');
  await expect(dialog.locator('input[type="number"]').nth(0)).toHaveValue('2');
  await expect(dialog.locator('input[type="number"]').nth(1)).toHaveValue('3');
}

async function fillComplete(page: Page, dialog: Locator) {
  await dialog.locator('#actual_date_of_release').fill('2026-11-10T11:25');
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Simple', exact: true }).click();
  await dialog.locator('#completed_mileage').fill('30001');
  await dialog.locator('#complete-service-type').click();
  await page.getByRole('option', { name: 'Preventive', exact: true }).click();
  await dialog.locator('#complete-service-location').click();
  await page.getByRole('option', { name: 'Done outside', exact: true }).click();
  await dialog.locator('#remarks').fill('Retained completion draft');
}

async function assertComplete(dialog: Locator) {
  await expect(dialog.locator('#actual_date_of_release')).toHaveValue(
    '2026-11-10T11:25'
  );
  await expect(dialog.getByRole('combobox').first()).toHaveText('Simple');
  await expect(dialog.locator('#completed_mileage')).toHaveValue('30001');
  await expect(dialog.locator('#complete-service-type')).toHaveText(
    'Preventive'
  );
  await expect(dialog.locator('#complete-service-location')).toHaveText(
    'Done outside'
  );
  await expect(dialog.locator('#remarks')).toHaveValue(
    'Retained completion draft'
  );
}

test.use({ timezoneId: 'Europe/Malta' });

for (const entry of ['list', 'detail'] as const) {
  for (const transition of ['note', 'complete-repair'] as const) {
    test(`${entry} ${transition} retains every failed field and retries the unchanged payload once`, async ({
      page
    }) => {
      const fixture = await fixtures(page, transition);
      const dialog = await open(page, entry, transition);
      const fill = transition === 'note' ? fillNote : fillComplete;
      const assertDraft = transition === 'note' ? assertNote : assertComplete;
      await fill(page, dialog);
      await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
      await expect(
        page.getByText(
          `Failed to ${transition === 'note' ? 'note job order' : 'complete repair'}: ${conflict}`,
          { exact: true }
        )
      ).toBeVisible();
      // Removing await from either caller, closing on rejection, or reapplying
      // defaults during a refetch must fail this retained-draft assertion.
      await expect(dialog).toHaveAttribute('data-state', 'open');
      await expect(dialog).toBeVisible();
      await assertDraft(dialog);
      for (const field of await dialog
        .locator('input, textarea, button[role="combobox"]')
        .all()) {
        await expect(field).toBeEnabled();
      }
      if (transition === 'complete-repair') {
        fixture.state.changed = true;
        const refreshed = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
            (entry === 'list'
              ? '/api/job-orders'
              : `/api/job-orders/${ids.order}`)
        );
        await page.evaluate(() =>
          window.dispatchEvent(new Event('visibilitychange'))
        );
        await refreshed;
        await assertDraft(dialog);
      }
      try {
        await dialog
          .getByRole('button', { name: 'Submit', exact: true })
          .evaluate((button: HTMLButtonElement) => {
            button.click();
            button.click();
          });
        await expect.poll(() => fixture.payloads.length).toBe(2);
        await expect(
          dialog.getByRole('button', { name: 'Submitting...', exact: true })
        ).toBeDisabled();
        await expect(
          dialog.getByRole('button', { name: 'Cancel', exact: true })
        ).toBeDisabled();
        for (const field of await dialog
          .locator('input, textarea, button[role="combobox"]')
          .all()) {
          await expect(field).toBeDisabled();
        }
        if (transition === 'note') {
          for (const removePart of await dialog
            .locator('[data-slot="badge"] button')
            .all()) {
            await expect(removePart).toBeDisabled();
          }
          // The custom picker uses a clickable div rather than a native input.
          // It must also ignore clicks while the submitted snapshot is pending.
          await dialog
            .getByText('Fixture Coolant - OEM · 10 on hand', { exact: true })
            .click();
          await expect(dialog.getByPlaceholder('Search...')).toBeHidden();
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveAttribute('data-state', 'open');
        await expect(dialog).toBeVisible();
        await assertDraft(dialog);
        const expected =
          transition === 'note'
            ? {
                assignedMechanicId: ids.mechanic,
                dateOfRequest: '2026-11-12T10:15',
                targetDate: '2026-11-20T16:30',
                spareParts: [
                  { sparePartId: ids.part, quantity: 2 },
                  { sparePartId: ids.secondPart, quantity: 3 }
                ]
              }
            : {
                repairDone: 'simple',
                completedMileage: 30001,
                maintenanceType: 'preventive',
                serviceLocation: 'outside',
                remarks: 'Retained completion draft',
                actualDateOfRelease: '2026-11-10T11:25'
              };
        expect(fixture.payloads).toEqual([expected, expected]);
        fixture.pendingRetry.release();
        await expect(dialog).toBeHidden();
        await expect(
          page.getByText(
            transition === 'note'
              ? 'Job order noted successfully!'
              : 'Job order repair completed successfully!',
            { exact: true }
          )
        ).toHaveCount(1);
        await expect(
          page.getByRole('button', {
            name: transition === 'note' ? 'Note Job Order' : 'Mark as Repaired',
            exact: true
          })
        ).toHaveCount(0);
        expect(fixture.payloads).toHaveLength(2);
        expect(fixture.unexpectedWrites).toEqual([]);
      } finally {
        fixture.pendingRetry.release();
      }
    });

    test(`${entry} ${transition} Cancel discards the draft and opens a fresh attempt`, async ({
      page
    }) => {
      const fixture = await fixtures(page, transition);
      await page.clock.setFixedTime(new Date('2026-11-12T08:00:00Z'));
      const dialog = await open(page, entry, transition);
      await (transition === 'note' ? fillNote : fillComplete)(page, dialog);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
      await page.clock.setFixedTime(new Date('2026-11-12T10:00:00Z'));
      await page
        .getByRole('button', {
          name: transition === 'note' ? 'Note Job Order' : 'Mark as Repaired',
          exact: true
        })
        .click();
      await expect(dialog).toBeVisible();
      if (transition === 'note') {
        await expect(dialog.locator('#date_of_request')).toHaveValue('');
        await expect(dialog.locator('#target_date')).toHaveValue('');
        await expect(dialog.getByRole('combobox')).toHaveText(
          'Select mechanic'
        );
        await expect(dialog.locator('input[type="number"]')).toHaveCount(0);
      } else {
        await expect(dialog.locator('#actual_date_of_release')).toHaveValue(
          '2026-11-12T11:00'
        );
        await expect(dialog.getByRole('combobox').first()).toHaveText(
          'Select type'
        );
        await expect(dialog.locator('#completed_mileage')).toHaveValue('');
        await expect(dialog.locator('#complete-service-type')).toHaveText(
          'Corrective'
        );
        await expect(dialog.locator('#complete-service-location')).toHaveText(
          'Done in the motorpool'
        );
        await expect(dialog.locator('#remarks')).toHaveValue('');
      }
      expect(fixture.payloads).toEqual([]);
      expect(fixture.unexpectedWrites).toEqual([]);
    });
  }
}
