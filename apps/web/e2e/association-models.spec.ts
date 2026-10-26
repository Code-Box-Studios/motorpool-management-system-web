import { expect, test } from '@playwright/test';
import { chooseFilter } from './filter-controls';
import { login } from './helpers';

test('shows unavailable Logistic Regression and applies live Apriori only after Run Model', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/maintenance?tab=predictive');
  const controls = page.getByRole('region', {
    name: 'Maintenance model selection',
    exact: true
  });
  const results = page.getByRole('region', {
    name: 'Spare parts model results',
    exact: true
  });
  await expect(
    controls.getByRole('button', { name: 'Run Model', exact: true })
  ).toBeEnabled();
  const risk = controls.getByRole('combobox', {
    name: 'Vehicle risk algorithm',
    exact: true
  });
  await risk.click();
  await expect(
    page.getByRole('option', {
      name: 'Logistic Regression (Unavailable)',
      exact: true
    })
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(risk).toBeFocused();
  await expect(controls).toContainText(
    'Missing fitted pipeline, scaler, and feature order.'
  );
  const parts = controls.getByRole('combobox', {
    name: 'Parts algorithm',
    exact: true
  });
  await parts.click();
  await page.getByRole('option', { name: 'Apriori', exact: true }).click();
  await expect(results).toContainText('FP-Growth results');
  const [response] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/analytics/association-models?algorithm=apriori')
    ),
    controls.getByRole('button', { name: 'Run Model', exact: true }).click()
  ]);
  const body = await response.json();
  expect(body).toMatchObject({
    algorithm: 'apriori',
    source: 'live_job_orders',
    sourceSha256: null
  });
  await expect(results).toContainText('Apriori results');
  await expect(results).toContainText('eligible live job-order transactions');
  if (body.count === 0)
    await expect(results).toContainText(
      'Current job-order transactions do not yield qualifying associations.'
    );
});

test('runs the selected saved model and keeps draft choices separate from results', async ({
  page
}) => {
  await login(page, 'admin');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/analytics/association-models'))
      requests.push(request.url());
  });
  await page.goto('/maintenance?tab=predictive');
  const controls = page.getByRole('region', {
    name: 'Maintenance model selection',
    exact: true
  });
  const results = page.getByRole('region', {
    name: 'Spare parts model results',
    exact: true
  });
  await expect(
    results.getByText('FP-Growth results', { exact: true })
  ).toBeVisible();
  await expect(
    results.getByText('21 training transactions · 4 rules', { exact: true })
  ).toBeVisible();
  await expect(results.getByRole('row')).toHaveCount(5);
  await controls
    .getByRole('combobox', { name: 'Parts algorithm', exact: true })
    .click();
  await page.getByRole('option', { name: 'Eclat', exact: true }).click();
  await expect(
    controls.getByText('Run the model to apply your selections.', {
      exact: true
    })
  ).toBeVisible();
  expect(requests.some((url) => url.includes('algorithm=eclat'))).toBe(false);
  await expect(
    results.getByText('FP-Growth results', { exact: true })
  ).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/analytics/association-models?algorithm=eclat')
    ),
    controls.getByRole('button', { name: 'Run Model', exact: true }).click()
  ]);
  expect((await response.json()).algorithm).toBe('eclat');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(
    results.getByText('Eclat results', { exact: true })
  ).toBeVisible();
  expect(requests.some((url) => url.includes('algorithm=eclat'))).toBe(true);
  await expect(
    results.getByRole('cell', { name: '57.1%', exact: true })
  ).toBeVisible();
  await chooseFilter(page, 'Confidence', '80% and above');
  await expect(results.getByRole('row')).toHaveCount(4);
  await expect(
    results.getByRole('cell', { name: '57.1%', exact: true })
  ).toHaveCount(0);
  await chooseFilter(page, 'Confidence', 'Below 50%');
  await expect(
    results.getByText('No records match your filters.')
  ).toBeVisible();
  await expect(results.getByRole('table')).toHaveCount(0);
  await results
    .getByRole('button', { name: 'Clear filters', exact: true })
    .first()
    .click();
  await expect(results.getByRole('row')).toHaveCount(5);
  await controls
    .getByRole('combobox', { name: 'Parts algorithm', exact: true })
    .click();
  await page
    .getByRole('option', { name: 'FP-Growth (Default)', exact: true })
    .click();
  const [rerun] = await Promise.all([
    page.waitForResponse((response) =>
      response
        .url()
        .includes('/analytics/association-models?algorithm=fp_growth')
    ),
    controls.getByRole('button', { name: 'Run Model', exact: true }).click()
  ]);
  expect((await rerun.json()).algorithm).toBe('fp_growth');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(
    results.getByText('FP-Growth results', { exact: true })
  ).toBeVisible();
});

test('reports the selected model failure and can retry without showing stale results', async ({
  page
}) => {
  await login(page, 'admin');
  let fail = true;
  await page.route(
    '**/api/analytics/association-models?algorithm=eclat',
    (route) =>
      fail
        ? route.fulfill({
            status: 503,
            json: {
              error: { code: 'MODEL_UNAVAILABLE', message: 'Unavailable' }
            }
          })
        : route.continue()
  );
  await page.goto('/maintenance?tab=predictive');
  const controls = page.getByRole('region', {
    name: 'Maintenance model selection',
    exact: true
  });
  const results = page.getByRole('region', {
    name: 'Spare parts model results',
    exact: true
  });
  await expect(
    results.getByText('FP-Growth results', { exact: true })
  ).toBeVisible();
  await controls
    .getByRole('combobox', { name: 'Parts algorithm', exact: true })
    .click();
  await page.getByRole('option', { name: 'Eclat', exact: true }).click();
  await controls
    .getByRole('button', { name: 'Run Model', exact: true })
    .click();
  await expect(results.getByRole('alert')).toContainText(
    'Could not load Eclat results.'
  );
  await expect(results.getByRole('table')).toHaveCount(0);
  fail = false;
  await controls
    .getByRole('button', { name: 'Run Model', exact: true })
    .click();
  await expect(
    results.getByText('Eclat results', { exact: true })
  ).toBeVisible();
  await expect(results.getByRole('row')).toHaveCount(5);
});

for (const width of [1280, 390]) {
  test(`model controls fit the available width at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, 'admin');
    await page.goto('/maintenance?tab=predictive');
    const controls = page.getByRole('region', {
      name: 'Maintenance model selection',
      exact: true
    });
    await expect(
      controls.getByRole('button', { name: 'Run Model', exact: true })
    ).toBeEnabled();
    const box = await controls.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await controls.screenshot({
      path: `/tmp/mms-association-models-${width}.png`
    });
  });
}
