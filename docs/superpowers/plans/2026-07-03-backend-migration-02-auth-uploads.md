# Backend Migration Plan 2/7: Auth Module + Uploads Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Express-owned authentication (JWT login/refresh/logout/me with rotating opaque refresh tokens and reuse revocation), `requireAuth`/`requireRole` middleware, the multer upload infrastructure, and the integration-test database wiring that all later domain plans build on.

**Architecture:** Feature module `apps/api/src/modules/auth/` (router → controller → service → repository) per spec §6; JWT + bcrypt helpers in `lib/`; refresh tokens are opaque 256-bit values stored as SHA-256 hashes with family revocation on reuse (spec §4.1/§5); tests run against the dedicated `mms_test` database via Vitest globalSetup + truncation (spec §13).

**Tech Stack:** jsonwebtoken, bcryptjs (cost 12), cookie-parser, multer, Zod contracts in `@mms/shared`, Vitest + Supertest against real Postgres.

**Spec:** `docs/superpowers/specs/2026-07-03-express-backend-migration-design.md` §4.1, §5, §6 (auth row), §7, §9, §12, §13. Prior work: Plan 1 scaffold (schema, `createApp`, `AppError`, `config`, seed).

## Global Constraints

- TypeScript strict; no `any` (use `unknown` + narrowing). `noUncheckedIndexedAccess` is on.
- **NodeNext module resolution: every relative import in `apps/api` and `packages/shared` MUST carry a `.js` extension.**
- Error envelope `{ error: { code, message, details? } }`. Codes used in this plan: `UNAUTHORIZED` (401), `INVALID_CREDENTIALS` (401), `ACCOUNT_INACTIVE` (403), `NO_ROLE` (403), `FORBIDDEN` (403), `VALIDATION_ERROR` (400), `INVALID_FILE_TYPE` (400), `UPLOAD_ERROR` (400), `NOT_FOUND` (404), `INTERNAL` (500).
- Role names (from `@mms/shared` `USER_ROLES`): `admin`, `security_guard`, `evp_operations`, `driver`, `requester`.
- bcrypt cost 12. Access JWT TTL 15 minutes, payload `{ sub, email, role, branchId }`. Refresh TTL 7 days, cookie name `mms_refresh`, httpOnly, path `/api/auth`, `sameSite` from `COOKIE_SAMESITE` env (default `lax` for local dev; deployed cross-site uses `none`), `secure` exactly when sameSite is `none`.
- Uploads: 5 MB limit, mimetypes `image/jpeg`, `image/png`, `image/webp` only, stored under `<UPLOADS_DIR>/<domain>/`, served statically at `/uploads` without auth (spec §9).
- Tests: integration tests hit the real `mms_test` Postgres (never mocks, never the dev `mms` DB). `fileParallelism: false` — suites share one DB.
- Express is v5 (Plan 1 scaffold): rejected promises in async handlers reach the error handler automatically — controllers may `throw AppError` without wrappers.
- Prior work already installed in `apps/api` by Plan 1: `bcryptjs` (+`@types/bcryptjs`), `supertest` (+types), `dotenv`, `vitest`. Only genuinely new deps get install steps here.
- **Documented spec §5 amendment:** `POST /auth/logout` is cookie-only (NO `requireAuth`) — a user whose access token has expired must still be able to log out. The spec's requireAuth-exception list is amended to include it.
- Conventional commits; do NOT add `Co-Authored-By` lines.
- The FE (`apps/web`) is untouched by this plan and must keep building.
- All work on the `production` branch. Docker Desktop may need relaunching before DB work (known flaky on this host).

---

### Task 1: Test-database wiring + config/env extensions

**Files:**
- Modify: `apps/api/src/config.ts`, `apps/api/vitest.config.ts`, `apps/api/.env`, `apps/api/.env.example`
- Create: `apps/api/src/test/global-setup.ts`, `apps/api/src/test/db.ts`
- Test: `apps/api/src/test/db.test.ts`

**Interfaces:**
- Consumes: `prisma` singleton (`src/lib/prisma.ts`), existing `config` object.
- Produces: `config` gains `jwtSecret: string`, `cookieSameSite: 'lax' | 'strict' | 'none'`, `uploadsDir: string`. `truncateAll(): Promise<void>` from `src/test/db.js`. Vitest runs against `TEST_DATABASE_URL` with migrations applied. Later tasks' integration tests rely on all of this.

- [ ] **Step 1: Extend env files + gitignore**

Append to BOTH `apps/api/.env` and `apps/api/.env.example`:

```env
JWT_SECRET=dev-only-secret-0123456789abcdef0123456789abcdef
COOKIE_SAMESITE=lax
UPLOADS_DIR=uploads
```

`TEST_DATABASE_URL=postgresql://mms:mms@localhost:5432/mms_test` already exists in both files from Plan 1 — verify it's present (add it if somehow missing). The `mms_test` database itself is created by `docker/init-test-db.sql`.

Append to the root `.gitignore` (test runs write binary fixtures under `uploads-test/`; an interrupted run must not leave committable strays):

```gitignore
apps/api/uploads-test/
```

- [ ] **Step 2: Extend config.ts**

Replace `apps/api/src/config.ts` with:

```ts
import { z } from 'zod';

// Validated process env — fail fast on boot if anything required is missing.
const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional(),
  UPLOADS_DIR: z.string().default('uploads')
});

const env = envSchema.parse(process.env);

export const config = {
  databaseUrl: env.DATABASE_URL,
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN,
  jwtSecret: env.JWT_SECRET,
  // Spec §5: cross-site production (Vercel↔Railway) needs SameSite=None;
  // same-site local dev wants Lax. Explicit env always wins.
  cookieSameSite:
    env.COOKIE_SAMESITE ?? (env.NODE_ENV === 'production' ? 'none' : 'lax'),
  uploadsDir: env.UPLOADS_DIR
};
```

- [ ] **Step 3: Vitest wiring for the test DB**

Replace `apps/api/vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is not set in apps/api/.env');
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: './src/test/global-setup.ts',
    // Tests get the TEST database; the app code reads DATABASE_URL as usual.
    env: { DATABASE_URL: testDatabaseUrl, UPLOADS_DIR: 'uploads-test' },
    // Suites share one database — never run files in parallel.
    fileParallelism: false
  }
});
```

`apps/api/src/test/global-setup.ts`:

```ts
import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

// Applies all migrations to the dedicated test database once per test run.
export default function setup(): void {
  loadEnv({ path: '.env' });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit'
  });
}
```

`apps/api/src/test/db.ts`:

```ts
import { prisma } from '../lib/prisma.js';

const TABLES = [
  'refresh_tokens',
  'user_roles',
  'users',
  'roles',
  'fuel_allocations',
  'trip_tickets',
  'job_order_spare_parts',
  'job_orders',
  'maintenance_completion_logs',
  'vehicle_maintenance_tracking',
  'maintenance_schedule_items',
  'maintenance_standards',
  'maintenance',
  'borrow_requests',
  'tools',
  'spare_parts',
  'gps_data',
  'geofence_violation',
  'geofence_area',
  'vehicle_status_audit',
  'drivers',
  'vehicles',
  'department_offices',
  'office_heads',
  'branches'
];

// Empties every app table between suites; CASCADE handles FK ordering.
export async function truncateAll(): Promise<void> {
  // Guard BEFORE truncating: a misconfigured URL must never wipe the dev DB.
  if (!process.env.DATABASE_URL?.includes('mms_test')) {
    throw new Error('refusing to truncate a non-test database');
  }
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  );
}
```

- [ ] **Step 4: Write the round-trip test**

`apps/api/src/test/db.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { truncateAll } from './db.js';

describe('test database wiring', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('talks to the mms_test database, not the dev database', () => {
    expect(process.env.DATABASE_URL).toContain('mms_test');
  });

  it('round-trips a row and truncates it', async () => {
    await prisma.role.create({ data: { name: 'roundtrip-check' } });
    expect(await prisma.role.count()).toBe(1);
    await truncateAll();
    expect(await prisma.role.count()).toBe(0);
  });
});
```

- [ ] **Step 5: Run tests**

(Ensure Docker + the db container are up first: `docker compose up -d`.)
Run: `pnpm --filter @mms/api test`
Expected: migrate deploy output, then 4 passing (2 existing app tests + 2 new). Then `pnpm --filter @mms/api typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat: wire integration tests to the dedicated test database"
```

---

### Task 2: Password + JWT helpers, shared auth contracts, validation middleware

**Files:**
- Create: `apps/api/src/lib/password.ts`, `apps/api/src/lib/jwt.ts`, `apps/api/src/middleware/validate.ts`, `packages/shared/src/contracts/auth.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/package.json` (deps)
- Test: `apps/api/src/lib/jwt.test.ts`, `apps/api/src/lib/password.test.ts`

**Interfaces:**
- Consumes: `config.jwtSecret`, `AppError`.
- Produces (contracts for Tasks 3–5):
  - `hashPassword(plain): Promise<string>`, `verifyPassword(plain, hash): Promise<boolean>` from `lib/password.js`
  - `signAccessToken(payload: AccessTokenPayload): string`, `verifyAccessToken(token): AccessTokenPayload`, `interface AccessTokenPayload { sub: string; email: string; role: string; branchId: string | null }` from `lib/jwt.js`
  - `validateBody(schema)` middleware from `middleware/validate.js`
  - From `@mms/shared`: `loginBodySchema`, `LoginBody`, `authUserSchema`, `AuthUser`, `loginResponseSchema`, `LoginResponse`

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter @mms/api add jsonwebtoken
pnpm --filter @mms/api add -D @types/jsonwebtoken
```

- [ ] **Step 2: Write the failing tests**

`apps/api/src/lib/password.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('Password123!');
    expect(hash).not.toBe('Password123!');
    expect(await verifyPassword('Password123!', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Password123!');
    expect(await verifyPassword('nope', hash)).toBe(false);
  });
});
```

`apps/api/src/lib/jwt.test.ts`:

```ts
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { AppError } from './errors.js';
import { signAccessToken, verifyAccessToken } from './jwt.js';

const payload = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'admin@mms.local',
  role: 'admin',
  branchId: null
};

describe('access tokens', () => {
  it('round-trips the payload', () => {
    const token = signAccessToken(payload);
    expect(verifyAccessToken(token)).toEqual(payload);
  });

  it('rejects a tampered token with a 401 AppError', () => {
    const token = signAccessToken(payload) + 'x';
    expect(() => verifyAccessToken(token)).toThrowError(AppError);
    try {
      verifyAccessToken(token);
    } catch (e) {
      expect((e as AppError).statusCode).toBe(401);
    }
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(
      { email: payload.email, role: payload.role, branchId: payload.branchId },
      config.jwtSecret,
      { subject: payload.sub, expiresIn: -1 }
    );
    expect(() => verifyAccessToken(expired)).toThrowError(AppError);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @mms/api test -- src/lib`
Expected: FAIL — modules `./password.js` / `./jwt.js` not found.

- [ ] **Step 4: Implement**

`apps/api/src/lib/password.ts`:

```ts
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

// Hash a plaintext password (bcrypt, cost 12 per spec §5).
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

// Compare a plaintext password against a stored bcrypt hash.
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

`apps/api/src/lib/jwt.ts`:

```ts
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from './errors.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  branchId: string | null;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// Sign a short-lived access JWT carrying the caller's identity + role.
export function signAccessToken(payload: AccessTokenPayload): string {
  const { sub, ...claims } = payload;
  return jwt.sign(claims, config.jwtSecret, {
    subject: sub,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  });
}

// Verify + decode an access JWT; any failure maps to a 401 AppError.
export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
  if (
    typeof decoded === 'string' ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.email !== 'string' ||
    typeof decoded.role !== 'string'
  ) {
    throw new AppError(401, 'UNAUTHORIZED', 'Malformed token payload');
  }
  return {
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    branchId: typeof decoded.branchId === 'string' ? decoded.branchId : null
  };
}
```

`apps/api/src/middleware/validate.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

// Parses req.body with a Zod schema; the parsed value replaces req.body.
// ZodError flows to the error handler, which maps it to 400 VALIDATION_ERROR.
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

`packages/shared/src/contracts/auth.ts`:

```ts
import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
  branchId: z.string().uuid().nullable()
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
```

Append to `packages/shared/src/index.ts`:

```ts
export * from './contracts/auth.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @mms/shared build && pnpm --filter @mms/api test -- src/lib`
Expected: 5 passing. Then `pnpm typecheck` at root → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat: add password/jwt helpers, shared auth contracts, and body validation"
```

---

### Task 3: Auth module — login, /auth/me, requireAuth

**Files:**
- Create: `apps/api/src/modules/auth/repository.ts`, `apps/api/src/modules/auth/tokens.ts`, `apps/api/src/modules/auth/service.ts`, `apps/api/src/modules/auth/controller.ts`, `apps/api/src/modules/auth/router.ts`, `apps/api/src/middleware/require-auth.ts`, `apps/api/src/test/factories.ts`
- Modify: `apps/api/src/app.ts` (cookie-parser + mount router), `apps/api/package.json` (deps)
- Test: `apps/api/src/modules/auth/auth.test.ts`

**Interfaces:**
- Consumes: Task 2 helpers/contracts, `prisma`, `AppError`, `config`.
- Produces (contracts for Task 4–5 and all domain plans):
  - `requireAuth` middleware; `interface AuthenticatedUser { id: string; email: string; role: string; branchId: string | null }`; global Express augmentation `req.user?: AuthenticatedUser`
  - `issueRefreshToken(userId): Promise<string>` and `hashToken(token): string` from `modules/auth/tokens.js`
  - `REFRESH_COOKIE = 'mms_refresh'` and `refreshCookieOptions()` exported from `modules/auth/controller.js`
  - Test factory `createTestUser(opts?): Promise<{ user: { id: string; email: string }; password: string }>` from `src/test/factories.js`
  - Endpoints: `POST /api/auth/login`, `GET /api/auth/me`

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter @mms/api add cookie-parser
pnpm --filter @mms/api add -D @types/cookie-parser
```

- [ ] **Step 2: Write the failing integration tests**

`apps/api/src/test/factories.ts` (test helper, written first — the tests need it):

```ts
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';

interface CreateTestUserOptions {
  email?: string;
  role?: string;
  password?: string;
  status?: 'active' | 'inactive';
  branchId?: string;
  fullName?: string;
}

// Creates a role (idempotent) + user + user_roles row for integration tests.
export async function createTestUser(opts: CreateTestUserOptions = {}) {
  const {
    email = 'admin@test.local',
    role = 'admin',
    password = 'Password123!',
    status = 'active',
    branchId,
    fullName = 'Test User'
  } = opts;

  const roleRow = await prisma.role.upsert({
    where: { name: role },
    update: {},
    create: { name: role }
  });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName,
      status,
      branchId,
      userRole: { create: { roleId: roleRow.id } }
    }
  });
  return { user: { id: user.id, email: user.email }, password };
}
```

`apps/api/src/modules/auth/auth.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

describe('POST /api/auth/login', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('returns an access token, the user, and sets the refresh cookie', async () => {
    await createTestUser({ email: 'admin@test.local', role: 'admin' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'admin@test.local', role: 'admin' });
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('mms_refresh=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
    expect(await prisma.refreshToken.count()).toBe(1);
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    await createTestUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'Password123!' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an inactive account with 403 ACCOUNT_INACTIVE', async () => {
    await createTestUser({ status: 'inactive' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'Password123!' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('rejects a malformed body with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(truncateAll);

  it('returns the fresh user for a valid token', async () => {
    await createTestUser({ email: 'driver@test.local', role: 'driver' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'driver@test.local', password: 'Password123!' });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'driver@test.local', role: 'driver' });
  });

  it('rejects a missing token with 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a tampered token with 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer nonsense');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @mms/api test -- src/modules/auth`
Expected: FAIL — auth router not mounted (404s) / modules missing.

- [ ] **Step 4: Implement the module**

`apps/api/src/modules/auth/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

// User with their single role resolved — what every auth flow needs.
export function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: { userRole: { include: { role: true } } }
  });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { userRole: { include: { role: true } } }
  });
}

export type UserWithRole = NonNullable<Awaited<ReturnType<typeof findUserByEmail>>>;
```

`apps/api/src/modules/auth/tokens.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Refresh tokens are opaque random values; only their SHA-256 lands in the DB.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
    }
  });
  return token;
}
```

`apps/api/src/modules/auth/service.ts`:

```ts
import type { AuthUser } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { signAccessToken } from '../../lib/jwt.js';
import { verifyPassword } from '../../lib/password.js';
import { findUserByEmail, findUserById, type UserWithRole } from './repository.js';
import { issueRefreshToken } from './tokens.js';

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// Shared gate: account must be active and have a role; returns the role name.
function assertUsable(user: UserWithRole): string {
  if (user.status !== 'active') {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'Account is inactive');
  }
  const role = user.userRole?.role.name;
  if (!role) {
    throw new AppError(403, 'NO_ROLE', 'User has no assigned role');
  }
  return role;
}

function toAuthUser(user: UserWithRole, role: string): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    role,
    branchId: user.branchId
  };
}

// Issues a fresh access + refresh pair for the user (used by login and refresh).
async function issuePair(user: UserWithRole, role: string): Promise<AuthResult> {
  return {
    accessToken: signAccessToken({ sub: user.id, email: user.email, role, branchId: user.branchId }),
    refreshToken: await issueRefreshToken(user.id),
    user: toAuthUser(user, role)
  };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const role = assertUsable(user);
  return issuePair(user, role);
}

export async function me(userId: string): Promise<AuthUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User no longer exists');
  }
  const role = assertUsable(user);
  return toAuthUser(user, role);
}

export { assertUsable, issuePair, toAuthUser };
```

`apps/api/src/middleware/require-auth.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  branchId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Verifies the Bearer access token and attaches req.user.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Missing bearer token'));
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      branchId: payload.branchId
    };
    next();
  } catch (err) {
    next(err);
  }
}
```

`apps/api/src/modules/auth/controller.ts`:

```ts
import type { CookieOptions, Request, Response } from 'express';
import type { LoginBody } from '@mms/shared';
import { config } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import * as authService from './service.js';

export const REFRESH_COOKIE = 'mms_refresh';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Cookie flags per spec §5: httpOnly, scoped to /api/auth, secure iff SameSite=None.
export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSameSite === 'none',
    path: '/api/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS
  };
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginBody;
  const { accessToken, refreshToken, user } = await authService.login(email, password);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  res.json({ accessToken, user });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json(await authService.me(req.user.id));
}
```

`apps/api/src/modules/auth/router.ts`:

```ts
import { Router } from 'express';
import { loginBodySchema } from '@mms/shared';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/require-auth.js';
import * as controller from './controller.js';

export const authRouter = Router();

authRouter.post('/login', validateBody(loginBodySchema), controller.login);
authRouter.get('/me', requireAuth, controller.me);
```

Modify `apps/api/src/app.ts` — add imports and wire cookie-parser + the router (final shape):

```ts
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/router.js';

// App factory so tests can mount a fresh instance without listening.
export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  if (process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined) {
    app.use(pinoHttp());
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);

  // Domain routers mount here in later plans.

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @mms/api test`
Expected: all suites green (app, db, lib, auth). Then `pnpm typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat: add auth module with login, /auth/me, and requireAuth middleware"
```

---

### Task 4: Refresh rotation, reuse revocation, logout

**Files:**
- Modify: `apps/api/src/modules/auth/service.ts`, `apps/api/src/modules/auth/controller.ts`, `apps/api/src/modules/auth/router.ts`
- Test: `apps/api/src/modules/auth/refresh.test.ts`

**Interfaces:**
- Consumes: Task 3 module internals (`issuePair`, `assertUsable`, `hashToken`, `REFRESH_COOKIE`, `refreshCookieOptions`).
- Produces: `POST /api/auth/refresh` (rotates cookie, returns `{ accessToken, user }`), `POST /api/auth/logout` (revokes + clears cookie, 204; cookie-only per the Global Constraints spec amendment). Reuse of a rotated/revoked token revokes ALL of the user's refresh tokens (spec §4.1); a merely-expired token gets a plain 401 without touching other sessions.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/auth/refresh.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function loginAndGetCookie(): Promise<string> {
  await createTestUser({ email: 'admin@test.local' });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.local', password: 'Password123!' });
  const cookie = res.headers['set-cookie']?.[0];
  if (!cookie) throw new Error('login did not set a refresh cookie');
  return cookie;
}

describe('POST /api/auth/refresh', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('rotates the token: new access token, new cookie, old row revoked', async () => {
    const cookie = await loginAndGetCookie();
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    const newCookie = res.headers['set-cookie']?.[0] ?? '';
    expect(newCookie).toContain('mms_refresh=');
    expect(newCookie).not.toBe(cookie);
    // one revoked (rotated) + one live
    expect(await prisma.refreshToken.count()).toBe(2);
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const cookie = await loginAndGetCookie();
    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(first.status).toBe(200);

    // replay the OLD cookie
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);

    // the rotated-out replacement must now be dead too
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    const newCookie = first.headers['set-cookie']?.[0] ?? '';
    const retry = await request(app).post('/api/auth/refresh').set('Cookie', newCookie);
    expect(retry.status).toBe(401);
  });

  it('rejects a missing cookie with 401', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects a garbage cookie with 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'mms_refresh=deadbeef');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  beforeEach(truncateAll);

  it('revokes the token, clears the cookie, and blocks later refresh', async () => {
    const cookie = await loginAndGetCookie();
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.[0]).toContain('mms_refresh=;');

    const after = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('is a no-op 204 without a cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mms/api test -- src/modules/auth/refresh`
Expected: FAIL — 404 (routes not mounted).

- [ ] **Step 3: Implement**

Append to `apps/api/src/modules/auth/service.ts`:

```ts
import { prisma } from '../../lib/prisma.js';
import { hashToken } from './tokens.js';

export async function refresh(presentedToken: string): Promise<AuthResult> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(presentedToken) },
    include: { user: { include: { userRole: { include: { role: true } } } } }
  });
  if (!stored) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
  }
  if (stored.revokedAt !== null) {
    // Reuse of a rotated/revoked token = possible theft: kill the family (spec §4.1).
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    throw new AppError(401, 'UNAUTHORIZED', 'Refresh token reuse detected');
  }
  if (stored.expiresAt < new Date()) {
    // Plain expiry is not reuse — this session ends, others stay alive.
    throw new AppError(401, 'UNAUTHORIZED', 'Refresh token expired');
  }
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() }
  });
  const role = assertUsable(stored.user);
  return issuePair(stored.user, role);
}

export async function logout(presentedToken: string | undefined): Promise<void> {
  if (!presentedToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}
```

(Hoist the two appended imports to the top import block and merge `hashToken` into the existing `./tokens.js` import — one import statement per module.)

Append to `apps/api/src/modules/auth/controller.ts`:

```ts
export async function refresh(req: Request, res: Response): Promise<void> {
  const presented = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  if (!presented) throw new AppError(401, 'UNAUTHORIZED', 'Missing refresh token');
  const { accessToken, refreshToken, user } = await authService.refresh(presented);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  res.json({ accessToken, user });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const presented = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  await authService.logout(presented);
  // Clear with the SAME attributes used to set (minus maxAge) — a cross-site
  // SameSite=None cookie can only be deleted by a matching SameSite=None header.
  const { maxAge: _maxAge, ...clearOptions } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, clearOptions);
  res.status(204).end();
}
```

Append to `apps/api/src/modules/auth/router.ts`:

```ts
authRouter.post('/refresh', controller.refresh);
authRouter.post('/logout', controller.logout);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mms/api test`
Expected: all green. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add refresh rotation with reuse revocation and logout"
```

---

### Task 5: requireRole middleware

**Files:**
- Create: `apps/api/src/middleware/require-role.ts`
- Test: `apps/api/src/middleware/require-role.test.ts`

**Interfaces:**
- Consumes: `requireAuth` + `AuthenticatedUser` augmentation, `AppError`, `errorHandler`. `USER_ROLES` from `@mms/shared` is a `const` OBJECT mapping role keys to role-name strings (`{ admin: 'admin', security_guard: 'security_guard', evp_operations: 'evp_operations', driver: 'driver', requester: 'requester' }`) — property access like `USER_ROLES.admin` is valid.
- Produces: `requireRole(...roles: string[])` — 401 if unauthenticated, 403 `FORBIDDEN` on role mismatch. Every domain plan's routers compose `requireAuth` + `requireRole`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/middleware/require-role.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '@mms/shared';
import { signAccessToken } from '../lib/jwt.js';
import { errorHandler } from './error-handler.js';
import { requireAuth } from './require-auth.js';
import { requireRole } from './require-role.js';

// Minimal app exercising the real middleware chain.
function buildApp() {
  const app = express();
  app.get(
    '/admin-only',
    requireAuth,
    requireRole(USER_ROLES.admin, USER_ROLES.evp_operations),
    (_req, res) => res.json({ ok: true })
  );
  app.use(errorHandler);
  return app;
}

function tokenFor(role: string): string {
  return signAccessToken({
    sub: '11111111-1111-4111-8111-111111111111',
    email: `${role}@test.local`,
    role,
    branchId: null
  });
}

describe('requireRole', () => {
  it('admits an allowed role', async () => {
    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).toBe(200);
  });

  it('admits the second allowed role', async () => {
    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', `Bearer ${tokenFor('evp_operations')}`);
    expect(res.status).toBe(200);
  });

  it('rejects a disallowed role with 403 FORBIDDEN', async () => {
    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', `Bearer ${tokenFor('driver')}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(buildApp()).get('/admin-only');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mms/api test -- src/middleware/require-role`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/api/src/middleware/require-role.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

// Role gate: mount AFTER requireAuth. 403 when the caller's role isn't allowed.
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient role'));
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mms/api test`
Expected: all green. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add requireRole middleware"
```

---

### Task 6: Upload infrastructure

**Files:**
- Create: `apps/api/src/lib/uploads.ts`
- Modify: `apps/api/src/app.ts` (static /uploads), `apps/api/src/middleware/error-handler.ts` (multer error mapping), `apps/api/package.json` (deps)
- Test: `apps/api/src/lib/uploads.test.ts`

**Interfaces:**
- Consumes: `config.uploadsDir`, `AppError`, `errorHandler`.
- Produces (for Plans 3–4 consumers): `createUploader(domain: string): multer.Multer` and `publicUploadPath(domain, filename): string` from `lib/uploads.js`; `GET /uploads/**` static serving; multer errors → 400 `UPLOAD_ERROR`.

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter @mms/api add multer
pnpm --filter @mms/api add -D @types/multer
```

- [ ] **Step 2: Write the failing tests**

`apps/api/src/lib/uploads.test.ts`:

```ts
import { existsSync, rmSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createUploader, publicUploadPath } from './uploads.js';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

function buildApp() {
  const app = express();
  const upload = createUploader('test');
  app.post('/upload', upload.single('image'), (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: 'No file' } });
      return;
    }
    res.json({ path: publicUploadPath('test', file.filename) });
  });
  app.use(errorHandler);
  return app;
}

describe('upload infrastructure', () => {
  afterAll(() => rmSync(config.uploadsDir, { recursive: true, force: true }));

  it('stores an allowed image and returns its public path', async () => {
    const res = await request(buildApp())
      .post('/upload')
      .attach('image', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.path).toMatch(/^\/uploads\/test\/[\w-]+\.png$/);
    const onDisk = res.body.path.replace('/uploads/', `${config.uploadsDir}/`);
    expect(existsSync(onDisk)).toBe(true);
  });

  it('rejects a disallowed mimetype with 400 INVALID_FILE_TYPE', async () => {
    const res = await request(buildApp())
      .post('/upload')
      .attach('image', Buffer.from('%PDF-1.4'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf'
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects an oversized file with 400 UPLOAD_ERROR', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const res = await request(buildApp())
      .post('/upload')
      .attach('image', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UPLOAD_ERROR');
  });

  it('serves stored files at /uploads with a cross-origin resource policy', async () => {
    const uploaded = await request(buildApp())
      .post('/upload')
      .attach('image', PNG, { filename: 'photo.png', contentType: 'image/png' });
    // the REAL app (with helmet) must serve it embeddable cross-origin
    const { createApp } = await import('../app.js');
    const res = await request(createApp()).get(uploaded.body.path as string);
    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @mms/api test -- src/lib/uploads`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`apps/api/src/lib/uploads.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { AppError } from './errors.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// Multer instance persisting files to <UPLOADS_DIR>/<domain>/ (spec §9).
export function createUploader(domain: string): multer.Multer {
  const dir = path.join(config.uploadsDir, domain);
  mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
      }
    }),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(new AppError(400, 'INVALID_FILE_TYPE', 'Only jpeg, png, or webp images are allowed'));
        return;
      }
      cb(null, true);
    }
  });
}

// The URL path stored in the DB for an uploaded file.
export function publicUploadPath(domain: string, filename: string): string {
  return `/uploads/${domain}/${filename}`;
}
```

In `apps/api/src/middleware/error-handler.ts`, add the multer mapping — import at top:

```ts
import multer from 'multer';
```

and insert BEFORE the `ZodError` branch:

```ts
  if (err instanceof multer.MulterError) {
    res.status(400).json({
      error: { code: 'UPLOAD_ERROR', message: err.message }
    });
    return;
  }
```

In `apps/api/src/app.ts`, add static serving after the health route. The global `helmet()` sets `Cross-Origin-Resource-Policy: same-origin`, which would make browsers block `<img>` loads from the cross-origin FE (localhost:5173 → :3000 in dev; Vercel → Railway deployed) — override it for this route only:

```ts
  app.use(
    '/uploads',
    (_req, res, next) => {
      // Images must be embeddable by the cross-origin FE (spec §9);
      // helmet's default CORP: same-origin would block them.
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(config.uploadsDir)
  );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @mms/api test`
Expected: all green (uploads suite writes under `uploads-test/`, cleaned up in `afterAll`). `pnpm typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat: add multer upload infrastructure with static /uploads serving"
```

---

### Task 7: Sweep + docs

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: documented auth endpoints + new env vars; whole workspace verified.

- [ ] **Step 1: Update README**

In the README's API section (add one if absent, after the quickstart): list the auth endpoints (`POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`) with one line each, note the refresh cookie (`mms_refresh`, httpOnly, 7 days) and the 15-minute access token, and document the three new env vars (`JWT_SECRET`, `COOKIE_SAMESITE` — set `none` for cross-site deploys, `UPLOADS_DIR`). Mention `/uploads/*` static serving.

- [ ] **Step 2: Full verification sweep**

```bash
pnpm build          # shared + api + web green
pnpm typecheck      # api + shared green
pnpm --filter @mms/api test   # all suites green
pnpm --filter @mms/api start  # background; then:
curl http://localhost:3000/api/health                            # {"status":"ok"}
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@mms.local","password":"Password123!"}'
# expect 200 with accessToken + user (dev DB is seeded) — then kill the server
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document auth endpoints and new environment variables"
```

---

## Self-Review Notes

- Spec coverage: §5 endpoints/cookie/JWT/bcrypt ✔ (Tasks 2–4), §4.1 rotation + family revocation ✔ (Task 4), role middleware ✔ (Task 5), §9 uploads ✔ (Task 6), §13 test DB ✔ (Task 1), §7 shared contracts ✔ (Task 2). `PATCH /users/:id/password` deliberately deferred to Plan 3 (users module, spec §6).
- Type consistency: `AccessTokenPayload`/`AuthenticatedUser` field sets match; `issuePair`/`assertUsable` exported in Task 3, consumed in Task 4; cookie name/options single-sourced in controller.
- NodeNext: every relative import shown carries `.js`.
- pino disabled under Vitest (`VITEST` env check) so test output stays pristine.
