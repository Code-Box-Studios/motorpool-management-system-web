import { expect, test } from '@playwright/test';
import { login } from './helpers';

const lists = [
  {
    path: '/vehicles',
    alternate: 'grid',
    alternateLabel: 'Grid',
    defaultLabel: 'Table'
  },
  {
    path: '/spare-parts',
    alternate: 'grid',
    alternateLabel: 'Grid',
    defaultLabel: 'Table'
  },
  {
    path: '/tools',
    alternate: 'grid',
    alternateLabel: 'Grid',
    defaultLabel: 'Table'
  },
  {
    path: '/trip-tickets',
    alternate: 'calendar',
    alternateLabel: 'Calendar',
    defaultLabel: 'Table'
  },
  {
    path: '/job-order',
    alternate: 'calendar',
    alternateLabel: 'Calendar',
    defaultLabel: 'Table'
  },
  {
    path: '/maintenance',
    alternate: 'table',
    alternateLabel: 'Table',
    defaultLabel: 'Calendar'
  }
];

for (const list of lists) {
  test(`${list.path} view links survive reload and Back while preserving other parameters`, async ({
    page
  }) => {
    await login(page, 'admin');
    await page.goto(`${list.path}?view=${list.alternate}&page=2&keep=retained`);
    const alternate = page.getByRole('tab', {
      name: list.alternateLabel,
      exact: true
    });
    const defaultTab = page.getByRole('tab', {
      name: list.defaultLabel,
      exact: true
    });
    await expect(alternate).toHaveAttribute('aria-selected', 'true');
    await page.reload();
    await expect(alternate).toHaveAttribute('aria-selected', 'true');
    await defaultTab.click();
    await expect(defaultTab).toHaveAttribute('aria-selected', 'true');
    await alternate.click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('view'))
      .toBe(list.alternate);
    expect(new URL(page.url()).searchParams.get('page')).toBe('2');
    expect(new URL(page.url()).searchParams.get('keep')).toBe('retained');
    await page.reload();
    await expect(alternate).toHaveAttribute('aria-selected', 'true');
    await page.goBack();
    await expect(defaultTab).toHaveAttribute('aria-selected', 'true');
    await page.goForward();
    await expect(alternate).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('searchbox').fill('view parameter check');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('search'))
      .toBe('view parameter check');
    expect(new URL(page.url()).searchParams.get('view')).toBe(list.alternate);
    await expect(alternate).toHaveAttribute('aria-selected', 'true');
  });
}

test('unsupported layout parameters fall back safely on every list', async ({
  page
}) => {
  await login(page, 'admin');
  for (const list of lists) {
    await page.goto(`${list.path}?view=unsupported`);
    await expect(
      page.getByRole('tab', { name: list.defaultLabel, exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel').first()).toBeVisible();
  }
});

test('maintenance keeps its schedule view when switching sections and filters', async ({
  page
}) => {
  await login(page, 'admin');
  await page.goto('/maintenance?tab=schedule&view=table&type=preventive');
  await expect(
    page.getByRole('tab', { name: 'Table', exact: true })
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Predictive', exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('tab'))
    .toBe('predictive');
  expect(new URL(page.url()).searchParams.get('view')).toBe('table');
  await page.getByRole('tab', { name: 'Schedule', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'Table', exact: true })
  ).toHaveAttribute('aria-selected', 'true');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .first()
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('type'))
    .toBe(null);
  expect(new URL(page.url()).searchParams.get('view')).toBe('table');
});
