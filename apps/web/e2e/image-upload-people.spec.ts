import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';
import { readFileSync } from 'node:fs';

const U = '71000000-0000-4000-8000-000000000001';
const D = '71000000-0000-4000-8000-000000000002';
const B = '71000000-0000-4000-8000-000000000003';
const R = '71000000-0000-4000-8000-000000000004';
const now = '2026-11-12T01:00:00.000Z';
const PNG = readFileSync(
  new URL('../public/logo/um-logo.png', import.meta.url)
);
const CURRENT_PNG = readFileSync(
  new URL('../public/logo/mms-logo.png', import.meta.url)
);
const photo = '/uploads/fixture-people.png';
const user = {
  id: U,
  fullName: 'Fixture Person',
  email: 'fixture-person@example.test',
  status: 'active',
  role: 'admin',
  branchId: B,
  avatarUrl: photo,
  createdAt: now
};
const driver = {
  id: D,
  fullName: 'Fixture Driver',
  email: 'fixture-driver@example.test',
  status: 'active',
  licenseNumber: 'FIXTURE-LICENSE',
  photo,
  createdAt: now,
  updatedAt: now
};

async function fixtures(page: Page) {
  const writes: { path: string; body: Buffer }[] = [];
  await page.route('**/uploads/fixture-people.png', (route) =>
    route.fulfill({ body: CURRENT_PNG, contentType: 'image/png' })
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/auth/')) return route.continue();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      writes.push({ path, body: request.postDataBuffer() ?? Buffer.alloc(0) });
      return route.fulfill({
        status: 422,
        json: {
          error: {
            code: 'FIXTURE_CAPTURE',
            message: 'Fixture captured upload without saving.'
          }
        }
      });
    }
    const send = (json: unknown) => route.fulfill({ json });
    if (path === '/api/users/me')
      return send({
        ...user,
        branchName: 'Fixture Branch',
        phone: '',
        address: ''
      });
    if (path === '/api/users') return send({ data: [user], count: 1 });
    if (path === '/api/roles')
      return send({ data: [{ id: R, name: 'admin' }], count: 1 });
    if (path === '/api/branches')
      return send({
        data: [
          { id: B, name: 'Fixture Branch', location: null, archivedAt: null }
        ],
        count: 1
      });
    if (path === `/api/drivers/${D}`) return send(driver);
    if (path === '/api/drivers') return send({ data: [driver], count: 1 });
    if (path === '/api/notifications') return send({ data: [], unread: 0 });
    return route.continue();
  });
  return writes;
}

const forms = [
  {
    route: '/profile',
    input: '#profile-avatar',
    edit: 'Edit profile',
    save: 'Save Changes',
    path: '/api/users/me',
    part: 'avatar',
    current: true,
    visualTheme: 'light',
    visualWidth: 1440
  },
  {
    route: '/user-management/add-user',
    input: '#signup-avatar',
    edit: null,
    save: 'Create Account',
    path: '/api/users',
    part: 'avatar',
    current: false,
    visualTheme: 'dark',
    visualWidth: 390
  },
  {
    route: `/user-management/${U}`,
    input: '#user-avatar',
    edit: 'Edit',
    save: 'Save Changes',
    path: `/api/users/${U}`,
    part: 'avatar',
    current: true,
    visualTheme: 'dark',
    visualWidth: 1440
  },
  {
    route: `/drivers/${D}`,
    input: '#driver_photo',
    edit: 'Edit',
    save: 'Save Details',
    path: `/api/drivers/${D}`,
    part: 'photo',
    current: true,
    visualTheme: 'light',
    visualWidth: 390
  }
];

async function openForm(page: Page, form: (typeof forms)[number]) {
  await page.goto(form.route);
  if (form.edit)
    await page.getByRole('button', { name: form.edit, exact: true }).click();
  else {
    await page.locator('#signup-fullname').fill('New Fixture Person');
    await page.locator('#signup-email').fill('new-fixture@example.test');
    await page.locator('#signup-password').fill('Password123!');
    await page.locator('#signup-branch').click();
    await page
      .getByRole('option', { name: 'Fixture Branch', exact: true })
      .click();
    await page.locator('#signup-role').click();
    await page.getByRole('option', { name: 'Admin', exact: true }).click();
  }
}

for (const form of forms) {
  test(`${form.route} previews, clears and submits the existing image field contract`, async ({
    page
  }) => {
    const writes = await fixtures(page);
    await login(page, 'admin');
    await openForm(page, form);
    const uploader = page.locator('[data-slot="image-upload"]');
    await page.locator(form.input).setInputFiles({
      name: 'uploaded-logo.png',
      mimeType: 'image/png',
      buffer: PNG
    });
    const selected = uploader.locator('img[src^="blob:"]');
    await expect(selected).toBeVisible();
    await expect
      .poll(() =>
        selected.evaluate((image: HTMLImageElement) => image.naturalWidth)
      )
      .toBeGreaterThan(0);
    await uploader
      .getByRole('button', { name: 'Remove uploaded-logo.png', exact: true })
      .click();
    await expect(selected).toHaveCount(0);
    if (form.current)
      await expect(
        uploader.locator('img[src$="fixture-people.png"]')
      ).toBeVisible();
    await page.locator(form.input).setInputFiles({
      name: 'uploaded-logo.png',
      mimeType: 'image/png',
      buffer: PNG
    });
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const switchTheme = page.getByRole('button', {
        name: `Switch to ${theme} mode`,
        exact: true
      });
      if (await switchTheme.count()) await switchTheme.click();
      if (theme === 'dark')
        await expect(page.locator('html')).toHaveClass(/dark/);
      else await expect(page.locator('html')).not.toHaveClass(/dark/);
      for (const width of [1440, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000
        });
        await expect(selected).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        ).toBe(true);
        if (theme === form.visualTheme && width === form.visualWidth) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: test
              .info()
              .outputPath(`${form.input.slice(1)}-${theme}-${width}.png`),
            fullPage: true,
            animations: 'disabled'
          });
        }
      }
    }
    await page
      .getByRole('button', {
        name: form.edit ? form.save : 'Sign Up',
        exact: true
      })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: form.save, exact: true })
      .click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].path).toBe(form.path);
    expect(writes[0].body.toString('latin1')).toContain(
      `name="${form.part}"; filename="uploaded-logo.png"`
    );
    expect(writes[0].body.includes(PNG)).toBe(true);
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(selected).toBeVisible();
    if (form.edit) {
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: form.edit, exact: true }).click();
      await expect(uploader.locator('img[src^="blob:"]')).toHaveCount(0);
      await expect(
        uploader.locator('img[src$="fixture-people.png"]')
      ).toBeVisible();
    }
  });
}

test('driver current photo deletion remains explicit and Cancel restores it', async ({
  page
}) => {
  const writes = await fixtures(page);
  await login(page, 'admin');
  await openForm(page, forms[3]);
  const uploader = page.locator('[data-slot="image-upload"]');
  await uploader
    .getByRole('button', { name: 'Remove current photo', exact: true })
    .click();
  await expect(uploader.locator('img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save Details', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Save Details', exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.toString('latin1')).toContain(
    'name="removePhoto"\r\n\r\ntrue'
  );
  expect(writes[0].body.toString('latin1')).not.toContain('filename=');
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(
    uploader.locator('img[src$="fixture-people.png"]')
  ).toBeVisible();
});

test('@capture people upload previews across light/dark desktop/mobile forms', async ({
  page
}) => {
  await fixtures(page);
  await login(page, 'admin');
  for (const form of forms) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openForm(page, form);
    await page.locator(form.input).setInputFiles({
      name: 'uploaded-logo.png',
      mimeType: 'image/png',
      buffer: PNG
    });
    const preview = page.getByRole('img', {
      name: 'Preview of uploaded-logo.png',
      exact: true
    });
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate((image: HTMLImageElement) => image.naturalWidth)
      )
      .toBeGreaterThan(0);
    const switchTheme = page.getByRole('button', {
      name: `Switch to ${form.visualTheme} mode`,
      exact: true
    });
    if (await switchTheme.count()) await switchTheme.click();
    await page.setViewportSize({
      width: form.visualWidth,
      height: form.visualWidth === 390 ? 844 : 1000
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: test
        .info()
        .outputPath(
          `${form.input.slice(1)}-${form.visualTheme}-${form.visualWidth}.png`
        ),
      fullPage: true,
      animations: 'disabled'
    });
  }
});
