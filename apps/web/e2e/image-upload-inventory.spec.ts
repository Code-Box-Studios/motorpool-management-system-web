import { expect, test } from '@playwright/test';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5+y9UAAAAASUVORK5CYII=',
  'base64'
);
const savedPhoto = `data:image/png;base64,${png.toString('base64')}`;
const recordId = '93000000-0000-4000-8000-000000000001';
const stamp = '2026-11-12T00:00:00.000Z';

for (const inventory of [
  { path: 'tools', create: 'add-tools', label: 'Tool', name: 'Photo tool' },
  {
    path: 'spare-parts',
    create: 'add-spare-part',
    label: 'Spare Part',
    name: 'Photo spare part'
  }
] as const) {
  for (const operation of ['create', 'edit'] as const) {
    test(`${inventory.path} ${operation} previews, removes, and retries an image without losing its multipart payload`, async ({
      page
    }) => {
      const bodies: string[] = [];
      const record = {
        id: recordId,
        name: inventory.name,
        description: 'Saved inventory description',
        status: 'available',
        image: savedPhoto,
        borrowedById: null,
        borrowedDate: null,
        estimatedReturnDate: null,
        brand: 'Saved brand',
        quantity: 2,
        createdAt: stamp,
        updatedAt: stamp
      };
      // Every API response is a fixture. Multipart serialization, browser
      // images, form drafts, mutation retries, and cache ownership stay real.
      await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === '/api/auth/me')
          return route.fulfill({
            json: {
              id: '93000000-0000-4000-8000-000000000002',
              email: 'image-admin@example.test',
              fullName: 'Image Administrator',
              avatarUrl: null,
              branchId: null,
              role: 'admin'
            }
          });
        if (path === '/api/auth/test-accounts')
          return route.fulfill({ json: { enabled: false } });
        if (path === '/api/notifications')
          return route.fulfill({ json: { data: [], unread: 0 } });
        if (
          path === `/api/${inventory.path}` ||
          path === `/api/${inventory.path}/${recordId}`
        ) {
          if (request.method() !== 'GET') {
            expect(request.method()).toBe(
              operation === 'create' ? 'POST' : 'PATCH'
            );
            expect(request.headers()['content-type']).toContain(
              'multipart/form-data; boundary='
            );
            bodies.push(request.postDataBuffer()!.toString('latin1'));
            if (bodies.length === 1)
              return route.fulfill({
                status: 503,
                json: {
                  error: { code: 'UNAVAILABLE', message: 'Retry image save' }
                }
              });
            return route.fulfill({
              json: record,
              status: operation === 'create' ? 201 : 200
            });
          }
          return route.fulfill({
            json: path.endsWith(recordId)
              ? record
              : { data: [record], count: 1 }
          });
        }
        if (request.method() !== 'GET')
          throw new Error(`Unexpected API write ${request.method()} ${path}`);
        return route.fulfill({ json: { data: [], count: 0 } });
      });

      await page.goto(
        `/${inventory.path}/${operation === 'create' ? inventory.create : recordId}`
      );
      if (operation === 'edit') {
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        const saved = page.getByRole('img', {
          name: inventory.name,
          exact: true
        });
        await expect(saved).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Remove current photo' })
        ).toBeVisible({ timeout: 1000 });
        await page
          .getByRole('button', { name: 'Remove current photo' })
          .click();
        await expect(saved).toHaveCount(0);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await expect(saved).toBeVisible();
      } else {
        await page.getByLabel('Name *', { exact: true }).fill(inventory.name);
      }

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'first.png',
        mimeType: 'image/png',
        buffer: png
      });
      await expect(
        page.getByRole('img', { name: 'Preview of first.png' })
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Remove first.png', exact: true })
        .click();
      await expect(
        page.getByRole('img', { name: 'Preview of first.png' })
      ).toHaveCount(0);
      await fileInput.setInputFiles({
        name: 'replacement.png',
        mimeType: 'image/png',
        buffer: png
      });
      const preview = page.getByRole('img', {
        name: 'Preview of replacement.png'
      });
      await expect(preview).toBeVisible();

      if (operation === 'edit') {
        // Cancel discards both the new File and current-image removal intent.
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await expect(preview).toHaveCount(0);
        await expect(
          page.getByRole('img', { name: inventory.name, exact: true })
        ).toBeVisible();
        await fileInput.setInputFiles({
          name: 'replacement.png',
          mimeType: 'image/png',
          buffer: png
        });
      }

      const action = `${operation === 'create' ? 'Add' : 'Update'} ${inventory.label}`;
      await page.getByRole('button', { name: action, exact: true }).click();
      const failure = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/${inventory.path}`) &&
          response.status() === 503
      );
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: action, exact: true })
        .click();
      await failure;
      // Tool edits keep their confirmation open on failure; other inventory
      // forms close it. Both must retain the selected File for another attempt.
      const dialog = page.getByRole('alertdialog');
      if (operation === 'edit' && inventory.path === 'tools')
        await dialog
          .getByRole('button', { name: 'Cancel', exact: true })
          .click();
      await expect(dialog).toHaveCount(0);
      await expect(preview).toBeVisible();
      await page.getByRole('button', { name: action, exact: true }).click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: action, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/${inventory.path}$`));
      expect(bodies).toHaveLength(2);
      for (const body of bodies) {
        expect(body).toContain('name="image"; filename="replacement.png"');
        expect(body).toContain('Content-Type: image/png');
        expect(body).not.toContain('filename="first.png"');
        expect(body).not.toContain('name="removeImage"');
      }
    });
  }
}
