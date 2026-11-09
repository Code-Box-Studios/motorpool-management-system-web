import { expect, test, type Page } from '@playwright/test';
import type { RiskAssessment } from '@mms/shared';

// HTTP fixtures keep the real application and query cache in use without
// authenticating against, or writing to, the development database.
const scoredVehicle: RiskAssessment = {
  vehicleId: '10000000-0000-4000-8000-000000000001',
  make: 'Toyota',
  model: 'Hilux',
  licensePlate: 'LR-7304',
  mileage: 58000,
  kmSinceLastMaint: 4600,
  avgDailyKm: 85,
  maintFreq12m: 2,
  riskScore: 73.4,
  priority: 'high',
  usedFallback: false,
  scoringMethod: 'logistic_regression',
  crossCheckScore: null,
  crossCheckModel: 'Decision Tree'
};

const unscoredVehicle = {
  vehicleId: '10000000-0000-4000-8000-000000000002',
  make: 'Isuzu',
  model: 'Traviz',
  licensePlate: 'LR-NODATE',
  reason: 'No dated maintenance or completed repair history.'
};

interface ResultFixture {
  data: RiskAssessment[];
  count: number;
  riskThreshold?: number;
  unscoredVehicles?: (typeof unscoredVehicle)[];
}

async function fixtures(page: Page, logisticResult: ResultFixture) {
  const riskRequests: string[] = [];
  const writes: string[] = [];
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({
        status: 405,
        json: { error: 'Read-only fixture' }
      });
    }
    if (url.pathname === '/api/auth/me')
      return route.fulfill({
        json: {
          id: '10000000-0000-4000-8000-000000000010',
          email: 'fixture-admin@mms.local',
          fullName: 'Fixture Administrator',
          avatarUrl: null,
          role: 'admin',
          branchId: null
        }
      });
    if (url.pathname === '/api/auth/test-accounts')
      return route.fulfill({ json: { enabled: false } });
    if (url.pathname === '/api/analytics/predictive-maintenance') {
      const algorithm = url.searchParams.get('algorithm') ?? 'random_forest';
      riskRequests.push(algorithm);
      return route.fulfill({
        json:
          algorithm === 'logistic_regression'
            ? logisticResult
            : {
                data: [
                  {
                    ...scoredVehicle,
                    scoringMethod: algorithm,
                    riskScore: algorithm === 'decision_tree' ? 41 : 82
                  }
                ],
                count: 1
              }
      });
    }
    if (url.pathname === '/api/analytics/association-models')
      return route.fulfill({
        json: {
          algorithm: 'apriori',
          modelName: 'Apriori',
          source: 'live_job_orders',
          sourceFile: null,
          sourceSha256: null,
          trainingTransactions: null,
          transactionCount: 0,
          minSupport: 0.1,
          count: 0,
          data: []
        }
      });
    if (url.pathname === '/api/notifications')
      return route.fulfill({ json: { data: [], unread: 0 } });
    return route.fulfill({ json: { data: [], count: 0 } });
  });
  return { riskRequests, writes };
}

function regions(page: Page) {
  return {
    controls: page.getByRole('region', {
      name: 'Maintenance model selection',
      exact: true
    }),
    results: page.getByRole('region', {
      name: 'Predictive vehicles',
      exact: true
    })
  };
}

async function selectLogisticRegression(page: Page) {
  const { controls } = regions(page);
  await expect(
    controls.getByRole('button', { name: 'Run Model', exact: true })
  ).toBeEnabled();
  await controls
    .getByRole('combobox', { name: 'Vehicle risk algorithm' })
    .click();
  const option = page.getByRole('option', {
    name: 'Logistic Regression',
    exact: true
  });
  await expect(option).toBeEnabled();
  await option.click();
}

test('runs Logistic Regression only after applying selection and shows its score without a service-date prediction', async ({
  page
}) => {
  const { riskRequests, writes } = await fixtures(page, {
    data: [scoredVehicle],
    count: 1,
    riskThreshold: 60,
    unscoredVehicles: [unscoredVehicle]
  });
  await page.goto('/maintenance?tab=predictive');
  const { controls, results } = regions(page);
  await expect(
    results.getByText('Random Forest', { exact: true })
  ).toBeVisible();
  await expect(
    results.getByText('Predicted Service', { exact: true })
  ).toBeVisible();
  await selectLogisticRegression(page);
  expect(riskRequests).toEqual(['random_forest']);
  await expect(
    results.getByText('Random Forest', { exact: true })
  ).toBeVisible();
  await controls
    .getByRole('button', { name: 'Run Model', exact: true })
    .click();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  expect(riskRequests).toEqual(['random_forest', 'logistic_regression']);
  await expect(
    results.getByText('Logistic Regression', { exact: true })
  ).toBeVisible();
  await expect(results.getByText('73.4', { exact: true })).toBeVisible();
  await expect(results.getByText('Model score', { exact: true })).toBeVisible();
  await expect(results).toContainText('Model threshold: 60%');
  await expect(
    results.getByText('Predicted Service', { exact: true })
  ).toHaveCount(0);
  await expect(results).toContainText('LR-NODATE');
  await expect(results).toContainText(unscoredVehicle.reason);
  await results
    .getByRole('searchbox', { name: 'Search predictive vehicles' })
    .fill('no matching scored vehicle');
  await expect(results).toContainText('No records match your search.');
  await expect(results).not.toContainText('All vehicles are well-maintained');
  await expect(results).toContainText('LR-NODATE');
  expect(writes).toEqual([]);
});

test('shows insufficient history instead of declaring unscored vehicles well-maintained', async ({
  page
}) => {
  await fixtures(page, {
    data: [],
    count: 0,
    riskThreshold: 60,
    unscoredVehicles: [unscoredVehicle]
  });
  await page.goto('/maintenance?tab=predictive');
  await selectLogisticRegression(page);
  const { controls, results } = regions(page);
  await controls
    .getByRole('button', { name: 'Run Model', exact: true })
    .click();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results).toContainText(
    'No vehicles could be scored with the available history.'
  );
  await expect(results).toContainText('LR-NODATE');
  await expect(results).toContainText(unscoredVehicle.reason);
  await expect(results).not.toContainText('All vehicles are well-maintained');
  await expect(results.getByText('Model score', { exact: true })).toHaveCount(
    0
  );
});

test('reads threshold metadata from each response without inventing a fallback', async ({
  page
}) => {
  const result: ResultFixture = {
    data: [scoredVehicle],
    count: 1,
    riskThreshold: 67
  };
  await fixtures(page, result);
  await page.goto('/maintenance?tab=predictive');
  await selectLogisticRegression(page);
  const { controls, results } = regions(page);
  await controls
    .getByRole('button', { name: 'Run Model', exact: true })
    .click();
  await expect(results).toContainText('Model threshold: 67%');
  await expect(results.getByText('73.4', { exact: true })).toBeVisible();
  delete result.riskThreshold;
  await controls
    .getByRole('button', { name: 'Run Model', exact: true })
    .click();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results).not.toContainText('Model threshold:');
  await expect(results.getByText('73.4', { exact: true })).toBeVisible();
  await expect(
    results.getByRole('region', { name: 'Unscored vehicles' })
  ).toHaveCount(0);
});

test('keeps array consumers compatible and preserves Decision Tree service-date display', async ({
  page
}) => {
  await fixtures(page, { data: [scoredVehicle], count: 1 });
  await page.goto('/maintenance?tab=preventive');
  await expect(
    page
      .getByRole('region', { name: 'Preventive vehicles', exact: true })
      .getByText('LR-7304', { exact: true })
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Predictive', exact: true }).click();
  const { controls, results } = regions(page);
  await expect(results.getByText('82', { exact: true })).toBeVisible();
  await expect(
    controls.getByRole('button', { name: 'Run Model', exact: true })
  ).toBeEnabled();
  await controls
    .getByRole('combobox', { name: 'Vehicle risk algorithm' })
    .click();
  await page
    .getByRole('option', { name: 'Decision Tree', exact: true })
    .click();
  await controls
    .getByRole('button', { name: 'Run Model', exact: true })
    .click();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results.getByText('41', { exact: true })).toBeVisible();
  await expect(results.getByText('Risk score', { exact: true })).toBeVisible();
  await expect(
    results.getByText('Predicted Service', { exact: true })
  ).toBeVisible();
  await expect(results).not.toContainText('Model threshold:');
  await page.getByRole('tab', { name: 'Preventive', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Preventive vehicles', exact: true })
      .getByText('LR-7304', { exact: true })
  ).toBeVisible();
});
