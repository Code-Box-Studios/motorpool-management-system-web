import { expect, test } from '@playwright/test';
import { chooseFilter } from './filter-controls';
import { apiGet, apiLogin, CREDENTIALS, login } from './helpers';

const predictions = {
  data: [
    {
      vehicleId: '10000000-0000-4000-8000-000000000001',
      make: 'Toyota',
      model: 'Hiace',
      licensePlate: 'MMS-HIGH',
      mileage: 12000,
      kmSinceLastMaint: 6000,
      avgDailyKm: 40,
      maintFreq12m: 1,
      riskScore: 90,
      priority: 'high',
      usedFallback: false,
      scoringMethod: 'random_forest',
      crossCheckScore: 0.5,
      crossCheckModel: 'client_decision_tree_v1'
    },
    {
      vehicleId: '10000000-0000-4000-8000-000000000002',
      make: 'Nissan',
      model: 'Urvan',
      licensePlate: 'MMS-LOW',
      mileage: 1000,
      kmSinceLastMaint: 1000,
      avgDailyKm: 20,
      maintFreq12m: 3,
      riskScore: 10,
      priority: 'low',
      usedFallback: false,
      scoringMethod: 'random_forest',
      crossCheckScore: 0.5,
      crossCheckModel: 'client_decision_tree_v1'
    }
  ],
  count: 2
};

test('maintenance searches preserve the Schedule page and sort when set and cleared', async ({
  page
}) => {
  await login(page, 'admin');
  for (const [tab, label, key] of [
    ['preventive', 'Search preventive vehicles', 'preventiveSearch'],
    ['predictive', 'Search predictive vehicles', 'predictiveSearch'],
    ['predictive', 'Search parts recommendations', 'partsSearch']
  ]) {
    await page.goto(`/maintenance?tab=${tab}&page=3&sortBy=date&sortOrder=asc`);
    const search = page.getByRole('searchbox', { name: label, exact: true });
    await search.fill('no-match-pagination-check');
    await expect(page).toHaveURL(new RegExp(`${key}=`));
    await expect(page).toHaveURL(/page=3/);
    await expect(page).toHaveURL(/sortBy=date/);
    await search.press('Escape');
    await expect(page).not.toHaveURL(new RegExp(`${key}=`));
    await expect(page).toHaveURL(/page=3/);
    await expect(page).toHaveURL(/sortOrder=asc/);
  }
});

test('preventive and predictive searches are independent and combine with filters', async ({
  page
}) => {
  await login(page, 'admin');
  await page.route('**/api/analytics/predictive-maintenance', (route) =>
    route.fulfill({ json: predictions })
  );
  await page.goto('/maintenance?tab=preventive');
  const preventive = page.getByRole('region', {
    name: 'Preventive vehicles',
    exact: true
  });
  const search = preventive.getByRole('searchbox', {
    name: 'Search preventive vehicles',
    exact: true
  });
  await search.fill('toyota MMS-HIGH');
  await expect(preventive.getByText('MMS-HIGH', { exact: true })).toBeVisible();
  await expect(preventive.getByText('MMS-LOW', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Predictive', exact: true }).click();
  const predictive = page.getByRole('region', {
    name: 'Predictive vehicles',
    exact: true
  });
  await expect(predictive.getByText('MMS-LOW', { exact: true })).toBeVisible();
  const predictiveSearch = predictive.getByRole('searchbox', {
    name: 'Search predictive vehicles',
    exact: true
  });
  await predictiveSearch.fill('nissan mms-low');
  await expect(predictive.getByText('MMS-HIGH', { exact: true })).toHaveCount(
    0
  );
  await chooseFilter(page, 'Risk', 'High Risk');
  await expect(
    predictive.getByText('No records match your search and filters.')
  ).toBeVisible();
  await predictive
    .getByRole('button', { name: 'Clear search', exact: true })
    .first()
    .click();
  await expect(predictive.getByText('MMS-HIGH', { exact: true })).toBeVisible();
  await expect(predictive.getByText('MMS-LOW', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Preventive', exact: true }).click();
  await expect(search).toHaveValue('toyota MMS-HIGH');
  await page.reload();
  await expect(search).toHaveValue('toyota MMS-HIGH');
});

test('parts search combines names and confidence and clears without changing the applied model', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/maintenance?tab=predictive');
  const results = page.getByRole('region', {
    name: 'Spare parts model results',
    exact: true
  });
  const search = results.getByRole('searchbox', {
    name: 'Search parts recommendations',
    exact: true
  });
  await search.fill('valve cover');
  await expect(results.getByRole('row')).toHaveCount(2);
  await chooseFilter(page, 'Confidence', '80% and above');
  await search.fill('no-part-matches');
  await expect(
    results.getByText('No records match your search and filters.')
  ).toBeVisible();
  await results
    .getByRole('button', { name: 'Clear search', exact: true })
    .first()
    .click();
  await expect(results.getByRole('row')).toHaveCount(4);
  await expect(
    results.getByText('FP-Growth results', { exact: true })
  ).toBeVisible();
});

test('top model controls change actual vehicle risk results after Run Model', async ({
  page,
  request
}) => {
  const actor = await apiLogin(request, CREDENTIALS.admin);
  const baseline = (await apiGet(
    request,
    '/api/analytics/predictive-maintenance',
    actor.token
  )) as {
    data: {
      vehicleId: string;
      make: string;
      model: string;
      riskScore: number;
    }[];
  };
  expect(baseline.data.length).toBeGreaterThan(0);
  const vehicle = baseline.data[0];
  await login(page, 'admin');
  await page.goto('/maintenance?tab=predictive');
  const controls = page.getByRole('region', {
    name: 'Maintenance model selection',
    exact: true
  });
  const fleet = page.getByRole('region', {
    name: 'Predictive vehicles',
    exact: true
  });
  await expect(
    controls.getByRole('button', { name: 'Run Model', exact: true })
  ).toBeEnabled();
  expect((await controls.boundingBox())!.y).toBeLessThan(
    (await fleet.boundingBox())!.y
  );
  await controls
    .getByRole('combobox', { name: 'Vehicle risk algorithm', exact: true })
    .click();
  await page
    .getByRole('option', { name: 'Usage-based estimate', exact: true })
    .click();
  const [response] = await Promise.all([
    page.waitForResponse((response) =>
      response
        .url()
        .includes('/analytics/predictive-maintenance?algorithm=usage_rules')
    ),
    controls.getByRole('button', { name: 'Run Model', exact: true }).click()
  ]);
  const scored = (await response.json()).data.find(
    (row: { vehicleId: string }) => row.vehicleId === vehicle.vehicleId
  );
  expect(scored.scoringMethod).toBe('usage_rules');
  expect(scored.riskScore).not.toBe(vehicle.riskScore);
  const card = fleet
    .locator('[data-slot="card"]')
    .filter({
      has: page.getByRole('link', {
        name: `${vehicle.make} ${vehicle.model}`,
        exact: true
      })
    })
    .last();
  await expect(
    card.getByText(String(scored.riskScore), { exact: true })
  ).toBeVisible();
  await expect(
    fleet.getByText('Usage-based estimate', { exact: true })
  ).toBeVisible();
  await card
    .getByRole('link', {
      name: `${vehicle.make} ${vehicle.model}`,
      exact: true
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/vehicles/${vehicle.vehicleId}`));
});

test('a failed vehicle-risk run hides old scores and can be retried independently', async ({
  page
}) => {
  await login(page, 'admin');
  let fail = true;
  await page.route(
    '**/api/analytics/predictive-maintenance?algorithm=usage_rules',
    (route) =>
      fail
        ? route.fulfill({
            status: 503,
            json: { error: { code: 'UNAVAILABLE', message: 'Unavailable' } }
          })
        : route.continue()
  );
  await page.goto('/maintenance?tab=predictive');
  const controls = page.getByRole('region', {
    name: 'Maintenance model selection',
    exact: true
  });
  const fleet = page.getByRole('region', {
    name: 'Predictive vehicles',
    exact: true
  });
  await expect(
    controls.getByRole('button', { name: 'Run Model', exact: true })
  ).toBeEnabled();
  await controls
    .getByRole('combobox', { name: 'Vehicle risk algorithm', exact: true })
    .click();
  await page
    .getByRole('option', { name: 'Usage-based estimate', exact: true })
    .click();
  await controls
    .getByRole('button', { name: 'Run Model', exact: true })
    .click();
  await expect(fleet.getByRole('alert')).toContainText(
    'Could not load vehicle risk results.'
  );
  await expect(fleet.getByRole('link')).toHaveCount(0);
  fail = false;
  await fleet
    .getByRole('button', { name: 'Retry vehicle results', exact: true })
    .click();
  await expect(fleet.getByRole('link').first()).toBeVisible();
});
