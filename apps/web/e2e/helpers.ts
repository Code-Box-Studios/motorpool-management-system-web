import { expect, type Page, type APIRequestContext } from '@playwright/test';

// The five seeded demo accounts (all share one password).
export const CREDENTIALS = {
  admin: 'admin@mms.local',
  requester: 'requester@mms.local',
  evp: 'evp_operations@mms.local',
  guard: 'security_guard@mms.local',
  driver: 'driver@mms.local'
} as const;

export type Role = keyof typeof CREDENTIALS;
export const PASSWORD = 'Password123!';
export const API_URL = 'http://localhost:3001';

// ---------- UI helpers ----------

// Signs in through the real login form and waits for the app shell to load.
export async function login(page: Page, role: Role): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(CREDENTIALS[role]);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

// Saves a full-page screenshot under e2e/screenshots for visual inspection.
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
}

// Waits until the given text is visible anywhere on the page.
export async function expectText(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
}

// ---------- API helpers (used to stage/verify state the UI can't drive headlessly) ----------

export interface AuthActor {
  token: string;
  user: { id: string; branchId: string | null };
}

export async function apiLogin(request: APIRequestContext, email: string): Promise<AuthActor> {
  const r = await request.post(`${API_URL}/api/auth/login`, { data: { email, password: PASSWORD } });
  expect(r.ok(), `API login failed for ${email}`).toBeTruthy();
  const j = (await r.json()) as { accessToken: string; user: { id: string; branchId: string | null } };
  return { token: j.accessToken, user: j.user };
}

export async function apiGet(request: APIRequestContext, path: string, token: string): Promise<unknown> {
  const r = await request.get(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  try {
    return await r.json();
  } catch {
    return null;
  }
}

export async function apiPost(
  request: APIRequestContext,
  path: string,
  token: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await request.post(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` }, data });
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { ok: r.ok(), status: r.status(), body };
}

// Unwraps a paginated `{ data, count }` response (or a bare array) into a row list.
export function listData(res: unknown): Record<string, unknown>[] {
  if (res && typeof res === 'object' && Array.isArray((res as { data?: unknown }).data)) {
    return (res as { data: Record<string, unknown>[] }).data;
  }
  return Array.isArray(res) ? (res as Record<string, unknown>[]) : [];
}

// Reads a single trip ticket's current status via the API (for assertions).
export async function tripStatus(request: APIRequestContext, id: string, token: string): Promise<string | undefined> {
  const t = (await apiGet(request, `/api/trip-tickets/${id}`, token)) as { status?: string } | null;
  return t?.status;
}
