import { expect, test, type Page, type Route } from '@playwright/test';

const administrator = {
  id: '10000000-0000-4000-8000-000000000011',
  email: 'logout-administrator@example.test',
  fullName: 'Logout Administrator',
  avatarUrl: null,
  role: 'admin',
  branchId: null
};
const requester = {
  ...administrator,
  id: '10000000-0000-4000-8000-000000000012',
  email: 'logout-requester@example.test',
  fullName: 'Next Requester',
  role: 'requester'
};

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

// Keep the real provider, router, browser cookies, and API client. Every HTTP
// API response is intercepted, so these tests never access the business DB.
async function fixtures(page: Page, failure: '503' | 'transport') {
  let logoutSucceeds = false;
  let authReads = 0;
  const handlers = new Map<string, (route: Route) => Promise<void>>();
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const override = handlers.get(path);
    if (override) return override(route);
    const headers = await request.allHeaders();
    const identity =
      headers.authorization === 'Bearer requester-token'
        ? requester
        : administrator;
    const unauthorized = () =>
      route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }
      });
    if (path === '/api/auth/login') {
      const user =
        request.postDataJSON().email === requester.email
          ? requester
          : administrator;
      const token = user.id === requester.id ? 'requester' : 'administrator';
      return route.fulfill({
        headers: {
          'Set-Cookie': `mms_refresh=${token}; Path=/api/auth; HttpOnly; SameSite=Lax`
        },
        json: { accessToken: `${token}-token`, user }
      });
    }
    if (path === '/api/auth/logout') {
      if (!logoutSucceeds) {
        if (failure === 'transport') return route.abort('failed');
        return route.fulfill({
          status: 503,
          json: {
            error: { code: 'UNAVAILABLE', message: 'Temporarily unavailable' }
          }
        });
      }
      return route.fulfill({
        status: 204,
        headers: {
          'Set-Cookie': 'mms_refresh=; Path=/api/auth; HttpOnly; Max-Age=0'
        }
      });
    }
    if (path === '/api/auth/me') {
      authReads += 1;
      return headers.authorization
        ? route.fulfill({ json: identity })
        : unauthorized();
    }
    if (path === '/api/auth/refresh') {
      authReads += 1;
      const cookie = headers.cookie?.match(
        /(?:^|;\s*)mms_refresh=([^;]+)/
      )?.[1];
      return cookie
        ? route.fulfill({ json: { accessToken: `${cookie}-token` } })
        : unauthorized();
    }
    if (path === '/api/auth/test-accounts')
      return route.fulfill({ json: { enabled: false } });
    if (path === '/api/users/me')
      return route.fulfill({
        json: {
          ...identity,
          phone: null,
          address: null,
          status: 'active',
          branchName: null,
          createdAt: '2026-11-12T00:00:00Z'
        }
      });
    if (path === '/api/notifications')
      return route.fulfill({ json: { data: [], unread: 0 } });
    return route.fulfill({ json: { data: [], count: 0 } });
  });
  return {
    handlers,
    allowLogout: () => {
      logoutSucceeds = true;
    },
    authReads: () => authReads
  };
}

async function signIn(page: Page, user = administrator) {
  await page.getByLabel('Email address').fill(user.email);
  await page
    .getByLabel('Password', { exact: true })
    .fill('FixturePassword123!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.locator('header [aria-haspopup="menu"]').last().click();
  await expect(page.getByRole('menu').getByText(user.email)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

async function startLogout(page: Page) {
  await page.locator('header [aria-haspopup="menu"]').last().click();
  await page.getByRole('menuitem', { name: 'Logout', exact: true }).click();
}

function blockSessionStorage(
  methods: ('getItem' | 'setItem' | 'removeItem')[] = [
    'getItem',
    'setItem',
    'removeItem'
  ]
) {
  for (const method of methods) {
    const original = Storage.prototype[method];
    Object.defineProperty(Storage.prototype, method, {
      configurable: true,
      value(this: Storage, ...args: string[]) {
        if (
          this === window.sessionStorage &&
          args[0] === 'mms.logout-pending'
        ) {
          throw new DOMException(
            'Session storage is blocked',
            method === 'setItem' ? 'QuotaExceededError' : 'SecurityError'
          );
        }
        return Reflect.apply(original, this, args);
      }
    });
  }
}

for (const failure of ['503', 'transport'] as const) {
  test(`failed logout (${failure}) stays private across reload and permits login only after retry confirms cookie removal`, async ({
    page
  }, testInfo) => {
    const server = await fixtures(page, failure);
    await page.goto('/login');
    await signIn(page);
    await startLogout(page);
    const retry = page.getByRole('button', { name: 'Retry sign-out' });
    await expect.soft(retry).toBeVisible({ timeout: 1000 });
    await expect.soft(page.getByLabel('Email address')).toHaveCount(0);
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name === 'mms_refresh' && cookie.httpOnly
      )
    ).toBe(true);
    const readsBeforeReload = server.authReads();
    await page.reload();
    await expect.soft(retry).toBeVisible({ timeout: 1000 });
    await expect
      .soft(page.locator('header [aria-haspopup="menu"]'))
      .toHaveCount(0);
    await expect.soft(page.getByLabel('Email address')).toHaveCount(0);
    expect.soft(server.authReads()).toBe(readsBeforeReload);
    await testInfo.attach('reload-boundary', {
      body: JSON.stringify({
        failure,
        readsBeforeReload,
        readsAfterReload: server.authReads(),
        privateHeaderRestored: await page
          .locator('header [aria-haspopup="menu"]')
          .count(),
        loginExposed: await page.getByLabel('Email address').count()
      }),
      contentType: 'application/json'
    });
    if (testInfo.errors.length) return;

    server.allowLogout();
    await retry.click();
    await expect(page.getByLabel('Email address')).toBeVisible();
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name === 'mms_refresh'
      )
    ).toBe(false);
    await signIn(page, requester);
    // The completed intent must not trap a fresh session on its next reload.
    await page.reload();
    await page.locator('header [aria-haspopup="menu"]').last().click();
    await expect(
      page.getByRole('menu').getByText(requester.email)
    ).toBeVisible();
    await expect(page.getByText(administrator.email)).toHaveCount(0);
  });
}

for (const failure of ['503', 'transport'] as const) {
  test(`blocked logout-intent storage keeps failed logout (${failure}) private across reload and allows confirmed recovery`, async ({
    page
  }, testInfo) => {
    const server = await fixtures(page, failure);
    await page.goto('/login');
    await signIn(page);
    // Block the provider's reads, writes, and removal before logout and across
    // reload. Blocking every key instead crashes TanStack at module import,
    // which would hide this provider regression behind an unrelated failure.
    await page.evaluate(blockSessionStorage);
    await page.addInitScript(blockSessionStorage);
    await startLogout(page);
    const retry = page.getByRole('button', { name: 'Retry sign-out' });
    await expect(retry).toBeVisible();
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name === 'mms_refresh' && cookie.httpOnly
      )
    ).toBe(true);
    const readsBeforeReload = server.authReads();
    await page.reload();
    await expect.soft(retry).toBeVisible({ timeout: 1000 });
    await expect
      .soft(page.locator('header [aria-haspopup="menu"]'))
      .toHaveCount(0);
    await expect.soft(page.getByLabel('Email address')).toHaveCount(0);
    expect.soft(server.authReads()).toBe(readsBeforeReload);
    await testInfo.attach('blocked-storage-reload-boundary', {
      body: JSON.stringify({
        failure,
        readsBeforeReload,
        readsAfterReload: server.authReads(),
        privateHeaderRestored: await page
          .locator('header [aria-haspopup="menu"]')
          .count()
      }),
      contentType: 'application/json'
    });
    if (testInfo.errors.length) return;

    server.allowLogout();
    await retry.click();
    await expect(page.getByLabel('Email address')).toBeVisible();
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name === 'mms_refresh'
      )
    ).toBe(false);
    // removeItem also throws, but confirmed server logout still allows a new
    // account in this document. A later blocked-storage startup stays closed.
    await signIn(page, requester);
    const readsBeforeNextReload = server.authReads();
    await page.reload();
    await expect(retry).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Finish signing out' })
    ).toBeVisible();
    await expect(page.locator('header [aria-haspopup="menu"]')).toHaveCount(0);
    expect(server.authReads()).toBe(readsBeforeNextReload);
  });
}

test('write-only quota failure keeps failed logout private after reload while storage reads still work', async ({
  page
}, testInfo) => {
  const server = await fixtures(page, '503');
  await page.goto('/login');
  await signIn(page);
  await page.evaluate(blockSessionStorage, ['setItem']);
  await page.addInitScript(blockSessionStorage, ['setItem']);
  await startLogout(page);
  const retry = page.getByRole('button', { name: 'Retry sign-out' });
  await expect(retry).toBeVisible();
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === 'mms_refresh' && cookie.httpOnly
    )
  ).toBe(true);
  expect(
    await page.evaluate(() => sessionStorage.getItem('mms.logout-pending'))
  ).toBeNull();
  const readsBeforeReload = server.authReads();
  await page.reload();
  await expect.soft(retry).toBeVisible({ timeout: 1000 });
  await expect
    .soft(page.locator('header [aria-haspopup="menu"]'))
    .toHaveCount(0);
  await expect.soft(page.getByLabel('Email address')).toHaveCount(0);
  expect.soft(server.authReads()).toBe(readsBeforeReload);
  expect(
    await page.evaluate(() => sessionStorage.getItem('mms.logout-pending'))
  ).toBeNull();
  if (testInfo.errors.length) return;

  server.allowLogout();
  await retry.click();
  await expect(page.getByLabel('Email address')).toBeVisible();
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === 'mms_refresh'
    )
  ).toBe(false);
  await signIn(page, requester);
  await page.reload();
  await page.locator('header [aria-haspopup="menu"]').last().click();
  await expect(page.getByRole('menu').getByText(requester.email)).toBeVisible();
  await expect(page.getByText(administrator.email)).toHaveCount(0);
});

test('cold startup with blocked logout-intent storage requires confirmed sign-out before login', async ({
  page
}, testInfo) => {
  const server = await fixtures(page, '503');
  await page.addInitScript(blockSessionStorage);
  await page.goto('/login');
  const retry = page.getByRole('button', { name: 'Retry sign-out' });
  await expect.soft(retry).toBeVisible({ timeout: 1000 });
  await expect
    .soft(page.getByRole('heading', { name: 'Finish signing out' }))
    .toBeVisible({ timeout: 1000 });
  await expect.soft(page.getByLabel('Email address')).toHaveCount(0);
  expect.soft(server.authReads()).toBe(0);
  if (testInfo.errors.length) return;

  server.allowLogout();
  await retry.click();
  await signIn(page, requester);
});

test('failed logout and retry keep an obsolete refresh from replacing the next account', async ({
  page
}) => {
  const server = await fixtures(page, '503');
  await page.goto('/login');
  await signIn(page);
  const oldRefresh = gate();
  const refreshSeen = gate();
  server.handlers.set('/api/auth/refresh', async (route) => {
    refreshSeen.release();
    await oldRefresh.promise;
    await route.fulfill({
      json: { accessToken: 'obsolete-administrator-token' }
    });
  });
  server.handlers.set('/api/auth-race-probe', async (route) => {
    await route.fulfill({
      status: 401,
      json: { error: { code: 'UNAUTHORIZED', message: 'Expired' } }
    });
  });
  await page.evaluate(async () => {
    const clientUrl = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname === '/src/lib/api/client.ts')!;
    const client = await import(clientUrl);
    (window as unknown as { oldRequest: Promise<string> }).oldRequest =
      client.api.get('/auth-race-probe').then(
        () => 'resolved',
        (error: Error) => error.name
      );
  });
  await refreshSeen.promise;
  try {
    await startLogout(page);
    await expect(
      page.getByRole('button', { name: 'Retry sign-out' })
    ).toBeVisible();
    server.allowLogout();
    await page.getByRole('button', { name: 'Retry sign-out' }).click();
    await signIn(page, requester);
    oldRefresh.release();
    expect(
      await page.evaluate(
        () => (window as unknown as { oldRequest: Promise<string> }).oldRequest
      )
    ).toBe('AbortError');
    expect(
      await page.evaluate(async () => {
        const clientUrl = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .find((url) => new URL(url).pathname === '/src/lib/api/client.ts')!;
        return (await import(clientUrl)).getAccessToken();
      })
    ).toBe('requester-token');
    await page.locator('header [aria-haspopup="menu"]').last().click();
    await expect(
      page.getByRole('menu').getByText(requester.email)
    ).toBeVisible();
    await expect(page.getByText(administrator.email)).toHaveCount(0);
  } finally {
    oldRefresh.release();
  }
});
