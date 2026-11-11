import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  apiGet,
  apiLogin,
  CREDENTIALS,
  listData,
  login,
  pickDate
} from './helpers';

async function openTripStep(page: Page) {
  await login(page, 'admin');
  await page.goto('/trip-tickets');
  await page.getByRole('button', { name: 'Create Trip Ticket' }).click();
  const dialog = page.getByRole('dialog');
  const branch = dialog.getByRole('group').filter({ hasText: 'Branch' });
  await branch.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Main Branch', exact: true }).click();
  await dialog
    .getByRole('group')
    .filter({ hasText: 'Department/Office/College' })
    .getByRole('combobox')
    .click();
  await page.getByRole('option').first().click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  return dialog;
}

async function selectEmployee(page: Page, dialog: Locator, name: string) {
  await dialog
    .getByRole('button', { name: 'Select employee participants', exact: true })
    .click();
  const picker = page.getByRole('dialog', {
    name: 'Choose employee participants',
    exact: true
  });
  await picker
    .getByRole('textbox', { name: 'Search participant employees' })
    .fill(name);
  await picker.getByRole('checkbox').first().check();
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
}

test('participant type precedes guides and preserves student names across roster selection', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const employees = listData(
    await apiGet(request, '/api/trip-tickets/guide-options', admin.token)
  );
  const dialog = await openTripStep(page);
  const type = dialog.getByRole('combobox', {
    name: 'Participant type',
    exact: true
  });
  await expect(type).toHaveText('Students');
  const typeBounds = (await type.boundingBox())!;
  const guidesBounds = (await dialog
    .getByRole('button', { name: 'Select guides', exact: true })
    .boundingBox())!;
  expect(typeBounds.y).toBeLessThan(guidesBounds.y);
  await dialog
    .getByPlaceholder('Participant 1', { exact: true })
    .fill('Student, One');
  await type.click();
  await page.getByRole('option', { name: 'Employees', exact: true }).click();
  await expect(
    dialog.getByPlaceholder('Participant 1', { exact: true })
  ).toHaveCount(0);
  await expect(
    dialog.getByText('Guides (Optional)', { exact: true })
  ).toBeVisible();
  await selectEmployee(page, dialog, employees[0].name as string);
  await expect(
    dialog.getByRole('list', { name: 'Selected employee participants' })
  ).toContainText(employees[0].name as string);

  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle('dark', value),
      dark
    );
    await page.setViewportSize({ width: 390, height: 900 });
    const trigger = dialog.getByRole('button', {
      name: 'Select employee participants',
      exact: true
    });
    await trigger.click();
    const picker = page.getByRole('dialog', {
      name: 'Choose employee participants',
      exact: true
    });
    await expect(
      picker.getByRole('textbox', { name: 'Search participant employees' })
    ).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: `/tmp/mms-participant-picker-${dark ? 'dark' : 'light'}-mobile.png`,
      animations: 'disabled'
    });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await dialog
      .getByText('Guides (Optional)', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/mms-participant-type-${dark ? 'dark' : 'light'}-mobile.png`
    });
  }
  await type.click();
  await page.getByRole('option', { name: 'Students', exact: true }).click();
  await expect(
    dialog.getByPlaceholder('Participant 1', { exact: true })
  ).toHaveValue('Student, One');
  await expect(dialog.getByText('Guides *', { exact: true })).toBeVisible();
});

test('employee participants and guides share the vehicle seat budget', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const employees = listData(
    await apiGet(request, '/api/trip-tickets/guide-options', admin.token)
  );
  const dialog = await openTripStep(page);
  await dialog
    .getByRole('group')
    .filter({ hasText: /^Vehicle/ })
    .getByRole('combobox')
    .click();
  await page.getByRole('option', { name: /MMS-0008/ }).click();
  await dialog
    .getByRole('combobox', { name: 'Participant type', exact: true })
    .click();
  await page.getByRole('option', { name: 'Employees', exact: true }).click();
  await selectEmployee(page, dialog, employees[0].name as string);
  await dialog
    .getByRole('button', { name: 'Select guides', exact: true })
    .click();
  const guidePicker = page.getByRole('dialog', {
    name: 'Choose guides',
    exact: true
  });
  for (const employee of employees.slice(1, 3)) {
    await guidePicker
      .getByRole('textbox', { name: 'Search employees' })
      .fill(employee.name as string);
    await guidePicker.getByRole('checkbox').first().check();
  }
  await expect(
    guidePicker.getByText('All passenger seats are filled.', { exact: true })
  ).toBeVisible();
  await guidePicker.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    dialog.getByText('3 of 3 seats (2 guides)', { exact: true })
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Select employee participants', exact: true })
    .click();
  const participantPicker = page.getByRole('dialog', {
    name: 'Choose employee participants',
    exact: true
  });
  for (const checkbox of await participantPicker.getByRole('checkbox').all()) {
    if (!(await checkbox.isChecked())) await expect(checkbox).toBeDisabled();
  }
  await participantPicker.getByRole('checkbox', { checked: true }).uncheck();
  await expect(
    participantPicker.getByText('All passenger seats are filled.', {
      exact: true
    })
  ).toHaveCount(0);
});

test('employee request submits roster identities with no guides and no student names', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const employees = listData(
    await apiGet(request, '/api/trip-tickets/guide-options', admin.token)
  );
  const dialog = await openTripStep(page);
  for (const label of ['Vehicle', 'Driver']) {
    await dialog
      .getByRole('group')
      .filter({ hasText: new RegExp(`^${label}`) })
      .getByRole('combobox')
      .click();
    await page.getByRole('option').first().click();
  }
  await dialog
    .locator('#destination')
    .fill('Participant type fixture destination');
  await dialog.locator('#purpose').fill('Employee roster trip');
  await dialog
    .getByPlaceholder('Participant 1', { exact: true })
    .fill('Do not submit this student');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(
    dialog.getByText('Student trips need at least one guide', { exact: true })
  ).toBeVisible();
  await dialog
    .getByRole('combobox', { name: 'Participant type', exact: true })
    .click();
  await page.getByRole('option', { name: 'Employees', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(
    dialog.getByText('Select at least one employee participant', {
      exact: true
    })
  ).toBeVisible();
  await selectEmployee(page, dialog, employees[0].name as string);
  await dialog
    .getByRole('button', { name: 'Select guides', exact: true })
    .click();
  const guidePicker = page.getByRole('dialog', {
    name: 'Choose guides',
    exact: true
  });
  await guidePicker
    .getByRole('textbox', { name: 'Search employees' })
    .fill(employees[0].name as string);
  await guidePicker.getByRole('checkbox').first().check();
  await guidePicker.getByRole('button', { name: 'Done', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(
    dialog.getByText('An employee cannot be both a participant and a guide', {
      exact: true
    })
  ).toBeVisible();
  await dialog
    .getByRole('list', { name: 'Selected guides', exact: true })
    .getByRole('button', { name: `Remove ${employees[0].name}`, exact: true })
    .click();
  await expect(dialog.getByText(/1 of \d+ seats \(0 guides\)/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await pickDate(
    page,
    dialog.locator('button[id="dates.0.date"]'),
    '2027-03-23'
  );
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(
    dialog.getByRole('definition').filter({ hasText: /^Employees$/ })
  ).toBeVisible();
  await expect(
    dialog.getByText('Do not submit this student', { exact: false })
  ).toHaveCount(0);
  const submitted = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().endsWith('/api/trip-tickets')
  );
  // Inspect the real form's wire payload without creating a stored booking.
  await page.route('**/api/trip-tickets', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'FIXTURE_ONLY',
              message: 'Fixture request captured.'
            }
          }
        })
      : route.fallback()
  );
  await dialog.getByRole('button', { name: 'Submit Request' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Submit Request' })
    .click();
  expect((await submitted).postDataJSON()).toMatchObject({
    participantType: 'employees',
    participantEmployeeIds: [employees[0].id],
    participants: [],
    participantsCount: 1,
    guideIds: []
  });
});

test('pending employee edits retain historical identities and approved employee guides can be cleared', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const tickets = listData(
    await apiGet(request, '/api/trip-tickets?limit=1', admin.token)
  );
  const source = (await apiGet(
    request,
    `/api/trip-tickets/${tickets[0].id}`,
    admin.token
  )) as Record<string, unknown>;
  const historicalId = '11111111-1111-4111-8111-111111111111';
  let fixture: Record<string, unknown> = {
    ...source,
    status: 'pending_admin_approval',
    participantType: 'employees',
    participants: ['Historical, Employee'],
    participantsCount: 1,
    participantEmployees: [
      {
        employeeId: historicalId,
        employee: {
          id: historicalId,
          name: 'Historical, Employee',
          position: 'Retired',
          archivedAt: '2026-01-01T00:00:00Z'
        }
      }
    ],
    guides: []
  };
  let update: Record<string, unknown> | undefined;
  await page.route(`**/api/trip-tickets/${source.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      update = route.request().postDataJSON();
      fixture = { ...fixture, ...update };
    }
    await route.fulfill({ json: fixture });
  });
  await login(page, 'admin');
  await page.goto(`/trip-tickets/${source.id}`);
  await expect(page.getByText('Employees', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Selected employee participants' })
  ).toContainText('Historical, Employee');
  await page.locator('#purpose').fill('Preserve historical employee');
  await page
    .getByRole('button', { name: 'Update Trip Ticket', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Update Trip Ticket', exact: true })
    .click();
  await expect.poll(() => update?.purpose).toBe('Preserve historical employee');
  // Unchanged assignments are omitted so archived roster members survive unrelated edits.
  expect(update).not.toHaveProperty('participantEmployeeIds');
  const employees = listData(
    await apiGet(request, '/api/trip-tickets/guide-options', admin.token)
  );
  fixture.status = 'approved';
  fixture.guides = [
    { employeeId: employees[0].id, employee: employees[0], user: null }
  ];
  await page.reload();
  await page
    .getByRole('button', { name: 'Reassign guides', exact: true })
    .click();
  await page
    .getByRole('list', { name: 'Selected guides', exact: true })
    .getByRole('button', { name: `Remove ${employees[0].name}`, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Save', exact: true })
  ).toBeEnabled();
  let reassigned: unknown;
  await page.route(`**/api/trip-tickets/${source.id}/guides`, async (route) => {
    reassigned = route.request().postDataJSON();
    await route.fulfill({ json: fixture });
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Reassign Guides', exact: true })
    .click();
  await expect.poll(() => reassigned).toEqual({ guideIds: [] });
});

test('pending student request switches to an employee roster and clears its guide', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const tickets = listData(
    await apiGet(request, '/api/trip-tickets?limit=1', admin.token)
  );
  const source = (await apiGet(
    request,
    `/api/trip-tickets/${tickets[0].id}`,
    admin.token
  )) as Record<string, unknown>;
  const employees = listData(
    await apiGet(request, '/api/trip-tickets/guide-options', admin.token)
  );
  let fixture = {
    ...source,
    status: 'pending_admin_approval',
    participantType: 'students',
    participantEmployees: [],
    participants: ['Student to replace'],
    participantsCount: 1,
    guides: [
      { employeeId: employees[0].id, employee: employees[0], user: null }
    ]
  };
  let update: Record<string, unknown> | undefined;
  await page.route(`**/api/trip-tickets/${source.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      update = route.request().postDataJSON();
      fixture = { ...fixture, ...update };
    }
    await route.fulfill({ json: fixture });
  });
  await login(page, 'admin');
  await page.goto(`/trip-tickets/${source.id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Participant type', exact: true })
    .click();
  await page.getByRole('option', { name: 'Employees', exact: true }).click();
  await selectEmployee(
    page,
    page.locator('#edit-trip-ticket-form'),
    employees[1].name as string
  );
  await page
    .getByRole('list', { name: 'Selected guides', exact: true })
    .getByRole('button', { name: `Remove ${employees[0].name}`, exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Update Trip Ticket', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Update Trip Ticket', exact: true })
    .click();
  await expect
    .poll(() => update)
    .toMatchObject({
      participantType: 'employees',
      participantEmployeeIds: [employees[1].id],
      participants: [],
      participantsCount: 1,
      guideIds: []
    });
});
