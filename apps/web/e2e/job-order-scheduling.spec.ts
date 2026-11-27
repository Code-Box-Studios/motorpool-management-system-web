import { test, expect } from '@playwright/test';
import { login, CREDENTIALS, apiLogin, apiDelete } from './helpers';

// A job order can be booked into a later month straight from the calendar:
// the clicked day lands in the form, the picker no longer caps at today, and
// the API accepts the future date. The same request offers preventive and
// corrective as one maintenance choice and lists the oil and water check.

const createdOrderIds: string[] = [];

test.afterAll(async ({ request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  for (const id of createdOrderIds) {
    await apiDelete(request, `/api/job-orders/${id}`, admin.token);
  }
});

const pad = (n: number) => String(n).padStart(2, '0');

test('a calendar day two months ahead opens a job order scheduled for that day', async ({
  page
}) => {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + 2, 15);
  const targetDay = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-15`;

  await login(page, 'admin');
  await page.goto('/job-order');
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await page.locator('.fc-next-button').click();
  await page.locator('.fc-next-button').click();
  const dayEvents = page.locator(
    `.fc-daygrid-day[data-date="${targetDay}"] .fc-event`
  );
  const eventsBefore = await dayEvents.count();
  await page
    .locator(`.fc-daygrid-day[data-date="${targetDay}"] .fc-daygrid-day-top`)
    .click();

  const dialog = page.getByRole('dialog', { name: 'Create Job Order' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('group')
    .filter({ hasText: 'Branch *' })
    .getByRole('combobox')
    .click();
  await page.getByRole('option', { name: 'Main Branch', exact: true }).click();
  await dialog
    .getByRole('group')
    .filter({ hasText: 'Vehicle *' })
    .getByRole('combobox')
    .click();
  await page.getByRole('option').first().click();
  await dialog.getByRole('button', { name: 'Continue' }).click();

  const incident = dialog.locator('#incident_date');
  await expect(incident).toHaveValue(`${targetDay}T08:00`);
  // The shared Input keeps a year-9999 sentinel max; it must not cap at today.
  const max = await incident.getAttribute('max');
  expect(max === null || max >= `${targetDay}T08:00`).toBe(true);

  await dialog.locator('#job-service-type').click();
  await expect(page.getByRole('option')).toHaveText([
    'Not recorded',
    'Preventive / Corrective',
    'Inspection',
    'Repair',
    'Service'
  ]);
  await page
    .getByRole('option', { name: 'Preventive / Corrective', exact: true })
    .click();

  await dialog
    .getByRole('button', { name: 'Services to be done *', exact: true })
    .click();
  const picker = page.getByRole('dialog', { name: 'Choose services' });
  await picker.getByRole('textbox', { name: 'Search services' }).fill('water');
  await picker
    .getByRole('checkbox', {
      name: 'Check up oil and water level',
      exact: true
    })
    .check();
  await picker.getByRole('button', { name: 'Done', exact: true }).click();

  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(
    dialog.getByRole('definition').filter({
      hasText: /^Preventive \/ Corrective$/
    })
  ).toBeVisible();

  const created = page.waitForResponse(
    (res) =>
      res.request().method() === 'POST' && res.url().endsWith('/api/job-orders')
  );
  await dialog.getByRole('button', { name: 'Submit Request' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Submit Request' })
    .click();
  const response = await created;
  expect(response.status()).toBe(201);
  const order = (await response.json()) as {
    id: string;
    incidentDate: string;
    maintenanceType: string | null;
    services: string[];
  };
  createdOrderIds.push(order.id);
  expect(new Date(order.incidentDate).getTime()).toBeGreaterThan(Date.now());
  expect(order.maintenanceType).toBe('preventive_corrective');
  expect(order.services).toEqual(['Check up oil and water level']);

  // Pending, so no target date yet: it still shows on the day it was booked.
  await page.reload();
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await page.locator('.fc-next-button').click();
  await page.locator('.fc-next-button').click();
  await expect(dayEvents).toHaveCount(eventsBefore + 1);
});
