# Backend Migration Plan 4/7: Vehicles, Maintenance, Spare Parts, Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fleet + inventory domain modules on the Plan 1–3 foundation: vehicles (multi-image CRUD + the shared `changeVehicleStatus` audit choke point consumed by Plan 5), spare parts and tools inventory (single-image CRUD; tools keep the permissive borrow-field PATCH), and the maintenance cluster — simple service-history CRUD, maintenance standards with nested schedule items, and per-vehicle maintenance tracking with the ported next-due / display-status logic.

**Architecture:** Feature modules per spec §6 (`router → controller → service → repository`), composed from the Plan 2 middleware (`requireAuth`, `requireRole`, `validateBody`, `createUploader`) and the Plan 3 conventions (`toSkipTake`, `{ data, count }`, per-route or router-wide `requireAuth`). No new migration — the Plan 1 initial migration already created all eight tables this plan touches, and the test-DB `TABLES` truncation list already includes them. The next-due and display-status calculations are pure functions (`modules/maintenance/next-due.ts`), unit-tested in isolation and reused by both tracking init and completion.

**Tech Stack:** Express 5, Prisma, Zod contracts in `@mms/shared`, Vitest + Supertest against `mms_test`.

**Spec:** `docs/superpowers/specs/2026-07-03-express-backend-migration-design.md` §4.2 (table changes: vehicles `branch → branch_id`, `images text[]`, `changeVehicleStatus` audit; maintenance tables; tools `borrowed_by → drivers`), §5 (read-access matrix — note the asymmetric gate: maintenance/spare-parts/tools reads exclude `security_guard`), §6 (module table: vehicles/maintenance/spare-parts/tools rows + response conventions), §9 (uploads). Prior work: Plans 1–3 (schema, seed, auth, middleware, uploads, test DB, reference/users/drivers).

## Global Constraints

- TypeScript strict; no `any`; `noUncheckedIndexedAccess` on. **NodeNext ESM: every relative import in `apps/api` and `packages/shared` carries `.js`.**
- Error envelope `{ error: { code, message, details? } }`. Codes added in this plan: `VEHICLE_IN_USE` (409), `STANDARD_IN_USE` (409), `SCHEDULE_ITEM_IN_USE` (409), plus the existing `NOT_FOUND` (404), `INVALID_ROLE`/validation codes. Prisma `P2003` (FK RESTRICT) is already mapped centrally to `409 CONFLICT` by the error-handler (Plan 3), so a local catch is only for a friendlier domain message.
- Response conventions (spec §6): collections → `{ data, count }` (`count` = TOTAL matching rows); `page` 1-indexed; `limit` max 200; **both omitted → full result set** (`toSkipTake` from Plan 3). Single resources → bare object.
- **Read-access matrix (spec §5) — mind the asymmetry:** vehicles reads = **any** authenticated role. Maintenance / maintenance-standards / maintenance-tracking / spare-parts / tools reads = admin, requester, evp_operations, **driver** — **NOT `security_guard`**. All writes in this plan are `requireRole('admin')`. This is codified once as `INVENTORY_READ_ROLES` (Task 1) and reused, so the gate can't drift between modules.
- **Multipart is all-strings.** For `POST/PATCH /vehicles`, `/spare-parts`, `/tools`, multer runs BEFORE `validateBody`, so every text field arrives as a string. Contracts use `z.coerce.number()` / `z.coerce.date()` and the shared `booleanFromString` / `nullableDate` / `nullableString` preprocessors (Task 1) — **never `z.coerce.boolean()`** (it treats the string `'false'` as `true`). Maintenance / standards / tracking bodies are JSON (no files), sent with real types.
- **`changeVehicleStatus` is the single choke point for every vehicle status flip** (spec §4.2). It updates `vehicles.status` and writes a `vehicle_status_audit` row **in the caller's transaction**, and is a no-op (no audit row) when the status is unchanged. Plan 5 (trip/job-order transitions) consumes it; keep its signature stable. It does NOT write an audit row on vehicle creation (creation is not a change).
- **Upload-orphan policy (decided — resolves the Plan 3 deferral):** multer writes files to disk before `validateBody`, and vehicle/tool/spare-part image *replacement* drops old paths from the row without unlinking the files. v1 **accepts orphaned upload files** (this mirrors the Supabase-era behavior, which never deleted storage objects on replace/remove) — documented, no cleanup middleware. A later hardening pass can add a sweep. Do not build orphan cleanup in this plan.
- **Response mappers:** vehicles, spare-parts, and tools have **no sensitive columns**, so their endpoints return the raw Prisma rows (serialized) — a deliberate decision, consistent with drivers, not an oversight. The one endpoint that transforms shape is `GET /vehicles/:id/maintenance-tracking`, which injects the computed `displayStatus` and embeds the schedule item — that gets an explicit mapper (`toTrackingResponse`).
- Multipart routes: multer runs BEFORE `validateBody`. Conventional commits; NO `Co-Authored-By` lines. All work on `production`. Docker Desktop is flaky on this host — relaunch + poll `docker info` before DB work if needed.
- **No new tables/migrations in this plan** → the test-DB `TABLES` truncation list needs no changes (verified: it already lists vehicles, vehicle_status_audit, maintenance, maintenance_standards, maintenance_schedule_items, vehicle_maintenance_tracking, maintenance_completion_logs, spare_parts, tools).

---

### Task 1: Shared contracts + enums + access helper + multipart preprocessors

**Files:**
- Modify: `packages/shared/src/enums.ts` (add `INTERVAL_TYPE`, `TRACKING_STATUS`), `packages/shared/src/contracts/common.ts` (add multipart preprocessors), `packages/shared/src/index.ts`
- Create: `packages/shared/src/contracts/vehicles.ts`, `packages/shared/src/contracts/maintenance.ts`, `packages/shared/src/contracts/spare-parts.ts`, `packages/shared/src/contracts/tools.ts`, `apps/api/src/lib/access.ts`
- Test: `apps/api/src/lib/access.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2–8 and the FE later):
  - `@mms/shared`: enums `INTERVAL_TYPE`, `TRACKING_STATUS`; preprocessors `booleanFromString`, `nullableString`, `nullableDate`, `nullableUuid`; `createVehicleBodySchema`/`CreateVehicleBody`, `updateVehicleBodySchema`/`UpdateVehicleBody`, `vehicleResponseSchema`/`VehicleResponse`; `createMaintenanceBodySchema`/`CreateMaintenanceBody`, `updateMaintenanceBodySchema`/`UpdateMaintenanceBody`; `createStandardBodySchema`/`CreateStandardBody`, `updateStandardBodySchema`/`UpdateStandardBody`, `createScheduleItemBodySchema`/`CreateScheduleItemBody`; `assignTrackingBodySchema`/`AssignTrackingBody`, `completeTrackingBodySchema`/`CompleteTrackingBody`; `createSparePartBodySchema`/`CreateSparePartBody`, `updateSparePartBodySchema`/`UpdateSparePartBody`; `createToolBodySchema`/`CreateToolBody`, `updateToolBodySchema`/`UpdateToolBody`.
  - `apps/api/src/lib/access.js`: `INVENTORY_READ_ROLES: UserRole[]` (admin, requester, evp_operations, driver).

- [ ] **Step 1: Write the failing test**

`apps/api/src/lib/access.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '@mms/shared';
import {
  booleanFromString,
  nullableDate,
  nullableString,
  createVehicleBodySchema,
  createToolBodySchema,
  completeTrackingBodySchema
} from '@mms/shared';
import { INVENTORY_READ_ROLES } from './access.js';

describe('access + multipart contracts', () => {
  it('INVENTORY_READ_ROLES excludes security_guard (spec §5 asymmetry)', () => {
    expect(INVENTORY_READ_ROLES).toContain(USER_ROLES.driver);
    expect(INVENTORY_READ_ROLES).not.toContain(USER_ROLES.security_guard);
  });

  it('booleanFromString treats only the literal "true" as true', () => {
    expect(booleanFromString.parse('true')).toBe(true);
    expect(booleanFromString.parse('false')).toBe(false);
    expect(booleanFromString.parse(true)).toBe(true);
  });

  it('nullableString: "" clears to null, absent stays undefined', () => {
    expect(nullableString.parse('')).toBeNull();
    expect(nullableString.parse(undefined)).toBeUndefined();
    expect(nullableString.parse('hello')).toBe('hello');
  });

  it('nullableDate: "" clears to null, a value coerces to a Date', () => {
    expect(nullableDate.parse('')).toBeNull();
    expect(nullableDate.parse('2027-06-30')).toBeInstanceOf(Date);
    expect(nullableDate.parse(undefined)).toBeUndefined();
  });

  it('createVehicleBodySchema coerces multipart string fields', () => {
    const parsed = createVehicleBodySchema.parse({
      make: 'Toyota',
      model: 'Hiace',
      year: '2021',
      vin: 'JT123',
      licensePlate: 'ABC-123',
      capacity: '12',
      fuelType: 'diesel',
      mileage: '48000',
      insuranceExpiry: '2027-01-01',
      registrationExpiry: '2027-03-01',
      branchId: '00000000-0000-4000-8000-000000000001'
    });
    expect(parsed.year).toBe(2021);
    expect(parsed.capacity).toBe(12);
    expect(parsed.status).toBe('available'); // default
    expect(parsed.insuranceExpiry).toBeInstanceOf(Date);
  });

  it('createToolBodySchema defaults status and coerces borrow dates', () => {
    const parsed = createToolBodySchema.parse({ name: 'Torque Wrench' });
    expect(parsed.status).toBe('available');
    const borrowed = createToolBodySchema.parse({
      name: 'Jack',
      status: 'borrowed',
      borrowedById: '00000000-0000-4000-8000-000000000009',
      borrowedDate: '2026-07-01'
    });
    expect(borrowed.borrowedDate).toBeInstanceOf(Date);
  });

  it('completeTrackingBodySchema requires a numeric completedMileage', () => {
    expect(completeTrackingBodySchema.parse({ completedMileage: '52000' }).completedMileage).toBe(52000);
    expect(() => completeTrackingBodySchema.parse({})).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --filter @mms/api test -- src/lib/access`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

Append to `packages/shared/src/enums.ts`:

```ts
// Schedule-item interval kind. Descriptive/UI-only — the next-due computation
// branches on the truthiness of interval_mileage / interval_months, NOT on this
// (faithful to the FE's real behavior). See modules/maintenance/next-due.ts.
export const INTERVAL_TYPE = {
  MILEAGE: 'mileage',
  TIME: 'time',
  BOTH: 'both'
} as const;

// Maintenance-tracking display status. Only 'pending' and 'completed' are ever
// persisted; 'due_soon' and 'overdue' are DERIVED on read (spec §6, ported from
// the FE's computeTrackingStatus).
export const TRACKING_STATUS = {
  PENDING: 'pending',
  DUE_SOON: 'due_soon',
  OVERDUE: 'overdue',
  COMPLETED: 'completed'
} as const;
```

Append to `packages/shared/src/contracts/common.ts`:

```ts
// ----- Multipart preprocessors -----
// Everything in a multipart/form-data body arrives as a string. These coerce
// the three-valued "absent = leave / '' = clear / value = set" convention the
// image-and-borrow-field forms rely on. NEVER use z.coerce.boolean() for a
// multipart flag — it treats the string 'false' as true.

// A flag whose only truthy value is the literal string 'true'.
export const booleanFromString = z.preprocess(
  (v) => (typeof v === 'string' ? v === 'true' : v),
  z.boolean()
);

// Optional-nullable string: absent → undefined (leave), '' → null (clear).
export const nullableString = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().nullable().optional()
);

// Optional-nullable UUID with the same three-valued convention.
export const nullableUuid = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().uuid().nullable().optional()
);

// Optional-nullable date: absent → undefined, '' → null, value → coerced Date.
export const nullableDate = z.preprocess(
  (v) => (v === '' ? null : v),
  z.coerce.date().nullable().optional()
);
```

(`z` is already imported at the top of `common.ts`.)

`packages/shared/src/contracts/vehicles.ts`:

```ts
import { z } from 'zod';
import { FUEL_TYPE, VEHICLE_STATUS } from '../enums.js';
import { nullableUuid } from './common.js';

const vehicleStatusSchema = z.nativeEnum(VEHICLE_STATUS);
const fuelTypeSchema = z.nativeEnum(FUEL_TYPE);

// Validation deliberately mirrors the current (lax) FE rules: year floor 1900
// with no ceiling, plate/vin any non-empty string, dates any parseable value.
export const createVehicleBodySchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1900),
  vin: z.string().min(1),
  licensePlate: z.string().min(1),
  capacity: z.coerce.number().int().min(1),
  fuelType: fuelTypeSchema,
  mileage: z.coerce.number().int().min(0),
  status: vehicleStatusSchema.default('available'),
  insuranceExpiry: z.coerce.date(),
  registrationExpiry: z.coerce.date(),
  branchId: z.string().uuid(),
  maintenanceStandardId: nullableUuid
});
export type CreateVehicleBody = z.infer<typeof createVehicleBodySchema>;

// Partial for PATCH, plus removedImages (URLs to drop from images[] on edit).
export const updateVehicleBodySchema = createVehicleBodySchema.partial().extend({
  removedImages: z.union([z.string(), z.array(z.string())]).optional()
});
export type UpdateVehicleBody = z.infer<typeof updateVehicleBodySchema>;

// Loose response type (Prisma row serialized to JSON); the FE consumes the
// type, not runtime validation.
export const vehicleResponseSchema = z
  .object({
    id: z.string().uuid(),
    make: z.string(),
    model: z.string(),
    year: z.number(),
    vin: z.string(),
    licensePlate: z.string(),
    capacity: z.number(),
    fuelType: fuelTypeSchema,
    mileage: z.number(),
    status: vehicleStatusSchema,
    images: z.array(z.string()),
    branchId: z.string().uuid().nullable(),
    maintenanceStandardId: z.string().uuid().nullable()
  })
  .passthrough();
export type VehicleResponse = z.infer<typeof vehicleResponseSchema>;
```

`packages/shared/src/contracts/maintenance.ts`:

```ts
import { z } from 'zod';
import { INTERVAL_TYPE, MAINTENANCE_TYPE } from '../enums.js';

// ----- Simple service-history rows (/maintenance) -----
export const createMaintenanceBodySchema = z.object({
  vehicleId: z.string().uuid(),
  type: z.nativeEnum(MAINTENANCE_TYPE),
  date: z.coerce.date(),
  cost: z.coerce.number().min(0).nullable().optional(),
  mileage: z.coerce.number().int().min(0).nullable().optional(),
  nextDue: z.coerce.date().nullable().optional(), // manually entered, NOT computed
  description: z.string().nullable().optional()
});
export type CreateMaintenanceBody = z.infer<typeof createMaintenanceBodySchema>;

export const updateMaintenanceBodySchema = createMaintenanceBodySchema.partial();
export type UpdateMaintenanceBody = z.infer<typeof updateMaintenanceBodySchema>;

// ----- Standards + nested schedule items (/maintenance-standards) -----
export const createScheduleItemBodySchema = z.object({
  taskName: z.string().min(1),
  taskDescription: z.string().nullable().optional(),
  intervalType: z.nativeEnum(INTERVAL_TYPE).default('mileage'),
  intervalMileage: z.coerce.number().int().min(0).nullable().optional(),
  intervalMonths: z.coerce.number().int().min(0).nullable().optional()
});
export type CreateScheduleItemBody = z.infer<typeof createScheduleItemBodySchema>;

export const createStandardBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  scheduleItems: z.array(createScheduleItemBodySchema).optional()
});
export type CreateStandardBody = z.infer<typeof createStandardBodySchema>;

export const updateStandardBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional()
});
export type UpdateStandardBody = z.infer<typeof updateStandardBodySchema>;

// ----- Per-vehicle tracking (/vehicles/:id/maintenance-tracking, /maintenance-tracking/:id/complete) -----
export const assignTrackingBodySchema = z.object({
  maintenanceStandardId: z.string().uuid()
});
export type AssignTrackingBody = z.infer<typeof assignTrackingBodySchema>;

export const completeTrackingBodySchema = z.object({
  completedMileage: z.coerce.number().int().min(0),
  notes: z.string().nullable().optional()
});
export type CompleteTrackingBody = z.infer<typeof completeTrackingBodySchema>;
```

`packages/shared/src/contracts/spare-parts.ts`:

```ts
import { z } from 'zod';
import { booleanFromString, nullableString } from './common.js';

export const createSparePartBodySchema = z.object({
  name: z.string().min(1),
  brand: nullableString,
  quantity: z.coerce.number().int().min(0).default(0),
  description: nullableString
});
export type CreateSparePartBody = z.infer<typeof createSparePartBodySchema>;

export const updateSparePartBodySchema = createSparePartBodySchema.partial().extend({
  removeImage: booleanFromString.optional()
});
export type UpdateSparePartBody = z.infer<typeof updateSparePartBodySchema>;
```

`packages/shared/src/contracts/tools.ts`:

```ts
import { z } from 'zod';
import { TOOL_STATUS } from '../enums.js';
import { booleanFromString, nullableDate, nullableString, nullableUuid } from './common.js';

// Permissive by design: the tools UI writes borrow/return state directly onto
// the tool row (no borrow-request entity, no enforced invariants — spec §6).
export const createToolBodySchema = z.object({
  name: z.string().min(1),
  description: nullableString,
  status: z.nativeEnum(TOOL_STATUS).default('available'),
  borrowedById: nullableUuid, // -> drivers.id
  borrowedDate: nullableDate,
  estimatedReturnDate: nullableDate
});
export type CreateToolBody = z.infer<typeof createToolBodySchema>;

export const updateToolBodySchema = createToolBodySchema.partial().extend({
  removeImage: booleanFromString.optional()
});
export type UpdateToolBody = z.infer<typeof updateToolBodySchema>;
```

`apps/api/src/lib/access.ts`:

```ts
import { USER_ROLES } from '@mms/shared';
import type { UserRole } from '../middleware/require-role.js';

// Spec §5 read matrix: maintenance, spare-parts, and tools are readable by
// every role EXCEPT security_guard (whose dashboard renders none of them).
// Codified once so the asymmetric gate can't drift between the three modules.
export const INVENTORY_READ_ROLES: UserRole[] = [
  USER_ROLES.admin,
  USER_ROLES.requester,
  USER_ROLES.evp_operations,
  USER_ROLES.driver
];
```

Append to `packages/shared/src/index.ts`:

```ts
export * from './contracts/vehicles.js';
export * from './contracts/maintenance.js';
export * from './contracts/spare-parts.js';
export * from './contracts/tools.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mms/shared build && pnpm --filter @mms/api test -- src/lib/access`
Expected: all green. Then `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat: add vehicle/maintenance/inventory contracts, tracking enums, and inventory access helper"
```

---

### Task 2: Vehicles module (CRUD + multi-image + changeVehicleStatus audit)

**Files:**
- Create: `apps/api/src/modules/vehicles/status.ts` (the shared `changeVehicleStatus`), `apps/api/src/modules/vehicles/repository.ts`, `apps/api/src/modules/vehicles/service.ts`, `apps/api/src/modules/vehicles/controller.ts`, `apps/api/src/modules/vehicles/router.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/src/modules/vehicles/vehicles.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, `toSkipTake`, `createUploader('vehicles')`, `publicUploadPath`, middleware, factories (`authHeader`, `createTestBranch`, `createTestUser`).
- Produces:
  - `apps/api/src/modules/vehicles/status.js`: `changeVehicleStatus(client, vehicleId, newStatus, opts)` where `client: Prisma.TransactionClient`, `newStatus: VehicleStatus`, `opts: { changedBy?: string | null; reason?: string | null; source: StatusChangeSource }`; `StatusChangeSource = 'manual_edit' | 'trip_check_out' | 'trip_check_in' | 'job_order_note' | 'job_order_complete'`. No-op (no audit row) when the status is unchanged; throws `AppError(404)` if the vehicle is missing. **Plan 5 imports this.**
  - Endpoints: `GET /api/vehicles` (any auth; `{ data, count }`, make/model asc), `GET /api/vehicles/:id` (any auth), `POST /api/vehicles` (admin; multipart `images` ≤10), `PATCH /api/vehicles/:id` (admin; multipart new `images` + `removedImages`), `DELETE /api/vehicles/:id` (admin).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/vehicles/vehicles.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({ email: 'boss@test.local', role: 'admin' });
  return authHeader(user.id, user.email, 'admin');
}

// Minimal valid vehicle body fields (multipart via .field()).
function vehicleFields(branchId: string) {
  return {
    make: 'Toyota',
    model: 'Hiace',
    year: '2021',
    vin: 'JT-VIN-001',
    licensePlate: 'ABC-1001',
    capacity: '12',
    fuelType: 'diesel',
    mileage: '48000',
    insuranceExpiry: '2027-01-01',
    registrationExpiry: '2027-03-01',
    branchId
  };
}

async function postVehicle(header: string, branchId: string) {
  const req = request(app).post('/api/vehicles').set('Authorization', header);
  const f = vehicleFields(branchId);
  for (const [k, v] of Object.entries(f)) req.field(k, v);
  return req;
}

describe('vehicles module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates, reads, lists, updates, and deletes a vehicle (admin)', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();

    const created = await postVehicle(header, branch.id);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ make: 'Toyota', status: 'available', mileage: 48000 });
    expect(created.body.images).toEqual([]);
    const id = created.body.id as string;

    const fetched = await request(app).get(`/api/vehicles/${id}`).set('Authorization', header);
    expect(fetched.status).toBe(200);
    expect(fetched.body.licensePlate).toBe('ABC-1001');

    const list = await request(app).get('/api/vehicles').set('Authorization', header);
    expect(list.body.count).toBe(1);

    const updated = await request(app)
      .patch(`/api/vehicles/${id}`)
      .set('Authorization', header)
      .field('mileage', '52000');
    expect(updated.status).toBe(200);
    expect(updated.body.mileage).toBe(52000);

    const removed = await request(app).delete(`/api/vehicles/${id}`).set('Authorization', header);
    expect(removed.status).toBe(204);
    expect(await prisma.vehicle.count()).toBe(0);
  });

  it('is readable by any authenticated role including security_guard', async () => {
    const branch = await createTestBranch();
    await postVehicle(await adminHeader(), branch.id);
    const { user } = await createTestUser({ email: 'guard@test.local', role: 'security_guard' });
    const res = await request(app)
      .get('/api/vehicles')
      .set('Authorization', authHeader(user.id, user.email, 'security_guard'));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('writes a vehicle_status_audit row when PATCH changes status, and none when it does not', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const created = await postVehicle(header, branch.id);
    const id = created.body.id as string;

    // A non-status field change writes NO audit row.
    await request(app).patch(`/api/vehicles/${id}`).set('Authorization', header).field('mileage', '50000');
    expect(await prisma.vehicleStatusAudit.count()).toBe(0);

    // A status change writes exactly one audit row capturing old -> new.
    const res = await request(app)
      .patch(`/api/vehicles/${id}`)
      .set('Authorization', header)
      .field('status', 'under_maintenance');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('under_maintenance');
    const audits = await prisma.vehicleStatusAudit.findMany({ where: { vehicleId: id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      oldStatus: 'available',
      newStatus: 'under_maintenance',
      changeSource: 'manual_edit'
    });
  });

  it('merges edit images: (existing minus removedImages) + newly uploaded', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const created = await postVehicle(header, branch.id);
    const id = created.body.id as string;
    // Seed two existing image paths directly (upload plumbing is exercised elsewhere).
    await prisma.vehicle.update({
      where: { id },
      data: { images: ['/uploads/vehicles/a.jpg', '/uploads/vehicles/b.jpg'] }
    });

    const res = await request(app)
      .patch(`/api/vehicles/${id}`)
      .set('Authorization', header)
      .field('removedImages', '/uploads/vehicles/a.jpg')
      .attach('images', Buffer.from('fakejpeg'), { filename: 'c.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(2); // b.jpg kept + the newly uploaded one
    expect(res.body.images).toContain('/uploads/vehicles/b.jpg');
    expect(res.body.images).not.toContain('/uploads/vehicles/a.jpg');
  });

  it('409s deleting a vehicle referenced by a maintenance row (VEHICLE_IN_USE)', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const created = await postVehicle(header, branch.id);
    const id = created.body.id as string;
    await prisma.maintenance.create({ data: { vehicleId: id, type: 'service', date: new Date('2026-01-01') } });

    const res = await request(app).delete(`/api/vehicles/${id}`).set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VEHICLE_IN_USE');
  });

  it('404s a missing vehicle and 403s writes for non-admins', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const miss = await request(app)
      .get('/api/vehicles/00000000-0000-4000-8000-00000000dead')
      .set('Authorization', header);
    expect(miss.status).toBe(404);

    const { user } = await createTestUser({ email: 'req@test.local', role: 'requester' });
    const forbidden = await postVehicle(authHeader(user.id, user.email, 'requester'), branch.id);
    expect(forbidden.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @mms/api test -- src/modules/vehicles` → 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/vehicles/status.ts`:

```ts
import { Prisma, type VehicleStatus } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

export type StatusChangeSource =
  | 'manual_edit'
  | 'trip_check_out'
  | 'trip_check_in'
  | 'job_order_note'
  | 'job_order_complete';

interface ChangeStatusOpts {
  changedBy?: string | null;
  reason?: string | null;
  source: StatusChangeSource;
}

// Spec §4.2: the single choke point for EVERY vehicle status flip. Updates the
// status column and records a vehicle_status_audit row IN THE CALLER'S
// transaction, so the audit can never miss a change. No-op (no audit row) when
// the status is unchanged. Plan 5's trip/job-order transitions call this.
export async function changeVehicleStatus(
  client: Prisma.TransactionClient,
  vehicleId: string,
  newStatus: VehicleStatus,
  opts: ChangeStatusOpts
): Promise<void> {
  const vehicle = await client.vehicle.findUnique({
    where: { id: vehicleId },
    select: { status: true }
  });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  if (vehicle.status === newStatus) return;
  await client.vehicle.update({ where: { id: vehicleId }, data: { status: newStatus } });
  await client.vehicleStatusAudit.create({
    data: {
      vehicleId,
      oldStatus: vehicle.status,
      newStatus,
      changedBy: opts.changedBy ?? null,
      changeSource: opts.source,
      reason: opts.reason ?? null
    }
  });
}
```

`apps/api/src/modules/vehicles/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findVehicleById(id: string) {
  return prisma.vehicle.findUnique({ where: { id } });
}

export async function listVehicles(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.vehicle.findMany({ orderBy: [{ make: 'asc' }, { model: 'asc' }], ...skipTake }),
    prisma.vehicle.count()
  ]);
  return { data, count };
}
```

`apps/api/src/modules/vehicles/service.ts`:

```ts
import { Prisma } from '@prisma/client';
import type { CreateVehicleBody, PaginationQuery, UpdateVehicleBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findVehicleById, listVehicles } from './repository.js';
import { changeVehicleStatus } from './status.js';

export async function list(query: PaginationQuery) {
  return listVehicles(toSkipTake(query));
}

export async function getById(id: string) {
  const vehicle = await findVehicleById(id);
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  return vehicle;
}

// New vehicles are created directly (creation is not a status "change", so no
// audit row — spec §4.2).
export async function create(body: CreateVehicleBody, imagePaths: string[]) {
  return prisma.vehicle.create({ data: { ...body, images: imagePaths } });
}

export async function update(
  id: string,
  body: UpdateVehicleBody,
  newImagePaths: string[],
  actor: AuthenticatedUser
) {
  const existing = await findVehicleById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');

  // Image merge (spec §9 / recon): keep existing paths not in removedImages,
  // then append the newly uploaded ones. Orphaned files are accepted in v1.
  const removed = normalizeRemoved(body.removedImages);
  const mergedImages =
    newImagePaths.length > 0 || removed.length > 0
      ? [...existing.images.filter((url) => !removed.includes(url)), ...newImagePaths]
      : undefined;

  // Never write status through vehicle.update — route it through the audit
  // choke point so the change is recorded.
  const { status, removedImages: _removed, ...rest } = body;

  return prisma.$transaction(async (tx) => {
    if (status !== undefined && status !== existing.status) {
      await changeVehicleStatus(tx, id, status, { changedBy: actor.id, source: 'manual_edit' });
    }
    return tx.vehicle.update({
      where: { id },
      data: { ...rest, ...(mergedImages ? { images: mergedImages } : {}) }
    });
  });
}

export async function remove(id: string): Promise<void> {
  const existing = await findVehicleById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  try {
    await prisma.vehicle.delete({ where: { id } });
  } catch (err) {
    // FK RESTRICT from trip tickets, job orders, maintenance, tracking, audit,
    // or GPS rows — surface a domain 409 instead of a generic conflict.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new AppError(409, 'VEHICLE_IN_USE', 'Vehicle is referenced by existing records; set it out of service instead');
    }
    throw err;
  }
}

// removedImages arrives from multipart as string | string[] | undefined.
function normalizeRemoved(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
```

`apps/api/src/modules/vehicles/controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateVehicleBody, UpdateVehicleBody } from '@mms/shared';
import { paginationQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { publicUploadPath } from '../../lib/uploads.js';
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

// multer .array() puts uploaded files on req.files (an array here).
function uploadedPaths(req: Request): string[] {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  return files.map((f) => publicUploadPath('vehicles', f.filename));
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(paginationQuerySchema.parse(req.query)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateVehicleBody, uploadedPaths(req)));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(
    await service.update(requireIdParam(req), req.body as UpdateVehicleBody, uploadedPaths(req), requireUser(req))
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
```

`apps/api/src/modules/vehicles/router.ts`:

```ts
import { Router } from 'express';
import { USER_ROLES, createVehicleBodySchema, updateVehicleBodySchema } from '@mms/shared';
import { createUploader } from '../../lib/uploads.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const imageUpload = createUploader('vehicles');

export const vehiclesRouter = Router();

vehiclesRouter.use(requireAuth);
vehiclesRouter.get('/', controller.list); // any authenticated role (spec §5)
vehiclesRouter.get('/:id', controller.getById);
vehiclesRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  imageUpload.array('images', 10),
  validateBody(createVehicleBodySchema),
  controller.create
);
vehiclesRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  imageUpload.array('images', 10),
  validateBody(updateVehicleBodySchema),
  controller.update
);
vehiclesRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
```

Mount in `apps/api/src/app.ts`:

```ts
import { vehiclesRouter } from './modules/vehicles/router.js';
// ...
  app.use('/api/vehicles', vehiclesRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full `pnpm --filter @mms/api test` green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add vehicles module with multi-image CRUD and changeVehicleStatus audit choke point"
```

---

### Task 3: Spare-parts module (CRUD + single image)

**Files:**
- Create: `apps/api/src/modules/spare-parts/repository.ts`, `apps/api/src/modules/spare-parts/service.ts`, `apps/api/src/modules/spare-parts/controller.ts`, `apps/api/src/modules/spare-parts/router.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/src/modules/spare-parts/spare-parts.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, `INVENTORY_READ_ROLES`, `toSkipTake`, `createUploader('spare-parts')`, `publicUploadPath`, middleware, factories.
- Produces: `GET /api/spare-parts` (INVENTORY_READ_ROLES; `{ data, count }`, updatedAt desc), `GET /api/spare-parts/:id`, `POST /api/spare-parts` (admin; multipart `image`), `PATCH /api/spare-parts/:id` (admin; multipart `image` + `removeImage`), `DELETE /api/spare-parts/:id` (admin).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/spare-parts/spare-parts.test.ts`:

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

describe('spare-parts module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates, reads, updates, and deletes a spare part (admin)', async () => {
    const header = await adminHeader();
    const created = await request(app)
      .post('/api/spare-parts')
      .set('Authorization', header)
      .field('name', 'Brake Pad')
      .field('brand', 'Bendix')
      .field('quantity', '25');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Brake Pad', brand: 'Bendix', quantity: 25 });
    const id = created.body.id as string;

    const updated = await request(app)
      .patch(`/api/spare-parts/${id}`)
      .set('Authorization', header)
      .field('quantity', '10');
    expect(updated.body.quantity).toBe(10);

    const removed = await request(app).delete(`/api/spare-parts/${id}`).set('Authorization', header);
    expect(removed.status).toBe(204);
  });

  it('defaults quantity to 0 and lists newest-first with a total count', async () => {
    const header = await adminHeader();
    await request(app).post('/api/spare-parts').set('Authorization', header).field('name', 'Older');
    await request(app).post('/api/spare-parts').set('Authorization', header).field('name', 'Newer');
    const res = await request(app).get('/api/spare-parts').set('Authorization', header);
    expect(res.body.count).toBe(2);
    expect(res.body.data[0].name).toBe('Newer'); // updatedAt desc
    expect(res.body.data[1].quantity).toBe(0);
  });

  it('is readable by driver but 403 for security_guard (spec §5 asymmetry)', async () => {
    const { user: drv } = await createTestUser({ email: 'd@test.local', role: 'driver' });
    const okd = await request(app)
      .get('/api/spare-parts')
      .set('Authorization', authHeader(drv.id, drv.email, 'driver'));
    expect(okd.status).toBe(200);

    const { user: grd } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const forbidden = await request(app)
      .get('/api/spare-parts')
      .set('Authorization', authHeader(grd.id, grd.email, 'security_guard'));
    expect(forbidden.status).toBe(403);
  });

  it('403s writes for non-admins and 404s a missing part', async () => {
    const { user } = await createTestUser({ email: 'r@test.local', role: 'requester' });
    const forbidden = await request(app)
      .post('/api/spare-parts')
      .set('Authorization', authHeader(user.id, user.email, 'requester'))
      .field('name', 'X');
    expect(forbidden.status).toBe(403);

    const miss = await request(app)
      .get('/api/spare-parts/00000000-0000-4000-8000-00000000dead')
      .set('Authorization', await adminHeader());
    expect(miss.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/spare-parts/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findSparePartById(id: string) {
  return prisma.sparePart.findUnique({ where: { id } });
}

export async function listSpareParts(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.sparePart.findMany({ orderBy: { updatedAt: 'desc' }, ...skipTake }),
    prisma.sparePart.count()
  ]);
  return { data, count };
}
```

`apps/api/src/modules/spare-parts/service.ts`:

```ts
import type { CreateSparePartBody, PaginationQuery, UpdateSparePartBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { findSparePartById, listSpareParts } from './repository.js';

export async function list(query: PaginationQuery) {
  return listSpareParts(toSkipTake(query));
}

export async function getById(id: string) {
  const part = await findSparePartById(id);
  if (!part) throw new AppError(404, 'NOT_FOUND', 'Spare part not found');
  return part;
}

export async function create(body: CreateSparePartBody, imagePath: string | null) {
  return prisma.sparePart.create({ data: { ...body, image: imagePath } });
}

export async function update(id: string, body: UpdateSparePartBody, newImagePath: string | null) {
  const existing = await findSparePartById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Spare part not found');
  const { removeImage, ...rest } = body;
  // Image field: a new upload wins; else removeImage clears it; else untouched.
  const image = newImagePath ? newImagePath : removeImage ? null : undefined;
  return prisma.sparePart.update({
    where: { id },
    data: { ...rest, ...(image !== undefined ? { image } : {}) }
  });
}

export async function remove(id: string): Promise<void> {
  const existing = await findSparePartById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Spare part not found');
  await prisma.sparePart.delete({ where: { id } });
}
```

`apps/api/src/modules/spare-parts/controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateSparePartBody, UpdateSparePartBody } from '@mms/shared';
import { paginationQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { publicUploadPath } from '../../lib/uploads.js';
import * as service from './service.js';

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

function imagePath(req: Request): string | null {
  return req.file ? publicUploadPath('spare-parts', req.file.filename) : null;
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(paginationQuerySchema.parse(req.query)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateSparePartBody, imagePath(req)));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireIdParam(req), req.body as UpdateSparePartBody, imagePath(req)));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
```

`apps/api/src/modules/spare-parts/router.ts`:

```ts
import { Router } from 'express';
import { USER_ROLES, createSparePartBodySchema, updateSparePartBodySchema } from '@mms/shared';
import { INVENTORY_READ_ROLES } from '../../lib/access.js';
import { createUploader } from '../../lib/uploads.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const imageUpload = createUploader('spare-parts');

export const sparePartsRouter = Router();

sparePartsRouter.use(requireAuth);
sparePartsRouter.get('/', requireRole(...INVENTORY_READ_ROLES), controller.list);
sparePartsRouter.get('/:id', requireRole(...INVENTORY_READ_ROLES), controller.getById);
sparePartsRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  imageUpload.single('image'),
  validateBody(createSparePartBodySchema),
  controller.create
);
sparePartsRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  imageUpload.single('image'),
  validateBody(updateSparePartBodySchema),
  controller.update
);
sparePartsRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
```

Mount in `apps/api/src/app.ts`:

```ts
import { sparePartsRouter } from './modules/spare-parts/router.js';
// ...
  app.use('/api/spare-parts', sparePartsRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add spare-parts module with single-image CRUD"
```

---

### Task 4: Tools module (CRUD + single image + permissive borrow-field PATCH)

**Files:**
- Create: `apps/api/src/modules/tools/repository.ts`, `apps/api/src/modules/tools/service.ts`, `apps/api/src/modules/tools/controller.ts`, `apps/api/src/modules/tools/router.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/src/modules/tools/tools.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, `INVENTORY_READ_ROLES`, `toSkipTake`, `createUploader('tools')`, `publicUploadPath`, middleware, factories.
- Produces: `GET /api/tools` (INVENTORY_READ_ROLES; `{ data, count }`, updatedAt desc), `GET /api/tools/:id`, `POST /api/tools` (admin; multipart `image`), `PATCH /api/tools/:id` (admin; multipart `image` + `removeImage`; **accepts borrow fields `status`/`borrowedById`/`borrowedDate`/`estimatedReturnDate` as a permissive passthrough**), `DELETE /api/tools/:id` (admin).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/tools/tools.test.ts`:

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

async function createDriver(email = 'wheel@test.local') {
  return prisma.driver.create({ data: { email, fullName: 'Wheel Man', status: 'active' } });
}

describe('tools module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates, reads, updates, and deletes a tool (admin)', async () => {
    const header = await adminHeader();
    const created = await request(app)
      .post('/api/tools')
      .set('Authorization', header)
      .field('name', 'Torque Wrench');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Torque Wrench', status: 'available' });
    const id = created.body.id as string;

    const removed = await request(app).delete(`/api/tools/${id}`).set('Authorization', header);
    expect(removed.status).toBe(204);
  });

  it('borrows via PATCH (status + borrowedById + dates) and returns via PATCH (clear fields)', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const created = await request(app).post('/api/tools').set('Authorization', header).field('name', 'Jack');
    const id = created.body.id as string;

    const borrowed = await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('status', 'borrowed')
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-07-01')
      .field('estimatedReturnDate', '2026-07-15');
    expect(borrowed.status).toBe(200);
    expect(borrowed.body).toMatchObject({ status: 'borrowed', borrowedById: driver.id });
    expect(borrowed.body.borrowedDate).not.toBeNull();

    // Return: status back to available, borrow fields cleared to null ('' -> null).
    const returned = await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('status', 'available')
      .field('borrowedById', '')
      .field('borrowedDate', '')
      .field('estimatedReturnDate', '');
    expect(returned.status).toBe(200);
    expect(returned.body).toMatchObject({ status: 'available', borrowedById: null, borrowedDate: null });
  });

  it('lists newest-first, readable by driver, 403 for security_guard', async () => {
    const header = await adminHeader();
    await request(app).post('/api/tools').set('Authorization', header).field('name', 'A');
    const { user: drv } = await createTestUser({ email: 'd@test.local', role: 'driver' });
    const okd = await request(app).get('/api/tools').set('Authorization', authHeader(drv.id, drv.email, 'driver'));
    expect(okd.status).toBe(200);
    expect(okd.body.count).toBe(1);

    const { user: grd } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const forbidden = await request(app)
      .get('/api/tools')
      .set('Authorization', authHeader(grd.id, grd.email, 'security_guard'));
    expect(forbidden.status).toBe(403);
  });

  it('403s writes for non-admins', async () => {
    const { user } = await createTestUser({ email: 'r@test.local', role: 'requester' });
    const forbidden = await request(app)
      .post('/api/tools')
      .set('Authorization', authHeader(user.id, user.email, 'requester'))
      .field('name', 'X');
    expect(forbidden.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/tools/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findToolById(id: string) {
  return prisma.tool.findUnique({ where: { id } });
}

export async function listTools(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.tool.findMany({ orderBy: { updatedAt: 'desc' }, ...skipTake }),
    prisma.tool.count()
  ]);
  return { data, count };
}
```

`apps/api/src/modules/tools/service.ts`:

```ts
import type { CreateToolBody, PaginationQuery, UpdateToolBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { findToolById, listTools } from './repository.js';

export async function list(query: PaginationQuery) {
  return listTools(toSkipTake(query));
}

export async function getById(id: string) {
  const tool = await findToolById(id);
  if (!tool) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  return tool;
}

export async function create(body: CreateToolBody, imagePath: string | null) {
  return prisma.tool.create({ data: { ...body, image: imagePath } });
}

// Permissive passthrough (spec §6): whatever borrow fields the caller sends are
// written verbatim. '' already became null in the contract, so a "return" that
// sends empty borrow fields clears them. No borrow/return invariants enforced.
export async function update(id: string, body: UpdateToolBody, newImagePath: string | null) {
  const existing = await findToolById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  const { removeImage, ...rest } = body;
  const image = newImagePath ? newImagePath : removeImage ? null : undefined;
  return prisma.tool.update({
    where: { id },
    data: { ...rest, ...(image !== undefined ? { image } : {}) }
  });
}

export async function remove(id: string): Promise<void> {
  const existing = await findToolById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  await prisma.tool.delete({ where: { id } });
}
```

`apps/api/src/modules/tools/controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateToolBody, UpdateToolBody } from '@mms/shared';
import { paginationQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { publicUploadPath } from '../../lib/uploads.js';
import * as service from './service.js';

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

function imagePath(req: Request): string | null {
  return req.file ? publicUploadPath('tools', req.file.filename) : null;
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(paginationQuerySchema.parse(req.query)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateToolBody, imagePath(req)));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireIdParam(req), req.body as UpdateToolBody, imagePath(req)));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
```

`apps/api/src/modules/tools/router.ts`:

```ts
import { Router } from 'express';
import { USER_ROLES, createToolBodySchema, updateToolBodySchema } from '@mms/shared';
import { INVENTORY_READ_ROLES } from '../../lib/access.js';
import { createUploader } from '../../lib/uploads.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const imageUpload = createUploader('tools');

export const toolsRouter = Router();

toolsRouter.use(requireAuth);
toolsRouter.get('/', requireRole(...INVENTORY_READ_ROLES), controller.list);
toolsRouter.get('/:id', requireRole(...INVENTORY_READ_ROLES), controller.getById);
toolsRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  imageUpload.single('image'),
  validateBody(createToolBodySchema),
  controller.create
);
toolsRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  imageUpload.single('image'),
  validateBody(updateToolBodySchema),
  controller.update
);
toolsRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
```

Mount in `apps/api/src/app.ts`:

```ts
import { toolsRouter } from './modules/tools/router.js';
// ...
  app.use('/api/tools', toolsRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add tools module with single-image CRUD and permissive borrow-field PATCH"
```

---

### Task 5: Maintenance module — simple service-history CRUD

**Files:**
- Create: `apps/api/src/modules/maintenance/repository.ts`, `apps/api/src/modules/maintenance/service.ts`, `apps/api/src/modules/maintenance/controller.ts`, `apps/api/src/modules/maintenance/router.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/src/modules/maintenance/maintenance.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, `INVENTORY_READ_ROLES`, `toSkipTake`, middleware, factories.
- Produces: `GET /api/maintenance` (INVENTORY_READ_ROLES; `{ data, count }`, date desc; optional `?vehicleId=`), `GET /api/maintenance/:id`, `POST /api/maintenance` (admin; JSON), `PATCH /api/maintenance/:id` (admin), `DELETE /api/maintenance/:id` (admin). This router owns the `/api/maintenance` base; Task 7 mounts `/api/maintenance-tracking` separately.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/maintenance/maintenance.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({ email: 'boss@test.local', role: 'admin' });
  return authHeader(user.id, user.email, 'admin');
}

async function createVehicle() {
  const branch = await createTestBranch();
  return prisma.vehicle.create({
    data: {
      make: 'Toyota', model: 'Hiace', year: 2021, vin: 'V1', licensePlate: 'P1',
      capacity: 12, fuelType: 'diesel', mileage: 40000, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-03-01')
    }
  });
}

describe('maintenance module (service history)', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates, reads, updates, deletes and lists date-desc filtered by vehicle', async () => {
    const header = await adminHeader();
    const v = await createVehicle();

    const created = await request(app)
      .post('/api/maintenance')
      .set('Authorization', header)
      .send({ vehicleId: v.id, type: 'preventive', date: '2026-02-01', cost: 1200.5, mileage: 41000 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ type: 'preventive', mileage: 41000 });
    const id = created.body.id as string;

    await request(app)
      .post('/api/maintenance')
      .set('Authorization', header)
      .send({ vehicleId: v.id, type: 'service', date: '2026-05-01' });

    const list = await request(app)
      .get(`/api/maintenance?vehicleId=${v.id}`)
      .set('Authorization', header);
    expect(list.body.count).toBe(2);
    expect(new Date(list.body.data[0].date).getTime()).toBeGreaterThan(
      new Date(list.body.data[1].date).getTime()
    ); // date desc

    const updated = await request(app)
      .patch(`/api/maintenance/${id}`)
      .set('Authorization', header)
      .send({ cost: 999 });
    expect(updated.body.cost).toBe(999);

    const removed = await request(app).delete(`/api/maintenance/${id}`).set('Authorization', header);
    expect(removed.status).toBe(204);
  });

  it('403 write for non-admin, 403 read for security_guard, 200 read for driver', async () => {
    const { user: g } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const guardRead = await request(app)
      .get('/api/maintenance')
      .set('Authorization', authHeader(g.id, g.email, 'security_guard'));
    expect(guardRead.status).toBe(403);

    const { user: d } = await createTestUser({ email: 'd@test.local', role: 'driver' });
    const driverRead = await request(app)
      .get('/api/maintenance')
      .set('Authorization', authHeader(d.id, d.email, 'driver'));
    expect(driverRead.status).toBe(200);

    const writeForbidden = await request(app)
      .post('/api/maintenance')
      .set('Authorization', authHeader(d.id, d.email, 'driver'))
      .send({ vehicleId: '00000000-0000-4000-8000-00000000dead', type: 'service', date: '2026-01-01' });
    expect(writeForbidden.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/maintenance/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findMaintenanceById(id: string) {
  return prisma.maintenance.findUnique({ where: { id } });
}

export async function listMaintenance(vehicleId: string | undefined, skipTake: SkipTake) {
  const where = vehicleId ? { vehicleId } : undefined;
  const [data, count] = await Promise.all([
    prisma.maintenance.findMany({ where, orderBy: { date: 'desc' }, ...skipTake }),
    prisma.maintenance.count({ where })
  ]);
  return { data, count };
}
```

`apps/api/src/modules/maintenance/service.ts`:

```ts
import type { CreateMaintenanceBody, UpdateMaintenanceBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import type { PaginationQuery } from '@mms/shared';
import { prisma } from '../../lib/prisma.js';
import { findMaintenanceById, listMaintenance } from './repository.js';

export async function list(vehicleId: string | undefined, query: PaginationQuery) {
  return listMaintenance(vehicleId, toSkipTake(query));
}

export async function getById(id: string) {
  const row = await findMaintenanceById(id);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Maintenance record not found');
  return row;
}

export async function create(body: CreateMaintenanceBody) {
  return prisma.maintenance.create({ data: body });
}

export async function update(id: string, body: UpdateMaintenanceBody) {
  await getById(id);
  return prisma.maintenance.update({ where: { id }, data: body });
}

export async function remove(id: string): Promise<void> {
  await getById(id);
  await prisma.maintenance.delete({ where: { id } });
}
```

`apps/api/src/modules/maintenance/controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateMaintenanceBody, UpdateMaintenanceBody } from '@mms/shared';
import { paginationQuerySchema } from '@mms/shared';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

const listQuerySchema = paginationQuerySchema.extend({ vehicleId: z.string().uuid().optional() });

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

export async function list(req: Request, res: Response): Promise<void> {
  const q = listQuerySchema.parse(req.query);
  res.json(await service.list(q.vehicleId, q));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateMaintenanceBody));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireIdParam(req), req.body as UpdateMaintenanceBody));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
```

`apps/api/src/modules/maintenance/router.ts`:

```ts
import { Router } from 'express';
import { USER_ROLES, createMaintenanceBodySchema, updateMaintenanceBodySchema } from '@mms/shared';
import { INVENTORY_READ_ROLES } from '../../lib/access.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const maintenanceRouter = Router();

maintenanceRouter.use(requireAuth);
maintenanceRouter.get('/', requireRole(...INVENTORY_READ_ROLES), controller.list);
maintenanceRouter.get('/:id', requireRole(...INVENTORY_READ_ROLES), controller.getById);
maintenanceRouter.post('/', requireRole(USER_ROLES.admin), validateBody(createMaintenanceBodySchema), controller.create);
maintenanceRouter.patch('/:id', requireRole(USER_ROLES.admin), validateBody(updateMaintenanceBodySchema), controller.update);
maintenanceRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
```

Mount in `apps/api/src/app.ts`:

```ts
import { maintenanceRouter } from './modules/maintenance/router.js';
// ...
  app.use('/api/maintenance', maintenanceRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add maintenance service-history CRUD module"
```

---

### Task 6: Maintenance standards + nested schedule items

**Files:**
- Create: `apps/api/src/modules/maintenance/standards.repository.ts`, `apps/api/src/modules/maintenance/standards.service.ts`, `apps/api/src/modules/maintenance/standards.controller.ts`, `apps/api/src/modules/maintenance/standards.router.ts`
- Modify: `apps/api/src/app.ts` (mount `/api/maintenance-standards`)
- Test: `apps/api/src/modules/maintenance/standards.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, `INVENTORY_READ_ROLES`, `toSkipTake`, middleware, factories.
- Produces: `GET /api/maintenance-standards` (INVENTORY_READ_ROLES; `{ data, count }`, name asc, embeds `scheduleItems`), `GET /api/maintenance-standards/:id`, `POST /api/maintenance-standards` (admin; JSON; optional nested `scheduleItems`), `PATCH /api/maintenance-standards/:id` (admin; name/description only), `DELETE /api/maintenance-standards/:id` (admin; cascades items, 409 `STANDARD_IN_USE` if a schedule item is still referenced by tracking), `POST /api/maintenance-standards/:id/schedule-items` (admin; add one item), `DELETE /api/maintenance-standards/schedule-items/:itemId` (admin; 409 `SCHEDULE_ITEM_IN_USE` if referenced by tracking).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/maintenance/standards.test.ts`:

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

describe('maintenance-standards module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates a standard with nested schedule items and reads it back', async () => {
    const header = await adminHeader();
    const created = await request(app)
      .post('/api/maintenance-standards')
      .set('Authorization', header)
      .send({
        name: 'Diesel 10k',
        description: 'Every 10,000 km',
        scheduleItems: [
          { taskName: 'Oil change', intervalType: 'mileage', intervalMileage: 10000 },
          { taskName: 'Timing belt', intervalType: 'both', intervalMileage: 60000, intervalMonths: 48 }
        ]
      });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Diesel 10k');
    expect(created.body.scheduleItems).toHaveLength(2);
    const id = created.body.id as string;

    const fetched = await request(app).get(`/api/maintenance-standards/${id}`).set('Authorization', header);
    expect(fetched.body.scheduleItems).toHaveLength(2);

    const list = await request(app).get('/api/maintenance-standards').set('Authorization', header);
    expect(list.body.count).toBe(1);
    expect(list.body.data[0].scheduleItems).toBeDefined();
  });

  it('adds and removes individual schedule items', async () => {
    const header = await adminHeader();
    const std = await prisma.maintenanceStandard.create({ data: { name: 'Base' } });
    const added = await request(app)
      .post(`/api/maintenance-standards/${std.id}/schedule-items`)
      .set('Authorization', header)
      .send({ taskName: 'Brake check', intervalType: 'time', intervalMonths: 6 });
    expect(added.status).toBe(201);
    const itemId = added.body.id as string;

    const removed = await request(app)
      .delete(`/api/maintenance-standards/schedule-items/${itemId}`)
      .set('Authorization', header);
    expect(removed.status).toBe(204);
    expect(await prisma.maintenanceScheduleItem.count()).toBe(0);
  });

  it('updates name/description and deletes the standard (cascading its items)', async () => {
    const header = await adminHeader();
    const std = await prisma.maintenanceStandard.create({
      data: { name: 'Old', scheduleItems: { create: [{ taskName: 'X', intervalType: 'mileage', intervalMileage: 5000 }] } }
    });
    const patched = await request(app)
      .patch(`/api/maintenance-standards/${std.id}`)
      .set('Authorization', header)
      .send({ name: 'New' });
    expect(patched.body.name).toBe('New');

    const removed = await request(app).delete(`/api/maintenance-standards/${std.id}`).set('Authorization', header);
    expect(removed.status).toBe(204);
    expect(await prisma.maintenanceScheduleItem.count()).toBe(0); // cascade
  });

  it('403s writes for non-admins and 403s reads for security_guard', async () => {
    const { user: r } = await createTestUser({ email: 'r@test.local', role: 'requester' });
    const forbidden = await request(app)
      .post('/api/maintenance-standards')
      .set('Authorization', authHeader(r.id, r.email, 'requester'))
      .send({ name: 'X' });
    expect(forbidden.status).toBe(403);

    const { user: g } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const guardRead = await request(app)
      .get('/api/maintenance-standards')
      .set('Authorization', authHeader(g.id, g.email, 'security_guard'));
    expect(guardRead.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/maintenance/standards.repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findStandardById(id: string) {
  return prisma.maintenanceStandard.findUnique({
    where: { id },
    include: { scheduleItems: true }
  });
}

export async function listStandards(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.maintenanceStandard.findMany({
      orderBy: { name: 'asc' },
      include: { scheduleItems: true },
      ...skipTake
    }),
    prisma.maintenanceStandard.count()
  ]);
  return { data, count };
}
```

`apps/api/src/modules/maintenance/standards.service.ts`:

```ts
import { Prisma } from '@prisma/client';
import type {
  CreateScheduleItemBody,
  CreateStandardBody,
  PaginationQuery,
  UpdateStandardBody
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { findStandardById, listStandards } from './standards.repository.js';

export async function list(query: PaginationQuery) {
  return listStandards(toSkipTake(query));
}

export async function getById(id: string) {
  const std = await findStandardById(id);
  if (!std) throw new AppError(404, 'NOT_FOUND', 'Maintenance standard not found');
  return std;
}

export async function create(body: CreateStandardBody) {
  const { scheduleItems, ...rest } = body;
  return prisma.maintenanceStandard.create({
    data: { ...rest, ...(scheduleItems ? { scheduleItems: { create: scheduleItems } } : {}) },
    include: { scheduleItems: true }
  });
}

export async function update(id: string, body: UpdateStandardBody) {
  await getById(id);
  return prisma.maintenanceStandard.update({
    where: { id },
    data: body,
    include: { scheduleItems: true }
  });
}

export async function remove(id: string): Promise<void> {
  await getById(id);
  try {
    await prisma.maintenanceStandard.delete({ where: { id } });
  } catch (err) {
    // Items cascade-delete, but an item still referenced by a tracking row
    // (RESTRICT) blocks the whole delete.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new AppError(409, 'STANDARD_IN_USE', 'Standard has schedule items still tracked on a vehicle');
    }
    throw err;
  }
}

export async function addScheduleItem(standardId: string, body: CreateScheduleItemBody) {
  await getById(standardId);
  return prisma.maintenanceScheduleItem.create({ data: { ...body, maintenanceStandardId: standardId } });
}

export async function removeScheduleItem(itemId: string): Promise<void> {
  const item = await prisma.maintenanceScheduleItem.findUnique({ where: { id: itemId } });
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Schedule item not found');
  try {
    await prisma.maintenanceScheduleItem.delete({ where: { id: itemId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new AppError(409, 'SCHEDULE_ITEM_IN_USE', 'Schedule item is tracked on a vehicle');
    }
    throw err;
  }
}
```

`apps/api/src/modules/maintenance/standards.controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateScheduleItemBody, CreateStandardBody, UpdateStandardBody } from '@mms/shared';
import { paginationQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import * as service from './standards.service.js';

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new AppError(400, 'VALIDATION_ERROR', `Missing ${name} parameter`);
  return value;
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(paginationQuerySchema.parse(req.query)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireParam(req, 'id')));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateStandardBody));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireParam(req, 'id'), req.body as UpdateStandardBody));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireParam(req, 'id'));
  res.status(204).end();
}

export async function addScheduleItem(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.addScheduleItem(requireParam(req, 'id'), req.body as CreateScheduleItemBody));
}

export async function removeScheduleItem(req: Request, res: Response): Promise<void> {
  await service.removeScheduleItem(requireParam(req, 'itemId'));
  res.status(204).end();
}
```

`apps/api/src/modules/maintenance/standards.router.ts` — declare the static `/schedule-items/:itemId` path BEFORE `/:id` so Express 5 doesn't match `schedule-items` as an `:id`:

```ts
import { Router } from 'express';
import { USER_ROLES, createScheduleItemBodySchema, createStandardBodySchema, updateStandardBodySchema } from '@mms/shared';
import { INVENTORY_READ_ROLES } from '../../lib/access.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './standards.controller.js';

export const standardsRouter = Router();

standardsRouter.use(requireAuth);
standardsRouter.get('/', requireRole(...INVENTORY_READ_ROLES), controller.list);

// Static child-collection routes must precede the '/:id' matcher.
standardsRouter.delete(
  '/schedule-items/:itemId',
  requireRole(USER_ROLES.admin),
  controller.removeScheduleItem
);
standardsRouter.post(
  '/:id/schedule-items',
  requireRole(USER_ROLES.admin),
  validateBody(createScheduleItemBodySchema),
  controller.addScheduleItem
);

standardsRouter.get('/:id', requireRole(...INVENTORY_READ_ROLES), controller.getById);
standardsRouter.post('/', requireRole(USER_ROLES.admin), validateBody(createStandardBodySchema), controller.create);
standardsRouter.patch('/:id', requireRole(USER_ROLES.admin), validateBody(updateStandardBodySchema), controller.update);
standardsRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
```

Mount in `apps/api/src/app.ts`:

```ts
import { standardsRouter } from './modules/maintenance/standards.router.js';
// ...
  app.use('/api/maintenance-standards', standardsRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add maintenance-standards module with nested schedule items"
```

---

### Task 7: Vehicle maintenance tracking (next-due helpers + assign/init + list + complete)

**Files:**
- Create: `apps/api/src/modules/maintenance/next-due.ts`, `apps/api/src/modules/maintenance/tracking.repository.ts`, `apps/api/src/modules/maintenance/tracking.service.ts`, `apps/api/src/modules/maintenance/tracking.controller.ts`, `apps/api/src/modules/maintenance/tracking.router.ts`
- Modify: `apps/api/src/modules/vehicles/router.ts` (nested `GET/POST /vehicles/:id/maintenance-tracking`), `apps/api/src/app.ts` (mount `/api/maintenance-tracking`)
- Test: `apps/api/src/modules/maintenance/next-due.test.ts` (unit), `apps/api/src/modules/maintenance/tracking.test.ts` (integration)

**Interfaces:**
- Consumes: Task 1 contracts, Task 6 standards (schedule items), vehicles module, middleware, factories.
- Produces:
  - `next-due.js`: `computeNextDue(anchorDate, anchorMileage, intervalMonths, intervalMileage): { nextDueDate: Date | null; nextDueMileage: number | null }`; `deriveTrackingStatus(t, now, currentMileage): 'overdue' | 'due_soon' | 'pending' | 'completed'`; `addMonths(date, months): Date`.
  - `POST /api/vehicles/:id/maintenance-tracking` (admin; body `{ maintenanceStandardId }`; assigns the standard to the vehicle and creates a tracking row per not-yet-tracked schedule item seeded from today + current mileage, status `pending`), `GET /api/vehicles/:id/maintenance-tracking` (INVENTORY_READ_ROLES; rows with derived `displayStatus`, embedding `scheduleItem`, sorted overdue→due_soon→pending→completed), `POST /api/maintenance-tracking/:id/complete` (admin; body `{ completedMileage, notes? }`; logs completion + recomputes next-due in one transaction).

- [ ] **Step 1: Write the failing unit tests**

`apps/api/src/modules/maintenance/next-due.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addMonths, computeNextDue, deriveTrackingStatus } from './next-due.js';

describe('computeNextDue (interval_type is ignored — truthiness only)', () => {
  it('computes both date and mileage when both intervals are set', () => {
    const r = computeNextDue(new Date('2026-01-15'), 50000, 12, 10000);
    expect(r.nextDueMileage).toBe(60000);
    expect(r.nextDueDate?.toISOString().slice(0, 10)).toBe('2027-01-15');
  });

  it('leaves date null for a mileage-only interval and vice versa', () => {
    expect(computeNextDue(new Date('2026-01-15'), 50000, null, 10000).nextDueDate).toBeNull();
    expect(computeNextDue(new Date('2026-01-15'), 50000, 6, null).nextDueMileage).toBeNull();
  });

  it('adds calendar months with JS Date.setMonth semantics (Jan 31 + 1mo overflows)', () => {
    expect(addMonths(new Date('2026-01-31'), 1).getMonth()).toBe(2); // March (overflow), preserving FE behavior
  });
});

describe('deriveTrackingStatus (spec-faithful port of computeTrackingStatus)', () => {
  const now = new Date('2026-06-01');

  it('completed + past due date OR mileage reached -> overdue', () => {
    expect(deriveTrackingStatus({ status: 'completed', nextDueDate: new Date('2026-05-01'), nextDueMileage: null }, now, 0)).toBe('overdue');
    expect(deriveTrackingStatus({ status: 'completed', nextDueDate: null, nextDueMileage: 60000 }, now, 60000)).toBe('overdue');
  });

  it('completed + within 30 days OR within 500km -> due_soon', () => {
    expect(deriveTrackingStatus({ status: 'completed', nextDueDate: new Date('2026-06-20'), nextDueMileage: null }, now, 0)).toBe('due_soon');
    expect(deriveTrackingStatus({ status: 'completed', nextDueDate: null, nextDueMileage: 60000 }, now, 59600)).toBe('due_soon');
  });

  it('completed + comfortably ahead -> completed', () => {
    expect(deriveTrackingStatus({ status: 'completed', nextDueDate: new Date('2027-01-01'), nextDueMileage: 90000 }, now, 40000)).toBe('completed');
  });

  it('never-completed row -> pending, or overdue if a due threshold is already passed', () => {
    expect(deriveTrackingStatus({ status: 'pending', nextDueDate: new Date('2027-01-01'), nextDueMileage: null }, now, 0)).toBe('pending');
    expect(deriveTrackingStatus({ status: 'pending', nextDueDate: new Date('2026-05-01'), nextDueMileage: null }, now, 0)).toBe('overdue');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @mms/api test -- src/modules/maintenance/next-due` → module missing.

- [ ] **Step 3: Implement the pure helpers**

`apps/api/src/modules/maintenance/next-due.ts`:

```ts
// Ported verbatim from the FE's completeMaintenanceTask / computeTrackingStatus
// (feat/standard-maintenance). interval_type is intentionally NOT consulted —
// each output derives purely from the truthiness of its interval.

// Adds whole calendar months using JS Date.setMonth (preserving the FE's
// overflow behavior, e.g. Jan 31 + 1 month -> Mar 3).
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function computeNextDue(
  anchorDate: Date,
  anchorMileage: number,
  intervalMonths: number | null,
  intervalMileage: number | null
): { nextDueDate: Date | null; nextDueMileage: number | null } {
  return {
    nextDueDate: intervalMonths ? addMonths(anchorDate, intervalMonths) : null,
    nextDueMileage: intervalMileage ? anchorMileage + intervalMileage : null
  };
}

interface TrackingLike {
  status: string | null;
  nextDueDate: Date | null;
  nextDueMileage: number | null;
}

// Derives the display status. Only 'pending'/'completed' are ever persisted;
// 'overdue'/'due_soon' are computed here on read (spec §6). Thresholds:
// overdue = past due date OR mileage >= next; due_soon = within 30 days OR
// within 500 km (checked only for already-completed rows).
export function deriveTrackingStatus(
  t: TrackingLike,
  now: Date,
  currentMileage: number
): 'overdue' | 'due_soon' | 'pending' | 'completed' {
  const dateOverdue = t.nextDueDate !== null && t.nextDueDate <= now;
  const mileageOverdue = t.nextDueMileage !== null && currentMileage >= t.nextDueMileage;

  if (t.status === 'completed') {
    if (dateOverdue || mileageOverdue) return 'overdue';
    const soonDate = new Date(now);
    soonDate.setDate(soonDate.getDate() + 30);
    const dateSoon = t.nextDueDate !== null && t.nextDueDate <= soonDate;
    const mileageSoon = t.nextDueMileage !== null && currentMileage >= t.nextDueMileage - 500;
    if (dateSoon || mileageSoon) return 'due_soon';
    return 'completed';
  }

  // Never completed: pending unless a due threshold is already passed.
  if (t.nextDueDate !== null || t.nextDueMileage !== null) {
    if (dateOverdue || mileageOverdue) return 'overdue';
  }
  return 'pending';
}
```

- [ ] **Step 4: Run unit tests to verify they pass** — `pnpm --filter @mms/api test -- src/modules/maintenance/next-due` → green.

- [ ] **Step 5: Write the failing integration tests**

`apps/api/src/modules/maintenance/tracking.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function admin() {
  const { user } = await createTestUser({ email: 'boss@test.local', role: 'admin' });
  return { id: user.id, header: authHeader(user.id, user.email, 'admin') };
}

async function vehicleWithStandard(mileage = 40000) {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'Toyota', model: 'Hiace', year: 2021, vin: 'V1', licensePlate: 'P1',
      capacity: 12, fuelType: 'diesel', mileage, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-03-01')
    }
  });
  const standard = await prisma.maintenanceStandard.create({
    data: {
      name: 'Std',
      scheduleItems: {
        create: [
          { taskName: 'Oil', intervalType: 'mileage', intervalMileage: 10000 },
          { taskName: 'Belt', intervalType: 'both', intervalMileage: 60000, intervalMonths: 48 }
        ]
      }
    },
    include: { scheduleItems: true }
  });
  return { vehicle, standard };
}

describe('vehicle maintenance tracking', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('assigns a standard, seeds tracking rows, and lists them with derived status', async () => {
    const a = await admin();
    const { vehicle, standard } = await vehicleWithStandard(40000);

    const assigned = await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header)
      .send({ maintenanceStandardId: standard.id });
    expect(assigned.status).toBe(201);
    expect(assigned.body.count).toBe(2);
    // Vehicle now carries the standard.
    expect((await prisma.vehicle.findUnique({ where: { id: vehicle.id } }))?.maintenanceStandardId).toBe(standard.id);
    // next_due_mileage = currentMileage + interval (40000 + 10000).
    const oil = await prisma.vehicleMaintenanceTracking.findFirst({
      where: { vehicleId: vehicle.id, scheduleItem: { taskName: 'Oil' } }
    });
    expect(oil?.nextDueMileage).toBe(50000);
    expect(oil?.status).toBe('pending');

    const listed = await request(app)
      .get(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header);
    expect(listed.status).toBe(200);
    expect(listed.body.count).toBe(2);
    expect(listed.body.data[0]).toHaveProperty('displayStatus');
    expect(listed.body.data[0]).toHaveProperty('scheduleItem');

    // Re-assigning does not duplicate existing tracking rows.
    const again = await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header)
      .send({ maintenanceStandardId: standard.id });
    expect(again.body.count).toBe(0); // nothing new created
    expect(await prisma.vehicleMaintenanceTracking.count({ where: { vehicleId: vehicle.id } })).toBe(2);
  });

  it('completes a task: writes a log, updates last-completed + next-due, sets status completed', async () => {
    const a = await admin();
    const { vehicle, standard } = await vehicleWithStandard(40000);
    await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header)
      .send({ maintenanceStandardId: standard.id });
    const oil = await prisma.vehicleMaintenanceTracking.findFirstOrThrow({
      where: { vehicleId: vehicle.id, scheduleItem: { taskName: 'Oil' } }
    });

    const res = await request(app)
      .post(`/api/maintenance-tracking/${oil.id}/complete`)
      .set('Authorization', a.header)
      .send({ completedMileage: 52000, notes: 'Done' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.lastCompletedMileage).toBe(52000);
    expect(res.body.nextDueMileage).toBe(62000); // 52000 + 10000

    expect(await prisma.maintenanceCompletionLog.count({ where: { vehicleMaintenanceTrackingId: oil.id } })).toBe(1);
    const log = await prisma.maintenanceCompletionLog.findFirstOrThrow({
      where: { vehicleMaintenanceTrackingId: oil.id }
    });
    expect(log.completedById).toBe(a.id);
    expect(log.completedMileage).toBe(52000);
  });

  it('403s tracking reads for security_guard and 403s writes for non-admins', async () => {
    const { vehicle, standard } = await vehicleWithStandard();
    const { user: g } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const guardRead = await request(app)
      .get(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', authHeader(g.id, g.email, 'security_guard'));
    expect(guardRead.status).toBe(403);

    const { user: d } = await createTestUser({ email: 'd@test.local', role: 'driver' });
    const driverAssign = await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', authHeader(d.id, d.email, 'driver'))
      .send({ maintenanceStandardId: standard.id });
    expect(driverAssign.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run to verify failure** — 404s.

- [ ] **Step 7: Implement**

`apps/api/src/modules/maintenance/tracking.repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

export function findTrackingWithItem(id: string) {
  return prisma.vehicleMaintenanceTracking.findUnique({
    where: { id },
    include: { scheduleItem: true }
  });
}

export function listTrackingForVehicle(vehicleId: string) {
  return prisma.vehicleMaintenanceTracking.findMany({
    where: { vehicleId },
    include: { scheduleItem: true }
  });
}

export function findTrackedItemIds(vehicleId: string) {
  return prisma.vehicleMaintenanceTracking.findMany({
    where: { vehicleId },
    select: { maintenanceScheduleItemId: true }
  });
}
```

`apps/api/src/modules/maintenance/tracking.service.ts`:

```ts
import type { CompleteTrackingBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { computeNextDue, deriveTrackingStatus } from './next-due.js';
import {
  findTrackedItemIds,
  findTrackingWithItem,
  listTrackingForVehicle
} from './tracking.repository.js';

// Assigns a standard to a vehicle and creates a tracking row for every schedule
// item not already tracked (seeded from today + current mileage, status
// 'pending'). Existing tracking rows — and their completion history — are left
// intact. Returns { data, count } of the NEWLY created rows.
export async function assign(vehicleId: string, maintenanceStandardId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { mileage: true } });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  const standard = await prisma.maintenanceStandard.findUnique({
    where: { id: maintenanceStandardId },
    include: { scheduleItems: true }
  });
  if (!standard) throw new AppError(404, 'NOT_FOUND', 'Maintenance standard not found');

  const trackedIds = new Set(
    (await findTrackedItemIds(vehicleId)).map((t) => t.maintenanceScheduleItemId)
  );
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { maintenanceStandardId } });
    const rows = [];
    for (const item of standard.scheduleItems) {
      if (trackedIds.has(item.id)) continue;
      const { nextDueDate, nextDueMileage } = computeNextDue(
        now,
        vehicle.mileage,
        item.intervalMonths,
        item.intervalMileage
      );
      rows.push(
        await tx.vehicleMaintenanceTracking.create({
          data: {
            vehicleId,
            maintenanceScheduleItemId: item.id,
            status: 'pending',
            nextDueDate,
            nextDueMileage
          }
        })
      );
    }
    return rows;
  });

  return { data: created, count: created.length };
}

export async function listForVehicle(vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { mileage: true } });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  const now = new Date();
  const rows = await listTrackingForVehicle(vehicleId);
  const priority = { overdue: 0, due_soon: 1, pending: 2, completed: 3 } as const;
  const data = rows
    .map((t) => ({ ...t, displayStatus: deriveTrackingStatus(t, now, vehicle.mileage) }))
    .sort((a, b) => priority[a.displayStatus] - priority[b.displayStatus]);
  return { data, count: data.length };
}

// Records a completion and recomputes next-due in ONE transaction (the FE did
// these as separate calls; the API makes them atomic).
export async function complete(trackingId: string, actorId: string, body: CompleteTrackingBody) {
  const tracking = await findTrackingWithItem(trackingId);
  if (!tracking) throw new AppError(404, 'NOT_FOUND', 'Tracking record not found');
  const now = new Date();
  const { nextDueDate, nextDueMileage } = computeNextDue(
    now,
    body.completedMileage,
    tracking.scheduleItem.intervalMonths,
    tracking.scheduleItem.intervalMileage
  );

  return prisma.$transaction(async (tx) => {
    await tx.maintenanceCompletionLog.create({
      data: {
        vehicleMaintenanceTrackingId: trackingId,
        completedById: actorId,
        completedMileage: body.completedMileage,
        notes: body.notes ?? null
      }
    });
    return tx.vehicleMaintenanceTracking.update({
      where: { id: trackingId },
      data: {
        lastCompletedDate: now,
        lastCompletedMileage: body.completedMileage,
        nextDueDate,
        nextDueMileage,
        status: 'completed'
      }
    });
  });
}
```

`apps/api/src/modules/maintenance/tracking.controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { AssignTrackingBody, CompleteTrackingBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import * as service from './tracking.service.js';

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new AppError(400, 'VALIDATION_ERROR', `Missing ${name} parameter`);
  return value;
}

function requireUser(req: Request) {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.user;
}

export async function assign(req: Request, res: Response): Promise<void> {
  const body = req.body as AssignTrackingBody;
  res.status(201).json(await service.assign(requireParam(req, 'id'), body.maintenanceStandardId));
}

export async function listForVehicle(req: Request, res: Response): Promise<void> {
  res.json(await service.listForVehicle(requireParam(req, 'id')));
}

export async function complete(req: Request, res: Response): Promise<void> {
  res.json(await service.complete(requireParam(req, 'id'), requireUser(req).id, req.body as CompleteTrackingBody));
}
```

`apps/api/src/modules/maintenance/tracking.router.ts` — the standalone `/api/maintenance-tracking/:id/complete` router (the per-vehicle routes are added to the vehicles router below):

```ts
import { Router } from 'express';
import { USER_ROLES, completeTrackingBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './tracking.controller.js';

export const trackingRouter = Router();

trackingRouter.use(requireAuth);
trackingRouter.post(
  '/:id/complete',
  requireRole(USER_ROLES.admin),
  validateBody(completeTrackingBodySchema),
  controller.complete
);
```

Add the nested per-vehicle routes to `apps/api/src/modules/vehicles/router.ts` (import the tracking controller + tracking contracts; `requireAuth` is already applied router-wide):

```ts
import { INVENTORY_READ_ROLES } from '../../lib/access.js';
import { assignTrackingBodySchema } from '@mms/shared';
import * as trackingController from '../maintenance/tracking.controller.js';
// ... after the existing vehicle routes:
vehiclesRouter.get(
  '/:id/maintenance-tracking',
  requireRole(...INVENTORY_READ_ROLES),
  trackingController.listForVehicle
);
vehiclesRouter.post(
  '/:id/maintenance-tracking',
  requireRole(USER_ROLES.admin),
  validateBody(assignTrackingBodySchema),
  trackingController.assign
);
```

Mount the standalone router in `apps/api/src/app.ts`:

```ts
import { trackingRouter } from './modules/maintenance/tracking.router.js';
// ...
  app.use('/api/maintenance-tracking', trackingRouter);
```

- [ ] **Step 8: Run tests to verify they pass** — full `pnpm --filter @mms/api test` green; `pnpm typecheck` clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat: add vehicle maintenance tracking with next-due calc and completion logging"
```

---

### Task 8: Sweep + docs + deferred avatar-upload regression test

**Files:**
- Modify: `README.md`
- Test: `apps/api/src/modules/users/users.test.ts` (add the deferred avatar-upload regression test)

- [ ] **Step 1: Close the Plan 3 deferral — one avatar-upload regression test**

Append a test to the existing `POST /api/users` describe block in `apps/api/src/modules/users/users.test.ts` (verifies the multipart avatar path persists an `avatarUrl`; note the mimetype-derived extension from Plan 2):

```ts
  it('stores an uploaded avatar path on the created user', async () => {
    const { header } = await adminHeader();
    const role = await prisma.role.upsert({
      where: { name: 'requester' },
      update: {},
      create: { name: 'requester' }
    });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'avatar@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'Avatar User')
      .field('roleId', role.id)
      .attach('avatar', Buffer.from('fakepng'), { filename: 'me.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.avatarUrl).toMatch(/^\/uploads\/avatars\/.+\.png$/);
  });
```

Run: `pnpm --filter @mms/api test -- src/modules/users` → green.

- [ ] **Step 2: Update README** — extend the API section with one row/line per new endpoint group: vehicles CRUD (multipart `images`, multi), spare-parts CRUD (multipart `image`), tools CRUD (multipart `image`; PATCH accepts borrow fields), maintenance CRUD (`?vehicleId=`), maintenance-standards (+ nested `schedule-items`), maintenance-tracking (`GET/POST /vehicles/:id/maintenance-tracking`, `POST /maintenance-tracking/:id/complete`). Note the read-access asymmetry once (maintenance/spare-parts/tools reads exclude `security_guard`).

- [ ] **Step 3: Full sweep**

```bash
pnpm build && pnpm typecheck && pnpm --filter @mms/api test
pnpm --filter @mms/api start   # background
# login as the seeded admin, capture accessToken, then:
curl -s http://localhost:3000/api/vehicles -H "Authorization: Bearer <token>"            # expect the seeded vehicles
curl -s http://localhost:3000/api/tools -H "Authorization: Bearer <token>"               # expect the seeded tools
curl -s http://localhost:3000/api/spare-parts -H "Authorization: Bearer <token>"         # expect seeded spare parts
curl -s http://localhost:3000/api/maintenance-standards -H "Authorization: Bearer <token>"
# kill the server
```

- [ ] **Step 4: Commit**

```bash
git add apps/api README.md
git commit -m "docs: document vehicle/maintenance/inventory endpoints; add avatar-upload regression test"
```

---

## Self-Review Notes

- **Spec coverage:** §6 vehicles row ✔ (Task 2, incl. multipart images + DELETE), spare-parts row ✔ (Task 3), tools row incl. borrow-field PATCH ✔ (Task 4), maintenance CRUD ✔ (Task 5), maintenance-standards + nested schedule items ✔ (Task 6), `GET/POST /vehicles/:id/maintenance-tracking` + `POST /maintenance-tracking/:id/complete` ✔ (Task 7). §4.2 `changeVehicleStatus` audit choke point ✔ (Task 2, exported for Plan 5). §5 read matrix: vehicles any-auth ✔; maintenance/spare-parts/tools exclude `security_guard` ✔ (`INVENTORY_READ_ROLES`, tested in Tasks 3–7); writes admin ✔.
- **Ported behavior fidelity:** next-due `= anchor + interval` (months via `setMonth`, mileage additive), `interval_type` ignored, each output null when its interval is null — ✔ `computeNextDue`, unit-tested (Task 7). Display status derived on read with the 30-day / 500 km thresholds — ✔ `deriveTrackingStatus`, unit-tested. Tool borrow/return as a permissive PATCH (`'' → null`) — ✔ (Task 1 preprocessors + Task 4 test). Vehicle image merge (existing − removed + new) — ✔ (Task 2 test). Simple `maintenance.next_due` stays manually entered — ✔ (contract comment, not computed).
- **Type consistency:** `changeVehicleStatus`/`StatusChangeSource` defined Task 2, re-exported for Plan 5; `INVENTORY_READ_ROLES` defined Task 1, used Tasks 3/4/5/6/7; `computeNextDue`/`deriveTrackingStatus` defined Task 7, used by both assign and complete; contract names match the Global Constraints Interfaces list; multipart preprocessors defined Task 1, used by vehicles/spare-parts/tools contracts.
- **Migration/DB:** no new tables → no migration, and the test-DB `TABLES` truncation list already covers all eight tables (verified) — no change needed.
- **Deferrals resolved:** upload-orphan policy → accept + document (Global Constraints); asymmetric role-gate coverage → tested per module; avatar-upload regression → Task 8; response-mapper decision → raw rows for no-sensitive-field domains, explicit `toTrackingResponse`/`displayStatus` where shape transforms. Express 5 `req.query` read-only respected (controllers parse). Static `/schedule-items/:itemId` declared before `/:id` (Task 6) and `/:id/maintenance-tracking` composes cleanly under the vehicles router.
- **Deferred to Plan 5 (note at its opening):** `changeVehicleStatus` gains an `expectedFrom` skip-and-log variant for trip check-out/in and job-order transitions (spec §6.1/§6.2); job-order complete-repair decrements `spare_parts.quantity` (the inventory decrement this plan deliberately omits); vehicle multi-image orphan cleanup remains unbuilt (hardening backlog).
