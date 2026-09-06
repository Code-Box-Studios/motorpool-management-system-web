import { test, expect, type Page } from '@playwright/test';
import {
  login,
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiPost,
  apiDelete
} from './helpers';

// Resolves a metric's rendered VALUE (not just its label) via the sibling
// <div> structure MetricStrip renders (components/shared/metric-card.tsx):
// one parent per metric, holding a label div then a value div. Same idiom as
// organization.spec.ts's detailValue() for a dt/dd pair.
function metricValue(page: Page, label: string) {
  return page.locator(
    `xpath=//div[normalize-space()=${JSON.stringify(label)}]/following-sibling::div[1]`
  );
}

// Created by the first test below; torn down afterwards so reruns don't pile
// up rows in the shared dev database.
let probeToolId: string | undefined;

test.afterEach(async ({ request }) => {
  if (!probeToolId) return;
  const admin = await apiLogin(request, CREDENTIALS.admin);
  await apiDelete(request, `/api/tools/${probeToolId}`, admin.token);
  probeToolId = undefined;
});

test.describe('tools borrow metrics', () => {
  test('the tools page reflects real borrow stats, not a stats endpoint that silently failed', async ({
    page,
    request
  }) => {
    // Both the metric strip and the leaderboard fall back to identical-looking
    // content when useToolBorrowStats() never resolves: index.tsx builds every
    // metric as `stats?.field ?? 0` and renders MetricStrip unconditionally,
    // and borrow-leaderboard.tsx's <SectionLabel>Most borrowed…</SectionLabel>
    // sits OUTSIDE its own loading/empty/list ternary. So a /stats route
    // shadowed by /:id (router.ts's own comment names this exact failure —
    // Express hands "stats" to Prisma as a uuid, which throws P2023 and
    // surfaces as a 500) renders a page that looks EXACTLY like a healthy,
    // empty database. Static labels can never catch that; only two things
    // can: the network response itself, and numbers/names that a zeroed
    // fallback cannot produce. This test asserts both.
    const admin = await apiLogin(request, CREDENTIALS.admin);
    const before = (await apiGet(
      request,
      '/api/tools/stats',
      admin.token
    )) as { toolsOut: number; overdue: number };

    const drivers = (await apiGet(request, '/api/drivers?limit=1', admin.token)) as {
      data: Array<{ id: string }>;
    };
    const driverId = drivers.data[0]?.id;
    expect(driverId, 'a driver exists to borrow the probe tool').toBeTruthy();

    // A fresh, currently-open, overdue borrow, created via the API so this
    // fixture is independent of whatever the seed data or earlier runs left
    // behind, and dated relative to "now" so it can never age out of the
    // 90-day borrow window (BORROW_WINDOW_DAYS) between runs.
    const toolName = `E2E Overdue Tool ${Date.now()}`;
    const created = await apiPost(request, '/api/tools', admin.token, {
      name: toolName,
      borrowedById: driverId,
      borrowedDate: new Date().toISOString(),
      estimatedReturnDate: new Date('2020-01-01').toISOString()
    });
    expect(created.ok, 'the probe tool is created already borrowed').toBeTruthy();
    probeToolId = (created.body as { id: string }).id;

    await login(page, 'admin');

    const statsResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/tools/stats') &&
        res.request().method() === 'GET'
    );
    await page.goto('/tools');
    const res = await statsResponse;
    // The direct guard: a /stats shadowed by /:id fails HERE, immediately and
    // unambiguously, instead of rendering a page indistinguishable from an
    // honestly empty fleet.
    expect(
      res.status(),
      'GET /api/tools/stats must resolve as its own route, not fall through to /:id'
    ).toBe(200);

    // Data-dependent: these values/names can only come from a /stats response
    // that actually carries today's numbers. The `?? 0` fallback this page
    // renders when the query never resolves cannot produce anything but 0 and
    // an empty leaderboard, so a match here proves the real endpoint answered.
    await expect(metricValue(page, 'Tools out')).toHaveText(
      String(before.toolsOut + 1)
    );
    await expect(metricValue(page, 'Overdue')).toHaveText(
      String(before.overdue + 1)
    );
    // Scoped to the leaderboard: the tool also appears in the plain tools
    // table below it, so an unscoped text match is ambiguous between the two.
    const leaderboard = page
      .locator('section')
      .filter({ hasText: 'Most borrowed' });
    await expect(leaderboard.getByText(toolName)).toBeVisible();
  });

  test('a driver sees the same metrics', async ({ page }) => {
    await login(page, 'driver');
    await page.goto('/tools');
    // Both admin and driver reach this route; a 403 from INVENTORY_READ_ROLES
    // being set wrong would render the strip with no numbers behind it.
    await expect(page.getByText('Tools out')).toBeVisible();
  });
});
