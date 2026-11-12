import { expect, test, type Page, type Route } from '@playwright/test';

// HTTP fixtures keep authentication, routing, and query caches real. No request
// in this file reaches the API or changes a database record.
const admin = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'private-admin@example.test',
  fullName: 'Private Administrator',
  avatarUrl: null,
  role: 'admin',
  branchId: null
};
const requester = {
  ...admin,
  id: '10000000-0000-4000-8000-000000000002',
  email: 'requester@example.test',
  fullName: 'Current Requester',
  role: 'requester'
};
const ticket = {
  id: '20000000-0000-4000-8000-000000000001',
  ticketNo: 97001,
  branchId: '30000000-0000-4000-8000-000000000001',
  driverId: '40000000-0000-4000-8000-000000000001',
  vehicleId: '50000000-0000-4000-8000-000000000001',
  officeId: null,
  officeHeadId: null,
  destination: 'ADMIN PRIVATE DESTINATION',
  destinationLatitude: null,
  destinationLongitude: null,
  purpose: 'Private administrative trip',
  dateRequested: '2026-11-12',
  participants: ['Private participant'],
  participantType: 'students',
  participantEmployees: [],
  participantsCount: 1,
  guides: [],
  preparedBy: admin.fullName,
  requestedById: admin.id,
  remarks: null,
  qrId: null,
  status: 'pending_admin_approval',
  approvedByAdminId: null,
  disapprovedReason: null,
  cancellationReason: null,
  startTs: null,
  endTs: null,
  createdAt: '2026-11-12T00:00:00Z',
  updatedAt: '2026-11-12T00:00:00Z',
  fuelAllocation: null,
  dates: []
};

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function fixtures(page: Page) {
  let current: typeof admin | null = null;
  const handlers = new Map<string, (route: Route) => Promise<void>>();
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const override = handlers.get(path);
    if (override) return override(route);
    const identity =
      req.headers().authorization === 'Bearer requester-token'
        ? requester
        : admin;
    if (path === '/api/auth/login') {
      current =
        req.postDataJSON().email === requester.email ? requester : admin;
      return route.fulfill({
        json: {
          accessToken:
            current.id === requester.id ? 'requester-token' : 'admin-token',
          user: current
        }
      });
    }
    if (path === '/api/auth/logout') {
      current = null;
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/auth/me' && current)
      return route.fulfill({ json: current });
    if (path === '/api/auth/refresh' || path === '/api/auth/me') {
      return route.fulfill({
        status: 401,
        json: {
          error: { code: 'UNAUTHORIZED', message: 'Sign in required' }
        }
      });
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
    if (path === `/api/trip-tickets/${ticket.id}`) {
      return route.fulfill(
        identity.id === requester.id
          ? {
              status: 404,
              json: { error: { code: 'NOT_FOUND', message: 'Not found' } }
            }
          : { json: ticket }
      );
    }
    if (path === '/api/notifications')
      return route.fulfill({ json: { data: [], unread: 0 } });
    return route.fulfill({ json: { data: [], count: 0 } });
  });
  return { handlers };
}

async function signIn(page: Page, identity = admin) {
  await page.getByLabel('Email address').fill(identity.email);
  await page
    .getByLabel('Password', { exact: true })
    .fill('FixturePassword123!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function signOut(page: Page) {
  await page.locator('header [aria-haspopup="menu"]').last().click();
  await page.getByRole('menuitem', { name: 'Logout', exact: true }).click();
  await expect(page.getByLabel('Email address')).toBeVisible();
}

test('normal logout/login cannot reveal a remembered private ticket or profile while requester authorization is delayed', async ({
  page
}) => {
  const { handlers } = await fixtures(page);
  await page.goto('/login');
  await signIn(page);
  await page.goto(`/trip-tickets/${ticket.id}`);
  await expect(
    page.getByText(ticket.destination, { exact: true }).first()
  ).toBeVisible();
  const rememberedIndex = await page.evaluate(
    () => history.state.__TSR_index as number
  );
  await page.evaluate(() => {
    (window as unknown as { authDocument: string }).authDocument =
      'same-document';
  });
  const oldDetail = gate();
  const oldDetailSeen = gate();
  const oldDetailFinished = new Promise<void>((resolve) => {
    const finished = (req: import('@playwright/test').Request) => {
      if (!req.url().endsWith(`/api/trip-tickets/${ticket.id}`)) return;
      page.off('requestfinished', finished);
      page.off('requestfailed', finished);
      resolve();
    };
    page.on('requestfinished', finished);
    page.on('requestfailed', finished);
  });
  handlers.set(`/api/trip-tickets/${ticket.id}`, async (route) => {
    oldDetailSeen.release();
    await oldDetail.promise;
    await route.fulfill({ json: ticket });
  });
  await page.evaluate(() =>
    window.dispatchEvent(new Event('visibilitychange'))
  );
  await oldDetailSeen.promise;
  await page
    .getByRole('link', { name: 'Dashboard', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await signOut(page);
  const detail = gate();
  const detailSeen = gate();
  const profile = gate();
  handlers.set(`/api/trip-tickets/${ticket.id}`, async (route) => {
    detailSeen.release();
    await detail.promise;
    await route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: 'Not found' } }
    });
  });
  handlers.set('/api/users/me', async (route) => {
    await profile.promise;
    await route.fulfill({
      json: {
        ...requester,
        phone: null,
        address: null,
        status: 'active',
        branchName: null,
        createdAt: '2026-11-12T00:00:00Z'
      }
    });
  });
  try {
    await signIn(page, requester);
    // Release the old administrator's pending read only after the new account
    // is active. Its result must remain confined to the discarded session.
    oldDetail.release();
    await oldDetailFinished;
    await expect(
      page.getByRole('heading', { name: 'My requests', exact: true })
    ).toBeVisible();
    await page.locator('header [aria-haspopup="menu"]').last().click();
    await expect
      .soft(
        page.getByRole('menu').getByText(requester.fullName, { exact: true })
      )
      .toBeVisible({ timeout: 1000 });
    await expect
      .soft(page.getByText(admin.fullName, { exact: true }))
      .toHaveCount(0, { timeout: 1000 });
    await page.keyboard.press('Escape');
    await page.evaluate(
      (index) => history.go(index - history.state.__TSR_index),
      rememberedIndex
    );
    await expect(page).toHaveURL(new RegExp(`/trip-tickets/${ticket.id}$`));
    await detailSeen.promise;
    await expect(
      page.getByText(ticket.destination, { exact: true })
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { authDocument: string }).authDocument
      )
    ).toBe('same-document');
    const denied = page.waitForResponse((response) =>
      response.url().endsWith(`/api/trip-tickets/${ticket.id}`)
    );
    detail.release();
    expect((await denied).status()).toBe(404);
    await expect(
      page.getByText('Record not found.', { exact: true })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(ticket.destination, { exact: true })
    ).toHaveCount(0);
  } finally {
    oldDetail.release();
    detail.release();
    profile.release();
  }
});

test('a late bootstrap response cannot replace the requester after authentication failure and normal login', async ({
  page
}) => {
  const { handlers } = await fixtures(page);
  const oldBoot = gate();
  const oldBootSeen = gate();
  handlers.set('/api/auth/me', async (route) => {
    oldBootSeen.release();
    await oldBoot.promise;
    await route.fulfill({ json: admin });
  });
  handlers.set('/api/auth-race-probe', async (route) => {
    await route.fulfill({
      status: 401,
      json: { error: { code: 'UNAUTHORIZED', message: 'Expired' } }
    });
  });
  await page.goto('/login');
  await oldBootSeen.promise;
  try {
    await page.evaluate(async () => {
      const clientUrl = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => new URL(url).pathname === '/src/lib/api/client.ts')!;
      const client = await import(clientUrl);
      await client.api.get('/auth-race-probe').catch(() => undefined);
    });
    await expect(page.getByLabel('Email address')).toBeVisible();
    await signIn(page, requester);
    oldBoot.release();
    await expect(
      page.getByRole('heading', { name: 'My requests', exact: true })
    ).toBeVisible();
    await page.locator('header [aria-haspopup="menu"]').last().click();
    await expect(
      page.getByRole('menu').getByText(requester.email, { exact: true })
    ).toBeVisible();
    await expect(page.getByText(admin.email, { exact: true })).toHaveCount(0);
  } finally {
    oldBoot.release();
  }
});

test('logout cancels a prior refresh so its late token cannot overwrite a new login', async ({
  page
}) => {
  const { handlers } = await fixtures(page);
  await page.goto('/login');
  await signIn(page);
  const oldRefresh = gate();
  const refreshSeen = gate();
  handlers.set('/api/auth/refresh', async (route) => {
    refreshSeen.release();
    await oldRefresh.promise;
    await route.fulfill({ json: { accessToken: 'obsolete-admin-token' } });
  });
  handlers.set('/api/auth-race-probe', async (route) => {
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
    await signOut(page);
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
    await expect(
      page.getByRole('heading', { name: 'My requests', exact: true })
    ).toBeVisible();
  } finally {
    oldRefresh.release();
  }
});

test('a returning session still boots through cookie refresh after a document reload', async ({
  page
}) => {
  const { handlers } = await fixtures(page);
  let refreshes = 0;
  handlers.set('/api/auth/me', async (route) => {
    await route.fulfill(
      route.request().headers().authorization === 'Bearer restored-token'
        ? { json: admin }
        : {
            status: 401,
            json: {
              error: { code: 'UNAUTHORIZED', message: 'Refresh required' }
            }
          }
    );
  });
  handlers.set('/api/auth/refresh', async (route) => {
    refreshes += 1;
    await route.fulfill({ json: { accessToken: 'restored-token' } });
  });
  await page.goto('/dashboard');
  await page.locator('header [aria-haspopup="menu"]').last().click();
  await expect(
    page.getByRole('menu').getByText(admin.email, { exact: true })
  ).toBeVisible();
  await page.reload();
  await page.locator('header [aria-haspopup="menu"]').last().click();
  await expect(
    page.getByRole('menu').getByText(admin.email, { exact: true })
  ).toBeVisible();
  expect(refreshes).toBe(2);
});
