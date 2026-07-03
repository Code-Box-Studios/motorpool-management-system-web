# Backend Migration Plan 3/7: Reference Data, Users, Drivers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first domain modules on the auth foundation: read-only reference data (roles, branches, offices, office heads), the users module (list with role filter, admin-only create with the driver-creation side effect, update, password change, delete, avatar upload), and drivers CRUD — plus the deferred login timing-side-channel fix.

**Architecture:** Feature modules per spec §6 (`router → controller → service → repository`), composed from Plan 2's middleware (`requireAuth`, `requireRole`, `validateBody`, `createUploader`). Collections return `{ data, count }`; `?page`/`?limit` optional, both omitted → full set. Roles/branches/offices/office-heads are grouped into ONE `reference` module (four trivial read-only endpoints — separate module folders would be empty ceremony).

**Tech Stack:** Express 5, Prisma, Zod contracts in `@mms/shared`, Vitest + Supertest against `mms_test`.

**Spec:** `docs/superpowers/specs/2026-07-03-express-backend-migration-design.md` §5 (role matrix, password lifecycle), §6 (module table: roles/branches/offices/users/drivers rows + response conventions), §9 (avatar upload). Prior work: Plans 1–2 (schema, seed, auth, middleware, uploads, test DB).

## Global Constraints

- TypeScript strict; no `any`; `noUncheckedIndexedAccess` on. **NodeNext ESM: every relative import in `apps/api` and `packages/shared` carries `.js`.**
- Error envelope `{ error: { code, message, details? } }`. Codes added in this plan: `EMAIL_TAKEN` (409), `INVALID_ROLE` (400), `CANNOT_DELETE_SELF` (400), `INVALID_CURRENT_PASSWORD` (400), `USER_IN_USE` (409), `NOT_FOUND` (404), plus the existing auth/validation codes.
- Response conventions (spec §6): collections → `{ data, count }` where `count` is the TOTAL matching rows (not the page size); `page` is 1-indexed; `limit` max 200; both omitted → full result set. This applies to the reference endpoints too. Single resources → bare object.
- Role access (spec §5 matrix): reference/users READS need only `requireAuth` (any role — dashboards resolve names from them). Drivers reads are role-scoped per the matrix: **a driver-role caller sees only their own row** (`drivers.userId = caller`); other roles see all. All WRITES in this plan are `requireRole('admin')`, except `PATCH /users/:id/password` (self with current password, or admin for OTHER users without it — an admin changing their OWN password still needs the current one).
- **Never apply `requireAuth` router-wide on a router mounted at the bare `/api` prefix** — it would intercept every later module's routes (including the future device-key `POST /gps/ingest`) and turn unknown-route 404s into 401s. The reference router guards each route individually.
- **Express 5 gotcha: `req.query` is a read-only getter — never assign to it.** Query params are parsed INSIDE controllers via Zod (`schema.parse(req.query)`), not via middleware.
- `POST /users` with a driver role creates the linked `drivers` row (`userId` set) **in the same transaction** — this is the app's only driver-creation-from-signup path (spec §6 users row).
- Password change revokes ALL of the user's refresh tokens (forced re-login everywhere).
- Multipart routes: multer runs BEFORE `validateBody` (text fields arrive as strings in `req.body`).
- Conventional commits; NO `Co-Authored-By` lines. All work on `production`. Docker Desktop is flaky on this host — relaunch + poll `docker info` before DB work if needed.
- No new tables/migrations in this plan → the test-DB `TABLES` truncation list needs no changes.

---

### Task 1: Shared contracts + pagination utilities

**Files:**
- Create: `packages/shared/src/contracts/common.ts`, `packages/shared/src/contracts/users.ts`, `packages/shared/src/contracts/drivers.ts`, `apps/api/src/lib/pagination.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/lib/pagination.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2–5 and the FE later):
  - `@mms/shared`: `paginationQuerySchema`, `PaginationQuery`; `userResponseSchema`, `UserResponse`, `createUserBodySchema`, `CreateUserBody`, `updateUserBodySchema`, `UpdateUserBody`, `changePasswordBodySchema`, `ChangePasswordBody`, `usersListQuerySchema`; `driverResponseSchema`, `DriverResponse`, `createDriverBodySchema`, `CreateDriverBody`, `updateDriverBodySchema`, `UpdateDriverBody`
  - `apps/api/src/lib/pagination.js`: `toSkipTake(q: PaginationQuery): { skip: number; take: number } | Record<string, never>`

- [ ] **Step 1: Write the failing test**

`apps/api/src/lib/pagination.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { paginationQuerySchema } from '@mms/shared';
import { toSkipTake } from './pagination.js';

describe('pagination', () => {
  it('returns an empty object when page and limit are omitted (full set)', () => {
    expect(toSkipTake(paginationQuerySchema.parse({}))).toEqual({});
  });

  it('computes skip/take from 1-indexed page', () => {
    expect(toSkipTake(paginationQuerySchema.parse({ page: '3', limit: '10' }))).toEqual({
      skip: 20,
      take: 10
    });
  });

  it('defaults the missing half when only one is provided', () => {
    expect(toSkipTake(paginationQuerySchema.parse({ page: '2' }))).toEqual({ skip: 10, take: 10 });
    expect(toSkipTake(paginationQuerySchema.parse({ limit: '5' }))).toEqual({ skip: 0, take: 5 });
  });

  it('rejects out-of-range values', () => {
    expect(() => paginationQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => paginationQuerySchema.parse({ limit: '201' })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter @mms/api test -- src/lib/pagination`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

`packages/shared/src/contracts/common.ts`:

```ts
import { z } from 'zod';

// ?page= / ?limit= — both optional; both omitted means "return everything".
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
```

`packages/shared/src/contracts/users.ts`:

```ts
import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  status: z.enum(['active', 'inactive']),
  branchId: z.string().uuid().nullable(),
  role: z.string().nullable(),
  createdAt: z.string()
});
export type UserResponse = z.infer<typeof userResponseSchema>;

export const createUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  phone: z.string().optional(),
  address: z.string().optional()
});
export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const updateUserBodySchema = z.object({
  fullName: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  roleId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  phone: z.string().optional(),
  address: z.string().optional()
});
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8)
});
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

export const usersListQuerySchema = paginationQuerySchema.extend({
  role: z.string().optional()
});
export type UsersListQuery = z.infer<typeof usersListQuerySchema>;
```

`packages/shared/src/contracts/drivers.ts`:

```ts
import { z } from 'zod';

export const driverStatusSchema = z.enum(['active', 'inactive', 'on_trip']);

export const createDriverBodySchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  dateOfBirth: z.coerce.date().optional(),
  licenseNumber: z.string().optional(),
  licenseType: z.string().optional(),
  licenseExpiry: z.coerce.date().optional(),
  status: driverStatusSchema.optional(),
  assignedVehicleId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  sssNumber: z.string().optional(),
  tin: z.string().optional(),
  hireDate: z.coerce.date().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional()
});
export type CreateDriverBody = z.infer<typeof createDriverBodySchema>;

export const updateDriverBodySchema = createDriverBodySchema.partial();
export type UpdateDriverBody = z.infer<typeof updateDriverBodySchema>;

// Response type is intentionally loose (Prisma row serialized to JSON);
// the FE consumes it via the shared type, not runtime validation.
export const driverResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  status: driverStatusSchema,
  userId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  assignedVehicleId: z.string().uuid().nullable()
}).passthrough();
export type DriverResponse = z.infer<typeof driverResponseSchema>;
```

Append to `packages/shared/src/index.ts`:

```ts
export * from './contracts/common.js';
export * from './contracts/users.js';
export * from './contracts/drivers.js';
```

`apps/api/src/lib/pagination.ts`:

```ts
import type { PaginationQuery } from '@mms/shared';

// Spec §6: page is 1-indexed; both params omitted -> full result set.
export function toSkipTake(
  q: PaginationQuery
): { skip: number; take: number } | Record<string, never> {
  if (q.page === undefined && q.limit === undefined) return {};
  const limit = q.limit ?? 10;
  const page = q.page ?? 1;
  return { skip: (page - 1) * limit, take: limit };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mms/shared build && pnpm --filter @mms/api test -- src/lib/pagination`
Expected: 4 passing. Then `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat: add shared contracts and pagination utilities for domain modules"
```

---

### Task 2: Reference module (roles, branches, offices, office heads)

**Files:**
- Create: `apps/api/src/modules/reference/repository.ts`, `apps/api/src/modules/reference/controller.ts`, `apps/api/src/modules/reference/router.ts`
- Modify: `apps/api/src/app.ts` (mount), `apps/api/src/test/factories.ts` (add `authHeader`, `createTestBranch`)
- Test: `apps/api/src/modules/reference/reference.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `prisma`, factories.
- Produces: `GET /api/roles`, `GET /api/branches`, `GET /api/offices` (embeds `head`), `GET /api/office-heads` — all `{ data, count }`, name-ascending, any authenticated role. Test helpers `authHeader(userId, email, role, branchId?)` and `createTestBranch(name?)` for all later tasks.

- [ ] **Step 1: Extend factories**

Append to `apps/api/src/test/factories.ts`:

```ts
import { signAccessToken } from '../lib/jwt.js';

// Bearer header for an arbitrary identity — no login round-trip needed.
export function authHeader(
  userId: string,
  email: string,
  role: string,
  branchId: string | null = null
): string {
  return `Bearer ${signAccessToken({ sub: userId, email, role, branchId })}`;
}

export async function createTestBranch(name = 'Test Branch') {
  return prisma.branch.create({ data: { name, location: 'Testville' } });
}
```

(Hoist the `signAccessToken` import to the top import block.)

- [ ] **Step 2: Write the failing tests**

`apps/api/src/modules/reference/reference.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

describe('reference module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('GET /api/roles returns { data, count } sorted by name', async () => {
    const { user } = await createTestUser({ role: 'driver' });
    const res = await request(app)
      .get('/api/roles')
      .set('Authorization', authHeader(user.id, user.email, 'driver'));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1); // only the factory-created role exists
    expect(res.body.data[0].name).toBe('driver');
  });

  it('GET /api/branches works for any authenticated role and paginates', async () => {
    const { user } = await createTestUser({ role: 'security_guard' });
    await createTestBranch('Alpha');
    await createTestBranch('Beta');
    const header = authHeader(user.id, user.email, 'security_guard');

    const res = await request(app).get('/api/branches').set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.data.map((b: { name: string }) => b.name)).toEqual(['Alpha', 'Beta']);

    const page2 = await request(app)
      .get('/api/branches?page=2&limit=1')
      .set('Authorization', header);
    expect(page2.body.count).toBe(2); // total, not page size
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.data[0].name).toBe('Beta');
  });

  it('GET /api/offices embeds the office head', async () => {
    const { user } = await createTestUser();
    const branch = await createTestBranch();
    const office = await prisma.departmentOffice.create({
      data: { name: 'Ops', branchId: branch.id }
    });
    const head = await prisma.officeHead.create({
      data: { name: 'Maria', branchId: branch.id, officeId: office.id }
    });
    await prisma.departmentOffice.update({ where: { id: office.id }, data: { headId: head.id } });

    const res = await request(app)
      .get('/api/offices')
      .set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(res.status).toBe(200);
    expect(res.body.data[0].head.name).toBe('Maria');

    const heads = await request(app)
      .get('/api/office-heads')
      .set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(heads.body.count).toBe(1);
  });

  it('rejects unauthenticated requests with 401', async () => {
    for (const path of ['/api/roles', '/api/branches', '/api/offices', '/api/office-heads']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('does NOT hijack unknown /api routes (unauthenticated 404 stays 404)', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail** — `pnpm --filter @mms/api test -- src/modules/reference` → 404s.

- [ ] **Step 4: Implement**

`apps/api/src/modules/reference/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export async function listRoles(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: 'asc' }, ...skipTake }),
    prisma.role.count()
  ]);
  return { data, count };
}

export async function listBranches(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.branch.findMany({ orderBy: { name: 'asc' }, ...skipTake }),
    prisma.branch.count()
  ]);
  return { data, count };
}

export async function listOffices(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.departmentOffice.findMany({
      orderBy: { name: 'asc' },
      include: { head: true },
      ...skipTake
    }),
    prisma.departmentOffice.count()
  ]);
  return { data, count };
}

export async function listOfficeHeads(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.officeHead.findMany({ orderBy: { name: 'asc' }, ...skipTake }),
    prisma.officeHead.count()
  ]);
  return { data, count };
}
```

`apps/api/src/modules/reference/controller.ts`:

```ts
import type { Request, Response } from 'express';
import { paginationQuerySchema } from '@mms/shared';
import { toSkipTake } from '../../lib/pagination.js';
import * as repo from './repository.js';

// Express 5: req.query is read-only — parse here, never in middleware.
function skipTakeFrom(req: Request) {
  return toSkipTake(paginationQuerySchema.parse(req.query));
}

export async function roles(req: Request, res: Response): Promise<void> {
  res.json(await repo.listRoles(skipTakeFrom(req)));
}

export async function branches(req: Request, res: Response): Promise<void> {
  res.json(await repo.listBranches(skipTakeFrom(req)));
}

export async function offices(req: Request, res: Response): Promise<void> {
  res.json(await repo.listOffices(skipTakeFrom(req)));
}

export async function officeHeads(req: Request, res: Response): Promise<void> {
  res.json(await repo.listOfficeHeads(skipTakeFrom(req)));
}
```

`apps/api/src/modules/reference/router.ts` — requireAuth is attached PER ROUTE, never router-wide (the router is mounted at the bare `/api` prefix; a router-wide guard would intercept every later module's routes and turn unknown-route 404s into 401s):

```ts
import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import * as controller from './controller.js';

export const referenceRouter = Router();

referenceRouter.get('/roles', requireAuth, controller.roles);
referenceRouter.get('/branches', requireAuth, controller.branches);
referenceRouter.get('/offices', requireAuth, controller.offices);
referenceRouter.get('/office-heads', requireAuth, controller.officeHeads);
```

In `apps/api/src/app.ts`, mount after the auth router:

```ts
import { referenceRouter } from './modules/reference/router.js';
// ...
  app.use('/api', referenceRouter);
```

- [ ] **Step 5: Run tests to verify they pass** — `pnpm --filter @mms/api test` all green; `pnpm typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat: add reference module (roles, branches, offices, office heads)"
```

---

### Task 3: Users module — list + create (with driver side effect)

**Files:**
- Create: `apps/api/src/modules/users/repository.ts`, `apps/api/src/modules/users/service.ts`, `apps/api/src/modules/users/controller.ts`, `apps/api/src/modules/users/router.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/src/modules/users/users.test.ts`

**Interfaces:**
- Consumes: Plan 2 middleware + uploads (`createUploader('avatars')`), Task 1 contracts, `toSkipTake`, factories.
- Produces: `GET /api/users?role=&page=&limit=` (any role; serves the FE's `getAllAdmins` via `?role=admin`), `POST /api/users` (admin; multipart field `avatar` optional; role=driver creates the linked driver row transactionally). `toUserResponse(user): UserResponse` mapper reused by Task 4.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/users/users.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({ email: 'boss@test.local', role: 'admin' });
  return { admin: user, header: authHeader(user.id, user.email, 'admin') };
}

describe('GET /api/users', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('lists users with their role name and filters by ?role=', async () => {
    const { header } = await adminHeader();
    await createTestUser({ email: 'd1@test.local', role: 'driver' });

    const all = await request(app).get('/api/users').set('Authorization', header);
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(2);

    const admins = await request(app).get('/api/users?role=admin').set('Authorization', header);
    expect(admins.body.count).toBe(1);
    expect(admins.body.data[0]).toMatchObject({ email: 'boss@test.local', role: 'admin' });
  });

  it('paginates with a total count', async () => {
    const { header } = await adminHeader();
    await createTestUser({ email: 'a@test.local', role: 'driver' });
    await createTestUser({ email: 'b@test.local', role: 'driver' });
    const res = await request(app)
      .get('/api/users?page=1&limit=2')
      .set('Authorization', header);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.count).toBe(3);
  });

  it('is readable by non-admin roles (name lookups)', async () => {
    const { user } = await createTestUser({ role: 'security_guard' });
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', authHeader(user.id, user.email, 'security_guard'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/users', () => {
  beforeEach(truncateAll);

  it('creates a user and, for the driver role, the linked driver row', async () => {
    const { header } = await adminHeader();
    const driverRole = await prisma.role.upsert({
      where: { name: 'driver' },
      update: {},
      create: { name: 'driver' }
    });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'newdriver@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'New Driver')
      .field('roleId', driverRole.id);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'newdriver@test.local', role: 'driver' });

    const driver = await prisma.driver.findUnique({ where: { email: 'newdriver@test.local' } });
    expect(driver).not.toBeNull();
    expect(driver?.userId).toBe(res.body.id);
  });

  it('links an existing unlinked personnel record instead of duplicating it', async () => {
    const { header } = await adminHeader();
    const driverRole = await prisma.role.upsert({
      where: { name: 'driver' },
      update: {},
      create: { name: 'driver' }
    });
    const personnel = await prisma.driver.create({
      data: { email: 'vet@test.local', fullName: 'Veteran Driver', status: 'active' }
    });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'vet@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'Veteran Driver')
      .field('roleId', driverRole.id);
    expect(res.status).toBe(201);
    expect(await prisma.driver.count()).toBe(1);
    const linked = await prisma.driver.findUnique({ where: { id: personnel.id } });
    expect(linked?.userId).toBe(res.body.id);

    // a second login for the same (now linked) driver email must conflict
    const again = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'vet2@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'V2')
      .field('roleId', driverRole.id);
    expect(again.status).toBe(201); // different email — fine, creates its own row
  });

  it('does not create a driver row for non-driver roles', async () => {
    const { header } = await adminHeader();
    const role = await prisma.role.upsert({
      where: { name: 'requester' },
      update: {},
      create: { name: 'requester' }
    });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'req@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'Req User')
      .field('roleId', role.id);
    expect(res.status).toBe(201);
    expect(await prisma.driver.count()).toBe(0);
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const { header } = await adminHeader();
    const role = await prisma.role.upsert({
      where: { name: 'requester' },
      update: {},
      create: { name: 'requester' }
    });
    await createTestUser({ email: 'dupe@test.local', role: 'requester' });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'dupe@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'Dupe')
      .field('roleId', role.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects an unknown roleId with 400 INVALID_ROLE', async () => {
    const { header } = await adminHeader();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'x@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'X')
      .field('roleId', '00000000-0000-4000-8000-00000000dead');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ROLE');
  });

  it('rejects non-admin callers with 403', async () => {
    const { user } = await createTestUser({ role: 'driver' });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', authHeader(user.id, user.email, 'driver'))
      .field('email', 'y@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'Y')
      .field('roleId', '00000000-0000-4000-8000-00000000dead');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @mms/api test -- src/modules/users` → 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/users/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

export const userInclude = { userRole: { include: { role: true } } } as const;

export type UserRow = NonNullable<
  Awaited<ReturnType<typeof findUserById>>
>;

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, include: userInclude });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, include: userInclude });
}

export async function listUsers(
  roleName: string | undefined,
  skipTake: { skip: number; take: number } | Record<string, never>
) {
  const where = roleName ? { userRole: { role: { name: roleName } } } : undefined;
  const [data, count] = await Promise.all([
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: { fullName: 'asc' },
      ...skipTake
    }),
    prisma.user.count({ where })
  ]);
  return { data, count };
}
```

`apps/api/src/modules/users/service.ts`:

```ts
import type { CreateUserBody, UserResponse, UsersListQuery } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { hashPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { findUserByEmail, listUsers, userInclude, type UserRow } from './repository.js';

export function toUserResponse(user: UserRow): UserResponse {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    branchId: user.branchId,
    role: user.userRole?.role.name ?? null,
    createdAt: user.createdAt.toISOString()
  };
}

export async function list(query: UsersListQuery) {
  const { data, count } = await listUsers(query.role, toSkipTake(query));
  return { data: data.map(toUserResponse), count };
}

export async function create(
  body: CreateUserBody,
  avatarPath: string | null
): Promise<UserResponse> {
  if (await findUserByEmail(body.email)) {
    throw new AppError(409, 'EMAIL_TAKEN', 'A user with this email already exists');
  }
  const role = await prisma.role.findUnique({ where: { id: body.roleId } });
  if (!role) {
    throw new AppError(400, 'INVALID_ROLE', 'Unknown role');
  }
  const passwordHash = await hashPassword(body.password);

  // Spec §6: creating a driver-role user also gets a linked drivers row —
  // the app's only signup-driven driver-creation path. If a personnel record
  // with this email already exists (created via POST /drivers), LINK it
  // instead of colliding with the drivers.email unique constraint; if it's
  // already linked to another login, that's a conflict. One transaction.
  const existingDriver =
    role.name === 'driver'
      ? await prisma.driver.findUnique({ where: { email: body.email } })
      : null;
  if (existingDriver && existingDriver.userId !== null) {
    throw new AppError(409, 'EMAIL_TAKEN', 'This driver already has a login');
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: body.email,
        passwordHash,
        fullName: body.fullName,
        branchId: body.branchId,
        phone: body.phone,
        address: body.address,
        avatarUrl: avatarPath,
        userRole: { create: { roleId: role.id } }
      },
      include: userInclude
    });
    if (role.name === 'driver') {
      if (existingDriver) {
        await tx.driver.update({
          where: { id: existingDriver.id },
          data: { userId: user.id }
        });
      } else {
        await tx.driver.create({
          data: {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            branchId: user.branchId,
            status: 'active'
          }
        });
      }
    }
    return user;
  });
  return toUserResponse(created);
}
```

`apps/api/src/modules/users/controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateUserBody } from '@mms/shared';
import { usersListQuerySchema } from '@mms/shared';
import { publicUploadPath } from '../../lib/uploads.js';
import * as service from './service.js';

export async function list(req: Request, res: Response): Promise<void> {
  // Express 5: req.query is read-only — parse here, never in middleware.
  const query = usersListQuerySchema.parse(req.query);
  res.json(await service.list(query));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateUserBody;
  const avatarPath = req.file ? publicUploadPath('avatars', req.file.filename) : null;
  res.status(201).json(await service.create(body, avatarPath));
}
```

`apps/api/src/modules/users/router.ts`:

```ts
import { Router } from 'express';
import { USER_ROLES, createUserBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import { createUploader } from '../../lib/uploads.js';
import * as controller from './controller.js';

const avatarUpload = createUploader('avatars');

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get('/', controller.list);
usersRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  avatarUpload.single('avatar'),
  validateBody(createUserBodySchema),
  controller.create
);
```

Mount in `apps/api/src/app.ts`:

```ts
import { usersRouter } from './modules/users/router.js';
// ...
  app.use('/api/users', usersRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full `pnpm --filter @mms/api test` green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add users module with role-filtered list and driver-creating admin signup"
```

---

### Task 4: Users module — update, password change, delete + login timing fix

**Files:**
- Modify: `apps/api/src/modules/users/service.ts`, `apps/api/src/modules/users/controller.ts`, `apps/api/src/modules/users/router.ts`, `apps/api/src/modules/auth/service.ts` (timing fix)
- Test: `apps/api/src/modules/users/users-manage.test.ts`, extend `apps/api/src/modules/auth/auth.test.ts`

**Interfaces:**
- Consumes: Task 3 module, `verifyPassword`/`hashPassword`.
- Produces: `PATCH /api/users/:id` (admin; multipart avatar optional), `PATCH /api/users/:id/password` (self with `currentPassword`, or admin without), `DELETE /api/users/:id` (admin; 400 `CANNOT_DELETE_SELF` on own account). Password change revokes all refresh tokens. Login timing fix: unknown email still runs one bcrypt compare.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/users/users-manage.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({ email: 'boss@test.local', role: 'admin' });
  return { admin: user, header: authHeader(user.id, user.email, 'admin') };
}

describe('PATCH /api/users/:id', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('updates fields and role (admin)', async () => {
    const { header } = await adminHeader();
    const { user } = await createTestUser({ email: 'u@test.local', role: 'requester' });
    const guardRole = await prisma.role.upsert({
      where: { name: 'security_guard' },
      update: {},
      create: { name: 'security_guard' }
    });
    const res = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', header)
      .field('fullName', 'Renamed')
      .field('status', 'inactive')
      .field('roleId', guardRole.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fullName: 'Renamed', status: 'inactive', role: 'security_guard' });
  });

  it('404s on a missing user and 403s for non-admins', async () => {
    const { header } = await adminHeader();
    const miss = await request(app)
      .patch('/api/users/00000000-0000-4000-8000-00000000dead')
      .set('Authorization', header)
      .field('fullName', 'X');
    expect(miss.status).toBe(404);

    const { user } = await createTestUser({ email: 'pleb@test.local', role: 'driver' });
    const forbidden = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', authHeader(user.id, user.email, 'driver'))
      .field('fullName', 'Nope');
    expect(forbidden.status).toBe(403);
  });
});

describe('PATCH /api/users/:id/password', () => {
  beforeEach(truncateAll);

  it('lets a user change their own password with the current one, revoking refresh tokens', async () => {
    const { user, password } = await createTestUser({ email: 'me@test.local', role: 'driver' });
    // create a live refresh token via a real login
    await request(app).post('/api/auth/login').send({ email: user.email, password });
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);

    const res = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', authHeader(user.id, user.email, 'driver'))
      .send({ currentPassword: password, newPassword: 'NewPassword123!' });
    expect(res.status).toBe(204);
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'NewPassword123!' });
    expect(relogin.status).toBe(200);
  });

  it('rejects a wrong current password with 400 INVALID_CURRENT_PASSWORD', async () => {
    const { user } = await createTestUser({ email: 'me@test.local', role: 'driver' });
    const res = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', authHeader(user.id, user.email, 'driver'))
      .send({ currentPassword: 'wrong-password', newPassword: 'NewPassword123!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('lets an admin set another user\'s password without the current one, but not other non-admins', async () => {
    const { header } = await adminHeader();
    const { user } = await createTestUser({ email: 'target@test.local', role: 'driver' });
    const ok = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', header)
      .send({ newPassword: 'AdminSet123!' });
    expect(ok.status).toBe(204);

    const { user: other } = await createTestUser({ email: 'other@test.local', role: 'requester' });
    const forbidden = await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set('Authorization', authHeader(other.id, other.email, 'requester'))
      .send({ newPassword: 'Sneaky123!' });
    expect(forbidden.status).toBe(403);
  });

  it('requires the current password even for an admin changing their OWN password', async () => {
    const { admin, header } = await adminHeader();
    const res = await request(app)
      .patch(`/api/users/${admin.id}/password`)
      .set('Authorization', header)
      .send({ newPassword: 'SneakyRotate123!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });
});

describe('DELETE /api/users/:id', () => {
  beforeEach(truncateAll);

  it('deletes a user (admin) and refuses self-deletion', async () => {
    const { admin, header } = await adminHeader();
    const { user } = await createTestUser({ email: 'bye@test.local', role: 'requester' });

    const res = await request(app).delete(`/api/users/${user.id}`).set('Authorization', header);
    expect(res.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();

    const self = await request(app).delete(`/api/users/${admin.id}`).set('Authorization', header);
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('CANNOT_DELETE_SELF');
  });
});
```

Append to `apps/api/src/modules/auth/auth.test.ts` (inside the login describe):

```ts
  it('takes a comparable time for unknown email vs wrong password (dummy hash compare)', async () => {
    await createTestUser({ email: 'timing@test.local' });
    // Behavioral assertion only: both paths 401 INVALID_CREDENTIALS.
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'Password123!' });
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'timing@test.local', password: 'not-the-password' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });
```

- [ ] **Step 2: Run to verify failure** — new routes 404, timing test passes trivially (guards behavior, not timing — acceptable).

- [ ] **Step 3: Implement**

Append to `apps/api/src/modules/users/service.ts` (hoist new imports):

```ts
import type { ChangePasswordBody, UpdateUserBody } from '@mms/shared';
import { verifyPassword } from '../../lib/password.js';
import { findUserById } from './repository.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';

export async function update(
  id: string,
  body: UpdateUserBody,
  avatarPath: string | null
): Promise<UserResponse> {
  const existing = await findUserById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (body.roleId) {
    const role = await prisma.role.findUnique({ where: { id: body.roleId } });
    if (!role) throw new AppError(400, 'INVALID_ROLE', 'Unknown role');
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (body.roleId) {
      // upsert: a role-less user (403 NO_ROLE on login) must be repairable here
      await tx.userRole.upsert({
        where: { userId: id },
        update: { roleId: body.roleId },
        create: { userId: id, roleId: body.roleId }
      });
    }
    return tx.user.update({
      where: { id },
      data: {
        fullName: body.fullName,
        status: body.status,
        branchId: body.branchId,
        phone: body.phone,
        address: body.address,
        ...(avatarPath ? { avatarUrl: avatarPath } : {})
      },
      include: userInclude
    });
  });
  return toUserResponse(updated);
}

export async function changePassword(
  actor: AuthenticatedUser,
  targetId: string,
  body: ChangePasswordBody
): Promise<void> {
  if (actor.id !== targetId && actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'You may only change your own password');
  }
  const target = await findUserById(targetId);
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');

  // Changing YOUR OWN password always requires the current one — admins
  // included (a hijacked admin session must not be able to lock out the
  // owner). Only admin-changes-ANOTHER-user skips it. NOT 401: the FE client
  // treats 401 as an expired access token and would force a logout loop.
  if (actor.id === targetId) {
    if (!body.currentPassword || !(await verifyPassword(body.currentPassword, target.passwordHash))) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    }
  }
  const passwordHash = await hashPassword(body.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: targetId }, data: { passwordHash } }),
    // Force re-login everywhere: a changed password invalidates all sessions.
    prisma.refreshToken.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
  ]);
}

export async function remove(actor: AuthenticatedUser, id: string): Promise<void> {
  if (actor.id === id) {
    throw new AppError(400, 'CANNOT_DELETE_SELF', 'You cannot delete your own account');
  }
  const existing = await findUserById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'User not found');
  try {
    await prisma.user.delete({ where: { id } });
  } catch (err) {
    // Required FKs (fuel_allocations.requested_by, completion logs) RESTRICT
    // deletion — surface a domain error instead of a 500.
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2003'
    ) {
      throw new AppError(409, 'USER_IN_USE', 'User is referenced by existing records; deactivate instead');
    }
    throw err;
  }
}
```

Append to `apps/api/src/modules/users/controller.ts` (hoist imports):

```ts
import type { ChangePasswordBody, UpdateUserBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';

function requireUser(req: Request) {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.user;
}

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

export async function update(req: Request, res: Response): Promise<void> {
  const avatarPath = req.file ? publicUploadPath('avatars', req.file.filename) : null;
  res.json(await service.update(requireIdParam(req), req.body as UpdateUserBody, avatarPath));
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  await service.changePassword(requireUser(req), requireIdParam(req), req.body as ChangePasswordBody);
  res.status(204).end();
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireUser(req), requireIdParam(req));
  res.status(204).end();
}
```

Append to `apps/api/src/modules/users/router.ts`:

```ts
import { changePasswordBodySchema, updateUserBodySchema } from '@mms/shared';

usersRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  avatarUpload.single('avatar'),
  validateBody(updateUserBodySchema),
  controller.update
);
usersRouter.patch(
  '/:id/password',
  validateBody(changePasswordBodySchema),
  controller.changePassword
);
usersRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
```

(Merge the `@mms/shared` imports into one statement. NOTE: `/:id/password` must be declared BEFORE `/:id` in the file, or Express 5 will match `PATCH /users/:id` first? No — distinct paths don't conflict; order between them is irrelevant here. Declare in the order shown.)

**Login timing fix** — in `apps/api/src/modules/auth/service.ts`, replace the login lookup block:

```ts
// A valid bcrypt hash of a throwaway string; used so unknown emails still
// cost one bcrypt compare (timing-side-channel hardening).
const DUMMY_PASSWORD_HASH = '<GENERATED>';

export async function login(email: string, password: string): Promise<AuthResult> {
  const user = await findUserByEmail(email);
  if (!user) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const role = assertUsable(user);
  return issuePair(user, role);
}
```

Generate the real hash for `<GENERATED>` (run in `apps/api/` — bcryptjs 2.x is CJS/UMD, so use the default export via dynamic import):

```bash
node -e "import('bcryptjs').then(b => b.default.hash('dummy-timing-pad', 12).then(console.log))"
```

Paste the printed `$2...` string as the `DUMMY_PASSWORD_HASH` literal.

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add user management (update, password change, delete) and login timing fix"
```

---

### Task 5: Drivers module (CRUD)

**Files:**
- Create: `apps/api/src/modules/drivers/repository.ts`, `apps/api/src/modules/drivers/service.ts`, `apps/api/src/modules/drivers/controller.ts`, `apps/api/src/modules/drivers/router.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/src/modules/drivers/drivers.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, pagination, middleware, factories.
- Produces: `GET /api/drivers?page=&limit=` (any role; `{ data, count }`, fullName asc), `GET /api/drivers/:id`, `POST /api/drivers` (admin), `PATCH /api/drivers/:id` (admin), `DELETE /api/drivers/:id` (admin). Drivers here are personnel records; `userId` stays null unless created via `POST /users` (Task 3).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/drivers/drivers.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({ email: 'boss@test.local', role: 'admin' });
  return authHeader(user.id, user.email, 'admin');
}

describe('drivers module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates, reads, updates, and deletes a driver (admin)', async () => {
    const header = await adminHeader();

    const created = await request(app)
      .post('/api/drivers')
      .set('Authorization', header)
      .send({
        email: 'pilot@test.local',
        fullName: 'Pilot One',
        licenseNumber: 'N01-23-456789',
        licenseExpiry: '2027-06-30',
        status: 'active'
      });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const fetched = await request(app).get(`/api/drivers/${id}`).set('Authorization', header);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toMatchObject({ email: 'pilot@test.local', fullName: 'Pilot One' });

    const updated = await request(app)
      .patch(`/api/drivers/${id}`)
      .set('Authorization', header)
      .send({ status: 'on_trip', notes: 'Long haul' });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('on_trip');

    const removed = await request(app).delete(`/api/drivers/${id}`).set('Authorization', header);
    expect(removed.status).toBe(204);
    expect(await prisma.driver.count()).toBe(0);
  });

  it('lists with pagination and total count, readable by any role', async () => {
    const { user } = await createTestUser({ role: 'evp_operations' });
    const header = authHeader(user.id, user.email, 'evp_operations');
    for (const n of ['Alpha', 'Bravo', 'Charlie']) {
      await prisma.driver.create({
        data: { email: `${n.toLowerCase()}@test.local`, fullName: n, status: 'active' }
      });
    }
    const res = await request(app)
      .get('/api/drivers?page=2&limit=2')
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].fullName).toBe('Charlie');
  });

  it('404s on a missing driver and 403s writes for non-admins', async () => {
    const header = await adminHeader();
    const miss = await request(app)
      .get('/api/drivers/00000000-0000-4000-8000-00000000dead')
      .set('Authorization', header);
    expect(miss.status).toBe(404);

    const { user } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const forbidden = await request(app)
      .post('/api/drivers')
      .set('Authorization', authHeader(user.id, user.email, 'security_guard'))
      .send({ email: 'x@test.local', fullName: 'X' });
    expect(forbidden.status).toBe(403);
  });

  it('rejects a duplicate driver email with 409 EMAIL_TAKEN', async () => {
    const header = await adminHeader();
    await prisma.driver.create({
      data: { email: 'dupe@test.local', fullName: 'Dupe', status: 'active' }
    });
    const res = await request(app)
      .post('/api/drivers')
      .set('Authorization', header)
      .send({ email: 'dupe@test.local', fullName: 'Dupe Two' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('scopes driver-role callers to their own row (spec §5 matrix)', async () => {
    const { user } = await createTestUser({ email: 'wheel@test.local', role: 'driver' });
    const mine = await prisma.driver.create({
      data: { email: 'wheel@test.local', fullName: 'Wheel Man', status: 'active', userId: user.id }
    });
    const other = await prisma.driver.create({
      data: { email: 'other@test.local', fullName: 'Other Driver', status: 'active' }
    });
    const header = authHeader(user.id, user.email, 'driver');

    const listRes = await request(app).get('/api/drivers').set('Authorization', header);
    expect(listRes.body.count).toBe(1);
    expect(listRes.body.data[0].id).toBe(mine.id);

    const own = await request(app).get(`/api/drivers/${mine.id}`).set('Authorization', header);
    expect(own.status).toBe(200);

    const foreign = await request(app).get(`/api/drivers/${other.id}`).set('Authorization', header);
    expect(foreign.status).toBe(404); // not-found masking
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/drivers/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

export function findDriverById(id: string) {
  return prisma.driver.findUnique({ where: { id } });
}

export function findDriverByEmail(email: string) {
  return prisma.driver.findUnique({ where: { email } });
}

export async function listDrivers(
  skipTake: { skip: number; take: number } | Record<string, never>,
  onlyUserId?: string
) {
  // Spec §5 matrix: driver-role callers see only their own personnel row.
  const where = onlyUserId ? { userId: onlyUserId } : undefined;
  const [data, count] = await Promise.all([
    prisma.driver.findMany({ where, orderBy: { fullName: 'asc' }, ...skipTake }),
    prisma.driver.count({ where })
  ]);
  return { data, count };
}
```

`apps/api/src/modules/drivers/service.ts`:

```ts
import type { CreateDriverBody, PaginationQuery, UpdateDriverBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findDriverByEmail, findDriverById, listDrivers } from './repository.js';

export async function list(query: PaginationQuery, actor: AuthenticatedUser) {
  // Driver-role callers are scoped to their own row (spec §5 matrix).
  const onlyUserId = actor.role === 'driver' ? actor.id : undefined;
  return listDrivers(toSkipTake(query), onlyUserId);
}

export async function getById(id: string, actor: AuthenticatedUser) {
  const driver = await findDriverById(id);
  // Not-found masking: a driver probing someone else's id learns nothing.
  if (!driver || (actor.role === 'driver' && driver.userId !== actor.id)) {
    throw new AppError(404, 'NOT_FOUND', 'Driver not found');
  }
  return driver;
}

// Admin-only paths skip the driver-role scoping.
async function mustExist(id: string) {
  const driver = await findDriverById(id);
  if (!driver) throw new AppError(404, 'NOT_FOUND', 'Driver not found');
  return driver;
}

export async function create(body: CreateDriverBody) {
  if (await findDriverByEmail(body.email)) {
    throw new AppError(409, 'EMAIL_TAKEN', 'A driver with this email already exists');
  }
  return prisma.driver.create({ data: body });
}

export async function update(id: string, body: UpdateDriverBody) {
  await mustExist(id);
  if (body.email) {
    const clash = await findDriverByEmail(body.email);
    if (clash && clash.id !== id) {
      throw new AppError(409, 'EMAIL_TAKEN', 'A driver with this email already exists');
    }
  }
  return prisma.driver.update({ where: { id }, data: body });
}

export async function remove(id: string): Promise<void> {
  await mustExist(id);
  await prisma.driver.delete({ where: { id } });
}
```

`apps/api/src/modules/drivers/controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateDriverBody, UpdateDriverBody } from '@mms/shared';
import { paginationQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

function requireUser(req: Request) {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.user;
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(paginationQuerySchema.parse(req.query), requireUser(req)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req), requireUser(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateDriverBody));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireIdParam(req), req.body as UpdateDriverBody));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
```

`apps/api/src/modules/drivers/router.ts`:

```ts
import { Router } from 'express';
import { USER_ROLES, createDriverBodySchema, updateDriverBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const driversRouter = Router();

driversRouter.use(requireAuth);
driversRouter.get('/', controller.list);
driversRouter.get('/:id', controller.getById);
driversRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  validateBody(createDriverBodySchema),
  controller.create
);
driversRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  validateBody(updateDriverBodySchema),
  controller.update
);
driversRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
```

Mount in `apps/api/src/app.ts`:

```ts
import { driversRouter } from './modules/drivers/router.js';
// ...
  app.use('/api/drivers', driversRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add drivers module with paginated CRUD"
```

---

### Task 6: Sweep + docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README** — extend the API section with one table row (or line) per new endpoint group: reference reads (`/api/roles`, `/api/branches`, `/api/offices`, `/api/office-heads`), users (`GET/POST /api/users`, `PATCH /api/users/:id`, `PATCH /api/users/:id/password`, `DELETE /api/users/:id`; role filter `?role=`; multipart `avatar`), drivers CRUD. Note the pagination convention once (`?page`/`?limit`, `{ data, count }`, omit both for the full set).

- [ ] **Step 2: Full sweep**

```bash
pnpm build && pnpm typecheck && pnpm --filter @mms/api test
pnpm --filter @mms/api start   # background
curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@mms.local","password":"Password123!"}'
# capture accessToken, then:
curl -s http://localhost:3000/api/users?role=admin -H "Authorization: Bearer <token>"   # expect the seeded admin
curl -s http://localhost:3000/api/drivers -H "Authorization: Bearer <token>"            # expect 5 seeded drivers
# kill the server
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document reference, users, and drivers endpoints"
```

---

## Self-Review Notes

- Spec coverage: §6 roles/branches/offices rows ✔ (Task 2), users row incl. `?role=` filter + driver side effect + password endpoint ✔ (Tasks 3–4), drivers row ✔ (Task 5); §5 role matrix (reads any-auth, writes admin, password self-or-admin) ✔; deferred P2 timing fix ✔ (Task 4).
- Type consistency: `toUserResponse`/`UserRow` defined Task 3, reused Task 4; `authHeader`/`createTestBranch` defined Task 2, used Tasks 3–5; error codes match the Global Constraints list.
- Express 5 `req.query` read-only pitfall documented and respected (controller-side parsing only).
- No new tables → no `TABLES` list change (checklist per P2 final review satisfied trivially).
