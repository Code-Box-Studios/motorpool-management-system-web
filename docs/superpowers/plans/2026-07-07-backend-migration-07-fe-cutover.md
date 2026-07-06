# Backend Migration Plan 7/7: Frontend Cutover + Supabase Removal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the React+Vite frontend (`apps/web`) over from Supabase to the Express API built in Plans 1–6, then delete all Supabase code and dependencies. The result: the FE is a pure UI client of `/api`; Supabase is gone.

**Architecture (spec §8):** Contract-first, single cutover. A new `lib/api/client.ts` (fetch wrapper: in-memory access token, single-flight refresh, envelope unwrap, multipart support) replaces the Supabase transport. Each `lib/supabase/<domain>.ts` is replaced by a `lib/api/<domain>.ts` that **keeps the exact same exported function names, signatures, and return shapes** — internally calling the new (camelCase) API and **reshaping the response to the FE's existing snake_case shapes** — so `lib/query/*`, `lib/mutation/*`, and components stay unchanged except by repointing their imports and the §8 exception list. A new `AuthProvider` holds the token in memory + boots from `GET /auth/me` with silent refresh, keeping the same context shape.

**Tech Stack:** React 19, Vite, TanStack Query + Router, `@mms/shared` (already a dep). No new FE test infrastructure (spec §13) — **the gate for every task is `pnpm --filter @mms/web build` (which runs `tsc -b && vite build`) compiling** + a manual/live smoke of key flows.

**Spec:** `docs/superpowers/specs/2026-07-03-express-backend-migration-design.md` §5 (roles the FE resolves), §6 (endpoints), §6.1/§6.2 (transition endpoints), §8 (the cutover + exception list), §9 (uploads), §10 (GPS), §11 (analytics). Prior work: Plans 1–6 (the complete Express API at `apps/api`, base path `/api`).

## Global Constraints

- **The FE keeps its snake_case domain types.** `apps/web/src/lib/types/supabase.ts` is a **type-only** file (no `@supabase` runtime import) — it is the source of the FE's snake_case types (`Vehicle`, `TripTicket`, `Driver`, …) that every component reads. **KEEP it** (this is a deliberate, pragmatic deviation from a full camelCase migration — it is what makes "components untouched" possible). The `lib/api/*` adapters map the API's camelCase responses **back into these snake_case shapes**. The `tsc -b` build catches any missing/renamed key.
- **Adapters are call-compatible.** Every `lib/api/<domain>.ts` exports the same function names + signatures + return types as the `lib/supabase/<domain>.ts` it replaces (read the current file; match it exactly). The cutover for a domain = create the adapter + change the import path in that domain's `lib/query/*` and `lib/mutation/*` hooks from `@/lib/supabase/<domain>` → `@/lib/api/<domain>`. Nothing else in the hooks/components changes (except the §8 exceptions).
- **camelCase → snake_case reshaping.** The API returns Prisma camelCase (`licensePlate`, `branchId`, `fuelAllocation`, `createdAt`). Adapters convert to the FE snake_case (`license_plate`, `branch`, `allocation_*`, `created_at`) so the returned object matches the FE's `Tables<'…'>` type. A per-domain reshape helper (`toSnake…`) is fine — but **it MUST NOT end in `return { … } as SomeFEType`.** An `as` assertion to a superset type suppresses TypeScript's missing/misnamed-key check, which is the ENTIRE gate here. Instead type the helper's return annotation (`function toSnake(row: VehicleResponse): Vehicle { return { … }; }`) or use `return { … } satisfies Vehicle`, so `tsc -b` fails on any omitted or misnamed key. Reserve `as` only for a single genuinely-untypable passthrough field. **This means every reshape must set EVERY column the FE `Row` type requires** — including legacy/dead columns the new API dropped (e.g. `trip_tickets` still types `attachment_path`, `pdf_path`, `qr_path`, `approved_by_evp_operations`, `fuel_allocation_id`; set these to `null` explicitly).
- **Uploads:** the FE currently uploads to Supabase Storage then inserts. The new API takes **multipart** (`multer`). So image-domain adapters (vehicles/spare-parts/tools/user avatar) build `FormData` (text fields + file parts) and POST/PATCH it; the API stores the file and returns the `/uploads/...` path in the row. QR: no upload — rendered client-side from the ticket id.
- **Auth:** `lib/api/auth.ts` replaces `lib/supabase/auth.ts` (`signIn`→`POST /auth/login`, `signOut`→`POST /auth/logout`, `getCurrentUser`→`GET /auth/me`; drop dead `resetPassword`/`signUp` from the login path). The new `AuthProvider` holds the access token in module memory (the client reads it), boots by attempting `GET /auth/me` (the client silently refreshes via the httpOnly cookie), and exposes the **same context shape** `{ user, session, loading }` — where `user` is shaped like the old Supabase user (`{ id, email, user_metadata: { full_name, role, role_id?, branch_id, avatar_url } }`) and `session` is a **synthetic non-null stand-in** when authenticated (so the route guards' `session` truthiness checks keep working). `role`/`branchId` come straight from `AuthUser` (`/auth/me`), so `useUserRole` no longer queries anything.
- **Env:** add `VITE_API_URL` to `apps/web/.env.local` + a new `apps/web/.env.example`; remove `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. The client reads `import.meta.env.VITE_API_URL`.
- **Ordering (single cutover):** build `lib/api/client.ts` + auth first, then all `lib/api/<domain>.ts` + repoint hooks, then the §8 exceptions, then **delete Supabase last** (deps, `lib/supabase/`, `supabase/`, `ml-api.ts`, `public/ml/`, the simulator, `gen-types`). Do not delete `lib/supabase/` until every consumer imports from `lib/api/`.
- **Every task ends with `pnpm --filter @mms/web build` passing** (or `pnpm --filter @mms/web exec tsc -b` for a faster type-only check while iterating). A task that leaves the FE non-compiling is not done. Because this is a single cutover, intermediate tasks keep BOTH `lib/supabase/*` (untouched) and the new `lib/api/*` present — the build stays green because unre-pointed hooks still import the (working, type-valid) supabase files until their domain task repoints them.
- Conventional commits; NO `Co-Authored-By`. All work on `production`. The API must be reachable for the live smoke (`apps/api` running + Postgres up).

---

### Task 1: API client + env + `lib/types.ts` User fix

**Files:**
- Create: `apps/web/src/lib/api/client.ts`, `apps/web/.env.example`
- Modify: `apps/web/.env.local` (add `VITE_API_URL`), `apps/web/src/lib/types.ts` (replace the `@supabase` `User` type)
- Test: build only (`pnpm --filter @mms/web exec tsc -b`)

**Interfaces:**
- Produces (consumed by every later task): `apps/web/src/lib/api/client.js` (Vite alias `@/lib/api/client`):
  - `setAccessToken(token: string | null): void`, `getAccessToken(): string | null` — in-memory token store.
  - `apiRequest<T>(path, opts?: { method?, json?, formData?, query?, headers?, skipRefresh? }): Promise<T>` — attaches `Authorization: Bearer` when a token is set, `credentials: 'include'`, JSON or multipart body, custom headers, single-flight refresh on 401 (only when a token is held). **Returns the parsed JSON as-is — it does NOT unwrap `{ data, count }`; each adapter reads `res.data`/`res.count` itself.**
  - `api.get/post/patch/del` convenience wrappers; `postForm/patchForm(path, formData)` for multipart.
  - `ApiError extends Error` with `status`, `code`.
  - `toAssetUrl(path)` — prefixes a relative `/uploads/...` path with the API base for `<img src>` use.
  - `onAuthFailure(cb: () => void): void` — the AuthProvider registers a callback the client calls when refresh fails (clear auth + route to /login).

- [ ] **Step 1: Implement the client**

`apps/web/src/lib/api/client.ts`:

```ts
const BASE_URL = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3000';

let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

let authFailureCb: (() => void) | null = null;
export function onAuthFailure(cb: () => void): void {
  authFailureCb = cb;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  json?: unknown; // JSON body
  formData?: FormData; // multipart body (takes precedence over json)
  query?: Record<string, string | number | undefined | null>;
  headers?: Record<string, string>; // extra headers (e.g. x-device-api-key for the gps demo)
  skipRefresh?: boolean; // used by the refresh call itself to avoid recursion
}

// Uploads are stored as RELATIVE paths (/uploads/<domain>/<file>) served from
// the API origin; the FE renders them as <img src>. Prefix with the API base so
// they resolve (they'd 404 against the FE origin otherwise).
export function toAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('/uploads') ? `${BASE_URL}${path}` : path;
}

// A single shared in-flight refresh promise so concurrent 401s (e.g. the 5s GPS
// poll + page queries) don't race the rotating refresh token (spec §8).
let refreshPromise: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include'
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { accessToken?: string };
        if (body.accessToken) {
          setAccessToken(body.accessToken);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        // Clear after the microtask so all awaiters observe the same result.
        setTimeout(() => (refreshPromise = null), 0);
      }
    })();
  }
  return refreshPromise;
}

function buildUrl(path: string, query?: RequestOpts['query']): string {
  const url = new URL(`${BASE_URL}${path.startsWith('/api') ? path : `/api${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function raw(path: string, opts: RequestOpts): Promise<Response> {
  const headers: Record<string, string> = { ...opts.headers };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let bodyInit: BodyInit | undefined;
  if (opts.formData) {
    bodyInit = opts.formData; // browser sets multipart boundary
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyInit = JSON.stringify(opts.json);
  }
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers,
    body: bodyInit
  });
}

// Core request: attaches auth, unwraps the envelope, retries ONCE after a
// single-flight refresh on 401. On refresh failure, notifies the AuthProvider.
export async function apiRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  let res = await raw(path, opts);

  // Only treat a 401 as an EXPIRED access token when we actually hold one. On a
  // fresh login (no token yet) a 401 is a real INVALID_CREDENTIALS — don't fire
  // a spurious refresh or mask it as "Session expired".
  if (res.status === 401 && !opts.skipRefresh && accessToken !== null) {
    const ok = await refreshOnce();
    if (ok) {
      res = await raw(path, opts); // retry once with the new token
    } else {
      authFailureCb?.();
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = (parsed as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? `Request failed (${res.status})`);
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOpts['query']) => apiRequest<T>(path, { method: 'GET', query }),
  post: <T>(path: string, json?: unknown) => apiRequest<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => apiRequest<T>(path, { method: 'PATCH', json }),
  del: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) => apiRequest<T>(path, { method: 'POST', formData }),
  patchForm: <T>(path: string, formData: FormData) => apiRequest<T>(path, { method: 'PATCH', formData })
};
```

(The client is intentionally **non-unwrapping**: list endpoints return `{ data, count }` and each adapter reads `res.data`/`res.count` itself — see the vehicles worked example.)

- [ ] **Step 2: Env**

Add to `apps/web/.env.local` (and remove `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` at cleanup — for now ADD alongside so the build has the var):

```
VITE_API_URL=http://localhost:3000
```

Create `apps/web/.env.example`:

```
VITE_API_URL=http://localhost:3000
```

- [ ] **Step 3: `lib/types.ts` User fix** — replace the `import('@supabase/supabase-js').User` reference (near line 128) with a local shape the new AuthProvider produces. Read the current `lib/types.ts` around that line; replace the `User`/`Session` uses with:

```ts
// Replaces @supabase/supabase-js User — the app's synthetic auth user shape.
export interface AppUser {
  id: string;
  email: string;
  user_metadata: {
    full_name?: string;
    role?: string;
    role_id?: string;
    branch_id?: string | null;
    avatar_url?: string | null;
  };
}
```

Then repoint any `UserMetadata`/`User` references in `lib/types.ts` to `AppUser['user_metadata']` / `AppUser`. (Do NOT touch `types/supabase.ts` — it stays.)

- [ ] **Step 4: Build** — `pnpm --filter @mms/web exec tsc -b` compiles (the client + types are unused so far; this just confirms they type-check). `lib/supabase/*` is untouched, so the full app still builds.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add API client (single-flight refresh) and VITE_API_URL"
```

---

### Task 2: Auth cutover — `lib/api/auth.ts` + AuthProvider + guards + login

**Files:**
- Create: `apps/web/src/lib/api/auth.ts`
- Modify: `apps/web/src/components/provider/auth-provider.tsx`, `apps/web/src/components/context/auth-context.ts` (types off `@supabase`), `apps/web/src/hooks/use-user-role.ts`, `apps/web/src/lib/utils.ts` (`getUserRoleName`), `apps/web/src/routes/index.tsx`, `apps/web/src/routes/_authenticated.tsx`, `apps/web/src/routes/_public.tsx`, `apps/web/src/lib/mutation/auth.ts`, `apps/web/src/components/login/login-form.tsx` (AuthError→ApiError), `apps/web/src/components/app-header/user-avatar.tsx` (signOut), `apps/web/src/components/app-sidebar/index.tsx` (role)
- Test: build; live smoke = login works

**Interfaces:**
- Consumes: Task 1 client. Produces `lib/api/auth.ts`: `signIn(email, password): Promise<AppUser>`, `signOut(): Promise<void>`, `getCurrentUser(): Promise<AppUser | null>`. (Drop `resetPassword`/`signUp` — dead per spec.)

- [ ] **Step 1: `lib/api/auth.ts`** — maps `AuthUser` (from the API) into the FE's `AppUser` shape (so `user.user_metadata.branch_id`/`role` keep working):

```ts
import type { AuthUser } from '@mms/shared';
import { api, setAccessToken, toAssetUrl } from './client.js';
import type { AppUser } from '../types';

function toAppUser(u: AuthUser): AppUser {
  return {
    id: u.id,
    email: u.email,
    user_metadata: {
      full_name: u.fullName,
      role: u.role,
      branch_id: u.branchId,
      avatar_url: toAssetUrl(u.avatarUrl) // relative /uploads path → absolute for <img src>
    }
  };
}

interface LoginResponse { accessToken: string; user: AuthUser }

export async function signIn(email: string, password: string): Promise<AppUser> {
  const res = await api.post<LoginResponse>('/auth/login', { email, password });
  setAccessToken(res.accessToken);
  return toAppUser(res.user);
}

export async function signOut(): Promise<void> {
  await api.post('/auth/logout');
  setAccessToken(null);
}

// Boot path: the client silently refreshes on 401, so a returning user with a
// live refresh cookie resolves here; anyone else gets null (→ login).
export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const u = await api.get<AuthUser>('/auth/me');
    return toAppUser(u);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Context types** — in `auth-context.ts`, replace the `@supabase/supabase-js` `User`/`Session` imports with the local shapes. `session` becomes a synthetic marker:

```ts
import { createContext } from 'react';
import type { AppUser } from '@/lib/types';

export type AuthSession = { authenticated: true } | null;

export type AuthContextType = {
  user: AppUser | null;
  session: AuthSession; // truthy when authenticated (route guards read this)
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
```

- [ ] **Step 3: AuthProvider** — rewrite `auth-provider.tsx` to boot from `getCurrentUser()`, register the client's auth-failure callback, drop all Supabase + debug logs:

```tsx
import React, { useEffect, useState } from 'react';
import { getCurrentUser, signIn, signOut } from '@/lib/api/auth';
import { onAuthFailure, setAccessToken } from '@/lib/api/client';
import type { AppUser } from '@/lib/types';
import { AuthContext, type AuthContextType } from '../context/auth-context';
import { Loading } from '../ui/loader';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If refresh fails mid-session, drop auth (guards will route to /login).
    onAuthFailure(() => {
      setAccessToken(null);
      setUser(null);
    });
    getCurrentUser()
      .then((u) => setUser(u))
      .finally(() => setLoading(false));
  }, []);

  // login/logout live on the context (no side-effect-in-render hack). The login
  // form calls auth.login(...); the user menu calls auth.logout().
  const login: AuthContextType['login'] = async (email, password) => {
    setUser(await signIn(email, password)); // signIn also sets the in-memory token
  };
  const logout: AuthContextType['logout'] = async () => {
    await signOut();
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    session: user ? { authenticated: true } : null,
    loading,
    login,
    logout
  };

  if (loading) return <Loading />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

- [ ] **Step 4: useUserRole + getUserRoleName** — `use-user-role.ts` now derives role from context (no query). Match its current RETURN shape (consumers read `userRole?.branch_id`, `userRole?.role`/`userRole?.roles`). Read the current file, then:

```ts
import { useAuth } from './use-auth';

export function useUserRole() {
  const { user } = useAuth();
  const role = user?.user_metadata.role ?? null;
  const branchId = user?.user_metadata.branch_id ?? null;
  // Preserve the shape consumers read (data?.branch_id, data?.role, data?.roles?.name).
  return {
    data: user
      ? { user_id: user.id, role, branch_id: branchId, roles: role ? { name: role } : null }
      : null,
    isLoading: false,
    isError: false
  };
}
```

(If consumers use `useUserRole()` as a full `UseQueryResult`, keep the fields they read — inspect call sites. Add `isLoading`/`isError` as shown.)

`getUserRoleName` in `lib/utils.ts` — the metadata already carries `role`, so:

```ts
export async function getUserRoleName(userMetadata: AppUser['user_metadata'] | null | undefined): Promise<string | null> {
  return userMetadata?.role ?? null;
}
```

(Keep it async to avoid touching its awaited call sites.)

- [ ] **Step 5: Route guards** — `routes/index.tsx` can no longer call `supabase.auth.getSession()` in `beforeLoad` (module-level, no React). Switch it to a client-token/`me` check, OR simplest: make `index.tsx` render a component that reads `useAuth()` and redirects. Read the current guard; replace the Supabase check with the new auth state. For `_authenticated.tsx`/`_public.tsx` (which already use `useAuth()` inside the component), just ensure they read `session`/`user` from the new context (they already do) and that `getUserRoleName(user?.user_metadata)` still works.
  - For `routes/index.tsx` `beforeLoad`: replace `const { data: { session } } = await supabase.auth.getSession()` with `getAccessToken() ? redirect({to:'/dashboard'}) : redirect({to:'/login'})` — but on a hard refresh the token isn't set yet (boot is async). Prefer: move the index redirect into a component using `useAuth()` (redirect to /dashboard if `session`, else /login), OR keep `beforeLoad` but await `getCurrentUser()` there. Choose the approach that compiles and matches the app's existing routing; document it in the report.

- [ ] **Step 6: login-form + user-avatar + mutation/auth.ts + sidebar** — `login-form.tsx`: replace `useSignIn` with `const { login } = useAuth()`; in submit, `try { await login(data.email, data.password); navigate({ to: '/' }); } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Login failed'); }` (use `formState.isSubmitting` for button loading; drop the `@supabase` `AuthError` import, import `ApiError` from `@/lib/api/client`). `user-avatar.tsx`: replace `useSignOut` with `const { logout } = useAuth()` and call `await logout()` (clears context; the guard routes to /login). `lib/mutation/auth.ts`: remove `useSignIn`/`useSignOut`/`useSignUp`/`useResetPassword` (login/logout now on the context); if `useCurrentUser` has a live consumer, repoint its `queryFn` to `getCurrentUser` from `@/lib/api/auth`, else delete it. `app-sidebar/index.tsx`: `getUserRoleName(user?.user_metadata)` still resolves (role is in metadata).

- [ ] **Step 7: Build + smoke** — `pnpm --filter @mms/web build` compiles. Live smoke (API + Postgres up, `VITE_API_URL` pointing at it): `pnpm --filter @mms/web dev`, log in as the seeded admin, confirm the dashboard loads and a refresh keeps you logged in (silent refresh), and logout returns to /login.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): cut auth over to the Express API (in-memory token, /auth/me boot, silent refresh)"
```

---

### Tasks 3–10: Per-domain `lib/api/<domain>.ts` adapters + repoint hooks

**For EACH domain task below:** (a) read the current `apps/web/src/lib/supabase/<domain>.ts` to get the exact exported function names, signatures, and return types; (b) create `apps/web/src/lib/api/<domain>.ts` exporting the SAME functions, implemented against the API endpoints listed, **reshaping the camelCase response into the FE's snake_case return type** (the function's declared return type — `Vehicle`, `TripTicket`, etc. — makes `tsc -b` enforce every key is present); (c) change the import path in that domain's `lib/query/<domain>.ts` and `lib/mutation/<domain>.ts` from `@/lib/supabase/<domain>` (or relative) → `@/lib/api/<domain>`; (d) `pnpm --filter @mms/web exec tsc -b` compiles; (e) commit. Keep `lib/supabase/<domain>.ts` in place (deleted in Task 12).

**Reshape helper pattern** (per domain, private to the adapter): a `toSnakeVehicle(row: VehicleResponse): Vehicle` that renames camel→snake and fills any FE-only fields. Use `@mms/shared` request types for bodies where they match; the response reshape targets the FE `Tables<'…'>` type.

---

### Task 3: Reference adapters — roles, branches (shared), offices

**Files:** Create `apps/web/src/lib/api/roles.ts`, `apps/web/src/lib/api/shared.ts` (branches), `apps/web/src/lib/api/offices.ts`. Modify the hooks in `lib/query/roles.ts`, `lib/query/shared.ts`, `lib/query/offices.ts` (offices currently inlines Supabase — repoint to `lib/api/offices`).

- [ ] **Step 1: roles** — `GET /roles` returns `{ data: Role[], count }` (name asc). `getRoles(): Promise<Role[]>` → `(await api.get<{data:Role[]}>('/roles')).data`. `getRoleById(id)` → `GET /roles` then find by id (no single-role endpoint) OR `GET /roles/:id` if present — check the API; if absent, fetch the list and `.find`. `getRoleByName(name): Promise<Role|null>` → fetch list, `.find(r=>r.name===name) ?? null` (preserves the not-found-returns-null contract). Role shape (`{id,name,description,created_at}`) — the API returns camelCase `createdAt`; reshape to `created_at`.
- [ ] **Step 2: branches (shared.ts)** — `getAllBranches(): Promise<Branch[]>` → `(await api.get<{data:Branch[]}>('/branches')).data` (reshape if the API embeds/renames; `Branch` = `{id,name,location}` — no camel fields).
- [ ] **Step 3: offices** — the §8 exception: `lib/query/offices.ts` currently calls `supabase.from('department_offices').select('*').order('name')` and `supabase.from('office_heads')...` inline. Create `lib/api/offices.ts` with `getDepartmentOffices()` → `GET /offices` (`{data,count}`, embeds `head`) and `getOfficeHeads()` → `GET /office-heads`, reshaping to the shapes the hooks return today; repoint the two `queryFn`s to these. Match the current return shape (read the current `offices.ts` query hooks).
- [ ] **Step 4: repoint hook imports + build + commit** (`git commit -m "feat(web): api adapters for roles, branches, offices"`).

---

### Task 4: Users + avatar (`lib/api/user-management.ts` + `lib/api/auth.ts` signIn already done)

**Files:** Create `apps/web/src/lib/api/user-management.ts`. Modify `lib/query/user-management.ts` + `lib/mutation/user-management.ts` (imports + the avatar mutation + the empty-onSuccess bug).

- [ ] **Step 1:** read the current `lib/supabase/user-management.ts`. Create the adapter:
  - `getAllUsers()` → `GET /users` (`{data,count}`; the API returns `UserResponse` = `{id,email,fullName,avatarUrl,status,branchId,role,createdAt}`). Reshape each into the current `UserProfileData` shape the table reads: a Title-cased `role` string, a `branch_name` (fetch `/branches` to map `branchId`→name, else 'N/A'), `full_name` from `fullName`, `avatar_url` via **`toAssetUrl(avatarUrl)`** (relative path → absolute), spread the profile snake_case. Match the current return exactly (read the current getAllUsers).
  - `getAllAdmins()` → `GET /users?role=admin` (`{data}`); reshape to the admins[] shape callers read.
- [ ] **Step 2: avatar mutation (§8 #3)** — `lib/mutation/user-management.ts` currently does `signUp` + `supabase.storage.upload` + `supabase.auth.updateUser`. Replace with a single **multipart** `POST /users`: build `FormData` with the `CreateUserBody` fields (`email,password,fullName,roleId,branchId,phone?,address?`) + the `avatar` file part, `api.postForm('/users', fd)`. Fill the **empty `onSuccess`** to `queryClient.invalidateQueries({ queryKey: ['allUsers'] })` (quote-fix the bug). Update-avatar path: multipart `PATCH /users/:id`.
- [ ] **Step 3: repoint imports + build + commit** (`git commit -m "feat(web): api adapter for users + multipart avatar upload"`).

---

### Task 5: Drivers (`lib/api/drivers.ts`)

**Files:** Create `apps/web/src/lib/api/drivers.ts`; modify `lib/query/drivers.ts` + `lib/mutation/drivers.ts` imports; §8 #6b driver-status display in `components/pages/drivers/index.tsx` + driver-details Select.

- [ ] **Step 1:** `getDrivers(page,limit): {data:Driver[],count}` → `GET /drivers?page&limit`; `getDriverById`, `createDriver`, `updateDriver` (JSON `POST/PATCH /drivers`), `deleteDriver(id): Promise<Driver>` → `DELETE /drivers/:id` returns 204, so capture the row via `getDriverById` BEFORE delete and return it (match the current contract). Reshape camel→snake for `Driver` (`full_name`←`fullName`, `license_number`←`licenseNumber`, `license_type`←`licenseType`, `license_expiry`←`licenseExpiry`, `sss_number`←`sssNumber`, `assigned_vehicle_id`←`assignedVehicleId`, `branch_id`←`branchId`, `user_id`←`userId`, `date_of_birth`←`dateOfBirth`, `hire_date`←`hireDate`, `emergency_contact_name`←`emergencyContactName`, `emergency_contact_phone`←`emergencyContactPhone`, `created_at`/`updated_at`). In `createDriver`/`updateDriver`, snake→camel the body AND translate `status`: the API enum is **lowercase** (`active`/`inactive`/`on_trip`); if the form supplies a display value (`Active`/`Inactive`/`On Trip`), map it down before sending.
- [ ] **Step 2 (§8 #6b — driver status, ALL sites; verification-caught):** the API returns lowercase status. Fix every FE site that assumes the capitalized value:
  - `drivers/index.tsx` — render `DRIVER_STATUS_DISPLAY[driver.status]` (from `@mms/shared`) instead of raw `driver.status`.
  - driver-details status `<Select>` — iterate `DRIVER_STATUS_DB` for values + `DRIVER_STATUS_DISPLAY` for labels.
  - `add-driver/action.tsx` — change the default `status: 'Active'` → `'active'` (and the zod enum to the DB values).
  - **driver-availability filters** — `trip-tickets/add-trip-ticket/page.tsx` (`if (driver.status !== 'Active') return false`) and `trip-tickets/trip-tickets-inner/index.tsx` (`driver.status === 'Active'`): change the literal to `'active'` (or `DRIVER_STATUS_DB[0]`).
  - **Grep the repo for the literal `'Active'`/`'Inactive'`/`'On Trip'` before finishing** to catch any other comparison.
- [ ] **Step 3 (AuthError):** `lib/mutation/drivers.ts` imports `type { AuthError } from '@supabase/supabase-js'` and uses it in `onError`. Drop that import and retype `onError: (error: AuthError)` → `ApiError` (from `@/lib/api/client`) or plain `Error`. (Grep other `lib/mutation/*.ts` for `AuthError` and fix the same way as domains are cut over.)
- [ ] **Step 4: repoint + build + commit** (`git commit -m "feat(web): api adapter for drivers + lowercase status across display/filters/forms"`).

---

### Task 6: Vehicles (`lib/api/vehicles.ts`) + branch→branchId form

**Files:** Create `apps/web/src/lib/api/vehicles.ts`; modify `lib/query/vehicles.ts` + `lib/mutation/vehicles.ts` imports; §8 #6a vehicle forms (`add-vehicle/actions.ts`, `vehicle-inner/actions.ts`, both `page.tsx`).

- [ ] **Step 1:** create the adapter (worked example — the pattern for all image domains):

```ts
import { api, toAssetUrl } from './client.js';
import { getAllBranches } from './shared.js';
import type { Vehicle, VehicleWithBranch, NewVehicle, UpdateVehicle } from '../types';
import type { VehicleResponse } from '@mms/shared';

// NOTE: typed return (no `as Vehicle`) so tsc enforces every key. Image paths
// are relative (/uploads/...) → prefix with toAssetUrl for <img src>.
function toSnake(v: VehicleResponse): Vehicle {
  const p = v as VehicleResponse & {
    insuranceExpiry: string; registrationExpiry: string; latitude: number | null;
    longitude: number | null; lastLocationUpdate: string | null; createdAt: string; updatedAt: string;
  };
  return {
    id: v.id, make: v.make, model: v.model, year: v.year, vin: v.vin,
    license_plate: v.licensePlate, capacity: v.capacity, fuel_type: v.fuelType,
    mileage: v.mileage, status: v.status,
    images: v.images.map((u) => toAssetUrl(u) ?? u),
    branch: v.branchId ?? '', maintenance_standard_id: v.maintenanceStandardId ?? null,
    insurance_expiry: p.insuranceExpiry, registration_expiry: p.registrationExpiry,
    latitude: p.latitude ?? null, longitude: p.longitude ?? null,
    last_location_update: p.lastLocationUpdate ?? null,
    created_at: p.createdAt, updated_at: p.updatedAt
  };
}

export async function getVehicles(page = 1, limit = 10): Promise<{ data: VehicleWithBranch[]; count: number | null }> {
  const [res, branches] = await Promise.all([
    api.get<{ data: VehicleResponse[]; count: number }>('/vehicles', { page, limit }),
    getAllBranches()
  ]);
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const data = res.data.map((v) => {
    const row = toSnake(v);
    return { ...row, branch_name: row.branch ? branchMap.get(row.branch) ?? row.branch : 'N/A' } as VehicleWithBranch;
  });
  return { data, count: res.count };
}

export async function getVehicleById(id: string): Promise<Vehicle> {
  return toSnake(await api.get<VehicleResponse>(`/vehicles/${id}`));
}

function vehicleFormData(v: Partial<NewVehicle>, files: File[]): FormData {
  const fd = new FormData();
  const map: Record<string, unknown> = {
    make: v.make, model: v.model, year: v.year, vin: v.vin, licensePlate: (v as any).license_plate,
    capacity: v.capacity, fuelType: (v as any).fuel_type, mileage: v.mileage, status: v.status,
    insuranceExpiry: (v as any).insurance_expiry, registrationExpiry: (v as any).registration_expiry,
    branchId: (v as any).branch, maintenanceStandardId: (v as any).maintenance_standard_id
  };
  for (const [k, val] of Object.entries(map)) if (val !== undefined && val !== null) fd.append(k, String(val));
  for (const f of files) fd.append('images', f);
  return fd;
}

export async function createVehicle(vehicle: NewVehicle, files: File[] = []): Promise<Vehicle> {
  return toSnake(await api.postForm<VehicleResponse>('/vehicles', vehicleFormData(vehicle, files)));
}

export async function updateVehicle(id: string, updates: UpdateVehicle, files: File[] = [], removedImages: string[] = []): Promise<Vehicle> {
  const fd = vehicleFormData(updates, files);
  for (const url of removedImages) fd.append('removedImages', url);
  return toSnake(await api.patchForm<VehicleResponse>(`/vehicles/${id}`, fd));
}
```

> The `as any` casts bridge fields the FE `VehicleResponse` (shared) may not name identically; verify against `@mms/shared`'s `vehicleResponseSchema` (it `.passthrough()`es, so extra fields like `insuranceExpiry`/timestamps are present at runtime). Tighten types where the shared schema declares the field.

- [ ] **Step 2 (§8 #6a):** in `add-vehicle/actions.ts` + `vehicle-inner/actions.ts` rename the zod key `branch: z.string().min(1)` → `branchId: z.string().uuid()` and the `defaultValues` key; in both `page.tsx` change the Controller `name="branch"` → `name="branchId"` (the `<Select>` already emits a branch UUID). Update the vehicles list display that reads `vehicle.branch`/`branch_name` if needed (the adapter still provides `branch`/`branch_name`). NOTE: the adapter maps the FE form's `branchId` back — align the form field name with what `createVehicle` reads (the `vehicleFormData` reads `v.branch`; if the form now emits `branchId`, update the form-submit mapping or have `vehicleFormData` read `branchId`). Keep them consistent and compiling.
- [ ] **Step 3: repoint + build + commit** (`git commit -m "feat(web): api adapter for vehicles (multipart images, branch_name reshape)"`).

---

### Task 7: Spare parts + tools (`lib/api/spare-parts.ts`, `lib/api/tools.ts`)

**Files:** Create both adapters; repoint `lib/query/{spare-parts,tools}.ts` + `lib/mutation/{spare-parts,tools}.ts`.

- [ ] **Step 1:** same multipart pattern as vehicles (single `image` field). `getSpareParts/getTools(page,limit): {data,count}` → `GET /spare-parts|/tools` (updatedAt desc — reshape `updatedAt`→`updated_at`). `*ById`. `create(entity, file?)` → multipart `POST` with the `image` part; `update(id, updates, file?, removeImage?)` → multipart `PATCH` appending `removeImage` when true. Reshape camel→snake (`SparePart`: `created_at`/`updated_at`; `Tool`: `borrowed_by`←`borrowedById`, `borrowed_date`←`borrowedDate`, `estimated_return_date`←`estimatedReturnDate`, `created_at`/`updated_at`). **Apply `toAssetUrl` to the `image` field** (relative `/uploads/spare-parts|tools/...` path → absolute for `<img src>`). Use a typed return (no `as` cast). `deleteSparePart(id): Promise<void>` → `DELETE`. Do NOT add a `deleteTool` (none exists today).
- [ ] **Step 2: repoint + build + commit** (`git commit -m "feat(web): api adapters for spare parts and tools"`).

---

### Task 8: Maintenance (`lib/api/maintenance.ts`) + standards

**Files:** Create `lib/api/maintenance.ts` (+ `lib/api/maintenance-standards.ts` if a supabase file exists for it); repoint the hooks.

- [ ] **Step 1:** `getMaintenances(page,limit): {data,count}` → `GET /maintenance?page&limit` (date desc); `getAllMaintenances(): Maintenance[]` → `GET /maintenance` unpaginated; `getMaintenanceById`; `create/update` (JSON `POST/PATCH /maintenance`); `deleteMaintenance(id): void`. Reshape `Maintenance` camel→snake (`vehicle_id`←`vehicleId`, `next_due`←`nextDue`, `created_at`/`updated_at`). If a `lib/supabase/maintenance-standards.ts` exists (feat-branch), mirror it against `/maintenance-standards` (+ nested schedule-items) and `/vehicles/:id/maintenance-tracking` / `/maintenance-tracking/:id/complete`.
- [ ] **Step 2: repoint + build + commit** (`git commit -m "feat(web): api adapter for maintenance (+ standards)"`).

---

### Task 9: Trip tickets (`lib/api/trip-tickets.ts`) + transitions + QR + cancel/status

**Files:** Create `lib/api/trip-tickets.ts` + `lib/api/trip-ticket-transitions` mutations (or add to `lib/mutation/trip-tickets.ts`); repoint `lib/query/trip-tickets.ts` + `lib/mutation/trip-tickets.ts`; §8 #1/#1b/#1c/#7 component edits.

- [ ] **Step 1: the adapter with the allocation_* flatten (highest-risk reshape).** Read the current `lib/supabase/trip-tickets.ts`. The API embeds `fuelAllocation`; FLATTEN it back onto the ticket:

```ts
import { api } from './client.js';
import type { TripTicket, NewTripTicket, UpdateTripTicket } from '../types';

// API TripTicket (camelCase, embeds fuelAllocation) -> FE snake_case Row with
// the denormalized allocation_* fields components read. TYPED return (no `as`)
// so tsc enforces every trip_tickets column — INCLUDING the legacy/dead columns
// the new API dropped (set to null). Add any other required column tsc reports.
function toSnake(t: any): TripTicket {
  const fa = t.fuelAllocation ?? null;
  return {
    id: t.id, branch_id: t.branchId, driver_id: t.driverId, vehicle_id: t.vehicleId,
    office_id: t.officeId ?? null, office_head_id: t.officeHeadId ?? null,
    destination: t.destination, purpose: t.purpose, date_requested: t.dateRequested,
    participants: t.participants ?? [], participants_count: t.participantsCount ?? null,
    prepared_by: t.preparedBy, requested_by: t.requestedById ?? null, remarks: t.remarks ?? null,
    qr_id: t.qrId ?? t.id, status: t.status,
    approved_by_admin: t.approvedByAdminId ?? null,
    disapproved_reason: t.disapprovedReason ?? null, cancellation_reason: t.cancellationReason ?? null,
    pre_trip_guard: t.preTripGuardId ?? null, pre_trip_checked_by: t.preTripCheckedById ?? null,
    pre_trip_checked_at: t.preTripCheckedAt ?? null, post_trip_guard: t.postTripGuardId ?? null,
    post_trip_checked_by: t.postTripCheckedById ?? null, post_trip_checked_at: t.postTripCheckedAt ?? null,
    start_ts: t.startTs ?? null, end_ts: t.endTs ?? null,
    created_at: t.createdAt, updated_at: t.updatedAt,
    // Denormalized allocation_* (spec §6.1 read contract) flattened from fuelAllocation:
    allocation_date: fa?.date ?? null, allocation_trip_to: fa?.tripTo ?? null,
    allocation_purpose: fa?.purpose ?? null, allocation_vehicle_id: fa?.vehicleId ?? null,
    allocation_fuel_type: fa?.fuelType ?? null, allocation_liters: fa?.liters ?? null,
    allocation_approved_by_evp_operations: fa?.approvedByEvpId ?? null,
    fuel_allocation_id: fa?.id ?? null,
    // Legacy columns the new API dropped — kept in the FE Row type, set to null:
    attachment_path: null, pdf_path: null, qr_path: null, approved_by_evp_operations: null
  };
}

export async function getTripTickets(page = 1, limit = 10, userId?: string, branchId?: string, driverId?: string) {
  const res = await api.get<{ data: any[]; count: number }>('/trip-tickets', { page, limit, requestedBy: userId, branchId, driverId });
  return { data: res.data.map(toSnake), count: res.count };
}
export async function getAllTripTickets(userId?: string, branchId?: string): Promise<TripTicket[]> {
  const res = await api.get<{ data: any[]; count: number }>('/trip-tickets', { requestedBy: userId, branchId });
  return res.data.map(toSnake);
}
export async function getTripTicketById(id: string): Promise<TripTicket> {
  return toSnake(await api.get(`/trip-tickets/${id}`));
}
export async function createTripTicket(t: NewTripTicket): Promise<TripTicket> {
  // camel-map the create body (destination/purpose/dateRequested/driverId/vehicleId/branchId/
  // officeId/officeHeadId/participants/participantsCount/requestedById/preparedBy/remarks/startTs/endTs)
  return toSnake(await api.post('/trip-tickets', mapCreateBody(t)));
}
export async function updateTripTicket(id: string, updates: any): Promise<TripTicket> {
  // PATCH only allowed while pending; status changes go through the transition mutations
  // (§8). Strip status/allocation_* from the PATCH body; forward the editable fields.
  return toSnake(await api.patch(`/trip-tickets/${id}`, mapUpdateBody(updates)));
}
export async function deleteTripTicket(id: string): Promise<void> {
  await api.del(`/trip-tickets/${id}`);
}
```

(Implement `mapCreateBody`/`mapUpdateBody` snake→camel; QR: drop `uploadTripTicketQrCode` and the post-insert qr update — `qr_id` is just the ticket id now.)

- [ ] **Step 2: transition mutations (§8 #1)** — add to `lib/mutation/trip-tickets.ts`: `useApproveTripTicket` (`POST /trip-tickets/:id/approve`, body `{liters,fuelType,date,purpose,tripTo}`), `useApproveEvpTripTicket` (`.../approve-evp`), `useDisapproveTripTicket` (`.../disapprove` `{reason}`), `useCancelTripTicket` (`.../cancel` `{reason}`), `useCheckOutTripTicket` (`.../check-out`), `useCheckInTripTicket` (`.../check-in`). Rewire the callers (the recon named them: `trip-tickets/index.tsx` admin approve+fuel dialog + disapprove + cancel; `evp-approval` approve/disapprove; `guard-confirmation` check-out/check-in) from the generic `useUpdateTripTicket(status=...)` to the dedicated mutations. The admin approve dialog maps its fuel fields to the `approve` body.
- [ ] **Step 3 (§8 #1b/#1c/#7):** requester cancel `<Button disabled>` adds `DISAPPROVED` to the excluded set. `trip-tickets-inner` status `<Select>` no longer edits status via PATCH (route it through a transition or make it read-only for status). Remove the **LIVE** `{tripTicket.qr_path ? (<a href={tripTicket.qr_path}>…) : …}` block in `trip-tickets-inner/index.tsx` (~lines 157-159 — it is live code, NOT commented); the QR already renders separately via `<QRCode value={tripTicket.id} size={160}>` (~line 154), and `qr_path` is now always null.
- [ ] **Step 4: repoint + build + commit** (`git commit -m "feat(web): trip-tickets adapter (allocation flatten) + transition mutations + QR/cancel edits"`).

---

### Task 10: Job orders (`lib/api/job-orders.ts`) + transitions + Note modal

**Files:** Create `lib/api/job-orders.ts`; add job-order transition mutations to `lib/mutation/job-orders.ts`; repoint hooks; §8 #2 Note/Approve/CompleteRepair modals.

- [ ] **Step 1:** keep the CURRENT positional signatures exactly (the hooks call them positionally): `getJobOrders(page = 1, limit = 10, userId?: string, userRole?: string): Promise<{ data: any[]; count: number | null }>` and `getAllJobOrders(userId?: string, userRole?: string): Promise<any[]>` → `GET /job-orders?page&limit` (the API server-scopes by role via the JWT, so `userId`/`userRole` are ignored internally — kept only for signature compatibility). Each row must carry `vehicles: {id,make,model,license_plate}` (the API embeds `vehicle` — rename to `vehicles` + snake the plate). `getJobOrderById` (no embed). `create/update` (JSON). Reshape camel→snake for `JobOrder` (`vehicle_id`,`branch_id`,`incident_date`,`incident_details`,`requested_by`,`noted_by`,`approved_by`,`assigned_mechanic`,`date_of_request`,`date_approved`,`target_date`,`actual_date_of_release`,`repair_done`,`created_at`,`updated_at`). Note: `spare_parts_used` (the old array) is gone — the new detail comes from the join; if a component reads `spare_parts_used`, provide it from the embedded `spareParts` (map to sparePartId array) or the reshaped `spareParts`.
- [ ] **Step 2: transition mutations (§8 #2)** — `useNoteJobOrder` (`POST /job-orders/:id/note`, body `{assignedMechanicId,dateOfRequest,targetDate,spareParts:[{sparePartId,quantity}]}`), `useApproveJobOrder` (`.../approve`), `useCompleteRepair` (`.../complete-repair`, body `{repairDone,remarks,actualDateOfRelease}`). Rewire `job-order/index.tsx` `handleNoteJobOrder/handleApproveJobOrder/handleCompleteRepair` (+ the modals + `evp-approval`) off the generic `updateJobOrder`. **The Note modal's spare-parts MultiSelect** currently submits an array of `spare_part` ids; change it to submit `[{sparePartId, quantity}]` pairs — add a quantity input per selected part (default 1). Read the current Note modal to wire the quantity UI minimally.
- [ ] **Step 3: repoint + build + commit** (`git commit -m "feat(web): job-orders adapter (vehicle embed) + transition mutations + note spare-parts quantities"`).

---

### Task 11: GPS + analytics (`lib/api/gps.ts`, `lib/api/analytics.ts`) + remove client ML/realtime

**Files:** Create `lib/api/gps.ts`, `lib/api/analytics.ts`; repoint `lib/query/gps.ts` (remove realtime effect) + `lib/query/analytics.ts` (thin REST); the dashboard GPS demo (§8 #8).

- [ ] **Step 1a (small API change — verification-caught):** the FE `GpsDataWithVehicle.vehicles` type REQUIRES `mileage: number` and `fuel_type: string`, but `GET /gps/latest` only joins `make/model/license_plate/status`. Add the two columns to the raw SQL in `apps/api/src/modules/gps/repository.ts` `latestPerVehicle` (`v.mileage, v.fuel_type AS "fuelType"`) and to the `LatestGpsRow` interface, so the adapter can populate them. (`fuel_type` has no `@map`, so the column is `fuel_type`; alias to `fuelType`.) Rebuild/retest `apps/api` (`pnpm --filter @mms/api exec vitest run src/modules/gps`) — the existing gps test still passes.
- [ ] **Step 1b: gps adapter** — `getLatestGpsData(): GpsDataWithVehicle[]` → `GET /gps/latest`; reshape each camelCase row to the FE `GpsDataWithVehicle` (top-level snake `gps_id`←`id`, `vehicle_id`←`vehicleId`, `engine_status`←`engineStatus`, `created_at`←`createdAt`, plus a nested `vehicles: { id: vehicleId, make, model, license_plate: licensePlate, status, mileage, fuel_type: fuelType }`). `getGpsDataByVehicle(id): Row[]` → `GET /gps/history?vehicleId=id&limit=100` (reshape). The demo ingest replaces `insertGpsData` (§8 #8): call `apiRequest('/gps/ingest', { method: 'POST', json: { vehicleId, latitude, longitude, speed, heading, engineStatus }, headers: { 'x-device-api-key': import.meta.env.VITE_GPS_DEVICE_KEY } })` (add `VITE_GPS_DEVICE_KEY` to `.env.local`/`.env.example`; note camelCase + `engineStatus`). **Remove** `subscribeToGpsUpdates` (§8 #5a): delete the `useEffect` channel in `useLatestGpsData` (keep `refetchInterval:5000`).
- [ ] **Step 2: analytics (§8 #5b)** — `lib/api/analytics.ts`: `usePredictiveMaintenanceData`→`GET /analytics/predictive-maintenance`, `useSparePartsAssociations`→`GET /analytics/association-rules`, and the dashboard metric hooks (`useVehicleStatusCounts`, `useCompletedTripsCount`)→`GET /analytics/dashboard` (bare `DashboardMetrics` — split into the shapes the hooks return).
  - **CRITICAL shape gap (verification-caught):** the components (`dashboard/predictive-maintenance.tsx`, `dashboard/preventive-maintenance.tsx`, `vehicles/vehicle-inner/vehicle-maintenance-insights.tsx`) read a **richer** `VehicleRiskAssessment` shape (`vehicleName`, `reason`, `predictedFailureDate`, `lastMaintenanceDate`) than the API's `RiskAssessment` (`{vehicleId, make, model, licensePlate, mileage, kmSinceLastMaint, avgDailyKm, maintFreq12m, riskScore, priority, usedFallback}`). So the adapter must **derive** these: `vehicleName = make + ' ' + model` (trivial); `reason` from `priority`; `predictedFailureDate`/`lastMaintenanceDate` re-derived client-side. **Keep the derivation helper in `lib/utils/predictive-maintenance.ts` — do NOT delete that file** (see below). Adapt its `buildAssessmentFromApi(apiRow: RiskAssessment): VehicleRiskAssessment` to map the NEW API shape → the FE shape; the adapter maps `res.data.map(buildAssessmentFromApi)` so the **components stay unchanged**.
  - **`lib/utils/predictive-maintenance.ts` is KEPT but STRIPPED** to display helpers only: remove `computeFleetRiskAssessments`/`computeVehicleRisk`/`extractVehicleFeatures`/the `fetch('/ml/rf_maintenance_model.json')` model loader/the RF traversal + fallback (the API owns inference now); **keep** `getNextMaintenanceDueMileage` (a pure helper with live consumers) and the adapted `buildAssessmentFromApi`. Delete the `../services/ml-api` import (the Flask client is deleted in Task 12).
  - `lib/utils/spare-parts-association.ts` can be deleted (Task 12) — the API returns the ruleset directly; if a component reads a different `AssociationRule` field shape, reshape it in the adapter.
- [ ] **Step 3: repoint + build + commit** (`git commit -m "feat(web): gps + analytics adapters; drop client-side ML and realtime"`).

---

### Task 12: Delete Supabase + dead code + final sweep

**Files:** delete + package.json + firmware + smoke.

- [ ] **Step 1: delete** (only after Tasks 3–11 repoint every consumer):
  - `rm -rf apps/web/src/lib/supabase/`
  - `rm -rf apps/web/supabase/` (edge functions incl. gps-ingest, config.toml, migrations)
  - `rm apps/web/src/lib/services/ml-api.ts` (+ the `services/` dir if empty)
  - `rm apps/web/public/ml/rf_maintenance_model.json` (+ `public/ml/` if empty)
  - `rm apps/web/src/lib/utils/vehicle-simulator.ts apps/web/src/lib/supabase/vehicle-tracking.ts apps/web/src/lib/query/vehicle-tracking.ts` (dead — verified no component consumers)
  - `rm apps/web/src/lib/utils/spare-parts-association.ts` (client Apriori, replaced by /analytics — verify no live non-Apriori export first)
  - **Do NOT delete `apps/web/src/lib/utils/predictive-maintenance.ts`** — Task 11 stripped it to display helpers (`getNextMaintenanceDueMileage`, `buildAssessmentFromApi`) which have LIVE consumers. Only its ML/model-fetch code was removed (in Task 11).
  - Do NOT delete `apps/web/src/lib/types/supabase.ts` — it is the FE's snake_case type source (kept per Global Constraints).
- [ ] **Step 2: package.json** — remove deps `@supabase/auth-ui-react`, `@supabase/auth-ui-shared`, `@supabase/supabase-js`, devDep `supabase`, and the `gen-types` script; `pnpm install`. Grep for any remaining `from '@supabase/` or `@/lib/supabase` import → fix (should be none).
- [ ] **Step 3: env + firmware** — remove `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from `.env.local`. In `tools/firmware/gps_esp32_supabase.ino` update the endpoint URL (L34) from the Supabase edge-function URL to the API `/api/gps/ingest` host + fix the Supabase comments.
- [ ] **Step 4: full sweep** — `pnpm --filter @mms/web build` compiles clean; `pnpm build` (whole monorepo) clean; `pnpm --filter @mms/web dev` + a live smoke of key flows (login, dashboard metrics + GPS map, a vehicle list + create, a trip-ticket approve→evp→check-out, a job-order note→approve→complete, analytics predictive list). Report the real smoke results.
- [ ] **Step 5: commit**

```bash
git add -A apps/web tools/firmware
git commit -m "chore(web): remove Supabase (deps, client, edge fns), dead ML/realtime code; point firmware at the API"
```

---

## Self-Review Notes

- **Spec §8 coverage:** api client (single-flight refresh, envelope) ✔ (Task 1); AuthProvider token-in-memory + `/auth/me` + silent refresh, same context shape ✔ (Task 2); per-domain `lib/api/*` call-compatible with camel→snake reshape ✔ (Tasks 3–11); `lib/api/auth.ts` drops `resetPassword`/`signUp` ✔; offices rewired ✔ (Task 3); gps realtime removed ✔, analytics client-ML deleted → thin REST ✔ (Task 11); avatar multipart + empty-onSuccess fix ✔ (Task 4); trip-ticket transition mutations + requester-cancel-drops-disapproved + status-select ✔ (Task 9); job-order transition mutations + spare-parts `{sparePartId,quantity}` pairs ✔ (Task 10); vehicle branch→branchId + driver status map ✔ (Tasks 5/6); QR client-side from id ✔ (Task 9); dashboard GPS demo → `/gps/ingest` ✔ (Task 11). Final cleanup: `@supabase/*` deps, `lib/supabase/`, `supabase/`, `ml-api.ts`, `public/ml/`, simulator, `gen-types`, debug logs ✔ (Task 12).
- **Deliberate deviation:** `types/supabase.ts` is KEPT (type-only, no runtime coupling) as the FE snake_case type source so components stay untouched — the adapters reshape into it. A later, separate migration could move the FE fully to `@mms/shared` camelCase types; that is out of scope here (it would churn every component).
- **The gate is the `tsc -b` build** (catches every missed/renamed key in a reshape) + the live smoke; there is no FE unit-test harness (spec §13). Each domain task keeps the old `lib/supabase/<domain>.ts` until its consumers are repointed, so the build stays green throughout the single cutover; Supabase is deleted only in Task 12 once nothing imports it.
- **Out-of-repo (note for Jess):** the Vercel project **Root Directory** must be set to `apps/web` in the dashboard (not in any committed file); the ESP32 firmware must be reflashed with the new URL; `VITE_API_URL` (and the demo `VITE_GPS_DEVICE_KEY`) must be set in the deployment env.
