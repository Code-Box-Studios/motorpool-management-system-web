import { test, expect, type Page } from '@playwright/test';
import { login, CREDENTIALS, apiLogin, apiDelete } from './helpers';

// Job order step 2: standard services come from a searchable checklist, and
// the free text below it is the optional "Additional Services to be done".
// One of the two is required.

const createdOrderIds: string[] = [];

test.afterAll(async ({ request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  for (const id of createdOrderIds) {
    await apiDelete(request, `/api/job-orders/${id}`, admin.token);
  }
});

async function openWhatHappened(page: Page) {
  await login(page, 'admin');
  await page.goto('/job-order');
  await page.getByRole('button', { name: 'Create Job Order' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Job Order' });
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
  // An hour ago, in the browser's local datetime-local format.
  const past = new Date(Date.now() - 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await dialog
    .locator('#incident_date')
    .fill(
      `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`
    );
  return dialog;
}

test('a job order is raised from picked services alone, with additional services optional', async ({
  page
}) => {
  const dialog = await openWhatHappened(page);

  await expect(
    dialog.getByText('Additional Services to be done', { exact: true })
  ).toBeVisible();
  await expect(dialog.getByText('What is wrong', { exact: false })).toHaveCount(
    0
  );

  // Neither picked nor written: the step refuses to continue.
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(
    dialog.getByText('Choose a service or describe the additional services', {
      exact: true
    })
  ).toBeVisible();

  await dialog
    .getByRole('button', { name: 'Services to be done *', exact: true })
    .click();
  const picker = page.getByRole('dialog', { name: 'Choose services' });
  await picker.getByRole('textbox', { name: 'Search services' }).fill('brake');
  await picker
    .getByRole('checkbox', { name: 'Check up brake system', exact: true })
    .check();
  await picker.getByRole('textbox', { name: 'Search services' }).fill('');
  await picker
    .getByRole('checkbox', { name: 'Check up tire pressure', exact: true })
    .check();
  await picker.getByRole('button', { name: 'Done', exact: true }).click();

  const selected = dialog.getByRole('list', { name: 'Selected services' });
  await expect(selected.getByRole('listitem')).toHaveText([
    'Check up brake system',
    'Check up tire pressure'
  ]);
  await expect(
    dialog.getByText('Choose a service or describe the additional services')
  ).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(
    dialog.getByText('Check up brake system, Check up tire pressure', {
      exact: true
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
    services: string[];
    incidentDetails: string | null;
  };
  createdOrderIds.push(order.id);
  expect(order.services).toEqual([
    'Check up brake system',
    'Check up tire pressure'
  ]);
  expect(order.incidentDetails).toBeNull();

  await page.goto(`/job-order/${order.id}`);
  await expect(
    page.getByRole('heading', {
      name: 'Check up brake system, Check up tire pressure'
    })
  ).toBeVisible({ timeout: 15_000 });
});

test('additional services alone are enough when nothing on the list fits', async ({
  page
}) => {
  const dialog = await openWhatHappened(page);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  const error = dialog.getByText(
    'Choose a service or describe the additional services',
    { exact: true }
  );
  await expect(error).toBeVisible();
  // Writing the work out clears the standing error.
  await dialog.locator('#incident_details').fill('Replace wiper blades');
  await expect(error).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(
    dialog.getByRole('definition').filter({ hasText: /^Replace wiper blades$/ })
  ).toBeVisible();
});
