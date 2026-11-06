import { expect, test } from '@playwright/test';

// Exercise the real login UI against isolated HTTP responses. These checks do
// not need an account, write to the database, or contact a deployed service.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }
    })
  );
  await page.goto('/login');
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' })
  ).toBeVisible();
});

test('keyboard users can reveal the password and see linked validation errors', async ({
  page
}) => {
  const email = page.getByRole('textbox', { name: 'Email address' });
  const password = page.getByLabel('Password', { exact: true });
  await email.focus();
  await email.fill('operator@example.test');
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await password.fill('short');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Show password' })
  ).toBeFocused();
  await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('short');
  await expect(
    page.getByRole('button', { name: 'Hide password' })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(password).toHaveAttribute('type', 'password');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Sign In', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(
    'Password must be at least 6 characters'
  );
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAttribute(
    'aria-describedby',
    'login-password-error'
  );
  await expect(page).toHaveURL(/\/login$/);
});

test('failed login restores the form, preserves input, and allows a retry', async ({
  page
}) => {
  let attempts = 0;
  let finishRequest: (() => void) | undefined;
  const requestGate = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  await page.route('**/api/auth/login', async (route) => {
    attempts += 1;
    expect(route.request().postDataJSON()).toEqual({
      email: 'operator@example.test',
      password: 'NotARealPassword!'
    });
    if (attempts === 1) await requestGate;
    await route.fulfill({
      status: 401,
      json: {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      }
    });
  });
  await page.getByLabel('Email address').fill('operator@example.test');
  await page.getByLabel('Password', { exact: true }).fill('NotARealPassword!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Signing in...' })
  ).toBeDisabled();
  await expect(
    page.getByRole('form', { name: 'Welcome back.' })
  ).toHaveAttribute('aria-busy', 'true');
  finishRequest!();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  await expect(
    page.getByRole('button', { name: 'Sign In', exact: true })
  ).toBeEnabled();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
    'NotARealPassword!'
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  expect(attempts).toBe(2);
  await expect(page).toHaveURL(/\/login$/);
});

test('login fits narrow phones, tablets, and desktop in both themes', async ({
  page
}) => {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) =>
        document.documentElement.classList.toggle('dark', value === 'dark'),
      theme
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole('heading', { name: 'Welcome back.' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Sign In', exact: true })
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      const toggle = await page
        .getByRole('button', { name: 'Show password' })
        .boundingBox();
      expect(toggle?.width).toBeGreaterThanOrEqual(44);
      expect(toggle?.height).toBeGreaterThanOrEqual(44);
    }
  }
});
