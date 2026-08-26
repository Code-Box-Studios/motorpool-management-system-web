# Admin-Managed Organization Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin add, edit, archive and restore branches, department offices and office heads from inside the app, instead of those rows being writable only by `prisma/seed.ts`.

**Architecture:** The three tables already exist with read-only list endpoints. We add an `archived_at` column to each, a new `organization` API module holding the write endpoints plus the three migrated GET handlers, and a shared in-use guard that refuses an archive while anything live still points at the record. List endpoints exclude archived rows by default, which removes them from every existing dropdown without touching those files.

**Tech Stack:** Express 5, Prisma 6, PostgreSQL, Zod (via `@mms/shared`), Vitest + supertest, React 19, TanStack Router/Query, Playwright.

**Design spec:** `docs/superpowers/specs/2026-08-26-admin-managed-organization-reference-design.md` — section references below (§4, §5.1) point at it.

## Global Constraints

- **`noUncheckedIndexedAccess: true`** in `apps/api/tsconfig.json`. Any indexed access (`arr[0]`, `counts[i]`) is typed `T | undefined` in the API package. It is NOT set in `apps/web`.
- **API tests run under `TZ: 'UTC'`** (pinned in `apps/api/vitest.config.ts`). Do not remove it.
- **Rebuild shared before typechecking the API** whenever `packages/shared` changes: `pnpm --filter @mms/shared build`. The API imports `@mms/shared` from its built output, so a contract change is invisible until it is rebuilt.
- **Archive only.** No `DELETE` endpoint for branches, offices or office heads, ever. `trip_tickets.branch_id` and `job_orders.branch_id` are NOT NULL.
- **"Live" excludes history.** Trip tickets in `completed`, `cancelled` or `disapproved` must never block an archive.
- **Uniqueness is case-insensitive and spans archived rows.**
- **Reads stay `requireAuth` only; every write is `requireRole(USER_ROLES.admin)`.**
- **Postgres enums are out of scope.** Do not add, rename or remove any enum value.
- **Run Prettier on every code file you touch** (`npx prettier --write <file>`). Do not reformat files you did not otherwise change. Do not format `apps/api/prisma/seed.ts` — it has never been formatted and would produce an ~800-line diff.
- **Never add a `Co-Authored-By: Claude` trailer or any AI attribution to a commit message. Never run `git push`.**

---

## File Structure

**Create**

| File | Responsibility |
| --- | --- |
| `apps/api/prisma/migrations/<timestamp>_add_org_archive/migration.sql` | `archived_at` columns + two case-insensitive unique indexes |
| `packages/shared/src/contracts/organization.ts` | Zod bodies and list query for the three resources |
| `apps/api/src/lib/org-refs.ts` | `assertOrgRefsActive` — the archived-parent check, used by four other modules |
| `apps/api/src/modules/organization/guard.ts` | Blocker counting per resource + `assertArchivable` |
| `apps/api/src/modules/organization/repository.ts` | Prisma queries |
| `apps/api/src/modules/organization/service.ts` | Create / update / archive / restore / list for all three |
| `apps/api/src/modules/organization/controller.ts` | Request parsing, status codes |
| `apps/api/src/modules/organization/router.ts` | Routes + auth gates |
| `apps/api/src/modules/organization/guard.test.ts` | Unit tests for the blocker matrix |
| `apps/api/src/modules/organization/branches.test.ts` | Branch endpoint tests |
| `apps/api/src/modules/organization/offices.test.ts` | Office + office-head endpoint tests |
| `apps/api/src/modules/organization/enforcement.test.ts` | §5.7 cross-module archived-parent rejection |
| `apps/web/src/lib/api/organization.ts` | Fetchers and mutators |
| `apps/web/src/lib/query/organization.ts` | `includeArchived` query hooks |
| `apps/web/src/lib/mutation/organization.ts` | Create / update / archive / restore mutations |
| `apps/web/src/routes/_authenticated/organization.tsx` | Route + sidebar `staticData` |
| `apps/web/src/components/pages/organization/index.tsx` | Tab shell |
| `apps/web/src/components/pages/organization/resource-tab.tsx` | One generic table used by all three tabs |
| `apps/web/src/components/pages/organization/record-dialog.tsx` | Add/Edit form dialog |
| `apps/web/src/components/pages/organization/archive-dialog.tsx` | Archive confirm + blocked-archive renderer |
| `apps/web/e2e/organization.spec.ts` | End-to-end |

**Modify**

| File | Change |
| --- | --- |
| `apps/api/prisma/schema.prisma` | `archivedAt` on 3 models + index NOTE comments |
| `packages/shared/src/enums.ts` | Add `LIVE_TRIP_STATUSES` |
| `packages/shared/src/index.ts` | Export the new contracts file |
| `apps/api/src/modules/trip-tickets/service.ts` | Import `LIVE_TRIP_STATUSES`; call `assertOrgRefsActive` |
| `apps/api/src/modules/users/service.ts` | Call `assertOrgRefsActive` |
| `apps/api/src/modules/vehicles/service.ts` | Call `assertOrgRefsActive` |
| `apps/api/src/modules/drivers/service.ts` | Call `assertOrgRefsActive` |
| `apps/api/src/modules/reference/{router,controller,repository}.ts` | Drop branches/offices/office-heads; keep roles |
| `apps/api/src/app.ts` | Mount `organizationRouter` |
| `apps/api/src/test/factories.ts` | Add vehicle/driver/ticket/office/head factories |
| `apps/web/src/lib/api/client.ts` | `ApiError` carries `details` |
| `apps/web/src/lib/types/supabase.ts` | `archived_at` on 3 table types |
| `apps/web/src/lib/api/shared.ts` | `getAllBranches` accepts `includeArchived` |

---

## Task 1: Schema, migration, and shared contracts

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_org_archive/migration.sql`
- Modify: `packages/shared/src/enums.ts`
- Create: `packages/shared/src/contracts/organization.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/modules/trip-tickets/service.ts:87` (remove the local const, import instead)

**Interfaces:**
- Produces: `LIVE_TRIP_STATUSES` (readonly tuple of 4 status strings), `organizationListQuerySchema`, `createBranchBodySchema`, `updateBranchBodySchema`, `createOfficeBodySchema`, `updateOfficeBodySchema`, `createOfficeHeadBodySchema`, `updateOfficeHeadBodySchema`, and their inferred types. Prisma models gain `archivedAt: Date | null`.

- [ ] **Step 1: Add `archivedAt` to the three Prisma models**

In `apps/api/prisma/schema.prisma`, add the field to `Branch`, `DepartmentOffice` and `OfficeHead`, immediately after `updatedAt` in each. Add the NOTE comments so the raw-SQL indexes are discoverable from the schema — this mirrors how `tracker_devices_active_vehicle_unique` is documented today.

```prisma
model Branch {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  location  String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")
  // NULL means active. Set by POST /branches/:id/archive, cleared by /restore.
  archivedAt DateTime? @map("archived_at")

  // ... existing relations unchanged ...

  // NOTE: case-insensitive unique index branches_name_lower_unique (lower(name))
  // is added via migration, not expressible in Prisma schema.
  @@map("branches")
}
```

`DepartmentOffice` gets the same `archivedAt` line plus:

```prisma
  // NOTE: case-insensitive unique index
  // department_offices_branch_name_lower_unique (branch_id, lower(name)) is
  // added via migration, not expressible in Prisma schema.
```

`OfficeHead` gets only the `archivedAt` line — office heads are people, and duplicate names are legitimate (§4.2).

- [ ] **Step 2: Generate the migration folder without applying it**

```bash
pnpm --filter @mms/api exec prisma migrate dev --create-only --name add_org_archive
```

**Warning:** if `prisma migrate dev` reports drift and offers to **reset**, decline. Against the shared Neon dev database a reset is data loss for the whole team. Drift here is most likely the orphaned `20260820100000_notification_type_trip_date_cancelled` row documented in `docs/multi-date-trip-tickets-rollout.md` §1.1 — delete that row and retry.

- [ ] **Step 3: Append the two functional unique indexes to the generated SQL**

Prisma will have written the three `ALTER TABLE` statements. Append to the same `migration.sql`:

```sql
-- Case-insensitive uniqueness. Prisma cannot express a functional index in
-- schema.prisma, so these are hand-written. They span archived rows on
-- purpose: restoring an archived "North Branch" must not collide with a new
-- one, and reusing the name would make the archived row ambiguous in
-- historical trip tickets.
CREATE UNIQUE INDEX "branches_name_lower_unique"
  ON "branches" (lower("name"));

CREATE UNIQUE INDEX "department_offices_branch_name_lower_unique"
  ON "department_offices" ("branch_id", lower("name"));
```

- [ ] **Step 4: Apply the migration**

```bash
pnpm --filter @mms/api exec prisma migrate dev
```

Expected: applies cleanly. If either `CREATE UNIQUE INDEX` fails with "could not create unique index", the database already holds a case-insensitive duplicate. That is the migration doing its job — do not weaken the index. Find the duplicates and resolve them first:

```sql
SELECT lower(name), count(*) FROM branches GROUP BY 1 HAVING count(*) > 1;
SELECT branch_id, lower(name), count(*) FROM department_offices GROUP BY 1, 2 HAVING count(*) > 1;
```

- [ ] **Step 5: Add `LIVE_TRIP_STATUSES` to shared enums**

Append to `packages/shared/src/enums.ts`:

```ts
// A trip that has not reached a terminal state still holds its vehicle and its
// driver. Completed / cancelled / disapproved trips release both.
//
// Lives here rather than in trip-tickets because the organization module's
// archive guard needs the identical list, and two copies of "which statuses
// still hold a resource" would drift silently — an archive that wrongly
// succeeds strands a van.
export const LIVE_TRIP_STATUSES = [
  'pending_admin_approval',
  'pending_fuel_allocation_approval',
  'approved',
  'in_progress'
] as const;
```

Named `LIVE_TRIP_STATUSES`, not `LIVE_STATUSES` as the spec §5.5 called it: `packages/shared/src/index.ts` re-exports every module flat, so a bare `LIVE_STATUSES` would be ambiguous in that namespace.

- [ ] **Step 6: Replace the local const in trip-tickets**

In `apps/api/src/modules/trip-tickets/service.ts`, delete the `LIVE_STATUSES` const and its comment at line 87, add `LIVE_TRIP_STATUSES` to the existing `@mms/shared` import, and update its one use site (around line 234) from `[...LIVE_STATUSES]` to `[...LIVE_TRIP_STATUSES]`.

- [ ] **Step 7: Write the contracts file**

Create `packages/shared/src/contracts/organization.ts`:

```ts
import { z } from 'zod';
import {
  booleanFromString,
  nullableString,
  nullableUuid,
  paginationQuerySchema
} from './common.js';

// ?includeArchived=true is used ONLY by the admin Organization page. Every
// other caller gets active records, which is what removes archived rows from
// every dropdown in the app without touching those call sites.
export const organizationListQuerySchema = paginationQuerySchema.extend({
  includeArchived: booleanFromString.optional()
});
export type OrganizationListQuery = z.infer<typeof organizationListQuerySchema>;

export const createBranchBodySchema = z.object({
  name: z.string().min(1),
  location: nullableString
});
export type CreateBranchBody = z.infer<typeof createBranchBodySchema>;

export const updateBranchBodySchema = createBranchBodySchema.partial();
export type UpdateBranchBody = z.infer<typeof updateBranchBodySchema>;

export const createOfficeBodySchema = z.object({
  name: z.string().min(1),
  branchId: nullableUuid,
  headId: nullableUuid
});
export type CreateOfficeBody = z.infer<typeof createOfficeBodySchema>;

export const updateOfficeBodySchema = createOfficeBodySchema.partial();
export type UpdateOfficeBody = z.infer<typeof updateOfficeBodySchema>;

export const createOfficeHeadBodySchema = z.object({
  name: z.string().min(1),
  branchId: nullableUuid,
  officeId: nullableUuid
});
export type CreateOfficeHeadBody = z.infer<typeof createOfficeHeadBodySchema>;

export const updateOfficeHeadBodySchema = createOfficeHeadBodySchema.partial();
export type UpdateOfficeHeadBody = z.infer<typeof updateOfficeHeadBodySchema>;
```

`archivedAt` appears in no schema. Archive state changes only through the two dedicated endpoints, so it can never be smuggled in through a `PATCH` and bypass the guard (§6).

- [ ] **Step 8: Export it**

Add to `packages/shared/src/index.ts`, after the `notifications` line:

```ts
export * from './contracts/organization.js';
```

- [ ] **Step 9: Build shared and typecheck**

```bash
pnpm --filter @mms/shared build
pnpm --filter @mms/api typecheck
```

Expected: both clean. If the API typecheck reports `LIVE_TRIP_STATUSES` is not exported, the shared build did not run — rerun it.

- [ ] **Step 10: Run the trip-ticket suites to prove the const move is inert**

```bash
pnpm --filter @mms/api exec vitest run src/modules/trip-tickets
```

Expected: PASS, unchanged count. This is a pure rename — any failure means the use site was missed or mistyped.

- [ ] **Step 11: Commit**

```bash
git add apps/api/prisma packages/shared apps/api/src/modules/trip-tickets/service.ts
git commit -m "feat(api): add archived_at to org reference tables and promote LIVE_TRIP_STATUSES"
```

---

## Task 2: The in-use guard

The heart of the feature. Get this wrong and an archive either strands a van or is impossible.

**Files:**
- Create: `apps/api/src/lib/org-refs.ts`
- Create: `apps/api/src/modules/organization/guard.ts`
- Create: `apps/api/src/modules/organization/guard.test.ts`
- Modify: `apps/api/src/test/factories.ts`

**Interfaces:**
- Consumes: `LIVE_TRIP_STATUSES` from `@mms/shared` (Task 1); `AppError` from `../../lib/errors.js`; `prisma` from `../../lib/prisma.js`.
- Produces:
  - `interface Blocker { resource: string; count: number }`
  - `branchBlockers(id: string): Promise<Blocker[]>`
  - `officeBlockers(id: string): Promise<Blocker[]>`
  - `officeHeadBlockers(id: string): Promise<Blocker[]>`
  - `assertArchivable(name: string, blockers: Blocker[]): void`
  - `assertOrgRefsActive(refs: OrgRefs): Promise<void>` from `lib/org-refs.ts`, where `OrgRefs = { branchId?: string | null; officeId?: string | null; officeHeadId?: string | null }`
- Test factories produced: `createTestVehicle`, `createTestDriver`, `createTestOffice`, `createTestOfficeHead`, `createTestTicket`.

- [ ] **Step 1: Add the test factories**

Append to `apps/api/src/test/factories.ts`:

```ts
// Minimal valid vehicle. Every required column gets a value; callers override
// what their test is actually about.
export async function createTestVehicle(
  branchId: string,
  overrides: Partial<{ licensePlate: string; vin: string }> = {}
) {
  return prisma.vehicle.create({
    data: {
      make: 'Toyota',
      model: 'Hiace',
      year: 2021,
      vin: overrides.vin ?? 'JT-VIN-GUARD',
      licensePlate: overrides.licensePlate ?? 'GRD-0001',
      capacity: 12,
      fuelType: 'diesel',
      mileage: 1000,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-03-01'),
      branchId
    }
  });
}

export async function createTestDriver(
  branchId: string,
  status: 'active' | 'inactive' | 'on_trip' = 'active',
  email = 'driver.guard@test.local'
) {
  return prisma.driver.create({
    data: { email, fullName: 'Guard Driver', status, branchId }
  });
}

export async function createTestOffice(branchId: string, name = 'Ops') {
  return prisma.departmentOffice.create({ data: { name, branchId } });
}

export async function createTestOfficeHead(
  branchId: string,
  officeId: string | null = null,
  name = 'Maria Santos'
) {
  return prisma.officeHead.create({ data: { name, branchId, officeId } });
}

// `preparedBy` is required with no default in schema.prisma — omitting it
// throws at runtime, not at typecheck.
export async function createTestTicket(opts: {
  branchId: string;
  driverId: string;
  vehicleId: string;
  status?: 'pending_admin_approval' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
  officeId?: string | null;
  officeHeadId?: string | null;
}) {
  return prisma.tripTicket.create({
    data: {
      branchId: opts.branchId,
      driverId: opts.driverId,
      vehicleId: opts.vehicleId,
      officeId: opts.officeId ?? null,
      officeHeadId: opts.officeHeadId ?? null,
      destination: 'Somewhere',
      purpose: 'Testing',
      dateRequested: new Date('2026-08-26'),
      preparedBy: 'Test',
      status: opts.status ?? 'approved'
    }
  });
}
```

- [ ] **Step 2: Write the failing guard tests**

Create `apps/api/src/modules/organization/guard.test.ts`. Every blocker in spec §5.1–5.3 needs a positive case AND its non-blocking counterpart — the negatives are the ones that cannot be verified by reading the code, and the archived-child negative is the one that would deadlock the whole feature if it regressed.

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import {
  createTestBranch,
  createTestDriver,
  createTestOffice,
  createTestOfficeHead,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import { branchBlockers, officeBlockers, officeHeadBlockers } from './guard.js';

// Blockers are returned as a list; tests care about which resources appear.
function names(blockers: { resource: string }[]) {
  return blockers.map((b) => b.resource).sort();
}

describe('organization archive guard', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('reports no blockers for an untouched branch', async () => {
    const branch = await createTestBranch('Empty');
    expect(await branchBlockers(branch.id)).toEqual([]);
  });

  it('blocks on a vehicle, whatever its status', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: 'out_of_service' }
    });
    // A van is a physical object. An out-of-service one is still parked at the
    // depot, so it blocks where an inactive DRIVER would not.
    expect(names(await branchBlockers(branch.id))).toEqual(['vehicles']);
  });

  it('blocks on an active driver but NOT an inactive one', async () => {
    const branch = await createTestBranch();
    await createTestDriver(branch.id, 'active', 'active@test.local');
    expect(names(await branchBlockers(branch.id))).toContain('drivers');

    await prisma.driver.deleteMany({});
    await createTestDriver(branch.id, 'inactive', 'gone@test.local');
    expect(await branchBlockers(branch.id)).toEqual([]);
  });

  it('blocks on an active user but NOT an inactive one', async () => {
    const branch = await createTestBranch();
    await createTestUser({ email: 'live@test.local', branchId: branch.id });
    expect(names(await branchBlockers(branch.id))).toContain('users');

    await prisma.user.updateMany({ data: { status: 'inactive' } });
    expect(await branchBlockers(branch.id)).toEqual([]);
  });

  it('blocks on an ACTIVE child office but NOT an archived one', async () => {
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    expect(names(await branchBlockers(branch.id))).toContain(
      'departmentOffices'
    );

    // The load-bearing case. Offices can only be archived, never deleted, so
    // if an archived office still blocked its branch, no branch could ever be
    // emptied and archiving would deadlock on its first real use.
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { archivedAt: new Date() }
    });
    expect(await branchBlockers(branch.id)).toEqual([]);
  });

  it('blocks on an ACTIVE child office head but NOT an archived one', async () => {
    const branch = await createTestBranch();
    const head = await createTestOfficeHead(branch.id);
    expect(names(await branchBlockers(branch.id))).toContain('officeHeads');

    await prisma.officeHead.update({
      where: { id: head.id },
      data: { archivedAt: new Date() }
    });
    expect(await branchBlockers(branch.id)).toEqual([]);
  });

  it('blocks on a live trip ticket but NOT a completed one', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id, 'inactive');
    const ticket = await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      status: 'approved'
    });
    expect(names(await branchBlockers(branch.id))).toContain('tripTickets');

    // History must never block: a branch with hundreds of finished trips has
    // to stay closable.
    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { status: 'completed' }
    });
    expect(names(await branchBlockers(branch.id))).not.toContain('tripTickets');
  });

  it('blocks on an open job order but NOT a repaired one', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const order = await prisma.jobOrder.create({
      data: { vehicleId: vehicle.id, branchId: branch.id, status: 'pending' }
    });
    expect(names(await branchBlockers(branch.id))).toContain('jobOrders');

    await prisma.jobOrder.update({
      where: { id: order.id },
      data: { status: 'repaired' }
    });
    expect(names(await branchBlockers(branch.id))).not.toContain('jobOrders');
  });

  it('counts each blocker so the dialog can name numbers', async () => {
    const branch = await createTestBranch();
    await createTestVehicle(branch.id, { vin: 'V1', licensePlate: 'P1' });
    await createTestVehicle(branch.id, { vin: 'V2', licensePlate: 'P2' });
    const blockers = await branchBlockers(branch.id);
    expect(blockers).toContainEqual({ resource: 'vehicles', count: 2 });
  });

  it('blocks an office on its active heads and live tickets only', async () => {
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id);
    expect(names(await officeBlockers(office.id))).toEqual(['officeHeads']);

    await prisma.officeHead.update({
      where: { id: head.id },
      data: { archivedAt: new Date() }
    });
    expect(await officeBlockers(office.id)).toEqual([]);

    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id, 'inactive');
    await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      officeId: office.id,
      status: 'in_progress'
    });
    expect(names(await officeBlockers(office.id))).toEqual(['tripTickets']);
  });

  it('blocks an office head on the office it heads and live tickets only', async () => {
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id);
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { headId: head.id }
    });
    expect(names(await officeHeadBlockers(head.id))).toEqual([
      'departmentOffices'
    ]);

    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { archivedAt: new Date() }
    });
    expect(await officeHeadBlockers(head.id)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
pnpm --filter @mms/api exec vitest run src/modules/organization/guard.test.ts
```

Expected: FAIL — `Failed to resolve import "./guard.js"`.

- [ ] **Step 4: Write the guard**

Create `apps/api/src/modules/organization/guard.ts`:

```ts
import { LIVE_TRIP_STATUSES } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

export interface Blocker {
  resource: string;
  count: number;
}

// Resolve a set of counts in parallel and keep only the non-zero ones, so the
// error payload names exactly what the admin has to deal with and nothing else.
async function collect(
  checks: { resource: string; count: Promise<number> }[]
): Promise<Blocker[]> {
  const counts = await Promise.all(checks.map((c) => c.count));
  return checks
    // noUncheckedIndexedAccess: counts[i] is number | undefined, and the
    // lengths are identical by construction.
    .map((c, i) => ({ resource: c.resource, count: counts[i] ?? 0 }))
    .filter((b) => b.count > 0);
}

const liveTicket = { in: [...LIVE_TRIP_STATUSES] };

// Everything that still points at a branch in a way that matters.
//
// Vehicles block whatever their status: a van is a physical object and a depot
// cannot be closed while vans are parked in it. Drivers and users do NOT block
// once inactive — an inactive person is history, the same category as a
// completed trip ticket. Child offices and heads block only while ACTIVE;
// counting archived children would make a branch impossible to empty, because
// children can only be archived and never deleted.
export function branchBlockers(id: string): Promise<Blocker[]> {
  return collect([
    {
      resource: 'vehicles',
      count: prisma.vehicle.count({ where: { branchId: id } })
    },
    {
      resource: 'drivers',
      count: prisma.driver.count({
        where: { branchId: id, status: { not: 'inactive' } }
      })
    },
    {
      resource: 'users',
      count: prisma.user.count({
        where: { branchId: id, status: { not: 'inactive' } }
      })
    },
    {
      resource: 'departmentOffices',
      count: prisma.departmentOffice.count({
        where: { branchId: id, archivedAt: null }
      })
    },
    {
      resource: 'officeHeads',
      count: prisma.officeHead.count({
        where: { branchId: id, archivedAt: null }
      })
    },
    {
      resource: 'tripTickets',
      count: prisma.tripTicket.count({
        where: { branchId: id, status: liveTicket }
      })
    },
    {
      resource: 'jobOrders',
      count: prisma.jobOrder.count({
        where: { branchId: id, status: { not: 'repaired' } }
      })
    }
  ]);
  // Fuel allocations are deliberately absent: FuelAllocation.tripTicketId is
  // unique with onDelete Cascade, so every allocation belongs to exactly one
  // ticket and the live-ticket count already covers it.
}

export function officeBlockers(id: string): Promise<Blocker[]> {
  return collect([
    {
      resource: 'officeHeads',
      count: prisma.officeHead.count({
        where: { officeId: id, archivedAt: null }
      })
    },
    {
      resource: 'tripTickets',
      count: prisma.tripTicket.count({
        where: { officeId: id, status: liveTicket }
      })
    }
  ]);
}

export function officeHeadBlockers(id: string): Promise<Blocker[]> {
  return collect([
    {
      resource: 'departmentOffices',
      count: prisma.departmentOffice.count({
        where: { headId: id, archivedAt: null }
      })
    },
    {
      resource: 'tripTickets',
      count: prisma.tripTicket.count({
        where: { officeHeadId: id, status: liveTicket }
      })
    }
  ]);
}

// `details.blockers` is what lets the UI render "1 department office, 2
// vehicles" instead of a flat refusal.
export function assertArchivable(name: string, blockers: Blocker[]): void {
  if (blockers.length === 0) return;
  throw new AppError(409, 'IN_USE', `${name} is still in use`, { blockers });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @mms/api exec vitest run src/modules/organization/guard.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 6: Write the archived-parent helper**

Create `apps/api/src/lib/org-refs.ts`. It lives in `lib/` rather than inside the organization module because four other modules call it (§5.7), and `lib/access.ts` is the existing precedent for cross-module policy.

```ts
import { AppError } from './errors.js';
import { prisma } from './prisma.js';

export interface OrgRefs {
  branchId?: string | null;
  officeId?: string | null;
  officeHeadId?: string | null;
}

// No write may point a non-archived record at an archived parent (§5.6).
//
// This is what makes archiving real rather than a claim the UI makes. Removing
// archived rows from the list endpoints stops them being OFFERED; it does not
// stop them being SENT, and POST /api/trip-tickets is directly reachable.
//
// Only the keys actually present are checked, so a PATCH that does not touch
// branchId does not re-validate it — a record already pointing at a branch
// that was later archived stays exactly as it is.
export async function assertOrgRefsActive(refs: OrgRefs): Promise<void> {
  const checks: Promise<string | null>[] = [];

  if (refs.branchId) {
    checks.push(
      prisma.branch
        .findUnique({
          where: { id: refs.branchId },
          select: { archivedAt: true }
        })
        .then((r) => (r?.archivedAt ? 'branch' : null))
    );
  }
  if (refs.officeId) {
    checks.push(
      prisma.departmentOffice
        .findUnique({
          where: { id: refs.officeId },
          select: { archivedAt: true }
        })
        .then((r) => (r?.archivedAt ? 'department office' : null))
    );
  }
  if (refs.officeHeadId) {
    checks.push(
      prisma.officeHead
        .findUnique({
          where: { id: refs.officeHeadId },
          select: { archivedAt: true }
        })
        .then((r) => (r?.archivedAt ? 'office head' : null))
    );
  }

  const archived = (await Promise.all(checks)).filter(
    (v): v is string => v !== null
  );
  if (archived.length > 0) {
    throw new AppError(
      409,
      'PARENT_ARCHIVED',
      `Cannot reference an archived ${archived.join(' and ')}`
    );
  }
}
```

A missing row is NOT treated as archived — an unknown id is a foreign-key problem that Prisma and each module's own `NOT_FOUND` check already handle, and reporting it as `PARENT_ARCHIVED` would be misleading.

- [ ] **Step 7: Typecheck, format and commit**

```bash
pnpm --filter @mms/api typecheck
npx prettier --write apps/api/src/lib/org-refs.ts apps/api/src/modules/organization/guard.ts apps/api/src/modules/organization/guard.test.ts apps/api/src/test/factories.ts
git add apps/api/src/lib/org-refs.ts apps/api/src/modules/organization apps/api/src/test/factories.ts
git commit -m "feat(api): archive guard counting live references per org resource"
```

---

## Task 3: Branch endpoints

**Files:**
- Create: `apps/api/src/modules/organization/repository.ts`
- Create: `apps/api/src/modules/organization/service.ts`
- Create: `apps/api/src/modules/organization/controller.ts`
- Create: `apps/api/src/modules/organization/router.ts`
- Create: `apps/api/src/modules/organization/branches.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modules/reference/{router,controller,repository}.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces: `organizationRouter`; service functions `listBranches`, `createBranch`, `updateBranch`, `archiveBranch`, `restoreBranch`. The `assertNameFree(model, name, excludeId?)` helper in `service.ts` is reused by Task 4.

- [ ] **Step 1: Write the failing branch tests**

Create `apps/api/src/modules/organization/branches.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({
    email: 'boss@test.local',
    role: 'admin'
  });
  return authHeader(user.id, user.email, 'admin');
}

describe('organization — branches', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates a branch (admin)', async () => {
    const header = await adminHeader();
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', header)
      .send({ name: 'South Branch', location: 'South Depot' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('South Branch');
    expect(res.body.archivedAt).toBeNull();
  });

  it('rejects a duplicate name regardless of case', async () => {
    const header = await adminHeader();
    await createTestBranch('South Branch');
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', header)
      .send({ name: 'south branch' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('renames a branch but refuses to collide with another', async () => {
    const header = await adminHeader();
    const a = await createTestBranch('Alpha');
    await createTestBranch('Beta');

    const ok = await request(app)
      .patch(`/api/branches/${a.id}`)
      .set('Authorization', header)
      .send({ name: 'Alpha Prime' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Alpha Prime');

    const clash = await request(app)
      .patch(`/api/branches/${a.id}`)
      .set('Authorization', header)
      .send({ name: 'BETA' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('lets a branch keep its own name on an unrelated PATCH', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Alpha');
    // Would fail if the duplicate check did not exclude the row being updated.
    const res = await request(app)
      .patch(`/api/branches/${branch.id}`)
      .set('Authorization', header)
      .send({ name: 'Alpha', location: 'Moved' });
    expect(res.status).toBe(200);
    expect(res.body.location).toBe('Moved');
  });

  it('archives a clean branch and hides it from the default list', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Doomed');

    const archived = await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).not.toBeNull();

    const list = await request(app)
      .get('/api/branches')
      .set('Authorization', header);
    expect(list.body.count).toBe(0);
    expect(list.body.data).toHaveLength(0);

    const all = await request(app)
      .get('/api/branches?includeArchived=true')
      .set('Authorization', header);
    expect(all.body.count).toBe(1);
    expect(all.body.data[0].name).toBe('Doomed');
  });

  it('refuses to archive a branch that still owns a vehicle, and says so', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Busy');
    await createTestVehicle(branch.id);

    const res = await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
    expect(res.body.error.details.blockers).toContainEqual({
      resource: 'vehicles',
      count: 1
    });

    // And it really did not archive.
    const still = await prisma.branch.findUnique({ where: { id: branch.id } });
    expect(still?.archivedAt).toBeNull();
  });

  it('restores an archived branch, and refuses to restore an active one', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Back');
    await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);

    const restored = await request(app)
      .post(`/api/branches/${branch.id}/restore`)
      .set('Authorization', header);
    expect(restored.status).toBe(200);
    expect(restored.body.archivedAt).toBeNull();

    const again = await request(app)
      .post(`/api/branches/${branch.id}/restore`)
      .set('Authorization', header);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_ARCHIVED');
  });

  it('refuses to archive an already-archived branch', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Twice');
    await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);
    const res = await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_ARCHIVED');
  });

  it('404s on an unknown id', async () => {
    const header = await adminHeader();
    const res = await request(app)
      .patch('/api/branches/00000000-0000-4000-8000-0000000000ff')
      .set('Authorization', header)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('lets any authenticated role READ but only admin WRITE', async () => {
    const { user } = await createTestUser({
      email: 'guard@test.local',
      role: 'security_guard'
    });
    const header = authHeader(user.id, user.email, 'security_guard');
    const branch = await createTestBranch('ReadOnly');

    expect(
      (await request(app).get('/api/branches').set('Authorization', header))
        .status
    ).toBe(200);

    for (const call of [
      request(app).post('/api/branches').set('Authorization', header).send({ name: 'X' }),
      request(app).patch(`/api/branches/${branch.id}`).set('Authorization', header).send({ name: 'Y' }),
      request(app).post(`/api/branches/${branch.id}/archive`).set('Authorization', header),
      request(app).post(`/api/branches/${branch.id}/restore`).set('Authorization', header)
    ]) {
      expect((await call).status).toBe(403);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @mms/api exec vitest run src/modules/organization/branches.test.ts
```

Expected: FAIL — every write returns 404 because no route exists yet.

- [ ] **Step 3: Write the repository**

Create `apps/api/src/modules/organization/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

// Archived rows are excluded unless explicitly asked for. This single default
// is what removes archived records from every dropdown in the app without
// editing any of those call sites.
function archiveWhere(includeArchived: boolean | undefined) {
  return includeArchived ? {} : { archivedAt: null };
}

export async function listBranches(
  skipTake: SkipTake,
  includeArchived?: boolean
) {
  const where = archiveWhere(includeArchived);
  const [data, count] = await Promise.all([
    prisma.branch.findMany({ where, orderBy: { name: 'asc' }, ...skipTake }),
    prisma.branch.count({ where })
  ]);
  return { data, count };
}

```

`listOffices` and `listOfficeHeads` belong to Task 4 — do not write them here. Nothing in this task calls them, and an unused export is dead code in this task's diff.

Note `count({ where })` — the handler being replaced counted the whole table, which would report a total that disagrees with a filtered page.

- [ ] **Step 4: Write the service (branches only for now)**

Create `apps/api/src/modules/organization/service.ts`:

```ts
import type {
  CreateBranchBody,
  OrganizationListQuery,
  UpdateBranchBody
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { assertArchivable, branchBlockers } from './guard.js';
import * as repo from './repository.js';

// Case-insensitive, and it spans archived rows on purpose: restoring an
// archived "North Branch" must not collide with one created since, and reusing
// a name would make the archived row ambiguous in historical records.
async function assertBranchNameFree(name: string, excludeId?: string) {
  const clash = await prisma.branch.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId && { id: { not: excludeId } })
    },
    select: { id: true }
  });
  if (clash)
    throw new AppError(
      409,
      'DUPLICATE_NAME',
      `A branch named "${name}" already exists`
    );
}

async function loadBranch(id: string) {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) throw new AppError(404, 'NOT_FOUND', 'Branch not found');
  return branch;
}

export function listBranches(query: OrganizationListQuery) {
  return repo.listBranches(toSkipTake(query), query.includeArchived);
}

export async function createBranch(body: CreateBranchBody) {
  await assertBranchNameFree(body.name);
  return prisma.branch.create({ data: body });
}

export async function updateBranch(id: string, body: UpdateBranchBody) {
  await loadBranch(id);
  // Exclude the row being updated, or renaming a branch to its own name fails.
  if (body.name !== undefined) await assertBranchNameFree(body.name, id);
  return prisma.branch.update({ where: { id }, data: body });
}

export async function archiveBranch(id: string) {
  const branch = await loadBranch(id);
  if (branch.archivedAt)
    throw new AppError(
      409,
      'ALREADY_ARCHIVED',
      'Branch is already archived'
    );
  assertArchivable(branch.name, await branchBlockers(id));
  return prisma.branch.update({
    where: { id },
    data: { archivedAt: new Date() }
  });
}

export async function restoreBranch(id: string) {
  const branch = await loadBranch(id);
  if (!branch.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Branch is not archived');
  return prisma.branch.update({ where: { id }, data: { archivedAt: null } });
}
```

- [ ] **Step 5: Write the controller**

Create `apps/api/src/modules/organization/controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateBranchBody, UpdateBranchBody } from '@mms/shared';
import { organizationListQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

// Express 5: req.query is read-only — parse here, never in middleware.
function listQuery(req: Request) {
  return organizationListQuerySchema.parse(req.query);
}

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id)
    throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

export async function listBranches(req: Request, res: Response): Promise<void> {
  res.json(await service.listBranches(listQuery(req)));
}

export async function createBranch(
  req: Request,
  res: Response
): Promise<void> {
  res.status(201).json(await service.createBranch(req.body as CreateBranchBody));
}

export async function updateBranch(
  req: Request,
  res: Response
): Promise<void> {
  res.json(
    await service.updateBranch(
      requireIdParam(req),
      req.body as UpdateBranchBody
    )
  );
}

export async function archiveBranch(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.archiveBranch(requireIdParam(req)));
}

export async function restoreBranch(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.restoreBranch(requireIdParam(req)));
}
```

- [ ] **Step 6: Write the router**

Create `apps/api/src/modules/organization/router.ts`:

```ts
import { Router } from 'express';
import {
  USER_ROLES,
  createBranchBodySchema,
  updateBranchBodySchema
} from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const organizationRouter = Router();

organizationRouter.use(requireAuth);

// Reads stay open to every authenticated role: the booking, user, vehicle and
// job-order forms all populate their dropdowns from these.
organizationRouter.get('/branches', controller.listBranches);

organizationRouter.post(
  '/branches',
  requireRole(USER_ROLES.admin),
  validateBody(createBranchBodySchema),
  controller.createBranch
);
organizationRouter.patch(
  '/branches/:id',
  requireRole(USER_ROLES.admin),
  validateBody(updateBranchBodySchema),
  controller.updateBranch
);
// POST rather than DELETE or a PATCH field: archiving is an operation that can
// FAIL with a structured list of blockers, which neither of those reads like.
organizationRouter.post(
  '/branches/:id/archive',
  requireRole(USER_ROLES.admin),
  controller.archiveBranch
);
organizationRouter.post(
  '/branches/:id/restore',
  requireRole(USER_ROLES.admin),
  controller.restoreBranch
);
```

- [ ] **Step 7: Mount it and drop the migrated handler from reference**

In `apps/api/src/app.ts`, add the import beside the others and mount it at `/api`, immediately after the `referenceRouter` line:

```ts
import { organizationRouter } from './modules/organization/router.js';
// ...
app.use('/api', referenceRouter);
app.use('/api', organizationRouter);
```

Then in `apps/api/src/modules/reference/`, delete the branches handler from all three files: the `referenceRouter.get('/branches', ...)` line in `router.ts`, the `branches` function in `controller.ts`, and `listBranches` in `repository.ts`. Leave roles, offices and office-heads alone — Task 4 moves those.

- [ ] **Step 8: Run the branch tests**

```bash
pnpm --filter @mms/api exec vitest run src/modules/organization/branches.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 9: Run the full API suite**

```bash
pnpm --filter @mms/api test
```

Expected: PASS. `reference.test.ts` still asserts `GET /api/branches` works and that it 401s unauthenticated — both must still hold, because the path did not change, only the module serving it.

- [ ] **Step 10: Typecheck, format, commit**

```bash
pnpm --filter @mms/api typecheck
npx prettier --write apps/api/src/modules/organization apps/api/src/modules/reference apps/api/src/app.ts
git add apps/api/src
git commit -m "feat(api): admin can create, rename, archive and restore branches"
```

---

## Task 4: Office and office-head endpoints

**Files:**
- Modify: `apps/api/src/modules/organization/{service,controller,router}.ts`
- Create: `apps/api/src/modules/organization/offices.test.ts`
- Modify: `apps/api/src/modules/reference/{router,controller,repository}.ts`

**Interfaces:**
- Consumes: `assertOrgRefsActive` from `../../lib/org-refs.js`; `officeBlockers` / `officeHeadBlockers` from `./guard.js`; the private `archiveWhere` helper and the `SkipTake` type already in `repository.ts` from Task 3.
- Produces: repository functions `listOffices`, `listOfficeHeads`; service functions `listOffices`, `createOffice`, `updateOffice`, `archiveOffice`, `restoreOffice`, and the same five for office heads.

- [ ] **Step 0: Add the two list queries to the repository**

Append to `apps/api/src/modules/organization/repository.ts`, reusing the `archiveWhere` helper Task 3 wrote:

```ts
export async function listOffices(
  skipTake: SkipTake,
  includeArchived?: boolean
) {
  const where = archiveWhere(includeArchived);
  const [data, count] = await Promise.all([
    prisma.departmentOffice.findMany({
      where,
      orderBy: { name: 'asc' },
      // The FE's office picker renders the head's name inline, so the list has
      // always embedded it. Keep that or the picker regresses.
      include: { head: true },
      ...skipTake
    }),
    prisma.departmentOffice.count({ where })
  ]);
  return { data, count };
}

export async function listOfficeHeads(
  skipTake: SkipTake,
  includeArchived?: boolean
) {
  const where = archiveWhere(includeArchived);
  const [data, count] = await Promise.all([
    prisma.officeHead.findMany({ where, orderBy: { name: 'asc' }, ...skipTake }),
    prisma.officeHead.count({ where })
  ]);
  return { data, count };
}
```

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/organization/offices.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestOffice,
  createTestOfficeHead,
  createTestUser
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({
    email: 'boss@test.local',
    role: 'admin'
  });
  return authHeader(user.id, user.email, 'admin');
}

describe('organization — offices and office heads', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates an office under a branch', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const res = await request(app)
      .post('/api/offices')
      .set('Authorization', header)
      .send({ name: 'Operations', branchId: branch.id });
    expect(res.status).toBe(201);
    expect(res.body.branchId).toBe(branch.id);
  });

  it('scopes office name uniqueness to the branch', async () => {
    const header = await adminHeader();
    const a = await createTestBranch('Alpha');
    const b = await createTestBranch('Beta');
    await createTestOffice(a.id, 'Operations');

    // Same name, different branch — legitimate.
    const other = await request(app)
      .post('/api/offices')
      .set('Authorization', header)
      .send({ name: 'Operations', branchId: b.id });
    expect(other.status).toBe(201);

    // Same name, same branch, different case — rejected.
    const clash = await request(app)
      .post('/api/offices')
      .set('Authorization', header)
      .send({ name: 'OPERATIONS', branchId: a.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('allows two office heads with the same name', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    await createTestOfficeHead(branch.id, null, 'Juan Cruz');
    // Office heads are people. Two employees named Juan Cruz is not an error.
    const res = await request(app)
      .post('/api/office-heads')
      .set('Authorization', header)
      .send({ name: 'Juan Cruz', branchId: branch.id });
    expect(res.status).toBe(201);
  });

  it('refuses to create an office under an archived branch', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Closed');
    await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);

    const res = await request(app)
      .post('/api/offices')
      .set('Authorization', header)
      .send({ name: 'Ghost Office', branchId: branch.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('refuses to reparent an office into an archived branch', async () => {
    const header = await adminHeader();
    const live = await createTestBranch('Live');
    const dead = await createTestBranch('Dead');
    const office = await createTestOffice(live.id);
    await request(app)
      .post(`/api/branches/${dead.id}/archive`)
      .set('Authorization', header);

    const res = await request(app)
      .patch(`/api/offices/${office.id}`)
      .set('Authorization', header)
      .send({ branchId: dead.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('refuses to restore an office whose branch is still archived', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Closing');
    const office = await createTestOffice(branch.id);

    // Empty the branch first — this is the ordering the guard forces.
    await request(app)
      .post(`/api/offices/${office.id}/archive`)
      .set('Authorization', header);
    await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);

    const res = await request(app)
      .post(`/api/offices/${office.id}/restore`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('archives an office only once its heads are archived', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id);

    const blocked = await request(app)
      .post(`/api/offices/${office.id}/archive`)
      .set('Authorization', header);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.blockers).toContainEqual({
      resource: 'officeHeads',
      count: 1
    });

    await request(app)
      .post(`/api/office-heads/${head.id}/archive`)
      .set('Authorization', header);
    const ok = await request(app)
      .post(`/api/offices/${office.id}/archive`)
      .set('Authorization', header);
    expect(ok.status).toBe(200);
  });

  it('archives an office head only once the office it heads lets go', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id);
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { headId: head.id }
    });

    const blocked = await request(app)
      .post(`/api/office-heads/${head.id}/archive`)
      .set('Authorization', header);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.blockers).toContainEqual({
      resource: 'departmentOffices',
      count: 1
    });

    await request(app)
      .patch(`/api/offices/${office.id}`)
      .set('Authorization', header)
      .send({ headId: null });
    const ok = await request(app)
      .post(`/api/office-heads/${head.id}/archive`)
      .set('Authorization', header);
    expect(ok.status).toBe(200);
  });

  it('hides archived offices and heads from the default lists', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, null, 'Solo');

    await request(app)
      .post(`/api/offices/${office.id}/archive`)
      .set('Authorization', header);
    await request(app)
      .post(`/api/office-heads/${head.id}/archive`)
      .set('Authorization', header);

    expect(
      (await request(app).get('/api/offices').set('Authorization', header)).body
        .count
    ).toBe(0);
    expect(
      (await request(app).get('/api/office-heads').set('Authorization', header))
        .body.count
    ).toBe(0);
    expect(
      (
        await request(app)
          .get('/api/offices?includeArchived=true')
          .set('Authorization', header)
      ).body.count
    ).toBe(1);
  });

  it('still embeds the office head on GET /api/offices', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id, 'Maria');
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { headId: head.id }
    });
    const res = await request(app)
      .get('/api/offices')
      .set('Authorization', header);
    expect(res.body.data[0].head.name).toBe('Maria');
  });

  it('rejects non-admin writes on both resources', async () => {
    const { user } = await createTestUser({
      email: 'req@test.local',
      role: 'requester'
    });
    const header = authHeader(user.id, user.email, 'requester');
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id);

    for (const call of [
      request(app).post('/api/offices').set('Authorization', header).send({ name: 'X' }),
      request(app).patch(`/api/offices/${office.id}`).set('Authorization', header).send({ name: 'Y' }),
      request(app).post(`/api/offices/${office.id}/archive`).set('Authorization', header),
      request(app).post('/api/office-heads').set('Authorization', header).send({ name: 'X' }),
      request(app).patch(`/api/office-heads/${head.id}`).set('Authorization', header).send({ name: 'Y' }),
      request(app).post(`/api/office-heads/${head.id}/archive`).set('Authorization', header)
    ]) {
      expect((await call).status).toBe(403);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @mms/api exec vitest run src/modules/organization/offices.test.ts
```

Expected: FAIL — the office write routes do not exist.

- [ ] **Step 3: Extend the service**

Append to `apps/api/src/modules/organization/service.ts`. Add `assertOrgRefsActive` to the imports (`import { assertOrgRefsActive } from '../../lib/org-refs.js';`) along with `officeBlockers` and `officeHeadBlockers` from `./guard.js`, and the office/head body types from `@mms/shared`.

```ts
// Office names are unique WITHIN a branch — "Operations Office" may legitimately
// exist at both Main and North. Two offices with no branch are compared against
// each other.
async function assertOfficeNameFree(
  name: string,
  branchId: string | null | undefined,
  excludeId?: string
) {
  const clash = await prisma.departmentOffice.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      branchId: branchId ?? null,
      ...(excludeId && { id: { not: excludeId } })
    },
    select: { id: true }
  });
  if (clash)
    throw new AppError(
      409,
      'DUPLICATE_NAME',
      `An office named "${name}" already exists in this branch`
    );
}

async function loadOffice(id: string) {
  const office = await prisma.departmentOffice.findUnique({ where: { id } });
  if (!office) throw new AppError(404, 'NOT_FOUND', 'Office not found');
  return office;
}

export function listOffices(query: OrganizationListQuery) {
  return repo.listOffices(toSkipTake(query), query.includeArchived);
}

export async function createOffice(body: CreateOfficeBody) {
  await assertOrgRefsActive({
    branchId: body.branchId,
    officeHeadId: body.headId
  });
  await assertOfficeNameFree(body.name, body.branchId);
  return prisma.departmentOffice.create({ data: body });
}

export async function updateOffice(id: string, body: UpdateOfficeBody) {
  const existing = await loadOffice(id);
  await assertOrgRefsActive({
    branchId: body.branchId,
    officeHeadId: body.headId
  });
  if (body.name !== undefined)
    await assertOfficeNameFree(
      body.name,
      // A PATCH that changes only the name must be checked against the branch
      // the office is ALREADY in.
      body.branchId === undefined ? existing.branchId : body.branchId,
      id
    );
  return prisma.departmentOffice.update({ where: { id }, data: body });
}

export async function archiveOffice(id: string) {
  const office = await loadOffice(id);
  if (office.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Office is already archived');
  assertArchivable(office.name, await officeBlockers(id));
  return prisma.departmentOffice.update({
    where: { id },
    data: { archivedAt: new Date() }
  });
}

export async function restoreOffice(id: string) {
  const office = await loadOffice(id);
  if (!office.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Office is not archived');
  // Restoring under an archived parent would recreate the very state the
  // branch guard exists to prevent.
  await assertOrgRefsActive({ branchId: office.branchId });
  return prisma.departmentOffice.update({
    where: { id },
    data: { archivedAt: null }
  });
}

// Office heads have NO name uniqueness — they are people, and two employees
// named Juan Cruz is not an error (§4.2).
async function loadOfficeHead(id: string) {
  const head = await prisma.officeHead.findUnique({ where: { id } });
  if (!head) throw new AppError(404, 'NOT_FOUND', 'Office head not found');
  return head;
}

export function listOfficeHeads(query: OrganizationListQuery) {
  return repo.listOfficeHeads(toSkipTake(query), query.includeArchived);
}

export async function createOfficeHead(body: CreateOfficeHeadBody) {
  await assertOrgRefsActive({
    branchId: body.branchId,
    officeId: body.officeId
  });
  return prisma.officeHead.create({ data: body });
}

export async function updateOfficeHead(
  id: string,
  body: UpdateOfficeHeadBody
) {
  await loadOfficeHead(id);
  await assertOrgRefsActive({
    branchId: body.branchId,
    officeId: body.officeId
  });
  return prisma.officeHead.update({ where: { id }, data: body });
}

export async function archiveOfficeHead(id: string) {
  const head = await loadOfficeHead(id);
  if (head.archivedAt)
    throw new AppError(
      409,
      'ALREADY_ARCHIVED',
      'Office head is already archived'
    );
  assertArchivable(head.name, await officeHeadBlockers(id));
  return prisma.officeHead.update({
    where: { id },
    data: { archivedAt: new Date() }
  });
}

export async function restoreOfficeHead(id: string) {
  const head = await loadOfficeHead(id);
  if (!head.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Office head is not archived');
  await assertOrgRefsActive({
    branchId: head.branchId,
    officeId: head.officeId
  });
  return prisma.officeHead.update({ where: { id }, data: { archivedAt: null } });
}
```

- [ ] **Step 4: Extend the controller**

Append ten handlers to `apps/api/src/modules/organization/controller.ts`, following the branch handlers exactly: `listOffices`, `createOffice` (201), `updateOffice`, `archiveOffice`, `restoreOffice`, and the same five for office heads. Each uses `listQuery(req)` or `requireIdParam(req)` and casts `req.body` to the matching `@mms/shared` type.

- [ ] **Step 5: Extend the router**

Append to `apps/api/src/modules/organization/router.ts` the same five-route block for `/offices` and `/office-heads`, using `createOfficeBodySchema` / `updateOfficeBodySchema` and `createOfficeHeadBodySchema` / `updateOfficeHeadBodySchema` in `validateBody`, and `requireRole(USER_ROLES.admin)` on every write. The two GETs carry no role gate.

- [ ] **Step 6: Finish emptying the reference module**

Delete from `apps/api/src/modules/reference/` the `offices` and `office-heads` routes, their controller functions, and `listOffices` / `listOfficeHeads` from `repository.ts`. What remains is roles only — `referenceRouter.get('/roles', ...)`, `controller.roles`, `repo.listRoles` — which is what the module's name has always claimed.

Leave `reference.test.ts` as it is. Its branch and office assertions still pass (the paths did not move), and its 401 loop over all four paths still asserts something true.

- [ ] **Step 7: Run the office tests**

```bash
pnpm --filter @mms/api exec vitest run src/modules/organization/offices.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 8: Run the full suite, typecheck, format, commit**

```bash
pnpm --filter @mms/api test
pnpm --filter @mms/api typecheck
npx prettier --write apps/api/src/modules/organization apps/api/src/modules/reference
git add apps/api/src
git commit -m "feat(api): admin can manage offices and office heads, with archived-parent guards"
```

---

## Task 5: Enforce archived parents across the other modules

Without this, "archived" is a claim the UI makes and the API does not honour (§5.7).

**Files:**
- Modify: `apps/api/src/modules/trip-tickets/service.ts`
- Modify: `apps/api/src/modules/users/service.ts`
- Modify: `apps/api/src/modules/vehicles/service.ts`
- Modify: `apps/api/src/modules/drivers/service.ts`
- Create: `apps/api/src/modules/organization/enforcement.test.ts`

**Interfaces:**
- Consumes: `assertOrgRefsActive` from `../../lib/org-refs.js` (Task 2).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/organization/enforcement.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

// An archived branch, ready to be sent where the UI would never offer it.
async function archivedBranch(header: string) {
  const branch = await createTestBranch('Closed Branch');
  const res = await request(app)
    .post(`/api/branches/${branch.id}/archive`)
    .set('Authorization', header);
  expect(res.status).toBe(200);
  return branch;
}

describe('archived branches are rejected on write, not just hidden', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  async function adminHeader() {
    const { user } = await createTestUser({
      email: 'boss@test.local',
      role: 'admin'
    });
    return authHeader(user.id, user.email, 'admin');
  }

  it('POST /api/users rejects an archived branchId', async () => {
    const header = await adminHeader();
    const branch = await archivedBranch(header);
    // Multipart, not JSON: the route is behind avatarUpload.single('avatar'),
    // as are the driver and vehicle routes below.
    const req = request(app).post('/api/users').set('Authorization', header);
    for (const [k, v] of Object.entries({
      email: 'new@test.local',
      password: 'Password123!',
      fullName: 'New Person',
      branchId: branch.id
    })) {
      req.field(k, v);
    }
    const res = await req;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('POST /api/vehicles rejects an archived branchId', async () => {
    const header = await adminHeader();
    const branch = await archivedBranch(header);
    const req = request(app)
      .post('/api/vehicles')
      .set('Authorization', header);
    const fields: Record<string, string> = {
      make: 'Toyota',
      model: 'Hiace',
      year: '2021',
      vin: 'JT-VIN-ARCH',
      licensePlate: 'ARC-0001',
      capacity: '12',
      fuelType: 'diesel',
      mileage: '1000',
      insuranceExpiry: '2027-01-01',
      registrationExpiry: '2027-03-01',
      branchId: branch.id
    };
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    const res = await req;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('POST /api/drivers rejects an archived branchId', async () => {
    const header = await adminHeader();
    const branch = await archivedBranch(header);
    const req = request(app)
      .post('/api/drivers')
      .set('Authorization', header);
    for (const [k, v] of Object.entries({
      email: 'newdriver@test.local',
      fullName: 'New Driver',
      branchId: branch.id
    })) {
      req.field(k, v);
    }
    const res = await req;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('POST /api/trip-tickets rejects an archived branchId', async () => {
    const header = await adminHeader();
    // Build the fleet on a LIVE branch, then file the trip against a dead one,
    // so the only thing wrong with the request is the archived branch.
    const live = await createTestBranch('Live');
    const vehicle = await createTestVehicle(live.id);
    const driver = await createTestDriver(live.id);
    const dead = await archivedBranch(header);

    const now = Date.now();
    const res = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', header)
      .send({
        branchId: dead.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'Anywhere',
        purpose: 'Testing',
        dateRequested: '2026-08-26',
        preparedBy: 'Test',
        dates: [
          {
            startTs: new Date(now + 3_600_000).toISOString(),
            endTs: new Date(now + 7_200_000).toISOString()
          }
        ]
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('leaves records that already point at a newly archived branch alone', async () => {
    const header = await adminHeader();
    // The check runs on write, not on read. A vehicle created while its branch
    // was live must keep working after the branch is archived — and archiving
    // is blocked by that vehicle anyway, so this is belt and braces.
    const branch = await createTestBranch('Later Closed');
    const vehicle = await createTestVehicle(branch.id);
    await prisma.branch.update({
      where: { id: branch.id },
      data: { archivedAt: new Date() }
    });
    const res = await request(app)
      .get(`/api/vehicles/${vehicle.id}`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.branchId).toBe(branch.id);
  });
});
```

If any request body above does not match the module's current contract, fix the **test body** to match the real schema — do not change the module's contract to suit the test. Read the relevant `packages/shared/src/contracts/*.ts` to confirm required fields.

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @mms/api exec vitest run src/modules/organization/enforcement.test.ts
```

Expected: FAIL — creates succeed with 201 instead of 409.

- [ ] **Step 3: Add the check to each service**

In each of the four services, import the helper and call it at the top of `create` and `update`, before any other work:

```ts
import { assertOrgRefsActive } from '../../lib/org-refs.js';
```

- `users/service.ts` — in `create` and `update`: `await assertOrgRefsActive({ branchId: body.branchId });`
- `vehicles/service.ts` — same, in `create` and `update`.
- `drivers/service.ts` — same, in `create` and `update`.
- `trip-tickets/service.ts` — in `create` and `update`, all three refs:

```ts
await assertOrgRefsActive({
  branchId: body.branchId,
  officeId: body.officeId,
  officeHeadId: body.officeHeadId
});
```

Do **not** add the check to any transition (approve, disapprove, cancel, check-out, check-in). A ticket that was valid when raised must stay completable, and the case is unreachable anyway: a ticket in any live status blocks its branch, office and head from being archived at all.

- [ ] **Step 4: Run the tests, then the whole suite**

```bash
pnpm --filter @mms/api exec vitest run src/modules/organization/enforcement.test.ts
pnpm --filter @mms/api test
```

Expected: enforcement PASS (5 tests); full suite PASS with no regressions. If an existing test now 409s, it is creating a record against an archived branch — check whether that is the test's intent or a real fixture bug.

- [ ] **Step 5: Typecheck, format, commit**

```bash
pnpm --filter @mms/api typecheck
npx prettier --write apps/api/src/modules/organization/enforcement.test.ts apps/api/src/modules/users/service.ts apps/api/src/modules/vehicles/service.ts apps/api/src/modules/drivers/service.ts apps/api/src/modules/trip-tickets/service.ts
git add apps/api/src
git commit -m "fix(api): reject writes that point a live record at an archived branch"
```

---

## Task 6: Web data layer

**Files:**
- Modify: `apps/web/src/lib/api/client.ts`
- Modify: `apps/web/src/lib/types/supabase.ts`
- Modify: `apps/web/src/lib/api/shared.ts`
- Create: `apps/web/src/lib/api/organization.ts`
- Create: `apps/web/src/lib/query/organization.ts`
- Create: `apps/web/src/lib/mutation/organization.ts`

**Interfaces:**
- Produces: `ApiError.details`; `ArchiveBlocker`; `blockersFrom(error)`; `describeBlockers(blockers)`; fetchers `getBranches`, `getOffices`, `getOfficeHeads` (each taking `includeArchived?: boolean`) and their create/update/archive/restore counterparts; hooks `useBranchesAdmin`, `useOfficesAdmin`, `useOfficeHeadsAdmin`; mutations `useCreateOrgRecord`, `useUpdateOrgRecord`, `useArchiveOrgRecord`, `useRestoreOrgRecord`.

- [ ] **Step 1: Make `ApiError` carry `details`**

In `apps/web/src/lib/api/client.ts`, the class currently drops the response's `details` object entirely, so the blocked-archive dialog has nothing to render. Add the field:

```ts
export class ApiError extends Error {
  status: number;
  code: string;
  // The API's error envelope may carry a structured payload — IN_USE puts its
  // blocker counts here. Dropping it left the UI unable to say WHY.
  details?: unknown;
  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }
}
```

And at the throw site near the end of `apiRequest`:

```ts
const err = (
  parsed as {
    error?: { code?: string; message?: string; details?: unknown };
  }
)?.error;
throw new ApiError(
  res.status,
  err?.code ?? 'ERROR',
  err?.message ?? `Request failed (${res.status})`,
  err?.details
);
```

- [ ] **Step 2: Add `archived_at` to the row types**

`apps/web/src/lib/types/supabase.ts` is a hand-maintained legacy type file the FE still types against. In each of `branches`, `department_offices` and `office_heads`, add to all three of `Row`, `Insert` and `Update`:

```ts
          archived_at: string | null;   // Row
          archived_at?: string | null;  // Insert and Update
```

- [ ] **Step 3: Teach the existing branch fetcher about the flag**

In `apps/web/src/lib/api/shared.ts`, extend `BranchResponse` with `archivedAt: string | null`, carry it through `toSnake` as `archived_at`, and give `getAllBranches` the parameter:

```ts
// Defaults to active-only, which is what all ten existing call sites want —
// their dropdowns must stop offering archived branches.
export const getAllBranches = async (
  includeArchived = false
): Promise<Branch[]> => {
  const res = await api.get<{ data: BranchResponse[]; count: number }>(
    '/branches',
    includeArchived ? { includeArchived: 'true' } : undefined
  );
  return res.data.map(toSnake);
};
```

`useBranches()` in `lib/query/shared.ts` stays exactly as it is — calling with no argument keeps its current behaviour.

- [ ] **Step 4: Write the organization API module**

Create `apps/web/src/lib/api/organization.ts`:

```ts
import { api, ApiError } from './client';
import type {
  CreateBranchBody,
  CreateOfficeBody,
  CreateOfficeHeadBody,
  UpdateBranchBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody
} from '@mms/shared';

// The three tabs are the same table with different columns, so one union keeps
// the mutation hooks from being written three times.
export type OrgResource = 'branches' | 'offices' | 'office-heads';

export interface OrgRecord {
  id: string;
  name: string;
  archivedAt: string | null;
  location?: string | null;
  branchId?: string | null;
  headId?: string | null;
  officeId?: string | null;
}

export type CreateOrgBody =
  | CreateBranchBody
  | CreateOfficeBody
  | CreateOfficeHeadBody;
export type UpdateOrgBody =
  | UpdateBranchBody
  | UpdateOfficeBody
  | UpdateOfficeHeadBody;

export interface ArchiveBlocker {
  resource: string;
  count: number;
}

// What the API means by each blocker key, singular and plural.
const BLOCKER_LABELS: Record<string, [string, string]> = {
  vehicles: ['vehicle', 'vehicles'],
  drivers: ['driver', 'drivers'],
  users: ['user', 'users'],
  departmentOffices: ['department office', 'department offices'],
  officeHeads: ['office head', 'office heads'],
  tripTickets: ['active trip ticket', 'active trip tickets'],
  jobOrders: ['open job order', 'open job orders']
};

export function blockersFrom(error: unknown): ArchiveBlocker[] {
  if (!(error instanceof ApiError) || error.code !== 'IN_USE') return [];
  const details = error.details as { blockers?: ArchiveBlocker[] } | undefined;
  return details?.blockers ?? [];
}

export function describeBlockers(blockers: ArchiveBlocker[]): string[] {
  return blockers.map(({ resource, count }) => {
    const labels = BLOCKER_LABELS[resource];
    // An unknown key is still worth showing — better a raw name than nothing.
    const label = labels ? (count === 1 ? labels[0] : labels[1]) : resource;
    return `${count} ${label}`;
  });
}

async function listResource(
  resource: OrgResource,
  includeArchived: boolean
): Promise<OrgRecord[]> {
  const res = await api.get<{ data: OrgRecord[]; count: number }>(
    `/${resource}`,
    includeArchived ? { includeArchived: 'true' } : undefined
  );
  return res.data;
}

export const getOrgRecords = (
  resource: OrgResource,
  includeArchived = true
): Promise<OrgRecord[]> => listResource(resource, includeArchived);

export const createOrgRecord = (
  resource: OrgResource,
  body: CreateOrgBody
): Promise<OrgRecord> => api.post<OrgRecord>(`/${resource}`, body);

export const updateOrgRecord = (
  resource: OrgResource,
  id: string,
  body: UpdateOrgBody
): Promise<OrgRecord> => api.patch<OrgRecord>(`/${resource}/${id}`, body);

export const archiveOrgRecord = (
  resource: OrgResource,
  id: string
): Promise<OrgRecord> => api.post<OrgRecord>(`/${resource}/${id}/archive`);

export const restoreOrgRecord = (
  resource: OrgResource,
  id: string
): Promise<OrgRecord> => api.post<OrgRecord>(`/${resource}/${id}/restore`);
```

- [ ] **Step 5: Write the query hooks**

Create `apps/web/src/lib/query/organization.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { getOrgRecords, type OrgResource } from '../api/organization';

// The admin page is the only caller that wants archived rows, so the flag is
// baked in here rather than exposed as an argument.
const orgQuery = (resource: OrgResource) => ({
  queryKey: ['organization', resource],
  queryFn: () => getOrgRecords(resource, true)
});

export const useBranchesAdmin = () => useQuery(orgQuery('branches'));
export const useOfficesAdmin = () => useQuery(orgQuery('offices'));
export const useOfficeHeadsAdmin = () => useQuery(orgQuery('office-heads'));
```

- [ ] **Step 6: Write the mutation hooks**

Create `apps/web/src/lib/mutation/organization.ts`. Each mutation invalidates both its own admin key and the plain `['branches']` key used by `useBranches()`, so a rename or archive is reflected in every dropdown without a reload.

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  archiveOrgRecord,
  createOrgRecord,
  restoreOrgRecord,
  updateOrgRecord,
  type CreateOrgBody,
  type OrgResource,
  type UpdateOrgBody
} from '@/lib/api/organization';
import type { ApiError } from '@/lib/api/client';

const LABELS: Record<OrgResource, string> = {
  branches: 'Branch',
  offices: 'Office',
  'office-heads': 'Office head'
};

function useOrgInvalidation(resource: OrgResource) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['organization', resource] });
    // The shared dropdown hook keys off ['branches'] and must not go stale.
    if (resource === 'branches')
      queryClient.invalidateQueries({ queryKey: ['branches'] });
  };
}

export const useCreateOrgRecord = (resource: OrgResource) => {
  const invalidate = useOrgInvalidation(resource);
  return useMutation({
    mutationFn: (body: CreateOrgBody) => createOrgRecord(resource, body),
    onSuccess: () => {
      toast.success(`${LABELS[resource]} created`);
      invalidate();
    },
    onError: (error: ApiError) =>
      toast.error(`Create failed: ${error?.message ?? String(error)}`)
  });
};

export const useUpdateOrgRecord = (resource: OrgResource) => {
  const invalidate = useOrgInvalidation(resource);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateOrgBody }) =>
      updateOrgRecord(resource, id, body),
    onSuccess: () => {
      toast.success(`${LABELS[resource]} updated`);
      invalidate();
    },
    onError: (error: ApiError) =>
      toast.error(`Update failed: ${error?.message ?? String(error)}`)
  });
};

// No toast on error: a blocked archive is rendered inside the dialog with its
// blocker list, which a toast cannot show.
export const useArchiveOrgRecord = (resource: OrgResource) => {
  const invalidate = useOrgInvalidation(resource);
  return useMutation({
    mutationFn: (id: string) => archiveOrgRecord(resource, id),
    onSuccess: () => {
      toast.success(`${LABELS[resource]} archived`);
      invalidate();
    }
  });
};

export const useRestoreOrgRecord = (resource: OrgResource) => {
  const invalidate = useOrgInvalidation(resource);
  return useMutation({
    mutationFn: (id: string) => restoreOrgRecord(resource, id),
    onSuccess: () => {
      toast.success(`${LABELS[resource]} restored`);
      invalidate();
    },
    onError: (error: ApiError) =>
      toast.error(`Restore failed: ${error?.message ?? String(error)}`)
  });
};
```

- [ ] **Step 7: Typecheck, lint, format, commit**

```bash
pnpm --filter @mms/shared build
pnpm --filter @mms/web exec tsc -b
pnpm --filter @mms/web lint
npx prettier --write apps/web/src/lib/api/client.ts apps/web/src/lib/api/organization.ts apps/web/src/lib/api/shared.ts apps/web/src/lib/query/organization.ts apps/web/src/lib/mutation/organization.ts apps/web/src/lib/types/supabase.ts
git add apps/web/src/lib
git commit -m "feat(web): organization data layer, and let ApiError carry error details"
```

---

## Task 7: The Organization page

**Files:**
- Create: `apps/web/src/routes/_authenticated/organization.tsx`
- Create: `apps/web/src/components/pages/organization/index.tsx`
- Create: `apps/web/src/components/pages/organization/resource-tab.tsx`
- Create: `apps/web/src/components/pages/organization/record-dialog.tsx`
- Create: `apps/web/src/components/pages/organization/archive-dialog.tsx`

**Interfaces:**
- Consumes: everything from Task 6.

- [ ] **Step 1: Create the route**

`apps/web/src/routes/_authenticated/organization.tsx`. `Settings` is the existing admin-only sidebar group that `tracker-devices` already uses — the app has exactly three groups (`Assets`, `Management`, `Settings`) and this adds no fourth. The sidebar builds itself from route `staticData`, so no sidebar file is edited.

```tsx
import Organization from '@/components/pages/organization';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { Building2 } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/organization')({
  component: Organization,
  staticData: {
    title: 'Organization',
    icon: Building2,
    group: 'Settings',
    allowedRoles: [USER_ROLES.admin]
  }
});
```

- [ ] **Step 2: Build the archive dialog**

`archive-dialog.tsx` — the only screen in the app that renders a structured API error, so it carries the interesting logic.

```tsx
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  blockersFrom,
  describeBlockers,
  type OrgRecord,
  type OrgResource
} from '@/lib/api/organization';
import { useArchiveOrgRecord } from '@/lib/mutation/organization';

interface ArchiveDialogProps {
  resource: OrgResource;
  record: OrgRecord | null;
  onClose: () => void;
}

export function ArchiveDialog({
  resource,
  record,
  onClose
}: ArchiveDialogProps) {
  const [blockers, setBlockers] = useState<string[]>([]);
  const archive = useArchiveOrgRecord(resource);

  function close() {
    setBlockers([]);
    onClose();
  }

  function confirm() {
    if (!record) return;
    archive.mutate(record.id, {
      onSuccess: close,
      // A blocked archive is not a failure to report and dismiss — it is a
      // list of work the admin has to do first, so it stays on screen.
      onError: (error) => setBlockers(describeBlockers(blockersFrom(error)))
    });
  }

  const blocked = blockers.length > 0;

  return (
    <AlertDialog open={!!record} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blocked
              ? `Cannot archive "${record?.name}"`
              : `Archive "${record?.name}"?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            {blocked ? (
              <div>
                <p>Still in use:</p>
                <ul className="mt-2 list-disc pl-5">
                  {blockers.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-2">Reassign or archive these first.</p>
              </div>
            ) : (
              <span>
                It will stop being offered anywhere in the app. Existing records
                keep showing it, and you can restore it later.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>
            {blocked ? 'Close' : 'Cancel'}
          </AlertDialogCancel>
          {!blocked && (
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open so a blocked archive can render inline.
                e.preventDefault();
                confirm();
              }}
              disabled={archive.isPending}
            >
              Archive
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

`apps/web/src/components/ui/alert-dialog.tsx` already exists — import from it, do not add a new primitive.

- [ ] **Step 3: Build the record dialog**

`record-dialog.tsx` — one form for Add and Edit, driven by a field list so all three resources share it. Branches show `name` + `location`; offices show `name` + a branch `<Select>` + a head `<Select>`; office heads show `name` + branch + office selects. The branch and office selects are populated from `useBranchesAdmin()` / `useOfficesAdmin()` **filtered to `archivedAt === null`** — an admin must not be able to file a new office under a branch they just archived, and the API would reject it with `PARENT_ARCHIVED` anyway.

Use `react-hook-form` with a Zod resolver, matching `apps/web/src/components/pages/tracker-devices/`. Submit calls `useCreateOrgRecord(resource)` or `useUpdateOrgRecord(resource)` and closes on success.

Because offices and heads reference each other, a newly created office cannot name a head that does not exist yet. Leave the head select empty on create and let the admin set it by editing afterwards — both fields are nullable exactly so this cycle can be built in two steps.

- [ ] **Step 4: Build the resource tab**

`resource-tab.tsx` — a table with a per-resource column list, an "Add" button, and per-row Edit plus either Archive (when `archivedAt === null`) or Restore. Archived rows render muted with an "Archived" badge. Wire the two dialogs through local state.

```tsx
const isArchived = (r: OrgRecord) => r.archivedAt !== null;
```

- [ ] **Step 5: Build the tab shell**

`index.tsx` — a `Tabs` with `TabsTrigger` values `branches`, `offices`, `office-heads`, defaulting to `branches`, each rendering `<ResourceTab resource={...} />`. Reuse the `ACTIVE_TAB` class string from `apps/web/src/components/shared/view-tabs.tsx` so the active pill matches the rest of the app.

- [ ] **Step 6: Verify in the running app**

```bash
pnpm dev
```

Sign in as an admin and confirm, in order:
1. "Organization" appears in the sidebar under Settings, and does NOT appear for a non-admin.
2. Creating a branch succeeds and it appears immediately in the trip-ticket form's branch dropdown.
3. Archiving that same branch succeeds while it is empty.
4. Archiving `Main Branch` is refused, and the dialog lists its vehicles, drivers and offices by count.
5. An archived branch is gone from the trip-ticket dropdown but still visible on the Organization page with a Restore button.

- [ ] **Step 7: Typecheck, lint, format, commit**

```bash
pnpm --filter @mms/web exec tsc -b
pnpm --filter @mms/web lint
npx prettier --write apps/web/src/components/pages/organization apps/web/src/routes/_authenticated/organization.tsx
git add apps/web/src
git commit -m "feat(web): Organization page for managing branches, offices and office heads"
```

---

## Task 8: End-to-end

**Files:**
- Create: `apps/web/e2e/organization.spec.ts`

**Interfaces:**
- Consumes: the helpers in `apps/web/e2e/helpers.ts`. Read that file first and follow its login and cleanup conventions.

- [ ] **Step 1: Write the spec**

Create `apps/web/e2e/organization.spec.ts` covering exactly one journey, which is the whole feature in miniature:

1. Sign in as admin, go to `/organization`.
2. Create a branch with a run-unique name (e.g. `E2E Branch ${Date.now()}`) — a fixed name would collide with itself on the second run now that names are unique.
3. Open the trip-ticket booking form and assert the new branch appears in the branch dropdown.
4. Return to `/organization` and archive it. Assert it succeeds — a brand-new branch owns nothing.
5. Reopen the booking form and assert the branch is **gone** from the dropdown.
6. Back on `/organization`, assert the row is still listed with an "Archived" badge, and restore it.

Clean up in `afterAll` by archiving the branch, following the per-id teardown pattern in `apps/web/e2e/multi-date-trip.spec.ts` rather than the no-cleanup pattern in `trip-lifecycle.spec.ts`.

- [ ] **Step 2: Run it**

```bash
pnpm --filter @mms/web test:e2e
```

Expected: the new spec passes and the existing specs still pass.

- [ ] **Step 3: Commit**

```bash
npx prettier --write apps/web/e2e/organization.spec.ts
git add apps/web/e2e/organization.spec.ts
git commit -m "test(e2e): a branch created, offered, archived and withdrawn from booking"
```

---

## Final Verification

- [ ] `pnpm --filter @mms/shared build`
- [ ] `pnpm --filter @mms/api typecheck` — 0 errors
- [ ] `pnpm --filter @mms/api test` — all green
- [ ] `pnpm --filter @mms/web exec tsc -b` — clean
- [ ] `pnpm --filter @mms/web lint` — clean
- [ ] `pnpm --filter @mms/web test:e2e` — all green
- [ ] `git status` shows no unintended files, and no commit carries an AI attribution trailer
- [ ] Add a rollout note to `docs/` covering the two pre-deploy duplicate-name SQL checks from Task 1 Step 4, in the same shape as `docs/multi-date-trip-tickets-rollout.md`
