# Backend Migration Plan 5/7: Trip Tickets, Fuel Allocations, Job Orders

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The two server-enforced status machines on the Plan 1–4 foundation: trip tickets (creation, role-scoped reads, the admin→EVP→guard approval/check-out/check-in lifecycle, and the 1:1 fuel-allocation row) and job orders (creation, driver-scoped reads, the admin-note→EVP-approve→admin-complete-repair lifecycle with the spare-parts join, the **new** inventory decrement, and vehicle-status side effects). Plus the carried-over Plan 4 hardening: a `@@unique` constraint on maintenance tracking (+ migration) and the `changeVehicleStatus` `expectedFrom` skip-and-log extension the transitions need.

**Architecture:** Feature modules per spec §6 (`router → controller → service → repository`), composed from the Plan 2–4 middleware and shared helpers. **Every state transition is a dedicated `POST /:id/<action>` endpoint** that validates (current status ∈ allowed-from set → else 409; caller role → else 403) and performs all writes — including vehicle-status flips (`changeVehicleStatus`) and inventory changes — inside ONE `prisma.$transaction`. Reads embed the relations the FE renders and are server-scoped per the spec §5 matrix. Fuel allocations have no standalone module: the 1:1 row is created and mutated only through trip-ticket transitions.

**Tech Stack:** Express 5, Prisma, Zod contracts in `@mms/shared`, Vitest + Supertest against `mms_test`.

**Spec:** `docs/superpowers/specs/2026-07-03-express-backend-migration-design.md` §5 (read matrix: trip-tickets/job-orders scoping), §6 (module table: trip-tickets/job-orders rows + response conventions), §6.1 (trip-ticket status machine), §6.2 (job-order status machine + spare-parts decrement). Prior work: Plans 1–4 (schema, seed, auth, middleware, uploads, reference/users/drivers, vehicles+`changeVehicleStatus`, spare-parts, tools, maintenance).

## Global Constraints

- TypeScript strict; no `any`; `noUncheckedIndexedAccess` on. **NodeNext ESM: every relative import in `apps/api` and `packages/shared` carries `.js`.**
- Error envelope `{ error: { code, message, details? } }`. Codes added in this plan: `INVALID_TRANSITION` (409 — current status not in the action's allowed-from set), `NOT_TICKET_OWNER` (403), plus existing `NOT_FOUND` (404), `FORBIDDEN` (403), `VALIDATION_ERROR` (400). Status-machine violations throw `AppError(409, 'INVALID_TRANSITION', …)`; wrong-role is the middleware's 403; stray Prisma `P2002`/`P2003` still map centrally to 409 `CONFLICT`.
- Response conventions (spec §6): collections → `{ data, count }` (count = total matching rows) via `toSkipTake`; both page/limit omitted → full set. **Sort orders (spec §6): trip tickets by `start_ts` DESC; job orders by `target_date` ASC.** Single resources → bare object. Reads embed the relations the FE renders (below).
- **Read scoping (spec §5 matrix):**
  - **trip-tickets** — any authenticated role may read, but scoped: `requester` sees only its own (`requestedById = caller`); `driver` sees only its own trips (`driverId =` the caller's driver row, resolved via `drivers.userId`); `admin`/`evp_operations`/`security_guard` see all (they pass `branchId`/`status` filters). Filters: `requestedBy`, `branchId`, `driverId`, `status`.
  - **job-orders** — readable by `admin`, `requester`, `evp_operations`, `driver` (NOT `security_guard`). `admin`/`evp_operations` see all; every other role sees only rows where `requestedById = caller` OR `assignedMechanicId =` the caller's driver row (resolved via `drivers.userId`). Filter: `status`.
- **Server-enforced state machines — every transition validates (allowed-from status → else 409 `INVALID_TRANSITION`; caller role → else 403) and is atomic (`prisma.$transaction`).** The FE's old free-form status edits and button-gating are replaced. `completed`/`cancelled`/`disapproved` (tickets) and `repaired` (orders) are terminal. **Admin cannot set a ticket to `approved` directly — only `approve-evp` does** (spec §6.1).
- **`changeVehicleStatus` is the sole vehicle-status writer** (Plan 4). This plan EXTENDS it with an optional `expectedFrom` (Task 2): when the vehicle is not in the expected prior status, the flip is **skipped** (no update, no audit row) and the function returns `false` — **the ticket/order transition still succeeds** (spec §6.1/§6.2). Callers pass `expectedFrom` for every trip/job-order flip.
- **INTENTIONAL new behavior beyond the current FE (spec-directed — do NOT treat as bugs; the recon confirmed these are absent today):** (1) trip check-out flips the vehicle to `on_trip` and check-in back to `available`; job-order note flips it to `under_maintenance` and complete-repair back to `available` — all via `changeVehicleStatus(expectedFrom)`. (2) guard `pre/postTripCheckedById` + `pre/postTripCheckedAt` are persisted (the FE dropped them). (3) `fuel_allocations.status` is set/mirrored (`pending` at admin-approve → `approved` at EVP-approve → `disapproved`/`cancelled` mirrored from the ticket if a row exists) and `fuel_allocations.branchId` is backfilled from the ticket. (4) complete-repair **decrements `spare_parts.quantity`** per the `job_order_spare_parts` rows and writes a `maintenance` history row. All in-transaction.
- **Fuel allocations (spec §4.2/§6.1):** the 1:1 row (`trip_ticket_id` unique) is created at admin-approve — copying the ticket's `vehicleId`, backfilling `branchId` from the ticket, setting `requestedById =` the **approving admin** (matches current FE mapping), `status = 'pending'`. EVP-approve stamps `approvedByEvpId` (the retained single EVP column — the old `approved_by_evp_operations` is superseded) and `status = 'approved'`. Reads EMBED the `fuelAllocation` relation; the FE flattens it to legacy `allocation_*` names in Plan 7 (NOT this plan's job).
- **Job-order spare parts (spec §4.2/§6.2):** recorded at the **note** step as `job_order_spare_parts(jobOrderId, sparePartId, quantity)` rows (the FE's `spare_parts_used` id-array becomes this join; **quantity is a new per-part input**). At complete-repair each row decrements the matching `spare_parts.quantity`.
- **New migration in this plan:** exactly one — `@@unique([vehicleId, maintenanceScheduleItemId])` on `VehicleMaintenanceTracking` (Task 2, the Plan 4 carry-over). No other schema change (all trip/job-order/fuel tables already exist from Plan 1). The test-DB `TABLES` list already includes `trip_tickets`, `fuel_allocations`, `job_orders`, `job_order_spare_parts` — no change needed.
- Multipart is NOT used in this plan (all bodies are JSON). Conventional commits; NO `Co-Authored-By` lines. All work on `production`. Docker Desktop is flaky on this host — relaunch + poll `docker info` before DB work if needed.

---

### Task 1: Shared contracts + `lib/http.ts` helper extraction

**Files:**
- Create: `packages/shared/src/contracts/trip-tickets.ts`, `packages/shared/src/contracts/job-orders.ts`, `apps/api/src/lib/http.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/lib/http.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3–8):
  - `@mms/shared`: `createTripTicketBodySchema`/`CreateTripTicketBody`, `updateTripTicketBodySchema`/`UpdateTripTicketBody`, `approveTripTicketBodySchema`/`ApproveTripTicketBody`, `reasonBodySchema`/`ReasonBody`, `tripTicketsListQuerySchema`/`TripTicketsListQuery`; `createJobOrderBodySchema`/`CreateJobOrderBody`, `updateJobOrderBodySchema`/`UpdateJobOrderBody`, `noteJobOrderBodySchema`/`NoteJobOrderBody`, `completeRepairBodySchema`/`CompleteRepairBody`, `jobOrdersListQuerySchema`/`JobOrdersListQuery`.
  - `apps/api/src/lib/http.js`: `requireIdParam(req): string`, `requireParam(req, name): string`, `requireUser(req): AuthenticatedUser` — the helpers currently duplicated across module controllers, extracted once (closes the Plan 4 final-review DRY finding). NEW modules use these; existing modules are left as-is in this plan.

- [ ] **Step 1: Write the failing test**

`apps/api/src/lib/http.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { requireIdParam, requireParam, requireUser } from './http.js';
import { AppError } from './errors.js';

function fakeReq(over: Partial<Request>): Request {
  return over as Request;
}

describe('http helpers', () => {
  it('requireIdParam returns a string id, rejects missing/array', () => {
    expect(requireIdParam(fakeReq({ params: { id: 'abc' } }))).toBe('abc');
    expect(() => requireIdParam(fakeReq({ params: {} }))).toThrow(AppError);
    expect(() => requireIdParam(fakeReq({ params: { id: ['a', 'b'] as unknown as string } }))).toThrow(AppError);
  });

  it('requireParam returns a named param or throws', () => {
    expect(requireParam(fakeReq({ params: { itemId: 'x' } }), 'itemId')).toBe('x');
    expect(() => requireParam(fakeReq({ params: {} }), 'itemId')).toThrow(AppError);
  });

  it('requireUser returns req.user or throws 401', () => {
    const user = { id: 'u1', email: 'a@b.c', role: 'admin', branchId: null };
    expect(requireUser(fakeReq({ user }))).toBe(user);
    expect(() => requireUser(fakeReq({}))).toThrow(AppError);
  });
});
```

- [ ] **Step 2: Run it to verify failure** — `pnpm --filter @mms/api test -- src/lib/http` → module missing.

- [ ] **Step 3: Implement**

`apps/api/src/lib/http.ts`:

```ts
import type { Request } from 'express';
import { AppError } from './errors.js';
import type { AuthenticatedUser } from '../middleware/require-auth.js';

// Express 5 types req.params values as string | string[]; narrow to a single
// string. These were duplicated across module controllers — centralized here.
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `Missing ${name} parameter`);
  }
  return value;
}

export function requireIdParam(req: Request): string {
  return requireParam(req, 'id');
}

export function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.user;
}
```

`packages/shared/src/contracts/trip-tickets.ts`:

```ts
import { z } from 'zod';
import { FUEL_TYPE, TRIP_TICKET_STATUS } from '../enums.js';
import { paginationQuerySchema } from './common.js';

// Create: a new ticket is always born pending_admin_approval; the client cannot
// choose a status. preparedBy is DB-required but the FE leaves it blank → default ''.
export const createTripTicketBodySchema = z.object({
  branchId: z.string().uuid(),
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  officeId: z.string().uuid().nullable().optional(),
  officeHeadId: z.string().uuid().nullable().optional(),
  destination: z.string().min(1),
  purpose: z.string().min(1),
  dateRequested: z.coerce.date(),
  participants: z.array(z.string()).default([]),
  participantsCount: z.coerce.number().int().min(1).nullable().optional(),
  preparedBy: z.string().default(''),
  requestedById: z.string().uuid().nullable().optional(),
  remarks: z.string().nullable().optional(),
  startTs: z.coerce.date().nullable().optional(),
  endTs: z.coerce.date().nullable().optional()
});
export type CreateTripTicketBody = z.infer<typeof createTripTicketBodySchema>;

// PATCH is only legal while pending_admin_approval (service-enforced); status is
// never editable here — transitions own it.
export const updateTripTicketBodySchema = createTripTicketBodySchema.partial();
export type UpdateTripTicketBody = z.infer<typeof updateTripTicketBodySchema>;

// approve(admin) carries the fuel-allocation payload.
export const approveTripTicketBodySchema = z.object({
  liters: z.coerce.number().positive(),
  fuelType: z.nativeEnum(FUEL_TYPE),
  date: z.coerce.date(),
  purpose: z.string().min(1),
  tripTo: z.string().min(1)
});
export type ApproveTripTicketBody = z.infer<typeof approveTripTicketBodySchema>;

// disapprove / cancel require a reason.
export const reasonBodySchema = z.object({ reason: z.string().min(1) });
export type ReasonBody = z.infer<typeof reasonBodySchema>;

export const tripTicketsListQuerySchema = paginationQuerySchema.extend({
  requestedBy: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  status: z.nativeEnum(TRIP_TICKET_STATUS).optional()
});
export type TripTicketsListQuery = z.infer<typeof tripTicketsListQuerySchema>;
```

`packages/shared/src/contracts/job-orders.ts`:

```ts
import { z } from 'zod';
import { JOB_ORDER_STATUS, REPAIR_DONE_TYPE } from '../enums.js';
import { paginationQuerySchema } from './common.js';

export const createJobOrderBodySchema = z.object({
  vehicleId: z.string().uuid(),
  branchId: z.string().uuid(),
  incidentDate: z.coerce.date().nullable().optional(),
  incidentDetails: z.string().nullable().optional(),
  requestedById: z.string().uuid().nullable().optional(),
  remarks: z.string().nullable().optional()
});
export type CreateJobOrderBody = z.infer<typeof createJobOrderBodySchema>;

// PATCH legal only while pending (service-enforced); never changes status.
export const updateJobOrderBodySchema = createJobOrderBodySchema.partial();
export type UpdateJobOrderBody = z.infer<typeof updateJobOrderBodySchema>;

// note(admin): assigns a mechanic and records spare parts used (quantity is a
// NEW per-part input; the old FE stored ids only).
export const noteJobOrderBodySchema = z.object({
  assignedMechanicId: z.string().uuid(),
  dateOfRequest: z.coerce.date().nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  spareParts: z
    .array(z.object({ sparePartId: z.string().uuid(), quantity: z.coerce.number().int().min(1).default(1) }))
    .default([])
});
export type NoteJobOrderBody = z.infer<typeof noteJobOrderBodySchema>;

// complete-repair(admin).
export const completeRepairBodySchema = z.object({
  repairDone: z.nativeEnum(REPAIR_DONE_TYPE),
  remarks: z.string().nullable().optional(),
  actualDateOfRelease: z.coerce.date().nullable().optional()
});
export type CompleteRepairBody = z.infer<typeof completeRepairBodySchema>;

export const jobOrdersListQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(JOB_ORDER_STATUS).optional()
});
export type JobOrdersListQuery = z.infer<typeof jobOrdersListQuerySchema>;
```

Append to `packages/shared/src/index.ts`:

```ts
export * from './contracts/trip-tickets.js';
export * from './contracts/job-orders.js';
```

- [ ] **Step 4: Run tests to verify they pass** — `pnpm --filter @mms/shared build && pnpm --filter @mms/api test -- src/lib/http` (all green); then `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat: add trip-ticket/job-order contracts and extract shared http param helpers"
```

---

### Task 2: Migration (tracking `@@unique`) + `changeVehicleStatus` `expectedFrom` + `assign()` dedup + `findDriverByUserId`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add `@@unique` to `VehicleMaintenanceTracking`), `apps/api/src/modules/vehicles/status.ts` (add `expectedFrom`), `apps/api/src/modules/maintenance/tracking.service.ts` (P2002-safe create), `apps/api/src/modules/drivers/repository.ts` (add `findDriverByUserId`)
- Create: migration via `prisma migrate dev`
- Test: `apps/api/src/modules/vehicles/status.test.ts`; extend `apps/api/src/modules/maintenance/tracking.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3–7):
  - `changeVehicleStatus(client, vehicleId, newStatus, opts)` — `opts` gains `expectedFrom?: VehicleStatus | VehicleStatus[]`; returns `Promise<boolean>` (`true` if flipped, `false` if skipped because status unchanged OR not in `expectedFrom`). Backward compatible — Plan 4's vehicle-update caller ignores the return.
  - `apps/api/src/modules/drivers/repository.js`: `findDriverByUserId(userId: string)` → the driver row linked to a login (for job-order scoping).

- [ ] **Step 1: Add the migration**

Add to the `VehicleMaintenanceTracking` model in `apps/api/prisma/schema.prisma` (a vehicle tracks each schedule item at most once — closes the Plan 4 assign() race):

```prisma
  @@unique([vehicleId, maintenanceScheduleItemId])
  @@map("vehicle_maintenance_tracking")
```

(The `@@map` line already exists — add the `@@unique` line directly above it.)

Generate + apply the migration (Docker Postgres must be up):

```bash
cd apps/api
pnpm exec prisma migrate dev --name tracking_unique_vehicle_schedule_item
pnpm exec prisma generate
```

Expected: a new migration folder under `apps/api/prisma/migrations/` adding the unique index; client regenerated. (The dev DB has no duplicate tracking rows — the seed creates none — so the migration applies cleanly.)

- [ ] **Step 2: Write the failing tests**

`apps/api/src/modules/vehicles/status.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { createTestBranch } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import { changeVehicleStatus } from './status.js';

async function makeVehicle(status: 'available' | 'on_trip' = 'available') {
  const branch = await createTestBranch();
  return prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V', licensePlate: 'P', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
}

describe('changeVehicleStatus expectedFrom', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('flips + audits when the current status matches expectedFrom', async () => {
    const v = await makeVehicle('available');
    const flipped = await prisma.$transaction((tx) =>
      changeVehicleStatus(tx, v.id, 'on_trip', { source: 'trip_check_out', expectedFrom: 'available' })
    );
    expect(flipped).toBe(true);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('on_trip');
    expect(await prisma.vehicleStatusAudit.count({ where: { vehicleId: v.id } })).toBe(1);
  });

  it('skips (no flip, no audit) and returns false when status is NOT in expectedFrom', async () => {
    const v = await makeVehicle('under_maintenance'); // not 'available'
    const flipped = await prisma.$transaction((tx) =>
      changeVehicleStatus(tx, v.id, 'on_trip', { source: 'trip_check_out', expectedFrom: 'available' })
    );
    expect(flipped).toBe(false);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe('under_maintenance');
    expect(await prisma.vehicleStatusAudit.count({ where: { vehicleId: v.id } })).toBe(0);
  });

  it('throws 404 for a missing vehicle', async () => {
    await expect(
      prisma.$transaction((tx) =>
        changeVehicleStatus(tx, '00000000-0000-4000-8000-00000000dead', 'on_trip', {
          source: 'trip_check_out',
          expectedFrom: 'available'
        })
      )
    ).rejects.toThrow('Vehicle not found');
  });
});
```

Append to `apps/api/src/modules/maintenance/tracking.test.ts` a dedup guard (inside the existing `describe`):

```ts
  it('does not create a duplicate tracking row when the unique key already exists', async () => {
    const a = await admin();
    const { vehicle, standard } = await vehicleWithStandard();
    await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header)
      .send({ maintenanceStandardId: standard.id });
    const before = await prisma.vehicleMaintenanceTracking.count({ where: { vehicleId: vehicle.id } });
    // Re-assign: no new rows, and no crash from the unique constraint.
    const again = await request(app)
      .post(`/api/vehicles/${vehicle.id}/maintenance-tracking`)
      .set('Authorization', a.header)
      .send({ maintenanceStandardId: standard.id });
    expect(again.status).toBe(201);
    expect(again.body.count).toBe(0);
    expect(await prisma.vehicleMaintenanceTracking.count({ where: { vehicleId: vehicle.id } })).toBe(before);
  });
```

- [ ] **Step 3: Run to verify failure** — `pnpm --filter @mms/api test -- src/modules/vehicles/status` → `expectedFrom` unsupported / returns void.

- [ ] **Step 4: Implement**

Replace `apps/api/src/modules/vehicles/status.ts` body with the `expectedFrom`-aware version (keep the imports and `StatusChangeSource` union unchanged):

```ts
interface ChangeStatusOpts {
  changedBy?: string | null;
  reason?: string | null;
  source: StatusChangeSource;
  // When set, the flip only happens if the vehicle is currently in one of these
  // statuses; otherwise it is skipped (no update, no audit) and false is
  // returned — the calling transition still succeeds (spec §6.1/§6.2).
  expectedFrom?: VehicleStatus | VehicleStatus[];
}

// Spec §4.2: the single choke point for EVERY vehicle status flip. Updates the
// status column and records a vehicle_status_audit row IN THE CALLER'S
// transaction. Returns true if it flipped, false if skipped.
export async function changeVehicleStatus(
  client: Prisma.TransactionClient,
  vehicleId: string,
  newStatus: VehicleStatus,
  opts: ChangeStatusOpts
): Promise<boolean> {
  const vehicle = await client.vehicle.findUnique({
    where: { id: vehicleId },
    select: { status: true }
  });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  if (opts.expectedFrom !== undefined) {
    const allowed = Array.isArray(opts.expectedFrom) ? opts.expectedFrom : [opts.expectedFrom];
    if (!allowed.includes(vehicle.status)) return false; // skip-and-log
  }
  if (vehicle.status === newStatus) return false;
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
  return true;
}
```

**Do NOT modify `assign()`'s transaction body.** The existing `trackedIds` pre-check already makes a *sequential* re-assign a no-op (the dedup test below passes on the current Plan 4 code), and the new `@@unique` constraint makes a genuine *concurrent* double-submit safe by construction: the losing insert violates the constraint, its transaction rolls back, and the central error handler maps the `P2002` to a clean `409 CONFLICT` — no duplicate rows.

**Explicitly do not add a per-item `try/catch (P2002) { continue }` inside the `$transaction`.** Prisma does not savepoint individual statements, so a constraint violation aborts the whole Postgres transaction (`25P02`); a following `tx.*` call would then throw `current transaction is aborted` — the catch cannot rescue it, and a last-iteration failure turns COMMIT into a silent ROLLBACK (a lying `201`). Leaving the create un-caught is correct: idempotency comes from the pre-check + constraint, not from swallowing the error.

Append to `apps/api/src/modules/drivers/repository.ts`:

```ts
// The driver row linked to a login — used to scope job-order visibility to the
// caller's assigned repairs (spec §6).
export function findDriverByUserId(userId: string) {
  return prisma.driver.findUnique({ where: { userId } });
}
```

- [ ] **Step 5: Run tests to verify they pass** — `pnpm --filter @mms/api test` (full suite green — status + tracking + all prior); `pnpm typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat: add tracking unique constraint, changeVehicleStatus expectedFrom, and driver-by-user lookup"
```

---

### Task 3: Trip-tickets module — create, scoped reads, PATCH, DELETE

**Files:**
- Create: `apps/api/src/modules/trip-tickets/repository.ts`, `apps/api/src/modules/trip-tickets/service.ts`, `apps/api/src/modules/trip-tickets/controller.ts`, `apps/api/src/modules/trip-tickets/router.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/src/modules/trip-tickets/trip-tickets.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, `toSkipTake`, `requireIdParam`/`requireUser` (`lib/http.js`), `findDriverByUserId`, middleware, factories.
- Produces: `GET /api/trip-tickets` (any auth, scoped; `{ data, count }`, startTs desc, filters `requestedBy`/`branchId`/`driverId`/`status`, embeds driver/vehicle/office/officeHead/fuelAllocation), `GET /api/trip-tickets/:id` (scoped, same embeds), `POST /api/trip-tickets` (any auth; forces `pending_admin_approval`), `PATCH /api/trip-tickets/:id` (owner or admin; only while `pending_admin_approval`), `DELETE /api/trip-tickets/:id` (admin; not while `in_progress`). Exports `tripTicketInclude` (the shared embed) + `scopeFor(actor)` for Tasks 4–5.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/trip-tickets/trip-tickets.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function scaffold() {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: 'available', branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
  const driver = await prisma.driver.create({ data: { email: 'd@test.local', fullName: 'D', status: 'active', branchId: branch.id } });
  return { branch, vehicle, driver };
}

function ticketBody(s: { branch: { id: string }; vehicle: { id: string }; driver: { id: string } }, requestedById: string) {
  return {
    branchId: s.branch.id, driverId: s.driver.id, vehicleId: s.vehicle.id,
    destination: 'Site A', purpose: 'Delivery', dateRequested: '2026-07-10',
    participants: ['Alice', 'Bob'], participantsCount: 2, requestedById,
    startTs: '2026-07-10T08:00:00.000Z', endTs: '2026-07-10T17:00:00.000Z'
  };
}

describe('trip-tickets module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates a ticket as pending_admin_approval and reads it back with embeds', async () => {
    const s = await scaffold();
    const { user } = await createTestUser({ email: 'req@test.local', role: 'requester' });
    const header = authHeader(user.id, user.email, 'requester');

    const created = await request(app).post('/api/trip-tickets').set('Authorization', header).send(ticketBody(s, user.id));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending_admin_approval');
    const id = created.body.id as string;

    const fetched = await request(app).get(`/api/trip-tickets/${id}`).set('Authorization', header);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toMatchObject({ destination: 'Site A' });
    expect(fetched.body.driver).toBeDefined();
    expect(fetched.body.vehicle).toBeDefined();
    expect(fetched.body).toHaveProperty('fuelAllocation'); // null until approved
  });

  it('ignores a client-supplied status on create (always pending_admin_approval)', async () => {
    const s = await scaffold();
    const { user } = await createTestUser({ email: 'req@test.local', role: 'requester' });
    const res = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', authHeader(user.id, user.email, 'requester'))
      .send({ ...ticketBody(s, user.id), status: 'approved' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_admin_approval');
  });

  it('scopes list: requester sees only own, admin sees all, sorted start_ts desc', async () => {
    const s = await scaffold();
    const { user: r1 } = await createTestUser({ email: 'r1@test.local', role: 'requester' });
    const { user: r2 } = await createTestUser({ email: 'r2@test.local', role: 'requester' });
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await request(app).post('/api/trip-tickets').set('Authorization', authHeader(r1.id, r1.email, 'requester'))
      .send({ ...ticketBody(s, r1.id), startTs: '2026-07-01T08:00:00.000Z' });
    await request(app).post('/api/trip-tickets').set('Authorization', authHeader(r2.id, r2.email, 'requester'))
      .send({ ...ticketBody(s, r2.id), startTs: '2026-07-20T08:00:00.000Z' });

    const asR1 = await request(app).get('/api/trip-tickets').set('Authorization', authHeader(r1.id, r1.email, 'requester'));
    expect(asR1.body.count).toBe(1); // only r1's own

    const asAdmin = await request(app).get('/api/trip-tickets').set('Authorization', authHeader(admin.id, admin.email, 'admin'));
    expect(asAdmin.body.count).toBe(2);
    expect(new Date(asAdmin.body.data[0].startTs) > new Date(asAdmin.body.data[1].startTs)).toBe(true); // start_ts desc
  });

  it('a query filter cannot widen a requester past their own tickets (IDOR guard)', async () => {
    const s = await scaffold();
    const { user: r1 } = await createTestUser({ email: 'r1@test.local', role: 'requester' });
    const { user: r2 } = await createTestUser({ email: 'r2@test.local', role: 'requester' });
    await request(app).post('/api/trip-tickets').set('Authorization', authHeader(r2.id, r2.email, 'requester')).send(ticketBody(s, r2.id));

    // r1 tries to read r2's tickets by spoofing the requestedBy filter — must see none.
    const spoof = await request(app)
      .get(`/api/trip-tickets?requestedBy=${r2.id}`)
      .set('Authorization', authHeader(r1.id, r1.email, 'requester'));
    expect(spoof.status).toBe(200);
    expect(spoof.body.count).toBe(0);
  });

  it('scopes driver-role list to the caller driver row (via drivers.userId)', async () => {
    const s = await scaffold();
    const { user: drvUser } = await createTestUser({ email: 'drv@test.local', role: 'driver' });
    await prisma.driver.update({ where: { id: s.driver.id }, data: { userId: drvUser.id } });
    const { user: req } = await createTestUser({ email: 'rq@test.local', role: 'requester' });
    await request(app).post('/api/trip-tickets').set('Authorization', authHeader(req.id, req.email, 'requester')).send(ticketBody(s, req.id));

    const asDriver = await request(app).get('/api/trip-tickets').set('Authorization', authHeader(drvUser.id, drvUser.email, 'driver'));
    expect(asDriver.status).toBe(200);
    expect(asDriver.body.count).toBe(1); // the ticket whose driverId is this driver
  });

  it('PATCH allowed while pending (owner) and 409 once not pending; DELETE admin-only', async () => {
    const s = await scaffold();
    const { user } = await createTestUser({ email: 'req@test.local', role: 'requester' });
    const header = authHeader(user.id, user.email, 'requester');
    const created = await request(app).post('/api/trip-tickets').set('Authorization', header).send(ticketBody(s, user.id));
    const id = created.body.id as string;

    const patched = await request(app).patch(`/api/trip-tickets/${id}`).set('Authorization', header).send({ destination: 'Site B' });
    expect(patched.status).toBe(200);
    expect(patched.body.destination).toBe('Site B');

    // Force it out of pending directly, then PATCH must 409.
    await prisma.tripTicket.update({ where: { id }, data: { status: 'approved' } });
    const late = await request(app).patch(`/api/trip-tickets/${id}`).set('Authorization', header).send({ destination: 'Site C' });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_TRANSITION');

    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const del = await request(app).delete(`/api/trip-tickets/${id}`).set('Authorization', authHeader(admin.id, admin.email, 'admin'));
    expect(del.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/trip-tickets/repository.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

// Relations the FE renders (spec §6.1 read contract). The FE flattens
// fuelAllocation into allocation_* names in Plan 7.
export const tripTicketInclude = {
  driver: true,
  vehicle: true,
  office: true,
  officeHead: true,
  fuelAllocation: true
} satisfies Prisma.TripTicketInclude;

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findTripTicketById(id: string) {
  return prisma.tripTicket.findUnique({ where: { id }, include: tripTicketInclude });
}

export async function listTripTickets(where: Prisma.TripTicketWhereInput, skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.tripTicket.findMany({ where, include: tripTicketInclude, orderBy: { startTs: 'desc' }, ...skipTake }),
    prisma.tripTicket.count({ where })
  ]);
  return { data, count };
}
```

`apps/api/src/modules/trip-tickets/service.ts`:

```ts
import type { Prisma } from '@prisma/client';
import type { CreateTripTicketBody, TripTicketsListQuery, UpdateTripTicketBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findDriverByUserId } from '../drivers/repository.js';
import { findTripTicketById, listTripTickets, tripTicketInclude } from './repository.js';

// Builds the visibility filter for a caller (spec §5): requester → own;
// driver → own trips (via drivers.userId); admin/evp/guard → unfiltered.
async function scopeFor(actor: AuthenticatedUser): Promise<Prisma.TripTicketWhereInput> {
  if (actor.role === 'requester') return { requestedById: actor.id };
  if (actor.role === 'driver') {
    const driver = await findDriverByUserId(actor.id);
    // No linked driver row → sees nothing (a uuid that can't match any driverId).
    return { driverId: driver?.id ?? '00000000-0000-4000-8000-000000000000' };
  }
  return {};
}

export async function list(query: TripTicketsListQuery, actor: AuthenticatedUser) {
  const scope = await scopeFor(actor);
  const filters: Prisma.TripTicketWhereInput = {
    ...(query.requestedBy ? { requestedById: query.requestedBy } : {}),
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.driverId ? { driverId: query.driverId } : {}),
    ...(query.status ? { status: query.status } : {})
  };
  // AND the caller's scope with the client filters — NEVER merge them by spread,
  // or a requester/driver ?requestedBy=/?driverId= filter would OVERWRITE the
  // scope key and read others' tickets (spec §5 IDOR). AND keeps scope binding:
  // admin/evp/guard scope is {} so their filters apply unchanged.
  const where: Prisma.TripTicketWhereInput = { AND: [scope, filters] };
  return listTripTickets(where, toSkipTake(query));
}

export async function getById(id: string, actor: AuthenticatedUser) {
  const ticket = await findTripTicketById(id);
  if (!ticket) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  // Enforce the same scoping on the detail read (not-found masking).
  if (actor.role === 'requester' && ticket.requestedById !== actor.id) {
    throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  }
  if (actor.role === 'driver') {
    const driver = await findDriverByUserId(actor.id);
    if (!driver || ticket.driverId !== driver.id) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  }
  return ticket;
}

export async function create(body: CreateTripTicketBody) {
  return prisma.tripTicket.create({
    data: { ...body, status: 'pending_admin_approval' }, // status is never client-chosen
    include: tripTicketInclude
  });
}

export async function update(id: string, body: UpdateTripTicketBody, actor: AuthenticatedUser) {
  const existing = await findTripTicketById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  if (actor.role !== 'admin' && existing.requestedById !== actor.id) {
    throw new AppError(403, 'NOT_TICKET_OWNER', 'You may only edit your own trip ticket');
  }
  if (existing.status !== 'pending_admin_approval') {
    throw new AppError(409, 'INVALID_TRANSITION', 'Trip ticket can only be edited while pending admin approval');
  }
  await prisma.tripTicket.update({ where: { id }, data: body });
  return findTripTicketById(id);
}

export async function remove(id: string): Promise<void> {
  const existing = await findTripTicketById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  if (existing.status === 'in_progress') {
    throw new AppError(409, 'INVALID_TRANSITION', 'Cannot delete a trip ticket that is in progress');
  }
  await prisma.tripTicket.delete({ where: { id } }); // fuel_allocation cascades (schema onDelete: Cascade)
}

export { scopeFor };
```

> **Implementer note:** the `update` return above is deliberately explicit — do the `prisma.tripTicket.update({ where: { id }, data: body })` then return `findTripTicketById(id)` so the response carries the embeds. Simplify to:
> ```ts
> await prisma.tripTicket.update({ where: { id }, data: body });
> return findTripTicketById(id);
> ```
> and drop the `.then()` chaining. (Kept the intent explicit; write the clean two-line form.)

`apps/api/src/modules/trip-tickets/controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateTripTicketBody, UpdateTripTicketBody } from '@mms/shared';
import { tripTicketsListQuerySchema } from '@mms/shared';
import { requireIdParam, requireUser } from '../../lib/http.js';
import * as service from './service.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = tripTicketsListQuerySchema.parse(req.query);
  res.json(await service.list(query, requireUser(req)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req), requireUser(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateTripTicketBody));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireIdParam(req), req.body as UpdateTripTicketBody, requireUser(req)));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
```

`apps/api/src/modules/trip-tickets/router.ts`:

```ts
import { Router } from 'express';
import { USER_ROLES, createTripTicketBodySchema, updateTripTicketBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const tripTicketsRouter = Router();

tripTicketsRouter.use(requireAuth);
tripTicketsRouter.get('/', controller.list); // any authenticated role, service-scoped
tripTicketsRouter.get('/:id', controller.getById);
tripTicketsRouter.post('/', validateBody(createTripTicketBodySchema), controller.create); // any authenticated role
tripTicketsRouter.patch('/:id', validateBody(updateTripTicketBodySchema), controller.update); // owner or admin (service-checked)
tripTicketsRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
```

Mount in `apps/api/src/app.ts` (after the maintenance routers, before the 404 handler):

```ts
import { tripTicketsRouter } from './modules/trip-tickets/router.js';
// ...
  app.use('/api/trip-tickets', tripTicketsRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add trip-tickets module with scoped reads, create, edit-while-pending, and delete"
```

---

### Task 4: Trip-ticket approval transitions (approve / approve-evp / disapprove / cancel + fuel allocations)

**Files:**
- Create: `apps/api/src/modules/trip-tickets/transitions.ts` (transition service), `apps/api/src/modules/trip-tickets/transitions.controller.ts`
- Modify: `apps/api/src/modules/trip-tickets/router.ts` (add transition routes)
- Test: `apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts`

**Interfaces:**
- Consumes: Task 3 (`findTripTicketById`, `tripTicketInclude`), Task 1 contracts, `requireUser`, middleware.
- Produces: `POST /api/trip-tickets/:id/approve` (admin; from `pending_admin_approval` → `pending_fuel_allocation_approval`; creates the fuel_allocations row), `POST /api/trip-tickets/:id/approve-evp` (evp_operations; from `pending_fuel_allocation_approval` → `approved`; stamps the allocation), `POST /api/trip-tickets/:id/disapprove` (admin from both pending states, or evp from the fuel-pending state; requires reason), `POST /api/trip-tickets/:id/cancel` (owning requester or admin; from either pending state).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function pendingTicket() {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: 'available', branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
  const driver = await prisma.driver.create({ data: { email: 'd@test.local', fullName: 'D', status: 'active', branchId: branch.id } });
  const { user: requester } = await createTestUser({ email: 'req@test.local', role: 'requester' });
  const ticket = await prisma.tripTicket.create({
    data: {
      branchId: branch.id, driverId: driver.id, vehicleId: vehicle.id, destination: 'A', purpose: 'P',
      dateRequested: new Date('2026-07-10'), preparedBy: '', requestedById: requester.id, status: 'pending_admin_approval'
    }
  });
  return { branch, vehicle, ticket, requester };
}

const fuelBody = { liters: 40, fuelType: 'diesel', date: '2026-07-10', purpose: 'Delivery', tripTo: 'Site A' };

describe('trip-ticket approval transitions', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('admin approve → pending_fuel_allocation_approval and creates the fuel allocation', async () => {
    const { ticket, vehicle, branch } = await pendingTicket();
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(fuelBody);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_fuel_allocation_approval');
    expect(res.body.approvedByAdminId).toBe(admin.id);
    const fa = await prisma.fuelAllocation.findUniqueOrThrow({ where: { tripTicketId: ticket.id } });
    expect(fa).toMatchObject({ liters: 40, status: 'pending', vehicleId: vehicle.id, branchId: branch.id, requestedById: admin.id });
  });

  it('rejects approve from the wrong role (403) and wrong state (409)', async () => {
    const { ticket } = await pendingTicket();
    const { user: req } = await createTestUser({ email: 'r@test.local', role: 'requester' });
    const forbidden = await request(app).post(`/api/trip-tickets/${ticket.id}/approve`).set('Authorization', authHeader(req.id, req.email, 'requester')).send(fuelBody);
    expect(forbidden.status).toBe(403);

    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await prisma.tripTicket.update({ where: { id: ticket.id }, data: { status: 'approved' } });
    const wrongState = await request(app).post(`/api/trip-tickets/${ticket.id}/approve`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send(fuelBody);
    expect(wrongState.status).toBe(409);
    expect(wrongState.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('evp approve → approved and stamps the allocation', async () => {
    const { ticket } = await pendingTicket();
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await request(app).post(`/api/trip-tickets/${ticket.id}/approve`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send(fuelBody);
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/approve-evp`).set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    const fa = await prisma.fuelAllocation.findUniqueOrThrow({ where: { tripTicketId: ticket.id } });
    expect(fa).toMatchObject({ status: 'approved', approvedByEvpId: evp.id });
  });

  it('disapprove requires a reason and marks the allocation disapproved if it exists', async () => {
    const { ticket } = await pendingTicket();
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await request(app).post(`/api/trip-tickets/${ticket.id}/approve`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send(fuelBody);
    const noReason = await request(app).post(`/api/trip-tickets/${ticket.id}/disapprove`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({});
    expect(noReason.status).toBe(400);
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/disapprove`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({ reason: 'Budget' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('disapproved');
    expect(res.body.disapprovedReason).toBe('Budget');
    expect((await prisma.fuelAllocation.findUniqueOrThrow({ where: { tripTicketId: ticket.id } })).status).toBe('disapproved');
  });

  it('cancel by the owner from a pending state, but not by a stranger', async () => {
    const { ticket, requester } = await pendingTicket();
    const { user: stranger } = await createTestUser({ email: 's@test.local', role: 'requester' });
    const forbidden = await request(app).post(`/api/trip-tickets/${ticket.id}/cancel`).set('Authorization', authHeader(stranger.id, stranger.email, 'requester')).send({ reason: 'x' });
    expect(forbidden.status).toBe(403);
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/cancel`).set('Authorization', authHeader(requester.id, requester.email, 'requester')).send({ reason: 'Changed plans' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.cancellationReason).toBe('Changed plans');
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s on the transition routes.

- [ ] **Step 3: Implement**

`apps/api/src/modules/trip-tickets/transitions.ts`:

```ts
import type { ApproveTripTicketBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findTripTicketById } from './repository.js';

// Loads the ticket and asserts its current status is in the allowed-from set.
async function loadInState(id: string, allowedFrom: string[]) {
  const ticket = await prisma.tripTicket.findUnique({ where: { id } });
  if (!ticket) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  if (!allowedFrom.includes(ticket.status)) {
    throw new AppError(409, 'INVALID_TRANSITION', `Not allowed from status ${ticket.status}`);
  }
  return ticket;
}

// admin approve → pending_fuel_allocation_approval; creates the fuel allocation
// (copies vehicleId, backfills branchId, requestedById = approving admin,
// status pending). One transaction.
export async function approve(id: string, actor: AuthenticatedUser, body: ApproveTripTicketBody) {
  const ticket = await loadInState(id, ['pending_admin_approval']);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({
      where: { id },
      data: { status: 'pending_fuel_allocation_approval', approvedByAdminId: actor.id }
    });
    await tx.fuelAllocation.create({
      data: {
        tripTicketId: id,
        vehicleId: ticket.vehicleId,
        branchId: ticket.branchId,
        requestedById: actor.id,
        liters: body.liters,
        fuelType: body.fuelType,
        date: body.date,
        purpose: body.purpose,
        tripTo: body.tripTo,
        status: 'pending'
      }
    });
  });
  return findTripTicketById(id);
}

// evp approve → approved; stamps the allocation.
export async function approveEvp(id: string, actor: AuthenticatedUser) {
  await loadInState(id, ['pending_fuel_allocation_approval']);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({ where: { id }, data: { status: 'approved' } });
    await tx.fuelAllocation.update({
      where: { tripTicketId: id },
      data: { status: 'approved', approvedByEvpId: actor.id }
    });
  });
  return findTripTicketById(id);
}

// disapprove (admin from both pending states; evp from the fuel-pending state).
export async function disapprove(id: string, actor: AuthenticatedUser, reason: string) {
  const allowedFrom =
    actor.role === 'evp_operations'
      ? ['pending_fuel_allocation_approval']
      : ['pending_admin_approval', 'pending_fuel_allocation_approval'];
  await loadInState(id, allowedFrom);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({ where: { id }, data: { status: 'disapproved', disapprovedReason: reason } });
    // Mirror onto the allocation if one exists (spec §6.1).
    await tx.fuelAllocation.updateMany({ where: { tripTicketId: id }, data: { status: 'disapproved' } });
  });
  return findTripTicketById(id);
}

// cancel (owning requester or admin; from either pending state).
export async function cancel(id: string, actor: AuthenticatedUser, reason: string) {
  const ticket = await loadInState(id, ['pending_admin_approval', 'pending_fuel_allocation_approval']);
  if (actor.role !== 'admin' && ticket.requestedById !== actor.id) {
    throw new AppError(403, 'NOT_TICKET_OWNER', 'You may only cancel your own trip ticket');
  }
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({ where: { id }, data: { status: 'cancelled', cancellationReason: reason } });
    await tx.fuelAllocation.updateMany({ where: { tripTicketId: id }, data: { status: 'cancelled' } });
  });
  return findTripTicketById(id);
}
```

`apps/api/src/modules/trip-tickets/transitions.controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { ApproveTripTicketBody, ReasonBody } from '@mms/shared';
import { requireIdParam, requireUser } from '../../lib/http.js';
import * as transitions from './transitions.js';

export async function approve(req: Request, res: Response): Promise<void> {
  res.json(await transitions.approve(requireIdParam(req), requireUser(req), req.body as ApproveTripTicketBody));
}

export async function approveEvp(req: Request, res: Response): Promise<void> {
  res.json(await transitions.approveEvp(requireIdParam(req), requireUser(req)));
}

export async function disapprove(req: Request, res: Response): Promise<void> {
  res.json(await transitions.disapprove(requireIdParam(req), requireUser(req), (req.body as ReasonBody).reason));
}

export async function cancel(req: Request, res: Response): Promise<void> {
  res.json(await transitions.cancel(requireIdParam(req), requireUser(req), (req.body as ReasonBody).reason));
}
```

Append the transition routes to `apps/api/src/modules/trip-tickets/router.ts` (import the additions; `requireAuth` is already router-wide). Note `cancel` allows two roles, so it is gated in the service, not the router:

```ts
import { approveTripTicketBodySchema, reasonBodySchema } from '@mms/shared';
import * as transitionsController from './transitions.controller.js';

tripTicketsRouter.post('/:id/approve', requireRole(USER_ROLES.admin), validateBody(approveTripTicketBodySchema), transitionsController.approve);
tripTicketsRouter.post('/:id/approve-evp', requireRole(USER_ROLES.evp_operations), transitionsController.approveEvp);
tripTicketsRouter.post('/:id/disapprove', requireRole(USER_ROLES.admin, USER_ROLES.evp_operations), validateBody(reasonBodySchema), transitionsController.disapprove);
tripTicketsRouter.post('/:id/cancel', requireRole(USER_ROLES.admin, USER_ROLES.requester), validateBody(reasonBodySchema), transitionsController.cancel);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add trip-ticket approval transitions with fuel-allocation lifecycle"
```

---

### Task 5: Trip-ticket guard transitions (check-out / check-in + vehicle status flip)

**Files:**
- Modify: `apps/api/src/modules/trip-tickets/transitions.ts` (add check-out/check-in), `apps/api/src/modules/trip-tickets/transitions.controller.ts`, `apps/api/src/modules/trip-tickets/router.ts`
- Test: `apps/api/src/modules/trip-tickets/trip-ticket-guard.test.ts`

**Interfaces:**
- Consumes: Task 2 `changeVehicleStatus` (with `expectedFrom`), Task 4 transitions helpers.
- Produces: `POST /api/trip-tickets/:id/check-out` (security_guard; from `approved` → `in_progress`; records pre-trip guard/checked-by/checked-at; flips vehicle available→on_trip), `POST /api/trip-tickets/:id/check-in` (security_guard; from `in_progress` → `completed`; records post-trip fields; flips vehicle on_trip→available).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/trip-tickets/trip-ticket-guard.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function approvedTicket(vehicleStatus: 'available' | 'under_maintenance' = 'available') {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: vehicleStatus, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
  const driver = await prisma.driver.create({ data: { email: 'd@test.local', fullName: 'D', status: 'active', branchId: branch.id } });
  const ticket = await prisma.tripTicket.create({
    data: { branchId: branch.id, driverId: driver.id, vehicleId: vehicle.id, destination: 'A', purpose: 'P', dateRequested: new Date('2026-07-10'), preparedBy: '', status: 'approved' }
  });
  return { vehicle, ticket };
}

describe('trip-ticket guard transitions', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('check-out: approved → in_progress, records the guard, flips vehicle to on_trip', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { user: guard } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', authHeader(guard.id, guard.email, 'security_guard')).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.preTripGuardId).toBe(guard.id);
    expect(res.body.preTripCheckedById).toBe(guard.id);
    expect(res.body.preTripCheckedAt).not.toBeNull();
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('on_trip');
    expect(await prisma.vehicleStatusAudit.count({ where: { vehicleId: vehicle.id, newStatus: 'on_trip' } })).toBe(1);
  });

  it('check-out still succeeds but SKIPS the vehicle flip when the vehicle is not available', async () => {
    const { vehicle, ticket } = await approvedTicket('under_maintenance');
    const { user: guard } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', authHeader(guard.id, guard.email, 'security_guard')).send({});
    expect(res.status).toBe(200); // ticket transition succeeds
    expect(res.body.status).toBe('in_progress');
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('under_maintenance'); // unchanged
    expect(await prisma.vehicleStatusAudit.count({ where: { vehicleId: vehicle.id } })).toBe(0); // skip-and-log
  });

  it('check-in: in_progress → completed, records post-trip guard, flips vehicle to available', async () => {
    const { vehicle, ticket } = await approvedTicket('available');
    const { user: guard } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const header = authHeader(guard.id, guard.email, 'security_guard');
    await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', header).send({});
    const res = await request(app).post(`/api/trip-tickets/${ticket.id}/check-in`).set('Authorization', header).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.postTripGuardId).toBe(guard.id);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('available');
  });

  it('403 for non-guard, 409 for the wrong from-state', async () => {
    const { ticket } = await approvedTicket('available');
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const forbidden = await request(app).post(`/api/trip-tickets/${ticket.id}/check-out`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({});
    expect(forbidden.status).toBe(403);

    const { user: guard } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const badState = await request(app).post(`/api/trip-tickets/${ticket.id}/check-in`).set('Authorization', authHeader(guard.id, guard.email, 'security_guard')).send({});
    expect(badState.status).toBe(409); // still 'approved', not 'in_progress'
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s.

- [ ] **Step 3: Implement**

Append to `apps/api/src/modules/trip-tickets/transitions.ts` (hoist the `changeVehicleStatus` import):

```ts
import { changeVehicleStatus } from '../vehicles/status.js';

// security_guard check-out → in_progress; records the pre-trip guard and flips
// the vehicle available→on_trip (skipped+logged if it isn't available).
export async function checkOut(id: string, actor: AuthenticatedUser) {
  const ticket = await loadInState(id, ['approved']);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({
      where: { id },
      data: {
        status: 'in_progress',
        preTripGuardId: actor.id,
        preTripCheckedById: actor.id,
        preTripCheckedAt: new Date()
      }
    });
    await changeVehicleStatus(tx, ticket.vehicleId, 'on_trip', {
      changedBy: actor.id,
      source: 'trip_check_out',
      expectedFrom: 'available'
    });
  });
  return findTripTicketById(id);
}

// security_guard check-in → completed; records the post-trip guard and flips
// the vehicle on_trip→available (skipped+logged if it isn't on_trip).
export async function checkIn(id: string, actor: AuthenticatedUser) {
  const ticket = await loadInState(id, ['in_progress']);
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({
      where: { id },
      data: {
        status: 'completed',
        postTripGuardId: actor.id,
        postTripCheckedById: actor.id,
        postTripCheckedAt: new Date()
      }
    });
    await changeVehicleStatus(tx, ticket.vehicleId, 'available', {
      changedBy: actor.id,
      source: 'trip_check_in',
      expectedFrom: 'on_trip'
    });
  });
  return findTripTicketById(id);
}
```

Append to `apps/api/src/modules/trip-tickets/transitions.controller.ts`:

```ts
export async function checkOut(req: Request, res: Response): Promise<void> {
  res.json(await transitions.checkOut(requireIdParam(req), requireUser(req)));
}

export async function checkIn(req: Request, res: Response): Promise<void> {
  res.json(await transitions.checkIn(requireIdParam(req), requireUser(req)));
}
```

Append to `apps/api/src/modules/trip-tickets/router.ts`:

```ts
tripTicketsRouter.post('/:id/check-out', requireRole(USER_ROLES.security_guard), transitionsController.checkOut);
tripTicketsRouter.post('/:id/check-in', requireRole(USER_ROLES.security_guard), transitionsController.checkIn);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add trip-ticket check-out/check-in with vehicle status flips"
```

---

### Task 6: Job-orders module — create, driver-scoped reads, PATCH, DELETE

**Files:**
- Create: `apps/api/src/modules/job-orders/repository.ts`, `apps/api/src/modules/job-orders/service.ts`, `apps/api/src/modules/job-orders/controller.ts`, `apps/api/src/modules/job-orders/router.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/src/modules/job-orders/job-orders.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, `toSkipTake`, `requireIdParam`/`requireUser`, `findDriverByUserId`, `INVENTORY_READ_ROLES` is NOT used here (job-orders has its own gate), middleware, factories.
- Produces: `GET /api/job-orders` (admin/requester/evp_operations/driver — NOT security_guard; scoped; `{ data, count }`, targetDate asc, embeds vehicle/spareParts/assignedMechanic; filter `status`), `GET /api/job-orders/:id` (scoped, same embeds), `POST /api/job-orders` (any of the four roles; forces `pending`), `PATCH /api/job-orders/:id` (admin; only while `pending`; never status), `DELETE /api/job-orders/:id` (admin). Exports `jobOrderInclude` for Task 7.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/job-orders/job-orders.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function scaffold() {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: 'available', branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
  return { branch, vehicle };
}

function orderBody(s: { branch: { id: string }; vehicle: { id: string } }, requestedById?: string) {
  return { vehicleId: s.vehicle.id, branchId: s.branch.id, incidentDetails: 'Brakes', requestedById };
}

describe('job-orders module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates a job order as pending and reads it back with embeds', async () => {
    const s = await scaffold();
    const { user } = await createTestUser({ email: 'req@test.local', role: 'requester' });
    const header = authHeader(user.id, user.email, 'requester');
    const created = await request(app).post('/api/job-orders').set('Authorization', header).send(orderBody(s, user.id));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');
    const fetched = await request(app).get(`/api/job-orders/${created.body.id}`).set('Authorization', header);
    expect(fetched.status).toBe(200);
    expect(fetched.body.vehicle).toBeDefined();
    expect(Array.isArray(fetched.body.spareParts)).toBe(true);
  });

  it('403s security_guard reads; admin/evp see all; requester sees only own', async () => {
    const s = await scaffold();
    const { user: r1 } = await createTestUser({ email: 'r1@test.local', role: 'requester' });
    const { user: r2 } = await createTestUser({ email: 'r2@test.local', role: 'requester' });
    await request(app).post('/api/job-orders').set('Authorization', authHeader(r1.id, r1.email, 'requester')).send(orderBody(s, r1.id));
    await request(app).post('/api/job-orders').set('Authorization', authHeader(r2.id, r2.email, 'requester')).send(orderBody(s, r2.id));

    const { user: guard } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const guardRead = await request(app).get('/api/job-orders').set('Authorization', authHeader(guard.id, guard.email, 'security_guard'));
    expect(guardRead.status).toBe(403);

    const asR1 = await request(app).get('/api/job-orders').set('Authorization', authHeader(r1.id, r1.email, 'requester'));
    expect(asR1.body.count).toBe(1);
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const asAdmin = await request(app).get('/api/job-orders').set('Authorization', authHeader(admin.id, admin.email, 'admin'));
    expect(asAdmin.body.count).toBe(2);
  });

  it('driver sees orders assigned to their driver row (via drivers.userId)', async () => {
    const s = await scaffold();
    const { user: drvUser } = await createTestUser({ email: 'drv@test.local', role: 'driver' });
    const mechanic = await prisma.driver.create({ data: { email: 'mech@test.local', fullName: 'Mech', status: 'active', userId: drvUser.id } });
    const { user: req } = await createTestUser({ email: 'rq@test.local', role: 'requester' });
    // an order assigned to this driver
    await prisma.jobOrder.create({ data: { vehicleId: s.vehicle.id, branchId: s.branch.id, status: 'assigned_mechanic', assignedMechanicId: mechanic.id, requestedById: req.id } });
    // an unrelated order
    await prisma.jobOrder.create({ data: { vehicleId: s.vehicle.id, branchId: s.branch.id, status: 'pending', requestedById: req.id } });

    const asDriver = await request(app).get('/api/job-orders').set('Authorization', authHeader(drvUser.id, drvUser.email, 'driver'));
    expect(asDriver.status).toBe(200);
    expect(asDriver.body.count).toBe(1);
  });

  it('PATCH admin-only while pending; DELETE admin-only', async () => {
    const s = await scaffold();
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const header = authHeader(admin.id, admin.email, 'admin');
    const created = await request(app).post('/api/job-orders').set('Authorization', header).send(orderBody(s));
    const id = created.body.id as string;
    const patched = await request(app).patch(`/api/job-orders/${id}`).set('Authorization', header).send({ incidentDetails: 'Rotors' });
    expect(patched.status).toBe(200);
    expect(patched.body.incidentDetails).toBe('Rotors');

    await prisma.jobOrder.update({ where: { id }, data: { status: 'assigned_mechanic' } });
    const late = await request(app).patch(`/api/job-orders/${id}`).set('Authorization', header).send({ incidentDetails: 'X' });
    expect(late.status).toBe(409);

    const del = await request(app).delete(`/api/job-orders/${id}`).set('Authorization', header);
    expect(del.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/job-orders/repository.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

// Embeds the FE renders: vehicle summary, the spare-parts join (+ each part),
// and the assigned mechanic. noted/approved/requested users are resolved
// client-side (matching current behavior).
export const jobOrderInclude = {
  vehicle: { select: { id: true, make: true, model: true, licensePlate: true } },
  spareParts: { include: { sparePart: true } },
  assignedMechanic: true
} satisfies Prisma.JobOrderInclude;

type SkipTake = { skip: number; take: number } | Record<string, never>;

export function findJobOrderById(id: string) {
  return prisma.jobOrder.findUnique({ where: { id }, include: jobOrderInclude });
}

export async function listJobOrders(where: Prisma.JobOrderWhereInput, skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.jobOrder.findMany({ where, include: jobOrderInclude, orderBy: { targetDate: 'asc' }, ...skipTake }),
    prisma.jobOrder.count({ where })
  ]);
  return { data, count };
}
```

`apps/api/src/modules/job-orders/service.ts`:

```ts
import type { Prisma } from '@prisma/client';
import type { CreateJobOrderBody, JobOrdersListQuery, UpdateJobOrderBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findDriverByUserId } from '../drivers/repository.js';
import { findJobOrderById, jobOrderInclude, listJobOrders } from './repository.js';

// Visibility (spec §6): admin/evp see all; everyone else sees rows they
// requested OR that are assigned to their driver row (via drivers.userId).
async function scopeFor(actor: AuthenticatedUser): Promise<Prisma.JobOrderWhereInput> {
  if (actor.role === 'admin' || actor.role === 'evp_operations') return {};
  const driver = await findDriverByUserId(actor.id);
  const or: Prisma.JobOrderWhereInput[] = [{ requestedById: actor.id }];
  if (driver) or.push({ assignedMechanicId: driver.id });
  return { OR: or };
}

export async function list(query: JobOrdersListQuery, actor: AuthenticatedUser) {
  const scope = await scopeFor(actor);
  const where: Prisma.JobOrderWhereInput = { ...scope, ...(query.status ? { status: query.status } : {}) };
  return listJobOrders(where, toSkipTake(query));
}

export async function getById(id: string, actor: AuthenticatedUser) {
  const order = await findJobOrderById(id);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (actor.role !== 'admin' && actor.role !== 'evp_operations') {
    const driver = await findDriverByUserId(actor.id);
    const mine = order.requestedById === actor.id || (driver !== null && order.assignedMechanicId === driver.id);
    if (!mine) throw new AppError(404, 'NOT_FOUND', 'Job order not found'); // not-found masking
  }
  return order;
}

export async function create(body: CreateJobOrderBody) {
  return prisma.jobOrder.create({ data: { ...body, status: 'pending' }, include: jobOrderInclude });
}

export async function update(id: string, body: UpdateJobOrderBody) {
  const existing = await findJobOrderById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (existing.status !== 'pending') {
    throw new AppError(409, 'INVALID_TRANSITION', 'Job order can only be edited while pending');
  }
  await prisma.jobOrder.update({ where: { id }, data: body });
  return findJobOrderById(id);
}

export async function remove(id: string): Promise<void> {
  const existing = await findJobOrderById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  await prisma.jobOrder.delete({ where: { id } }); // job_order_spare_parts cascade (schema)
}
```

`apps/api/src/modules/job-orders/controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateJobOrderBody, UpdateJobOrderBody } from '@mms/shared';
import { jobOrdersListQuerySchema } from '@mms/shared';
import { requireIdParam, requireUser } from '../../lib/http.js';
import * as service from './service.js';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(jobOrdersListQuerySchema.parse(req.query), requireUser(req)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req), requireUser(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateJobOrderBody));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireIdParam(req), req.body as UpdateJobOrderBody));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
```

`apps/api/src/modules/job-orders/router.ts` — reads gated to the four roles (excludes security_guard); create allowed to those four; writes admin:

```ts
import { Router } from 'express';
import { USER_ROLES, createJobOrderBodySchema, updateJobOrderBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const JOB_ORDER_ROLES = [USER_ROLES.admin, USER_ROLES.requester, USER_ROLES.evp_operations, USER_ROLES.driver] as const;

export const jobOrdersRouter = Router();

jobOrdersRouter.use(requireAuth);
jobOrdersRouter.get('/', requireRole(...JOB_ORDER_ROLES), controller.list);
jobOrdersRouter.get('/:id', requireRole(...JOB_ORDER_ROLES), controller.getById);
jobOrdersRouter.post('/', requireRole(...JOB_ORDER_ROLES), validateBody(createJobOrderBodySchema), controller.create);
jobOrdersRouter.patch('/:id', requireRole(USER_ROLES.admin), validateBody(updateJobOrderBodySchema), controller.update);
jobOrdersRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
```

Mount in `apps/api/src/app.ts`:

```ts
import { jobOrdersRouter } from './modules/job-orders/router.js';
// ...
  app.use('/api/job-orders', jobOrdersRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add job-orders module with driver-scoped reads and CRUD"
```

---

### Task 7: Job-order transitions (note / approve / complete-repair + spare-parts join, decrement, maintenance row, vehicle flips)

**Files:**
- Create: `apps/api/src/modules/job-orders/transitions.ts`, `apps/api/src/modules/job-orders/transitions.controller.ts`
- Modify: `apps/api/src/modules/job-orders/router.ts`
- Test: `apps/api/src/modules/job-orders/job-order-transitions.test.ts`

**Interfaces:**
- Consumes: Task 2 `changeVehicleStatus(expectedFrom)`, Task 6 (`findJobOrderById`, `jobOrderInclude`), Task 1 contracts.
- Produces: `POST /api/job-orders/:id/note` (admin; `pending` → `assigned_mechanic`; writes noted_by, dates, mechanic, spare-parts join rows; flips vehicle → under_maintenance), `POST /api/job-orders/:id/approve` (evp_operations; `assigned_mechanic` → `ongoing_repair`; stamps approved_by/date_approved), `POST /api/job-orders/:id/complete-repair` (admin; `ongoing_repair` → `repaired`; **decrements spare_parts.quantity**, writes a maintenance row, flips vehicle → available).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/job-orders/job-order-transitions.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function scaffold(vehicleStatus: 'available' | 'under_maintenance' = 'available') {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: vehicleStatus, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
  const mechanic = await prisma.driver.create({ data: { email: 'm@test.local', fullName: 'Mech', status: 'active', branchId: branch.id } });
  const part = await prisma.sparePart.create({ data: { name: 'Brake Pad', quantity: 10 } });
  const order = await prisma.jobOrder.create({ data: { vehicleId: vehicle.id, branchId: branch.id, status: 'pending' } });
  return { branch, vehicle, mechanic, part, order };
}

describe('job-order transitions', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('note: pending → assigned_mechanic, writes spare-parts join, flips vehicle to under_maintenance', async () => {
    const { vehicle, mechanic, part, order } = await scaffold('available');
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const res = await request(app)
      .post(`/api/job-orders/${order.id}/note`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send({ assignedMechanicId: mechanic.id, targetDate: '2026-08-01', spareParts: [{ sparePartId: part.id, quantity: 3 }] });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('assigned_mechanic');
    expect(res.body.notedById).toBe(admin.id);
    const joins = await prisma.jobOrderSparePart.findMany({ where: { jobOrderId: order.id } });
    expect(joins).toHaveLength(1);
    expect(joins[0]).toMatchObject({ sparePartId: part.id, quantity: 3 });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('under_maintenance');
  });

  it('rejects note from the wrong role (403) and wrong state (409)', async () => {
    const { mechanic, order } = await scaffold();
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    const forbidden = await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({ assignedMechanicId: mechanic.id });
    expect(forbidden.status).toBe(403);
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await prisma.jobOrder.update({ where: { id: order.id }, data: { status: 'ongoing_repair' } });
    const wrong = await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({ assignedMechanicId: mechanic.id });
    expect(wrong.status).toBe(409);
  });

  it('approve (evp): assigned_mechanic → ongoing_repair', async () => {
    const { mechanic, part, order } = await scaffold();
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', authHeader(admin.id, admin.email, 'admin')).send({ assignedMechanicId: mechanic.id, spareParts: [{ sparePartId: part.id, quantity: 3 }] });
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    const res = await request(app).post(`/api/job-orders/${order.id}/approve`).set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ongoing_repair');
    expect(res.body.approvedById).toBe(evp.id);
    expect(res.body.dateApproved).not.toBeNull();
  });

  it('complete-repair (admin): decrements spare-parts quantity, writes a maintenance row, flips vehicle to available', async () => {
    const { vehicle, mechanic, part, order } = await scaffold('available');
    const { user: admin } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const adminH = authHeader(admin.id, admin.email, 'admin');
    await request(app).post(`/api/job-orders/${order.id}/note`).set('Authorization', adminH).send({ assignedMechanicId: mechanic.id, spareParts: [{ sparePartId: part.id, quantity: 3 }] });
    const { user: evp } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    await request(app).post(`/api/job-orders/${order.id}/approve`).set('Authorization', authHeader(evp.id, evp.email, 'evp_operations')).send({});

    const res = await request(app).post(`/api/job-orders/${order.id}/complete-repair`).set('Authorization', adminH).send({ repairDone: 'simple', remarks: 'Done', actualDateOfRelease: '2026-08-05' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('repaired');
    expect((await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } })).quantity).toBe(7); // 10 - 3
    expect(await prisma.maintenance.count({ where: { vehicleId: vehicle.id } })).toBe(1);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).status).toBe('available');
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/job-orders/transitions.ts`:

```ts
import type { CompleteRepairBody, NoteJobOrderBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { changeVehicleStatus } from '../vehicles/status.js';
import { findJobOrderById } from './repository.js';

async function loadInState(id: string, allowedFrom: string[]) {
  const order = await prisma.jobOrder.findUnique({ where: { id } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (!allowedFrom.includes(order.status)) {
    throw new AppError(409, 'INVALID_TRANSITION', `Not allowed from status ${order.status}`);
  }
  return order;
}

// admin note → assigned_mechanic; records the mechanic + spare-parts join rows
// and flips the vehicle to under_maintenance. One transaction.
export async function note(id: string, actor: AuthenticatedUser, body: NoteJobOrderBody) {
  const order = await loadInState(id, ['pending']);
  await prisma.$transaction(async (tx) => {
    await tx.jobOrder.update({
      where: { id },
      data: {
        status: 'assigned_mechanic',
        notedById: actor.id,
        dateOfRequest: body.dateOfRequest ?? null,
        targetDate: body.targetDate ?? null,
        assignedMechanicId: body.assignedMechanicId
      }
    });
    // Replace any existing join rows with the noted set.
    await tx.jobOrderSparePart.deleteMany({ where: { jobOrderId: id } });
    if (body.spareParts.length > 0) {
      await tx.jobOrderSparePart.createMany({
        data: body.spareParts.map((p) => ({ jobOrderId: id, sparePartId: p.sparePartId, quantity: p.quantity }))
      });
    }
    await changeVehicleStatus(tx, order.vehicleId, 'under_maintenance', {
      changedBy: actor.id,
      source: 'job_order_note',
      expectedFrom: 'available'
    });
  });
  return findJobOrderById(id);
}

// evp approve → ongoing_repair.
export async function approve(id: string, actor: AuthenticatedUser) {
  await loadInState(id, ['assigned_mechanic']);
  await prisma.jobOrder.update({
    where: { id },
    data: { status: 'ongoing_repair', approvedById: actor.id, dateApproved: new Date() }
  });
  return findJobOrderById(id);
}

// admin complete-repair → repaired; decrements spare-parts inventory, writes a
// maintenance history row, and flips the vehicle back to available. One
// transaction (spec §6.2 — this inventory decrement is NEW behavior).
export async function completeRepair(id: string, actor: AuthenticatedUser, body: CompleteRepairBody) {
  const order = await prisma.jobOrder.findUnique({ where: { id }, include: { spareParts: true } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (order.status !== 'ongoing_repair') {
    throw new AppError(409, 'INVALID_TRANSITION', `Not allowed from status ${order.status}`);
  }
  const releaseDate = body.actualDateOfRelease ?? new Date();
  await prisma.$transaction(async (tx) => {
    await tx.jobOrder.update({
      where: { id },
      data: {
        status: 'repaired',
        repairDone: body.repairDone,
        remarks: body.remarks ?? null,
        actualDateOfRelease: releaseDate
      }
    });
    // Decrement inventory per noted part (spec §6.2 — NEW behavior). Intentionally
    // NO stock floor: a physically-completed repair is never blocked on inventory
    // math, and clamping would hide over-use. A negative quantity is an accepted
    // signal for admin reconciliation. (Revisit if a hard stock guard is wanted.)
    for (const line of order.spareParts) {
      await tx.sparePart.update({
        where: { id: line.sparePartId },
        data: { quantity: { decrement: line.quantity } }
      });
    }
    await tx.maintenance.create({
      data: { vehicleId: order.vehicleId, type: 'repair', date: releaseDate, description: body.remarks ?? null }
    });
    await changeVehicleStatus(tx, order.vehicleId, 'available', {
      changedBy: actor.id,
      source: 'job_order_complete',
      expectedFrom: 'under_maintenance'
    });
  });
  return findJobOrderById(id);
}
```

`apps/api/src/modules/job-orders/transitions.controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CompleteRepairBody, NoteJobOrderBody } from '@mms/shared';
import { requireIdParam, requireUser } from '../../lib/http.js';
import * as transitions from './transitions.js';

export async function note(req: Request, res: Response): Promise<void> {
  res.json(await transitions.note(requireIdParam(req), requireUser(req), req.body as NoteJobOrderBody));
}

export async function approve(req: Request, res: Response): Promise<void> {
  res.json(await transitions.approve(requireIdParam(req), requireUser(req)));
}

export async function completeRepair(req: Request, res: Response): Promise<void> {
  res.json(await transitions.completeRepair(requireIdParam(req), requireUser(req), req.body as CompleteRepairBody));
}
```

Append to `apps/api/src/modules/job-orders/router.ts`:

```ts
import { completeRepairBodySchema, noteJobOrderBodySchema } from '@mms/shared';
import * as transitionsController from './transitions.controller.js';

jobOrdersRouter.post('/:id/note', requireRole(USER_ROLES.admin), validateBody(noteJobOrderBodySchema), transitionsController.note);
jobOrdersRouter.post('/:id/approve', requireRole(USER_ROLES.evp_operations), transitionsController.approve);
jobOrdersRouter.post('/:id/complete-repair', requireRole(USER_ROLES.admin), validateBody(completeRepairBodySchema), transitionsController.completeRepair);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add job-order transitions with spare-parts decrement and vehicle status flips"
```

---

### Task 8: Sweep + docs + live smoke

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README** — extend the API section with the trip-tickets endpoints (CRUD + the transition verbs `approve`/`approve-evp`/`disapprove`/`cancel`/`check-out`/`check-in`; note the fuel-allocation is embedded and created at admin-approve; note the scoping) and job-orders endpoints (CRUD + `note`/`approve`/`complete-repair`; note the spare-parts join at note and the inventory decrement at complete-repair; note security_guard has no read access). State once that transitions are server-enforced (409 on illegal state, 403 on wrong role) and that check-out/check-in and note/complete-repair flip vehicle status.

- [ ] **Step 2: Full sweep**

```bash
pnpm build && pnpm typecheck && pnpm --filter @mms/api test
pnpm --filter @mms/api start   # background (note: another process may hold :3000 — use PORT=3011 if so)
# login as the seeded admin (creds in apps/api/prisma/seed.ts), capture the token, then:
curl -s "http://localhost:3000/api/trip-tickets" -H "Authorization: Bearer <token>"   # expect the seeded tickets
curl -s "http://localhost:3000/api/job-orders" -H "Authorization: Bearer <token>"     # expect the seeded job orders
# kill the server
```

If the seeded trip-ticket/job-order data doesn't round-trip cleanly through the new relational reads (possible seed drift vs the new fuel_allocations shape — flagged in prior ledgers), report it as a concern; do NOT fix the seed in this task (its own follow-up).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document trip-ticket and job-order endpoints and status machines"
```

---

## Self-Review Notes

- **Spec coverage:** §6.1 trip-ticket machine — approve/approve-evp/disapprove/cancel ✔ (Task 4), check-out/check-in ✔ (Task 5); allowed-from + role tuples enforced (409/403); fuel-allocation created at admin-approve, stamped at EVP-approve, mirrored on disapprove/cancel ✔. §6.2 job-order machine — note/approve/complete-repair ✔ (Task 7); spare-parts join at note, inventory decrement + maintenance row + vehicle flip at complete-repair ✔. §5 read scoping — trip-tickets (requester/driver scoped) ✔ (Task 3), job-orders (admin/evp all, others own/assigned via drivers.userId, security_guard excluded) ✔ (Task 6). §6 sort orders — trip start_ts desc, job target_date asc ✔. Reads embed the FE-rendered relations incl. fuelAllocation ✔.
- **Carry-overs resolved:** `@@unique` tracking migration + P2002-safe assign() ✔ (Task 2); `changeVehicleStatus` `expectedFrom` skip-and-log + its 404 branch now covered ✔ (Task 2); `lib/http.ts` extracted, new modules consume it ✔ (Task 1).
- **Intentional new behavior (flagged in Global Constraints, spec-directed):** vehicle-status flips on all four transition points; guard checked_by/at persisted; fuel_allocations.status/branchId set; spare_parts.quantity decrement; maintenance row at complete-repair. Each is `expectedFrom`-guarded or transaction-scoped.
- **Type consistency:** `tripTicketInclude`/`jobOrderInclude`/`findTripTicketById`/`findJobOrderById` defined in the module tasks, reused by the transition tasks; `changeVehicleStatus` return type widened to `boolean` (Plan 4 callers ignore it); `findDriverByUserId` defined Task 2, used Tasks 3/6; contract names match the Interfaces blocks; `INVALID_TRANSITION`/`NOT_TICKET_OWNER` codes used consistently.
- **Express 5 `req.query` read-only** respected (controllers parse). Static transition segments (`/:id/approve`, `/:id/check-out`, etc.) don't collide with `/:id`. No multipart in this plan.
- **Deferred (note for Plan 6/7):** seed drift vs the new relational fuel_allocations shape (surfaced by Task 8 smoke if present) — fix in a seed pass; the old-module `requireIdParam`/`requireUser` duplication can be migrated to `lib/http.ts` in a cleanup (new modules already use it); the detail-page free-status edit bypass is removed on the FE in Plan 7.
