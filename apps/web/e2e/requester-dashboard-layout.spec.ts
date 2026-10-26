import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const request = route.request();
    if (
      ['GET', 'HEAD', 'OPTIONS'].includes(request.method()) ||
      /\/auth\/(login|refresh|logout)$/.test(request.url())
    )
      return route.continue();
    return route.abort('blockedbyclient');
  });
});

test('requester queue uses cards, scoped tabs, one toolbar and preserved request dialogs', async ({
  page
}) => {
  await login(page, 'requester');
  await expect(page.getByRole('tab', { name: /^Waiting/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByRole('searchbox')).toHaveCount(1);
  await expect(page.getByRole('table')).toHaveCount(0);
  const waiting = page.getByRole('article');
  expect(await waiting.count()).toBeGreaterThan(0);
  await expect(waiting.first()).toContainText('Departure');
  await expect(waiting.first()).toContainText('Return');
  await expect(waiting.first()).toContainText('Vehicle');
  await expect(waiting.first()).toContainText('Driver');
  const search = page.getByRole('searchbox');
  await search.fill('no-such-request-layout');
  await expect(page.getByText('No records match your search.')).toBeVisible();
  await page
    .locator('[data-slot="list-toolbar"]')
    .getByRole('button', { name: 'Clear search', exact: true })
    .click();
  await expect(waiting.first()).toBeVisible();
  await page
    .getByRole('button', { name: 'Filters: Approval', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Filter by approval', exact: true })
    .click();
  await page
    .getByRole('option', { name: 'Needs approval', exact: true })
    .click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('article').first()).toContainText(
    'Needs approval'
  );
  await page
    .locator('[data-slot="list-toolbar"]')
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  const cancel = waiting
    .first()
    .getByRole('button', { name: /Cancel request/ });
  await cancel.click();
  await expect(
    page.getByRole('alertdialog', { name: 'Cancel Trip Ticket' })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cancel).toBeFocused();
  const opener = page.getByRole('button', {
    name: 'Request a trip',
    exact: true
  });
  await opener.click();
  await expect(
    page.getByRole('dialog', { name: 'Request Trip Ticket' })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  const destination = await page
    .getByRole('article')
    .first()
    .getByRole('heading')
    .innerText();
  await page.getByRole('searchbox').fill(destination);
  await page.getByRole('searchbox').press('Enter');
  await expect(page.getByRole('article').first()).toContainText(destination);
  await page.getByRole('tab', { name: /^History/ }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await page.getByRole('tab', { name: /^Waiting/ }).click();
  await expect(page.getByRole('searchbox')).toHaveValue(destination);
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('tab', { name: /^History/ }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Search request history' })
  ).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(1);
  const completed = page
    .getByRole('article')
    .filter({ hasText: 'Completed' })
    .first();
  await expect(completed).toBeVisible();
  await expect(completed.getByRole('button', { name: /Cancel/ })).toHaveCount(
    0
  );
  await expect(
    completed.getByText('View details', { exact: true })
  ).toHaveCount(0);
  // The schedule and metadata area opens details, not just the destination link.
  await completed.click();
  await expect(page).toHaveURL(/\/trip-tickets\/[^?]+\?viewOnly=true/);
  await page.goBack();
  await expect(
    page.getByRole('tab', { name: 'History', exact: true })
  ).toHaveAttribute('aria-selected', 'true');
});

test('requester cards fit both themes at phone, tablet and desktop widths', async ({
  page
}) => {
  await login(page, 'requester');
  await expect(page.getByRole('article').first()).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      localStorage.setItem('theme', value);
    }, theme);
    await page.reload();
    await expect(page.getByRole('article').first()).toBeVisible();
    for (const width of [360, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth
          )
        )
        .toBe(true);
      for (const card of await page.getByRole('article').all()) {
        const bounds = await card.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        const link = card.getByRole('link', { name: /View details/ });
        await expect(link).toHaveCount(1);
        await link.focus();
        await expect(link).toBeFocused();
        for (const action of await card.getByRole('button').all()) {
          expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(
            44
          );
        }
      }
      await page.screenshot({
        path: `/tmp/mms-requester-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled'
      });
    }
  }
});
