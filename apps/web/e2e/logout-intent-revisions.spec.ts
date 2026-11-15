import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const user = {
  id: '10000000-0000-4000-8000-000000000091',
  email: 'logout-revision@example.test',
  fullName: 'Logout Revision',
  role: 'admin',
  avatarUrl: null,
  branchId: null
};

// HTTP is the only mock boundary. The provider, client, browser stores,
// same-origin documents, native/fallback locks and event delivery stay real.
async function fixtures(context: BrowserContext) {
  const counts = { login: 0, logout: 0, refresh: 0, patch: 0 };
  let onLogout: () => Promise<void> = async () => undefined;
  await context.addCookies([
    {
      name: 'mms_refresh',
      value: 'fixture',
      domain: 'localhost',
      path: '/api/auth',
      httpOnly: true,
      sameSite: 'Lax'
    }
  ]);
  await context.route('**/logout-revision-empty', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' })
  );
  await context.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = await request.allHeaders();
    if (path === '/api/auth/me')
      return route.fulfill(
        headers.authorization
          ? { json: user }
          : { status: 401, json: { error: { code: 'UNAUTHORIZED' } } }
      );
    if (path === '/api/auth/refresh') {
      counts.refresh++;
      return route.fulfill({ json: { accessToken: 'fixture-token', user } });
    }
    if (path === '/api/auth/login') {
      counts.login++;
      return route.fulfill({
        headers: {
          'Set-Cookie':
            'mms_refresh=new-login; Path=/api/auth; HttpOnly; SameSite=Lax'
        },
        json: { accessToken: 'fixture-token', user }
      });
    }
    if (path === '/api/auth/logout') {
      counts.logout++;
      await onLogout();
      return route.fulfill({
        status: 204,
        headers: {
          'Set-Cookie': 'mms_refresh=; Path=/api/auth; HttpOnly; Max-Age=0'
        }
      });
    }
    if (path === '/api/users/me') {
      if (request.method() === 'PATCH') counts.patch++;
      return route.fulfill({
        json: {
          ...user,
          phone: null,
          address: null,
          status: 'active',
          branchName: null,
          createdAt: '2026-11-13T00:00:00Z'
        }
      });
    }
    if (path === '/api/auth/test-accounts')
      return route.fulfill({ json: { enabled: false } });
    if (path === '/api/notifications')
      return route.fulfill({ json: { data: [], unread: 0 } });
    return route.fulfill({ json: { data: [], count: 0 } });
  });
  return {
    counts,
    onLogout(callback: () => Promise<void>) {
      onLogout = callback;
    }
  };
}

async function profile(page: Page) {
  await page.goto('/profile');
  await expect(
    page.getByRole('button', { name: 'Edit profile', exact: true })
  ).toBeVisible();
}

async function logout(page: Page) {
  await page.locator('header [aria-haspopup="menu"]').last().click();
  await page.getByRole('menuitem', { name: 'Logout', exact: true }).click();
}

function blockIntentWrites(store: 'cookie' | 'localStorage' | 'shared') {
  if (store !== 'localStorage') {
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'cookie'
    )!;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => descriptor.get!.call(document),
      set: (value: string) => {
        if (store !== 'shared' && !value.startsWith('mms_logout_intent='))
          descriptor.set!.call(document, value);
      }
    });
  }
  if (store !== 'cookie') {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        this === localStorage &&
        (store === 'shared' || key === 'mms.logout-pending')
      )
        throw new DOMException('Writes blocked', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  }
}

for (const store of ['cookie', 'localStorage'] as const)
  test(`SESS-02 confirmed logout permits login despite a read-only ${store} retaining pending intent`, async ({
    context,
    page
  }) => {
    const server = await fixtures(context);
    server.onLogout(() => page.evaluate(blockIntentWrites, store));
    await profile(page);
    await logout(page);
    await expect(page.getByLabel('Email address')).toBeVisible();
    await page.getByLabel('Email address').fill(user.email);
    await page
      .getByLabel('Password', { exact: true })
      .fill('FixturePassword123!');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(server.counts.login).toBe(1);
    expect(server.counts.logout).toBe(1);
  });

test('SESS-02 a new pending fallback outranks stale confirmations after failed logout and reload', async ({
  context,
  page
}) => {
  const server = await fixtures(context);
  await profile(page);
  await page.evaluate(() => {
    document.cookie = 'mms_logout_intent=confirmed; Path=/; SameSite=Lax';
    localStorage.setItem('mms.logout-pending', 'false');
  });
  await page.evaluate(blockIntentWrites, 'shared');
  await context.addInitScript(blockIntentWrites, 'shared');
  await logout(page);
  await expect(
    page.getByRole('button', { name: 'Retry sign-out' })
  ).toBeVisible();
  const refreshes = server.counts.refresh;
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Retry sign-out' })
  ).toBeVisible();
  await expect(page.locator('header')).toHaveCount(0);
  await expect(page.getByLabel('Email address')).toHaveCount(0);
  expect(server.counts.refresh).toBe(refreshes);
  expect(server.counts.logout).toBe(0);
});

for (const strategy of ['native', 'fallback'] as const)
  test(`SESS-03 queued ${strategy} logout hides peer draft and blocks private dispatch before cookie-lock acquisition`, async ({
    context,
    page
  }) => {
    if (strategy === 'fallback')
      await context.addInitScript(() =>
        Object.defineProperty(navigator, 'locks', { value: undefined })
      );
    const server = await fixtures(context);
    await profile(page);
    await page
      .getByRole('button', { name: 'Edit profile', exact: true })
      .click();
    await page.locator('#profile-fullname').fill('Unsaved private draft');
    const actor = await context.newPage();
    await profile(actor);
    const holder = await context.newPage();
    await holder.goto('/logout-revision-empty');
    await holder.evaluate(async () => {
      const url = '/src/lib/api/session-coordination.ts';
      const coordinator = await import(url);
      const state = window as unknown as {
        held: boolean;
        release: () => void;
      };
      void coordinator.withAuthCookieLock(
        () =>
          new Promise<void>((resolve) => {
            state.held = true;
            state.release = resolve;
          })
      );
    });
    await expect
      .poll(() =>
        holder.evaluate(() => (window as unknown as { held: boolean }).held)
      )
      .toBe(true);
    try {
      await logout(actor);
      await expect(
        actor.getByRole('heading', { name: 'Signing out…' })
      ).toBeVisible();
      const outcome = await page.evaluate(async () => {
        const url = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .find(
            (value) => new URL(value).pathname === '/src/lib/api/client.ts'
          )!;
        const client = await import(url);
        return client.api
          .patch('/users/me', { fullName: 'Old private draft' })
          .then(
            () => 'sent',
            (error: Error) => error.name
          );
      });
      expect(outcome).toBe('AbortError');
      expect(server.counts.patch).toBe(0);
      expect(server.counts.logout).toBe(0);
      await expect(page.locator('#profile-fullname')).toHaveCount(0);
      await expect(page.locator('header')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Retry sign-out' })
      ).toBeVisible();
    } finally {
      await holder.evaluate(() =>
        (window as unknown as { release: () => void }).release()
      );
    }
    await expect(actor.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
  });

for (const strategy of ['native', 'fallback'] as const)
  test(`SESS-03 overlapping ${strategy} peer retries keep the newer intent until its own transport completes`, async ({
    context,
    page
  }) => {
    if (strategy === 'fallback')
      await context.addInitScript(() =>
        Object.defineProperty(navigator, 'locks', { value: undefined })
      );
    const server = await fixtures(context);
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    server.onLogout(() => (server.counts.logout === 1 ? first : second));
    await profile(page);
    const peer = await context.newPage();
    await profile(peer);
    try {
      await logout(page);
      await expect.poll(() => server.counts.logout).toBe(1);
      await peer.getByRole('button', { name: 'Retry sign-out' }).click();
      releaseFirst();
      await expect.poll(() => server.counts.logout).toBe(2);
      for (const tab of [page, peer]) {
        await expect(tab.getByLabel('Email address')).toHaveCount(0);
        await expect(tab.locator('header')).toHaveCount(0);
      }
      releaseSecond();
      for (const tab of [page, peer])
        await expect(tab.getByLabel('Email address')).toBeVisible();
    } finally {
      releaseFirst();
      releaseSecond();
    }
  });

test('SESS-03 a superseded logout paused before enqueue cannot revoke a newer login', async ({
  context,
  page
}) => {
  const server = await fixtures(context);
  const peer = await context.newPage();
  for (const tab of [page, peer]) await tab.goto('/logout-revision-empty');
  await page.evaluate(async () => {
    const url = '/src/lib/api/auth.ts';
    const auth = await import(url);
    const native = navigator.locks.request.bind(navigator.locks);
    const state = window as unknown as {
      resumeEnqueue: () => void;
      logout: Promise<void>;
    };
    navigator.locks.request = ((...args: unknown[]) =>
      new Promise((resolve, reject) => {
        state.resumeEnqueue = () => {
          void Reflect.apply(native, navigator.locks, args).then(
            resolve,
            reject
          );
        };
      })) as typeof navigator.locks.request;
    state.logout = auth.signOut();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { resumeEnqueue: () => void })
            .resumeEnqueue
      )
    )
    .toBe('function');
  await peer.evaluate(async (email) => {
    const url = '/src/lib/api/auth.ts';
    const auth = await import(url);
    await auth.signOut();
    await auth.signIn(email, 'FixturePassword123!');
  }, user.email);
  expect(server.counts.logout).toBe(1);
  expect(server.counts.login).toBe(1);
  await page.evaluate(() =>
    (window as unknown as { resumeEnqueue: () => void }).resumeEnqueue()
  );
  await page.evaluate(
    () => (window as unknown as { logout: Promise<void> }).logout
  );
  expect(server.counts.logout).toBe(1);
  expect(
    (await context.cookies()).some((cookie) => cookie.name === 'mms_refresh')
  ).toBe(true);
});

for (const recovered of ['all stores', 'localStorage only'] as const)
  test(`SESS-02 an older completion preserves a newer URL-only pending intent when ${recovered} recover`, async ({
    context,
    page
  }) => {
    await fixtures(context);
    await page.goto('/logout-revision-empty');
    const before = await page.evaluate(async (recovered) => {
      const url = '/src/lib/api/logout-intent.ts';
      const intent = await import(url);
      const older = intent.rememberLogout(true);
      let block = true;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (
          block ||
          (recovered === 'localStorage only' && this === sessionStorage)
        )
          throw new DOMException('Read-only store', 'QuotaExceededError');
        return set.call(this, key, value);
      };
      const descriptor = Object.getOwnPropertyDescriptor(
        Document.prototype,
        'cookie'
      )!;
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: () => descriptor.get!.call(document),
        set: (value: string) => {
          if (block || recovered === 'localStorage only')
            throw new DOMException('Read-only cookie', 'SecurityError');
          descriptor.set!.call(document, value);
        }
      });
      intent.rememberLogout(true);
      const urlFallback = new URL(location.href).searchParams.has(
        intent.LOGOUT_INTENT_KEY
      );
      block = false;
      intent.rememberLogout(false, older);
      return { urlFallback, pending: intent.hasPendingLogout() };
    }, recovered);
    expect(before.urlFallback).toBe(true);
    expect(before.pending).toBe(true);
    await page.reload();
    expect(
      await page.evaluate(async () => {
        const url = '/src/lib/api/logout-intent.ts';
        return (await import(url)).hasPendingLogout();
      })
    ).toBe(true);
  });

test('session helper rejects an ended login after delayed IndexedDB lock completion', async ({
  context,
  page
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined });
    const state = window as unknown as {
      holdCompletion: boolean;
      completionHeld: boolean;
      releaseCompletion: () => void;
    };
    const transaction = IDBDatabase.prototype.transaction;
    const descriptor = Object.getOwnPropertyDescriptor(
      IDBTransaction.prototype,
      'oncomplete'
    )!;
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const tx = Reflect.apply(transaction, this, args) as IDBTransaction;
      if (this.name === 'mms-auth-coordination' && args[1] === 'readwrite')
        Object.defineProperty(tx, 'oncomplete', {
          set(handler: ((event: Event) => void) | null) {
            descriptor.set!.call(tx, function (event: Event) {
              if (state.holdCompletion) {
                state.completionHeld = true;
                state.releaseCompletion = () => handler?.call(tx, event);
              } else handler?.call(tx, event);
            });
          }
        });
      return tx;
    };
  });
  await fixtures(context);
  await page.goto('/logout-revision-empty');
  await page.evaluate(async (email) => {
    const url = '/src/lib/api/auth.ts';
    const auth = await import(url);
    const source = await (await fetch(url)).text();
    const clientUrl = source.match(/from\s+["']([^"']*\/client[^"']*)["']/)![1];
    const client = await import(clientUrl);
    const state = window as unknown as {
      holdCompletion: boolean;
      hasToken: () => boolean;
      loginResult: Promise<{ id: string } | { error: string }>;
    };
    state.hasToken = () => client.getAccessToken() !== null;
    state.holdCompletion = true;
    state.loginResult = auth.signIn(email, 'FixturePassword123!').then(
      (value: { id: string }) => ({ id: value.id }),
      (error: Error) => ({ error: error.name })
    );
  }, user.email);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { completionHeld: boolean }).completionHeld
      )
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      (window as unknown as { hasToken: () => boolean }).hasToken()
    )
  ).toBe(true);
  const peer = await context.newPage();
  await peer.route('**/api/auth/login', (route) =>
    route.fulfill({
      headers: {
        'Set-Cookie':
          'mms_refresh=peer-login; Path=/api/auth; HttpOnly; SameSite=Lax'
      },
      json: {
        accessToken: 'peer-token',
        user: {
          ...user,
          id: '10000000-0000-4000-8000-000000000092',
          email: 'peer@example.test'
        }
      }
    })
  );
  await peer.goto('/logout-revision-empty');
  await peer.evaluate(async () => {
    const url = '/src/lib/api/auth.ts';
    await (
      await import(url)
    ).signIn('peer@example.test', 'FixturePassword123!');
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { hasToken: () => boolean }).hasToken()
      )
    )
    .toBe(false);
  await page.evaluate(() =>
    (window as unknown as { releaseCompletion: () => void }).releaseCompletion()
  );
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            loginResult: Promise<{ id: string } | { error: string }>;
          }
        ).loginResult
    )
  ).toEqual({ error: 'AbortError' });
});
