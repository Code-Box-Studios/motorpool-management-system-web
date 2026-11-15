import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const admin = {
  id: '10000000-0000-4000-8000-000000000021',
  email: 'session-admin@example.test',
  fullName: 'Session Administrator',
  role: 'admin',
  avatarUrl: null,
  branchId: null
};
const requester = {
  ...admin,
  id: '10000000-0000-4000-8000-000000000022',
  email: 'session-requester@example.test',
  fullName: 'Session Requester',
  role: 'requester'
};

// HTTP is the only mock boundary: production provider, client, cookie jar,
// navigation, cross-document coordination and request cancellation stay real.
async function server(context: BrowserContext) {
  let current = admin;
  let generation = 0;
  let activeRefreshes = 0;
  let peakRefreshes = 0;
  let mutationIdentity: string | null = null;
  let refreshUser = admin;
  let logoutAllowed = true;
  await context.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const headers = await req.allHeaders();
    const identity =
      headers.authorization === `Bearer ${requester.id}` ? requester : admin;
    const denied = () =>
      route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHORIZED', message: 'Expired' } }
      });
    const cookie = () => ({
      'Set-Cookie': `mms_refresh=${generation}; Path=/api/auth; HttpOnly; SameSite=Lax`
    });
    if (path === '/api/auth/login') {
      current =
        req.postDataJSON().email === requester.email ? requester : admin;
      refreshUser = current;
      generation++;
      return route.fulfill({
        headers: cookie(),
        json: { accessToken: current.id, user: current }
      });
    }
    if (path === '/api/auth/logout') {
      if (!logoutAllowed)
        return route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: 'Offline' } }
        });
      return route.fulfill({
        status: 204,
        headers: {
          'Set-Cookie': 'mms_refresh=; Path=/api/auth; HttpOnly; Max-Age=0'
        }
      });
    }
    if (path === '/api/auth/refresh') {
      const presented = headers.cookie?.match(
        /(?:^|;\s*)mms_refresh=([^;]+)/
      )?.[1];
      if (presented === undefined) return denied();
      activeRefreshes++;
      peakRefreshes = Math.max(peakRefreshes, activeRefreshes);
      // Deliberate server latency makes overlapping cookie reads observable.
      await new Promise((resolve) => setTimeout(resolve, 150));
      activeRefreshes--;
      if (presented !== String(generation)) return denied();
      generation++;
      return route.fulfill({
        headers: cookie(),
        json: { accessToken: refreshUser.id, user: refreshUser }
      });
    }
    if (path === '/api/auth/me')
      return headers.authorization
        ? route.fulfill({ json: identity })
        : denied();
    if (path === '/api/session-mutation') {
      if (headers.authorization !== `Bearer ${requester.id}`) return denied();
      mutationIdentity = identity.id;
      return route.fulfill({ json: { saved: true } });
    }
    if (path === '/api/auth/test-accounts')
      return route.fulfill({ json: { enabled: false } });
    if (path === '/api/notifications')
      return route.fulfill({ json: { data: [], unread: 0 } });
    if (path === '/api/users/me')
      return route.fulfill({
        json: {
          ...identity,
          phone: null,
          address: null,
          status: 'active',
          branchName: null,
          createdAt: '2026-11-13T00:00:00Z'
        }
      });
    return route.fulfill({ json: { data: [], count: 0 } });
  });
  return {
    peakRefreshes: () => peakRefreshes,
    mutationIdentity: () => mutationIdentity,
    changeRefreshIdentity: () => {
      refreshUser = requester;
    },
    allowLogout: (allowed: boolean) => {
      logoutAllowed = allowed;
    }
  };
}

async function login(page: Page, user = admin) {
  await page.getByLabel('Email address').fill(user.email);
  await page
    .getByLabel('Password', { exact: true })
    .fill('FixturePassword123!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.locator('header [aria-haspopup="menu"]').last()
  ).toBeVisible();
}

async function logout(page: Page) {
  await page.locator('header [aria-haspopup="menu"]').last().click();
  await page.getByRole('menuitem', { name: 'Logout', exact: true }).click();
}

for (const withoutLocks of [false, true]) {
  test(`AUTH-01 serializes shared-cookie rotations across two documents${withoutLocks ? ' without Web Locks' : ''}`, async ({
    context,
    page
  }) => {
    const fixture = await server(context);
    if (withoutLocks)
      await context.addInitScript(() =>
        Object.defineProperty(navigator, 'locks', { value: undefined })
      );
    await page.goto('/login');
    await login(page);
    const other = await context.newPage();
    // Both fresh documents have no bearer, but share the same refresh cookie.
    await Promise.all([page.reload(), other.goto('/dashboard')]);
    await expect
      .soft(page.locator('header [aria-haspopup="menu"]').last())
      .toBeVisible();
    await expect
      .soft(other.locator('header [aria-haspopup="menu"]').last())
      .toBeVisible();
    expect(fixture.peakRefreshes()).toBe(1);
  });
}

test('AUTH-02 another tab logout removes the old private interface before the next login', async ({
  context,
  page
}) => {
  await server(context);
  await page.goto('/login');
  await login(page);
  const other = await context.newPage();
  await other.goto('/dashboard');
  await expect(
    other.locator('header [aria-haspopup="menu"]').last()
  ).toBeVisible();
  await logout(other);
  await expect(other.getByLabel('Email address')).toBeVisible();
  await expect(
    page.locator('header [aria-haspopup="menu"]').last()
  ).toHaveCount(0);
  await login(other, requester);
  await expect(page.getByText(admin.email)).toHaveCount(0);
});

test('AUTH-02 unexpected refresh identity never retries an old-account mutation as the new account', async ({
  context,
  page
}) => {
  const fixture = await server(context);
  await page.goto('/login');
  await login(page);
  fixture.changeRefreshIdentity();
  const outcome = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname === '/src/lib/api/client.ts')!;
    const client = await import(url);
    return client.api
      .post('/session-mutation', { draft: 'administrator-only draft' })
      .then(
        () => 'saved',
        (error: Error) => error.name
      );
  });
  expect.soft(outcome).toBe('AbortError');
  expect.soft(fixture.mutationIdentity()).toBeNull();
  await expect(
    page.locator('header [aria-haspopup="menu"]').last()
  ).toHaveCount(0);
});

test('GAP-03 confirmed logout survives blocked sessionStorage reload while a pending logout stays private', async ({
  context,
  page
}) => {
  const fixture = await server(context);
  await page.goto('/login');
  await login(page);
  const block = () => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value(this: Storage, ...args: string[]) {
          if (
            this === window.sessionStorage &&
            args[0] === 'mms.logout-pending'
          )
            throw new DOMException('Storage blocked', 'SecurityError');
          return Reflect.apply(original, this, args);
        }
      });
    }
  };
  await page.evaluate(block);
  await page.addInitScript(block);
  fixture.allowLogout(false);
  await logout(page);
  await expect(
    page.getByRole('button', { name: 'Retry sign-out' })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Retry sign-out' })
  ).toBeVisible();
  await expect(
    page.locator('header [aria-haspopup="menu"]').last()
  ).toHaveCount(0);
  fixture.allowLogout(true);
  await page.getByRole('button', { name: 'Retry sign-out' }).click();
  await login(page, requester);
  await page.reload();
  await expect(
    page.locator('header [aria-haspopup="menu"]').last()
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry sign-out' })
  ).toHaveCount(0);
});

test('AUTH-02 pending logout in one tab hides both workspaces until confirmed recovery', async ({
  context,
  page
}) => {
  const fixture = await server(context);
  await page.goto('/login');
  await login(page);
  const other = await context.newPage();
  await other.goto('/dashboard');
  await expect(
    other.locator('header [aria-haspopup="menu"]').last()
  ).toBeVisible();
  fixture.allowLogout(false);
  await logout(other);
  for (const tab of [page, other]) {
    await expect(
      tab.getByRole('button', { name: 'Retry sign-out' })
    ).toBeVisible();
    await expect(tab.getByLabel('Email address')).toHaveCount(0);
  }
  fixture.allowLogout(true);
  await other.getByRole('button', { name: 'Retry sign-out' }).click();
  for (const tab of [page, other])
    await expect(tab.getByLabel('Email address')).toBeVisible();
});

test('AUTH-02 a held former-identity response is discarded after sibling login', async ({
  context,
  page
}) => {
  await server(context);
  let release!: () => void;
  let seen!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const arrived = new Promise<void>((resolve) => {
    seen = resolve;
  });
  await context.route('**/api/session-private', async (route) => {
    seen();
    await held;
    await route.fulfill({ json: { secret: 'former-account-private-data' } });
  });
  await page.goto('/login');
  await login(page);
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname === '/src/lib/api/client.ts')!;
    const client = await import(url);
    (window as unknown as { oldRead: Promise<string> }).oldRead = client.api
      .get('/session-private')
      .then(
        () => 'accepted',
        (error: Error) => error.name
      );
  });
  await arrived;
  try {
    const other = await context.newPage();
    await other.goto('/dashboard');
    await expect(
      other.locator('header [aria-haspopup="menu"]').last()
    ).toBeVisible();
    await logout(other);
    await login(other, requester);
    release();
    expect(
      await page.evaluate(
        () => (window as unknown as { oldRead: Promise<string> }).oldRead
      )
    ).toBe('AbortError');
    await expect(page.locator('header [aria-haspopup="menu"]')).toHaveCount(0);
  } finally {
    release();
  }
});

test('auth invalidation messages and storage never contain bearer credentials', async ({
  context,
  page
}) => {
  await context.addInitScript(() => {
    const messages: unknown[] = [];
    (window as unknown as { authMessages: unknown[] }).authMessages = messages;
    const original = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function (message: unknown) {
      messages.push(message);
      original.call(this, message);
    };
  });
  await server(context);
  await page.goto('/login');
  await login(page);
  await logout(page);
  const observed = await page.evaluate(() => ({
    messages: (window as unknown as { authMessages: unknown[] }).authMessages,
    local: { ...localStorage },
    session: { ...sessionStorage },
    cookie: document.cookie
  }));
  expect(observed.messages.length).toBeGreaterThan(0);
  const encoded = JSON.stringify(observed);
  expect(encoded).not.toContain(admin.id);
  expect(encoded).not.toContain(requester.id);
  expect(encoded).not.toContain('accessToken');
});

test('logout remains private when every reliable intent store is unavailable', async ({
  context,
  page
}) => {
  await server(context);
  await page.goto('/login');
  await login(page);
  const block = () => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'mms.logout-pending')
        throw new DOMException('Blocked', 'SecurityError');
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mms.logout-pending')
        throw new DOMException('Blocked', 'SecurityError');
      return set.call(this, key, value);
    };
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        return '';
      },
      set() {
        /* Browser denies cookie storage. */
      }
    });
    history.replaceState = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  };
  await page.evaluate(block);
  await page.addInitScript(block);
  // Losing a readable revision store itself invalidates the private session.
  // Trigger the normal resume check before exercising the fail-closed gate.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('button', { name: 'Retry sign-out' })
  ).toBeVisible();
  await expect(page.getByLabel('Email address')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Retry sign-out' })
  ).toBeVisible();
  await expect(page.locator('header [aria-haspopup="menu"]')).toHaveCount(0);
});

async function heldAuthLock(context: BrowserContext) {
  const holder = await context.newPage();
  await holder.route('**/session-lock-holder', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' })
  );
  await holder.goto('/session-lock-holder');
  await holder.evaluate(async () => {
    const url = '/src/lib/api/session-coordination.ts';
    const { withAuthCookieLock } = await import(url);
    const state = window as unknown as {
      holding: boolean;
      releaseLock: () => void;
      heldLock: Promise<void>;
    };
    state.heldLock = withAuthCookieLock(
      () =>
        new Promise<void>((resolve) => {
          state.holding = true;
          state.releaseLock = resolve;
        })
    );
  });
  await expect
    .poll(() =>
      holder.evaluate(() => (window as unknown as { holding: boolean }).holding)
    )
    .toBe(true);
  return holder;
}

for (const strategy of ['native', 'fallback'] as const)
  for (const action of ['login', 'logout'] as const)
    test(`${strategy} active holder times out visibly during ${action} without stealing its cookie-rotation lock`, async ({
      context,
      page
    }) => {
      let logins = 0;
      await server(context);
      await context.route('**/api/auth/login', async (route) => {
        logins++;
        await route.fallback();
      });
      if (strategy === 'fallback')
        await context.addInitScript(() =>
          Object.defineProperty(navigator, 'locks', { value: undefined })
        );
      await page.goto('/login');
      await expect(page.getByLabel('Email address')).toBeVisible();
      if (action === 'logout') await login(page);
      await page.clock.install();
      const holder = await heldAuthLock(context);
      await page.evaluate(() => {
        (window as unknown as { lockReads: number }).lockReads = 0;
        const get = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get = function (key) {
          if (key === 'mms.auth-cookie')
            (window as unknown as { lockReads: number }).lockReads++;
          return get.call(this, key);
        };
      });
      if (action === 'login') {
        await page.getByLabel('Email address').fill(admin.email);
        await page
          .getByLabel('Password', { exact: true })
          .fill('FixturePassword123!');
        await page
          .getByRole('button', { name: 'Sign In', exact: true })
          .click();
      } else await logout(page);
      if (strategy === 'fallback')
        await expect
          .poll(() =>
            page.evaluate(
              () => (window as unknown as { lockReads: number }).lockReads
            )
          )
          .toBeGreaterThan(0);
      else
        await expect
          .poll(() =>
            page.evaluate(
              async () => (await navigator.locks.query()).pending?.length
            )
          )
          .toBe(1);
      await page.clock.fastForward(11_000);
      await expect(
        page.getByText(/Session coordination is busy/)
      ).toBeVisible();
      expect(logins).toBe(action === 'login' ? 0 : 1);
      await expect(page.locator('header [aria-haspopup="menu"]')).toHaveCount(
        0
      );
      await holder.close();
    });

test('a suspended tab that missed invalidation checks shared revision before sending an old draft', async ({
  context,
  page
}) => {
  await server(context);
  let mutations = 0;
  context.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/session-mutation')
      mutations++;
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BroadcastChannel', { value: undefined });
    const addWindow = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, ...args: unknown[]) => {
      if (!['storage', 'focus', 'pageshow'].includes(type))
        Reflect.apply(addWindow, window, [type, ...args]);
    }) as typeof window.addEventListener;
    const addDocument = document.addEventListener.bind(document);
    document.addEventListener = ((type: string, ...args: unknown[]) => {
      if (type !== 'visibilitychange')
        Reflect.apply(addDocument, document, [type, ...args]);
    }) as typeof document.addEventListener;
  });
  await page.goto('/login');
  await login(page);
  const clientUrl = await page.evaluate(
    () =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname === '/src/lib/api/client.ts')!
  );
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  const other = await context.newPage();
  await other.goto('/dashboard');
  await expect(
    other.locator('header [aria-haspopup="menu"]').last()
  ).toBeVisible();
  await logout(other);
  await login(other, requester);
  // Deliberately no event/poll has notified the old visible document yet.
  await expect(
    page.locator('header [aria-haspopup="menu"]').last()
  ).toBeVisible();
  const outcome = await page.evaluate(async (url) => {
    const client = await import(url);
    return client.api.post('/session-mutation', { draft: 'old account' }).then(
      () => 'sent',
      (error: Error) => error.name
    );
  }, clientUrl);
  expect(outcome).toBe('AbortError');
  expect(mutations).toBe(0);
});

test('confirmed logout survives navigation when cookies and sessionStorage are blocked but localStorage works', async ({
  context,
  page
}) => {
  await server(context);
  await page.goto('/login');
  await login(page);
  const block = () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        return '';
      },
      set() {
        /* First-party JS cookie storage denied. */
      }
    });
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    for (const [name, original] of [
      ['getItem', get],
      ['setItem', set],
      ['removeItem', remove]
    ] as const) {
      Object.defineProperty(Storage.prototype, name, {
        configurable: true,
        value(this: Storage, ...args: string[]) {
          if (this === sessionStorage && args[0] === 'mms.logout-pending')
            throw new DOMException('Blocked', 'SecurityError');
          return Reflect.apply(original, this, args);
        }
      });
    }
  };
  await page.evaluate(block);
  await page.addInitScript(block);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('button', { name: 'Retry sign-out' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry sign-out' }).click();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await login(page, requester);
  await page.reload();
  await expect(
    page.locator('header [aria-haspopup="menu"]').last()
  ).toBeVisible();
});

for (const withoutLocks of [false, true])
  test(`an identity reset keeps an already consumed refresh under ${withoutLocks ? 'fallback' : 'native'} lock until its cookie response arrives`, async ({
    context
  }) => {
    if (withoutLocks)
      await context.addInitScript(() =>
        Object.defineProperty(navigator, 'locks', { value: undefined })
      );
    let generation = 0;
    let refreshes = 0;
    let replay = false;
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    await context.addCookies([
      {
        name: 'mms_refresh',
        value: '0',
        domain: 'localhost',
        path: '/api/auth',
        httpOnly: true,
        sameSite: 'Lax'
      }
    ]);
    await context.route('**/session-client-only', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html></html>' })
    );
    await context.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
      const headers = await route.request().allHeaders();
      if (new URL(route.request().url()).pathname === '/api/auth/refresh') {
        refreshes++;
        const cookie = headers.cookie?.match(/mms_refresh=([^;]+)/)?.[1];
        if (cookie !== String(generation)) {
          replay = true;
          return route.fulfill({
            status: 401,
            json: { error: { code: 'REPLAY' } }
          });
        }
        generation++;
        if (refreshes === 1) {
          entered();
          await held;
        }
        return route.fulfill({
          headers: {
            'Set-Cookie': `mms_refresh=${generation}; Path=/api/auth; HttpOnly; SameSite=Lax`
          },
          json: { accessToken: 'good', user: { id: 'u' } }
        });
      }
      return route.fulfill(
        headers.authorization === 'Bearer good'
          ? { json: { ok: true } }
          : { status: 401, json: { error: { code: 'UNAUTHORIZED' } } }
      );
    });
    const a = await context.newPage();
    const b = await context.newPage();
    for (const tab of [a, b]) {
      await tab.goto('/session-client-only');
      await tab.evaluate(async () => {
        const url = '/src/lib/api/client.ts';
        const client = await import(url);
        client.setAccessToken('expired');
        client.setSessionIdentity('u');
        const get = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get = function (key) {
          (window as unknown as { lockQueued: boolean }).lockQueued = true;
          return get.call(this, key);
        };
        (window as unknown as { sessionClient: typeof client }).sessionClient =
          client;
      });
    }
    const begin = (tab: Page) =>
      tab.evaluate(() => {
        const state = window as unknown as {
          sessionClient: { apiRequest: (path: string) => Promise<unknown> };
          pendingRead: Promise<string>;
        };
        state.pendingRead = state.sessionClient.apiRequest('/read').then(
          () => 'accepted',
          (error: Error) => error.name
        );
      });
    await begin(a);
    await started;
    await begin(b);
    if (withoutLocks) {
      await expect
        .poll(() =>
          b.evaluate(
            () => (window as unknown as { lockQueued: boolean }).lockQueued
          )
        )
        .toBe(true);
    } else {
      await expect
        .poll(() =>
          b.evaluate(
            async () => (await navigator.locks.query()).pending?.length
          )
        )
        .toBe(1);
    }
    try {
      await a.evaluate(() =>
        (
          window as unknown as {
            sessionClient: { resetAuthSession: () => void };
          }
        ).sessionClient.resetAuthSession()
      );
      if (!withoutLocks)
        await expect.soft
          .poll(() =>
            b.evaluate(async () => (await navigator.locks.query()).held?.length)
          )
          .toBe(1);
    } finally {
      release();
    }
    expect(
      await a.evaluate(
        () =>
          (window as unknown as { pendingRead: Promise<string> }).pendingRead
      )
    ).toBe('AbortError');
    expect(
      await b.evaluate(
        () =>
          (window as unknown as { pendingRead: Promise<string> }).pendingRead
      )
    ).toBe('accepted');
    expect(replay).toBe(false);
    expect(refreshes).toBe(2);
  });

for (const staleStore of ['cookie', 'localStorage'] as const)
  test(`identity invalidation survives a readable stale ${staleStore} whose writes are blocked`, async ({
    context,
    page
  }) => {
    await server(context);
    await page.goto('/login');
    await login(page);
    const other = await context.newPage();
    await other.goto('/dashboard');
    await expect(
      other.locator('header [aria-haspopup="menu"]').last()
    ).toBeVisible();
    await other.evaluate((store) => {
      if (store === 'cookie') {
        const descriptor = Object.getOwnPropertyDescriptor(
          Document.prototype,
          'cookie'
        )!;
        Object.defineProperty(document, 'cookie', {
          configurable: true,
          get() {
            return descriptor.get!.call(document);
          },
          set(value: string) {
            if (!value.startsWith('mms.auth-revision='))
              descriptor.set!.call(document, value);
          }
        });
      } else {
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (this !== localStorage || key !== 'mms.auth-revision')
            set.call(this, key, value);
        };
      }
    }, staleStore);
    await logout(other);
    await expect(other.getByLabel('Email address')).toBeVisible();
    await expect(page.locator('header [aria-haspopup="menu"]')).toHaveCount(0);
  });

test('fallback waiter recovers automatically when the actual holder document closes', async ({
  context
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(navigator, 'locks', { value: undefined })
  );
  const holder = await heldAuthLock(context);
  const waiter = await context.newPage();
  await waiter.route('**/session-lock-waiter', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' })
  );
  await waiter.goto('/session-lock-waiter');
  await waiter.evaluate(async () => {
    const url = '/src/lib/api/session-coordination.ts';
    const { withAuthCookieLock } = await import(url);
    const state = window as unknown as {
      entered: boolean;
      error?: string;
      lockQueued: boolean;
    };
    state.entered = false;
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      state.lockQueued = true;
      return get.call(this, key);
    };
    void withAuthCookieLock(async () => {
      state.entered = true;
    }).catch((error: Error) => {
      state.error = error.message;
    });
  });
  await expect
    .poll(() =>
      waiter.evaluate(
        () => (window as unknown as { lockQueued: boolean }).lockQueued
      )
    )
    .toBe(true);
  expect(
    await waiter.evaluate(
      () => (window as unknown as { entered: boolean }).entered
    )
  ).toBe(false);
  // No HTTP operation is in progress: this isolates actual owner death from
  // the separate ambiguous-network-outcome limit of both lock strategies.
  await holder.close();
  await expect
    .poll(
      () =>
        waiter.evaluate(
          () => (window as unknown as { entered: boolean }).entered
        ),
      { timeout: 3000 }
    )
    .toBe(true);
});

test('fallback upgrades an orphaned v1 owner without asking to clear site storage', async ({
  context,
  page
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(navigator, 'locks', { value: undefined })
  );
  await page.route('**/session-lock-legacy', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' })
  );
  await page.goto('/session-lock-legacy');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('mms-auth-coordination', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('locks');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('locks', 'readwrite');
        tx.objectStore('locks').put('orphaned-v1-document', 'mms.auth-cookie');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
    const url = '/src/lib/api/session-coordination.ts';
    const { withAuthCookieLock } = await import(url);
    const state = window as unknown as { entered: boolean; error?: string };
    state.entered = false;
    void withAuthCookieLock(async () => {
      state.entered = true;
    }).catch((error: Error) => {
      state.error = error.message;
    });
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { entered: boolean }).entered
        ),
      { timeout: 3000 }
    )
    .toBe(true);
});

for (const action of ['failed login', 'denied switch'] as const)
  test(`${action} preserves a peer account identity, cached profile and unsaved draft`, async ({
    context,
    page
  }) => {
    await server(context);
    let profileReads = 0;
    context.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/users/me') profileReads++;
    });
    await page.goto('/login');
    await login(page);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Edit profile' }).click();
    const draft = page.getByLabel('Full Name *', { exact: true });
    await draft.fill('Unsaved peer profile draft');
    const other = await context.newPage();
    await other.goto('/dashboard');
    await expect(
      other.locator('header [aria-haspopup="menu"]').last()
    ).toBeVisible();
    const readsBeforeFailure = profileReads;
    if (action === 'failed login')
      await context.route('**/api/auth/login', (route) =>
        route.fulfill({
          status: 401,
          json: {
            error: { code: 'INVALID_CREDENTIALS', message: 'Wrong password' }
          }
        })
      );
    else
      await context.route('**/api/auth/test-accounts/switch', (route) =>
        route.fulfill({
          status: 403,
          json: {
            error: { code: 'TEST_ACCOUNT_FORBIDDEN', message: 'Switch denied' }
          }
        })
      );
    const error = await other.evaluate(async (action) => {
      const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname === '/src/lib/api/auth.ts')!;
      const auth = await import(url);
      return (
        action === 'failed login'
          ? auth.signIn('bad@example.test', 'wrong-password')
          : auth.switchTestAccount('requester')
      ).then(
        () => 'unexpected success',
        (error: { code: string }) => error.code
      );
    }, action);
    expect(error).toBe(
      action === 'failed login'
        ? 'INVALID_CREDENTIALS'
        : 'TEST_ACCOUNT_FORBIDDEN'
    );
    // Resolve event delivery and the normal resume revision check before asserting.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(draft).toHaveValue('Unsaved peer profile draft');
    expect(profileReads).toBe(readsBeforeFailure);
    await page.locator('header [aria-haspopup="menu"]').last().click();
    await expect(page.getByRole('menu').getByText(admin.email)).toBeVisible();
  });

for (const action of ['login', 'switch'] as const)
  test(`successful ${action} publishes before lock release even after the local identity resets`, async ({
    context,
    page
  }) => {
    await server(context);
    await page.goto('/login');
    await login(page);
    const other = await context.newPage();
    await other.goto('/dashboard');
    await expect(
      other.locator('header [aria-haspopup="menu"]').last()
    ).toBeVisible();
    let entered!: () => void;
    let release!: () => void;
    const arrived = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const path =
      action === 'login' ? '/api/auth/login' : '/api/auth/test-accounts/switch';
    await context.route(`**${path}`, async (route) => {
      entered();
      await held;
      await route.fulfill({
        headers: {
          'Set-Cookie':
            'mms_refresh=new-account; Path=/api/auth; HttpOnly; SameSite=Lax'
        },
        json: { accessToken: requester.id, user: requester }
      });
    });
    const previousRevision = await page.evaluate(() =>
      localStorage.getItem('mms.auth-revision')
    );
    await other.evaluate(async (action) => {
      const resources = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name);
      const url = resources.find(
        (url) => new URL(url).pathname === '/src/lib/api/auth.ts'
      )!;
      const auth = await import(url);
      (window as unknown as { transition: Promise<string> }).transition = (
        action === 'login'
          ? auth.signIn('requester@example.test', 'password')
          : auth.switchTestAccount('requester')
      ).then(
        () => 'accepted',
        (error: Error) => error.name
      );
    }, action);
    await arrived;
    try {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(
        page.locator('header [aria-haspopup="menu"]').last()
      ).toBeVisible();
      await page.evaluate(() => {
        (
          window as unknown as { nextLockRevision: Promise<string | null> }
        ).nextLockRevision = navigator.locks.request(
          'mms.auth-cookie',
          async () => localStorage.getItem('mms.auth-revision')
        );
      });
      await expect
        .poll(() =>
          page.evaluate(
            async () => (await navigator.locks.query()).pending?.length
          )
        )
        .toBe(1);
      await other.evaluate(async () => {
        const url = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .find((url) => new URL(url).pathname === '/src/lib/api/client.ts')!;
        (await import(url)).resetAuthSession();
      });
      release();
      expect(
        await other.evaluate(
          () =>
            (window as unknown as { transition: Promise<string> }).transition
        )
      ).toBe('AbortError');
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { nextLockRevision: Promise<string | null> })
              .nextLockRevision
        )
      ).not.toBe(previousRevision);
      await expect(page.locator('header [aria-haspopup="menu"]')).toHaveCount(
        0
      );
    } finally {
      release();
    }
  });

test('blocked shared coordination stores prevent identity HTTP before changing a cookie', async ({
  context,
  page
}) => {
  await server(context);
  await page.goto('/login');
  await login(page);
  const other = await context.newPage();
  await other.goto('/dashboard');
  await expect(
    other.locator('header [aria-haspopup="menu"]').last()
  ).toBeVisible();
  let transitions = 0;
  context.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/login') transitions++;
  });
  const error = await other.evaluate(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'cookie'
    )!;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        return descriptor.get!.call(document);
      },
      set() {
        /* Writes denied; old readable values remain. */
      }
    });
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage)
        throw new DOMException('Blocked', 'SecurityError');
      return set.call(this, key, value);
    };
    const url = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname === '/src/lib/api/auth.ts')!;
    const auth = await import(url);
    return auth.signIn('requester@example.test', 'password').then(
      () => 'unexpected success',
      (error: Error) => error.message
    );
  });
  expect(error).toContain('Shared session storage is unavailable');
  expect(transitions).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.locator('header [aria-haspopup="menu"]').last()
  ).toBeVisible();
});

test('native acquisition deadline and identity abort never interrupt work that already holds the lock', async ({
  page
}) => {
  await page.route('**/session-lock-active', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' })
  );
  await page.goto('/session-lock-active');
  await page.clock.install();
  await page.evaluate(async () => {
    const url = '/src/lib/api/session-coordination.ts';
    const { withAuthCookieLock } = await import(url);
    const controller = new AbortController();
    const state = window as unknown as {
      started: boolean;
      ended: boolean;
      result?: string;
      releaseActive: () => void;
      cancelIdentity: () => void;
    };
    state.cancelIdentity = () => controller.abort();
    state.ended = false;
    void withAuthCookieLock(
      () =>
        new Promise<string>((resolve) => {
          state.started = true;
          state.releaseActive = () => resolve('finished');
        }),
      controller.signal
    ).then(
      (value: string) => {
        state.result = value;
        state.ended = true;
      },
      (error: Error) => {
        state.result = error.name;
        state.ended = true;
      }
    );
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { started: boolean }).started)
    )
    .toBe(true);
  await page.clock.fastForward(11_000);
  await page.evaluate(() =>
    (window as unknown as { cancelIdentity: () => void }).cancelIdentity()
  );
  expect(
    await page.evaluate(
      async () => (await navigator.locks.query()).held?.length
    )
  ).toBe(1);
  expect(
    await page.evaluate(() => (window as unknown as { ended: boolean }).ended)
  ).toBe(false);
  await page.evaluate(() =>
    (window as unknown as { releaseActive: () => void }).releaseActive()
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { result?: string }).result)
    )
    .toBe('finished');
});
