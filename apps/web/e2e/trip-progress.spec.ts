import { expect, test } from '@playwright/test';
import { apiGet, apiLogin, CREDENTIALS, listData, login } from './helpers';

test('trip workflow shows the current stage, terminal outcomes and repeated outing cycles', async ({
  page,
  request
}) => {
  const actor = await apiLogin(request, CREDENTIALS.admin);
  const [base] = listData(
    await apiGet(request, '/api/trip-tickets', actor.token)
  );
  expect(base).toBeTruthy();
  const original = (await apiGet(
    request,
    `/api/trip-tickets/${base.id}`,
    actor.token
  )) as Record<string, unknown>;
  let fixture: Record<string, unknown> = { ...original };
  await page.route(`**/api/trip-tickets/${base.id}`, (route) =>
    route.fulfill({ json: fixture })
  );
  await login(page, 'admin');
  const stages = [
    ['pending_admin_approval', 'Admin review'],
    ['pending_fuel_allocation_approval', 'Fuel sign-off'],
    ['approved', 'Ready at gate'],
    ['in_progress', 'On the road'],
    ['completed', 'Completed']
  ];
  for (const [status, stage] of stages) {
    fixture = {
      ...original,
      status,
      dates: (original.dates as Record<string, unknown>[]).map((date) => ({
        ...date,
        status:
          status === 'completed'
            ? 'completed'
            : status === 'in_progress'
              ? 'in_progress'
              : 'scheduled'
      }))
    };
    await page.goto(`/trip-tickets/${base.id}`);
    const progress = page.getByRole('region', {
      name: 'Trip progress',
      exact: true
    });
    await expect(progress).toBeVisible();
    await expect(progress.getByRole('listitem')).toHaveCount(6);
    if (status === 'completed') {
      await expect(progress.locator('li[data-state="complete"]')).toHaveCount(
        6
      );
    } else {
      await expect(progress.locator('[aria-current="step"]')).toContainText(
        stage
      );
      await expect(
        progress.locator('li[data-state="upcoming"]').last()
      ).toContainText('Completed');
    }
    // Discard cached detail state between fixtures without any business writes.
    await page.goto('/trip-tickets');
  }
  const dates = original.dates as Record<string, unknown>[];
  fixture = {
    ...original,
    status: 'approved',
    dates: [
      {
        ...dates[0],
        id: 'returned-outing',
        status: 'completed',
        postTripCheckedAt: '2026-10-01T09:00:00Z'
      },
      { ...dates[0], id: 'next-outing', status: 'scheduled' },
      { ...dates[0], id: 'cancelled-outing', status: 'cancelled' }
    ]
  };
  await page.goto(`/trip-tickets/${base.id}`);
  await page.reload();
  const progress = page.getByRole('region', {
    name: 'Trip progress',
    exact: true
  });
  await expect(progress.locator('[aria-current="step"]')).toContainText(
    'Ready at gate'
  );
  await expect(progress).toContainText('1 of 2 outings completed');
  await expect(progress).toContainText('1 cancelled');
  await expect(progress).toContainText('Each outing repeats');
  for (const status of ['cancelled', 'disapproved']) {
    fixture = {
      ...original,
      status,
      approvedByAdminId: null,
      fuelAllocation: null,
      cancellationReason: 'No longer needed',
      disapprovedReason: 'Budget declined',
      dates: dates.map((date) => ({
        ...date,
        status: 'cancelled',
        preTripCheckedAt: null,
        postTripCheckedAt: null
      }))
    };
    await page.reload();
    await expect(progress).toContainText(
      status === 'cancelled' ? 'Cancelled' : 'Declined'
    );
    await expect(progress.locator('[aria-current="step"]')).toHaveCount(0);
    await expect(progress.locator('li[data-state="complete"]')).toHaveCount(1);
    await expect(progress).toContainText(
      status === 'cancelled' ? 'No longer needed' : 'Budget declined'
    );
  }
  fixture = {
    ...fixture,
    status: 'cancelled',
    approvedByAdminId: actor.user.id,
    fuelAllocation: {
      id: '11111111-1111-4111-8111-111111111111',
      approvedByEvpId: actor.user.id,
      liters: 20,
      fuelType: 'diesel'
    }
  };
  await page.reload();
  await expect(progress.locator('li[data-state="complete"]')).toHaveCount(3);
  await expect(progress.locator('[aria-current="step"]')).toHaveCount(0);
});

test('trip and repair progress have connected stages in both themes on phones and wide screens', async ({
  page,
  request
}, testInfo) => {
  const actor = await apiLogin(request, CREDENTIALS.admin);
  const [trips, jobs] = await Promise.all([
    apiGet(request, '/api/trip-tickets', actor.token).then(listData),
    apiGet(request, '/api/job-orders', actor.token).then(listData)
  ]);
  await login(page, 'admin');
  for (const [path, label, count] of [
    [`/trip-tickets/${trips[0].id}`, 'Trip progress', 6],
    [`/job-order/${jobs[0].id}`, 'Repair progress', 4]
  ] as const) {
    await page.goto(path);
    const progress = page.getByRole('region', { name: label, exact: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle('dark', value === 'dark'),
        theme
      );
      for (const width of [360, 768, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(progress).toBeVisible();
        await expect(progress.getByRole('listitem')).toHaveCount(count);
        const lines = progress.locator('[data-slot="workflow-connector"]');
        await expect(lines).toHaveCount(count - 1);
        for (const line of await lines.all()) {
          const bounds = await line.boundingBox();
          expect(bounds!.width).toBeGreaterThan(0);
          expect(bounds!.height).toBeGreaterThan(0);
        }
        expect(
          await progress.evaluate(
            (element) => element.scrollWidth <= element.clientWidth
          )
        ).toBeTruthy();
        await progress.screenshot({
          path: testInfo.outputPath(`${label}-${theme}-${width}.png`),
          animations: 'disabled'
        });
      }
    }
  }
});
