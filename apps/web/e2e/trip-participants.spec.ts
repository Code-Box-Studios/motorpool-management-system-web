import { test, expect } from '@playwright/test';
import { apiGet, apiLogin, CREDENTIALS, listData, login } from './helpers';

for (const count of [35, 120]) {
  test(`${count} participants stay compact and searchable at desktop and phone sizes`, async ({
    page,
    request
  }) => {
    test.setTimeout(120_000);
    const admin = await apiLogin(request, CREDENTIALS.admin);
    const tickets = listData(
      await apiGet(request, '/api/trip-tickets?limit=100', admin.token)
    );
    expect(tickets.length, 'An existing trip is required').toBeGreaterThan(0);
    const id = tickets[0].id as string;
    const names = Array.from({ length: count }, (_, index) =>
      index === 0
        ? 'A very long participant name '.repeat(12).trim()
        : `Participant ${String(index + 1).padStart(2, '0')}`
    );
    names[4] = 'Same Name';
    names[5] = 'Same Name';

    // Exercise large responses without changing a stored trip or its passengers.
    await page.route(`**/api/trip-tickets/${id}`, async (route) => {
      const response = await route.fetch();
      const ticket = await response.json();
      await route.fulfill({
        response,
        json: { ...ticket, participants: names }
      });
    });
    await login(page, 'admin');
    const writes: string[] = [];
    await page.route('**/api/**', (route) => {
      const req = route.request();
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method()) &&
        !req.url().endsWith('/api/auth/refresh')
      ) {
        writes.push(req.method());
        return route.abort();
      }
      return route.fallback();
    });
    await page.goto(`/trip-tickets/${id}`);
    const people = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'People', exact: true })
    });
    const trigger = people.getByRole('button', {
      name: `View all ${count} participants`,
      exact: true
    });

    for (const dark of [false, true]) {
      await page.evaluate((value) => {
        document.documentElement.classList.toggle('dark', value);
      }, dark);
      for (const width of [1920, 1280, 900, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(trigger).toBeVisible();
        const card = (await people.boundingBox())!;
        expect(card.height).toBeLessThan(400);
        if (width === 390) {
          await expect
            .poll(async () => (await trigger.boundingBox())!.height)
            .toBeGreaterThanOrEqual(44);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth)
        ).toBeLessThanOrEqual(width);
        await trigger.click();
        const dialog = page.getByRole('dialog', {
          name: 'Trip participants',
          exact: true
        });
        await expect(dialog).toBeVisible();
        const search = dialog.getByRole('searchbox', {
          name: 'Search participants'
        });
        await expect(search).toBeFocused();
        const list = dialog.getByRole('list', {
          name: 'Participants',
          exact: true
        });
        await expect(list.getByRole('listitem')).toHaveCount(count);
        await expect(
          dialog.getByText('Same Name', { exact: true })
        ).toHaveCount(2);
        await search.fill('pARTICIPANT 31');
        await expect(list.getByRole('listitem')).toHaveCount(1);
        await expect(list).toContainText('Participant 31');
        await search.fill('No matching person');
        await expect(dialog).toContainText(
          'No participants match your search.'
        );
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await expect(search).toHaveValue('');
        await expect(list.getByRole('listitem')).toHaveCount(count);
        await list.getByRole('listitem').last().scrollIntoViewIfNeeded();
        await expect(list.getByRole('listitem').last()).toBeVisible();
        const bounds = (await dialog.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(15);
        expect(bounds.y).toBeGreaterThanOrEqual(15);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 15);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(885);
        expect(
          await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)
        ).toBeLessThanOrEqual(1);
        if (count === 35 && [1920, 390].includes(width)) {
          await page.screenshot({
            path: `/tmp/mms-participants-${width}-${dark ? 'dark' : 'light'}.png`
          });
        }
        const close = dialog.getByRole('button', {
          name: 'Close',
          exact: true
        });
        const closeBounds = (await close.boundingBox())!;
        expect(closeBounds.width).toBeGreaterThanOrEqual(44);
        expect(closeBounds.height).toBeGreaterThanOrEqual(44);
        await close.click();
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
      }
    }
    expect(writes).toEqual([]);
  });
}
