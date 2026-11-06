import { test, expect } from '@playwright/test';
import {
  API_URL,
  CREDENTIALS,
  apiDelete,
  apiLogin,
  apiPost,
  login
} from './helpers';

const createdIds: string[] = [];
test.afterEach(async ({ request }) => {
  if (!createdIds.length) return;
  const admin = await apiLogin(request, CREDENTIALS.admin);
  for (const id of createdIds.splice(0)) {
    expect(
      (await apiDelete(request, `/api/tracker-devices/${id}`, admin.token)).ok
    ).toBeTruthy();
  }
});

test('administrator saves and reloads a private dated configuration snapshot', async ({
  page,
  request
}) => {
  const imei = `${Date.now()}`;
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const created = await apiPost(request, '/api/tracker-devices', admin.token, {
    imei,
    label: 'Configuration browser test'
  });
  expect(created.ok).toBeTruthy();
  const id = (created.body as { id: string }).id;
  createdIds.push(id);
  await login(page, 'admin');
  await page.goto(`/tracker-devices/${id}`);
  await expect(
    page.getByRole('heading', { name: 'Last confirmed configuration' })
  ).toBeVisible();
  await expect(page.getByText('No configuration saved yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Update from RCONF' }).click();
  const dialog = page.getByRole('dialog', { name: 'Update from RCONF' });
  await expect(
    dialog.getByRole('button', { name: 'Copy RCONF' })
  ).toBeVisible();
  await expect(
    dialog.getByText('Saving this report does not change hardware settings.')
  ).toBeVisible();
  await dialog
    .getByLabel('RCONF reply')
    .fill(
      `ST-901L-X:V5.25,ID:${imei},UP:browser-secret,U1:private-number,MODE:GPRS,APN:internet,private-user,private-pass,IP:198.51.100.42,5013,GPRS UPLOAD TIME:5,30,TIME ZONE:E00,SLEEP:OFF`
    );
  await dialog.getByRole('button', { name: 'Save configuration' }).click();
  await expect(dialog).toBeHidden();
  const card = page
    .locator('section')
    .filter({
      has: page.getByRole('heading', { name: 'Last confirmed configuration' })
    });
  await expect(card).toContainText('Saved from RCONF');
  await expect(card).toContainText('198.51.100.42:5013');
  await expect(card).toContainText('5 seconds');
  await expect(card).toContainText('30 seconds');
  await expect(card.locator('time')).toHaveAttribute(
    'datetime',
    /\d{4}-\d{2}-\d{2}T/
  );
  await expect(
    page.getByText(/browser-secret|private-number|private-user|private-pass/)
  ).toHaveCount(0);
  await page.reload();
  await expect(card).toContainText('ST-901L-X');
  await expect(card).toContainText('5 seconds');
  await page.screenshot({
    path: '/tmp/mms-tracker-configuration-desktop.png',
    fullPage: true
  });
});

test('mobile import rejects a different device, preserves unknowns, and supports Escape', async ({
  page,
  request
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const imei = `${Date.now()}`;
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const created = await apiPost(request, '/api/tracker-devices', admin.token, {
    imei
  });
  const id = (created.body as { id: string }).id;
  createdIds.push(id);
  await login(page, 'admin');
  await page.goto(`/tracker-devices/${id}`);
  const trigger = page.getByRole('button', { name: 'Update from RCONF' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Update from RCONF' });
  const input = dialog.getByLabel('RCONF reply');
  await input.fill('ST-901L-X:V5.25,ID:9999999999,MODE:GPRS');
  await dialog.getByRole('button', { name: 'Save configuration' }).click();
  await expect(dialog.getByRole('alert')).toContainText('does not match');
  await expect(input).toHaveValue(/9999999999/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(input).toHaveValue('');
  await input.fill(`ST-901L-X:V5.25,ID:${imei},MODE:GPRS`);
  await dialog.getByRole('button', { name: 'Save configuration' }).click();
  await expect(dialog).toBeHidden();
  const card = page
    .locator('section')
    .filter({
      has: page.getByRole('heading', { name: 'Last confirmed configuration' })
    });
  await expect(card).toContainText('Unknown');
  await expect(card).not.toContainText('5 seconds');
  const stored = await request.get(`${API_URL}/api/tracker-devices/${id}`, {
    headers: { Authorization: `Bearer ${admin.token}` }
  });
  expect((await stored.json()).configuration.apn).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBeTruthy();
  await page.screenshot({
    path: '/tmp/mms-tracker-configuration-mobile.png',
    fullPage: true
  });
});
