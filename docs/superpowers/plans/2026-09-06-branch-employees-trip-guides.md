# Branch Employees as Trip Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every branch an admin-managed employee roster, and require one or more of those employees to be assigned to each trip ticket as the staff who accompany and guide the participants.

**Architecture:** Two new tables — `employees` (an org reference table shaped after `OfficeHead`, but with a required `branch_id`) and `trip_ticket_employees` (a composite-PK join shaped after `JobOrderSparePart`). Employees join the existing generic `organization` module and become a fourth tab on the Organization page. Guides are written with a delete-all-then-recreate helper copied from `replaceTripDates`, count toward the vehicle's seat capacity, and are picked from a branch-filtered repeating `Select` in the booking form. A dedicated admin-only `POST /api/trip-tickets/:id/guides` reassigns guides after the ticket is frozen at approval.

**Tech Stack:** Express 5, Prisma 6, PostgreSQL, Zod (via `@mms/shared`), Vitest + supertest, React 19, TanStack Router/Query, react-hook-form, Playwright.

**Design spec:** `docs/superpowers/specs/2026-09-06-branch-employees-trip-guides-design.md` — section references below (§4.3, §5.1) point at it.

## Global Constraints

- **`noUncheckedIndexedAccess: true`** in `apps/api/tsconfig.json`. Any indexed access (`arr[0]`, `list[i]`) is typed `T | undefined` in the API package. It is NOT set in `apps/web`.
- **API tests run under `TZ: 'UTC'`** and `fileParallelism: false` (pinned in `apps/api/vitest.config.ts`). Do not remove either.
- **Rebuild shared before typechecking anything**: `pnpm --filter @mms/shared build`. Both `apps/api` and `apps/web` import `@mms/shared` from its built `dist`, so a contract change is invisible to typecheck until it is rebuilt. This is the first command in every verification block below.
- **`apps/web` has no `typecheck` script** — use `pnpm --filter @mms/web exec tsc -b`. **`apps/api` has no `lint` script** — only `apps/web` lints.
- **Guides count toward vehicle capacity** (§5.1). The client and the server must compute the same headcount: `max(namedParticipants, participantsCount ?? 0) + guides`.
- **At least one guide is required on create** (§5.3). Absent `guideIds` on a PATCH means _leave the guides alone_; present-but-empty is a **`400 VALIDATION_ERROR`** from zod, not `NO_GUIDES`. `NO_GUIDES` is reachable only on `POST /api/trip-tickets/:id/guides`.
- **No name uniqueness on employees, ever** (§4.3). Two people named Juan Cruz at one branch is not an error. Do not add a unique index, and do not "fix" its absence.
- **`Employee.branchId` is REQUIRED**, unlike `OfficeHead.branchId`. A null-branch employee would appear in no picker anywhere, silently.
- **The organization router keeps PER-ROUTE guards.** It is mounted at the bare `/api` prefix; a router-wide `requireAuth` would 401 the device-key GPS routes (see the comment at `organization/router.ts:18-24`).
- **"Live" excludes history.** A `completed`, `cancelled` or `disapproved` ticket must never block archiving an employee.
- **Never use `apps/web/src/components/ui/multi-select.tsx`** (§9.3). It has no ARIA roles (the e2e suite drives `getByRole('combobox')`) and paints raw `bg-white`, which is broken in dark mode.
- **Run Prettier on every code file you touch** (`npx prettier --write <file>`). Do not reformat files you did not otherwise change. **Never format `apps/api/prisma/seed.ts`** — it has never been formatted and would produce an ~800-line diff.
- **Never add a `Co-Authored-By: Claude` trailer or any AI attribution to a commit message. Never run `git push`.**

---

## Task Order

Each task ends green. The order is load-bearing in three places, marked below.

```
Task 1  Schema, migration, seed, test infrastructure
   ↓        (everything needs prisma.employee to exist)
Task 2  Employee contracts + organization API
   ↓        LOAD-BEARING: also pre-seeds guideIds into enforcement.test.ts,
   ↓        where it is an inert no-op until Task 3 makes it required
Task 3  Trip-ticket guides API  (guideIds becomes REQUIRED here)
   ↓        LOAD-BEARING: also repairs the three Playwright fixtures it breaks,
   ↓        so the e2e suite is never left red between tasks
Task 4  The Organization Employees tab
   ↓        LOAD-BEARING: Task 5's picker goes stale forever without Task 4's
   ↓        useOrgInvalidation branch. Task 6 creates employees through this UI.
Task 5  Booking form Guides picker + ticket detail + reassign UI
   ↓
Task 6  End-to-end coverage
```

**Why Task 2 touches a trip-ticket test file.** The moment Task 3 lands `.min(1)`, the four inline `POST /api/trip-tickets` bodies in `enforcement.test.ts` start returning `400 VALIDATION_ERROR` — but two of them assert `409 PARENT_ARCHIVED`, so the failure reads as an _organization_ bug. Task 2 already opens that file and lands first, at which point `createTripTicketBodySchema` is still a plain `z.object` that strips unknown keys. Adding `guideIds` there is a no-op until Task 3 gives it meaning. One editor, one file, no red window.

## File Structure

**Create**

| File                                                                                 | Responsibility                                                                                                    |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `apps/api/prisma/migrations/<timestamp>_add_employees_and_trip_guides/migration.sql` | Two tables, two indexes, three foreign keys, and the NOTE recording the deliberate absence of a name unique index |
| `apps/api/src/test/employees-schema.test.ts`                                         | Schema-level guarantees: composite PK, asymmetric cascade, duplicate names legal, truncation                      |
| `apps/api/src/modules/trip-tickets/guides.ts`                                        | `replaceTripTicketGuides` + `assertSeatsFit` — the sibling of `dates.ts`                                          |
| `apps/api/src/modules/trip-tickets/guides.test.ts`                                   | Pure unit tests for the seat arithmetic and the `NO_GUIDES` refusal, no database                                  |
| `apps/api/src/modules/trip-tickets/trip-ticket-guides.test.ts`                       | Integration: capacity, empty-vs-absent, both reads, archived-guide history, the reassign endpoint                 |
| `apps/api/src/modules/organization/employees.test.ts`                                | Employee API suite: CRUD, required branch, `?branchId=`, archive/restore, role matrix                             |
| `apps/api/src/modules/organization/employee-archive.test.ts`                         | `409 IN_USE` while guiding a live ticket; history never blocks                                                    |
| `apps/web/e2e/trip-guides.spec.ts`                                                   | Admin adds an employee, books a trip with them as guide, detail names them                                        |

**Modify**

| File                                                                                                   | Change                                                                                     |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `apps/api/prisma/schema.prisma`                                                                        | `Employee` + `TripTicketEmployee` models; back-relations on `Branch` and `TripTicket`      |
| `apps/api/prisma/seed.ts`                                                                              | 3 Main + 2 North employees; guides on every seeded ticket. **Never prettier this file**    |
| `apps/api/src/test/db.ts`                                                                              | `employees` and `trip_ticket_employees` join `TABLES`                                      |
| `apps/api/src/test/factories.ts`                                                                       | `createTestEmployee(branchId, name = 'Ana Bautista')`                                      |
| `packages/shared/src/contracts/organization.ts`                                                        | Employee create/update bodies + list query                                                 |
| `packages/shared/src/contracts/trip-tickets.ts`                                                        | `guideIds` on the create body; `reassignGuidesBodySchema`                                  |
| `apps/api/src/lib/org-refs.ts`                                                                         | `employeeIds` key so `PARENT_ARCHIVED` covers a referenced guide                           |
| `apps/api/src/modules/organization/{repository,service,controller,router,guard}.ts`                    | Employee CRUD + `employeeBlockers` + the employees entry in `branchBlockers`               |
| `apps/api/src/modules/trip-tickets/repository.ts`                                                      | `tripTicketInclude` gains `guides: { include: { employee: true } }`                        |
| `apps/api/src/modules/trip-tickets/service.ts`                                                         | `assertBookable` capacity; create destructures `guideIds` out of the spread; update gating |
| `apps/api/src/modules/trip-tickets/{transitions,transitions.controller,router}.ts`                     | `POST /:id/guides`                                                                         |
| `apps/web/src/lib/api/{organization,shared,trip-tickets}.ts`                                           | Employee resource, `getEmployees`, guide mapping, `reassignTripTicketGuides`               |
| `apps/web/src/lib/query/{organization,shared}.ts`                                                      | `useEmployeesAdmin`, `useEmployees`                                                        |
| `apps/web/src/lib/mutation/{organization,trip-tickets}.ts`                                             | `LABELS` + the invalidation branch; `useReassignGuides`                                    |
| `apps/web/src/lib/types.ts`                                                                            | `TripTicket.guides`; `NewTripTicket.guideIds` (**required**)                               |
| `apps/web/src/components/pages/organization/{index,resource-tab,record-dialog}.tsx`                    | The fourth tab                                                                             |
| `apps/web/src/components/pages/trip-tickets/add-trip-ticket/{form,actions}.tsx`                        | The Guides picker and the seat arithmetic                                                  |
| `apps/web/src/components/pages/trip-tickets/trip-tickets-inner/index.tsx`                              | The Guides `DetailItem` + the reassign control                                             |
| `apps/api/src/modules/organization/{enforcement,guard}.test.ts`, `apps/api/src/lib/org-refs.test.ts`   | Employee coverage + the `guideIds` pre-seed                                                |
| `apps/api/src/modules/trip-tickets/{trip-tickets,trip-ticket-booking,trip-ticket-transitions}.test.ts` | Fixture repair                                                                             |
| `apps/web/e2e/{trip-lifecycle,multi-date-trip,organization}.spec.ts`                                   | Fixture repair + the Employees tab test                                                    |

---

## Task 1: Schema, migration, seed, and test infrastructure

**Files:**

- [test] apps/api/src/test/employees-schema.test.ts — New. Schema-level guarantees the migration is responsible for: branch-scoped employee, no name uniqueness, composite-PK duplicate refusal, Cascade from the ticket / Restrict toward the employee, and that truncateAll clears both tables.
- [modify] apps/api/src/test/factories.ts @ 95-101 (createTestOfficeHead); the new factory is appended directly after it, before createTestTicket at 103 — Add createTestEmployee(branchId, name) alongside createTestOfficeHead.
- [modify] apps/api/prisma/schema.prisma @ 257-259 (end of OfficeHead / the `// ---------- Fleet` banner) and 401-403 (end of TripTicket / start of FuelAllocation) — Insert `model Employee` after OfficeHead and `model TripTicketEmployee` after TripTicket.
- [modify] apps/api/prisma/schema.prisma @ 206-213 (Branch relation list) and 381-395 (TripTicket relation list) — Add `employees Employee[]` to Branch and `guides TripTicketEmployee[]` to TripTicket; the TripTicket block re-aligns by one column.
- [create] apps/api/prisma/migrations/<timestamp>\_add_employees_and_trip_guides/migration.sql — Two CREATE TABLEs, two CREATE INDEXes, three foreign keys, plus a NOTE recording the deliberate absence of a name unique index.
- [modify] apps/api/prisma/seed.ts @ 63-65 (after the northOffice head update, before `// One user per role`) and 348-350 / 365 (inside the ticket loop) — Seed 3 Main Branch and 2 North Branch employees, and attach guides to every seeded ticket. NEVER run prettier on this file.
- [modify] apps/api/src/test/db.ts @ 3-31 (the TABLES array) — Add 'trip_ticket_employees' before 'trip_tickets', and 'employees' before 'branches'.

**Interfaces:**

_Produces:_

- Prisma model `Employee` -> table `employees`; delegate `prisma.employee`; row type `{ id: string; name: string; position: string | null; phone: string | null; branchId: string; createdAt: Date; updatedAt: Date; archivedAt: Date | null }`. `archivedAt === null` means active. No name unique index — duplicates are legal.
- Prisma model `TripTicketEmployee` -> table `trip_ticket_employees`; delegate `prisma.tripTicketEmployee`; row type `{ tripTicketId: string; employeeId: string; createdAt: Date; updatedAt: Date }`. Composite PK, so single-row lookups use `where: { tripTicketId_employeeId: { tripTicketId, employeeId } }`.
- `Branch.employees: Employee[]` — the back-relation `branchBlockers` in `organization/guard.ts:35-81` counts through, and the relation filter `where: { employees: { some: { archivedAt: null } } }` is available.
- `TripTicket.guides: TripTicketEmployee[]` — the collection `repository.ts:6-13` must add as `guides: { include: { employee: true } }`, and `where: { guides: { none: {} } }` / `{ some: { employeeId } }` filters are available.
- Nested-write shapes confirmed working: create `guides: { create: [{ employeeId }] }` (unchecked variant, no `connect` needed); the delete-all-then-recreate helper uses `tx.tripTicketEmployee.deleteMany({ where: { tripTicketId } })` then `tx.tripTicketEmployee.createMany({ data: employeeIds.map((employeeId) => ({ tripTicketId, employeeId })) })`.
- Referential actions: `trip_ticket_employees_trip_ticket_id_fkey` is `ON DELETE CASCADE`; `trip_ticket_employees_employee_id_fkey` and `employees_branch_id_fkey` are `ON DELETE RESTRICT`. Deleting a ticket removes its guide links; deleting an employee with any guide history throws P2003.
- `createTestEmployee(branchId: string, name = 'Ana Bautista'): Promise<Employee>` — exported from `apps/api/src/test/factories.ts`.
- `TABLES` in `apps/api/src/test/db.ts` now truncates `employees` and `trip_ticket_employees`, so `truncateAll()` needs no change in later tasks.
- Seeded employee ids, stable across re-seeds: Main Branch (`00000000-0000-4000-8000-000000000001`) = `...0031` Ana Bautista / Tour Guide, `...0032` Rico Mendoza / Safety Officer, `...0033` Liza Domingo / Nurse. North Branch (`...0002`) = `...0034` Paolo Cruz / Tour Guide, `...0035` Grace Lim / Safety Officer. E2E specs can rely on these.

_Consumes:_

- (nothing — this is the first task)

**Before you start — gotchas found while drafting this task:**

- `prisma db execute` REQUIRES `--schema` or `--url`. The `add_tool_borrows` plan (docs/superpowers/plans/2026-08-28-...:1300) omits it; run as written there it fails with `Error: Either --url or --schema must be provided.` Do not copy that form.
- Adding `guides TripTicketEmployee[]` widens the TripTicket relation block's type column by one character, because `TripTicketEmployee[]` (20) is longer than `GeofenceViolation[]` (19). All eleven `@relation` lines shift right by one space. Step 4 shows the shifted block; I verified `prisma format` is a byte-for-byte no-op on it, and `prisma validate` passes.
- The exact migration SQL in Step 6 is not guessed — it came from `prisma migrate diff --from-schema-datamodel <current> --to-schema-datamodel <edited> --script` against this repo's Prisma 6.3. `@default(now()) @updatedAt` produces `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` (matching `trip_dates`), not the bare `NOT NULL` that `tool_borrows` has from a plain `@updatedAt`.
- `--create-only` does NOT regenerate the Prisma client. `prisma.employee` stays `undefined` until the plain `prisma migrate dev` in Step 7 — that is exactly why the Step 2 failure message is `TypeError: Cannot read properties of undefined (reading 'create')`, which I confirmed by instantiating the current generated client.
- Order matters between Step 1 and Step 9. If `db.ts` is edited before the migration is applied, `truncateAll` in `beforeEach` dies first with `relation "employees" does not exist` and you never see the real TDD failure. Keep `db.ts` after Step 8.
- `db.ts` is the one deliverable here with no failing test that covers it. Omitting `trip_ticket_employees` from `TABLES` produces no error at all — just rows surviving between suites, surfacing later as an unrelated flaky failure in some other file. It is listed on the `job_order_spare_parts` precedent (db.ts:10), not because CASCADE needs it.
- NEVER run prettier on `apps/api/prisma/seed.ts` — it is outside prettier's reach on purpose and formatting it yields an ~800-line diff. Match its dense hand-formatted style.
- The seed's ticket block is behind `if ((await prisma.tripTicket.count()) === 0)` at seed.ts:297. On an already-populated dev or preview database the ticket loop never runs, so existing tickets keep zero guides. That is spec §11's "no backfill" in practice; only a database seeded from empty ends up with guides on every ticket. The fresh-database assertion in Step 12 is scoped accordingly.
- Seed capacity arithmetic is load-bearing for Task 5: seeded vehicles seat `4 + i` (4..9), tickets carry 2 participants, and 7 tickets cycle 6 vehicles. One guide each (two on the `approved` ticket, whose van seats 6) keeps every seeded ticket inside capacity. Seed a third guide anywhere and the i=0 / i=6 tickets on the 4-seat Hiace go over — they would still seed fine (the seed bypasses `assertBookable`) but become un-editable in the UI with a 409 OVER_CAPACITY the moment anyone opens them.
- `createTestEmployee` deliberately takes only `(branchId, name)`, per spec §12. Tests that need a `position` or `phone` should either go through `POST /api/employees` (which is what they are usually actually testing) or call `prisma.employee.create` inline — the precedent is `tool-borrows.test.ts:32-35`, which creates drivers inline rather than widening a factory.
- Guard against Prisma trying to drop hand-written indexes. Four indexes exist only in raw SQL and cannot be represented in `schema.prisma`: `branches_name_lower_unique`, `department_offices_branch_name_lower_unique`, `tracker_devices_active_vehicle_unique`, `tool_borrows_open_unique`. Prisma has left them alone through the last four migrations, but check the generated file and delete any `DROP INDEX` for them before applying.
- Spec §12 lists seven test fixtures that POST trip tickets and will break once `guideIds` becomes required (`trip-lifecycle.spec.ts:56-57`, `multi-date-trip.spec.ts:124-125/197-198/257-258`, `organization.spec.ts:493-494`, `trip-ticket-booking.test.ts:103`, `trip-tickets.test.ts:68-69`). None of them break in THIS task — nothing yet requires a guide — so Step 13 must be fully green before committing. If any of them are already red, that is a pre-existing failure, not this task's.

### Steps

- [ ] **Step 1: Write the failing schema test and the createTestEmployee factory**

Both files are test infrastructure, so they go in together — the test cannot be written without the factory it drives.

Append to `apps/api/src/test/factories.ts`, **immediately after `createTestOfficeHead`** (which currently ends at line 101) and before the `// \`preparedBy\` is required...` comment at line 103. The existing factory, for reference:

```ts
export async function createTestOfficeHead(
  branchId: string,
  officeId: string | null = null,
  name = 'Maria Santos'
) {
  return prisma.officeHead.create({ data: { name, branchId, officeId } });
}
```

The new one, in the same shape — positional arguments with defaults, no options object, returns the Prisma row:

```ts
// Employees are branch-scoped and REQUIRE a branch, unlike office heads —
// there is no `null` to default to.
export async function createTestEmployee(
  branchId: string,
  name = 'Ana Bautista'
) {
  return prisma.employee.create({ data: { name, branchId } });
}
```

Create `apps/api/src/test/employees-schema.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import {
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestTicket,
  createTestVehicle
} from './factories.js';
import { truncateAll } from './db.js';

// Schema-level guarantees only — nothing here goes through HTTP. These are the
// invariants the migration is responsible for, and every later task assumes
// them: the join's composite key, its asymmetric cascade, and the deliberate
// absence of name uniqueness.
describe('employees and trip guides schema', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  async function branchWithTicket() {
    const branch = await createTestBranch('Guides Branch');
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id);
    const ticket = await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id
    });
    return { branch, ticket };
  }

  it('creates an employee scoped to a branch, active by default', async () => {
    const branch = await createTestBranch('Guides Branch');
    const employee = await createTestEmployee(branch.id, 'Ana Bautista');

    expect(employee.branchId).toBe(branch.id);
    expect(employee.position).toBeNull();
    expect(employee.phone).toBeNull();
    expect(employee.archivedAt).toBeNull();
  });

  it('allows two employees with the same name in one branch', async () => {
    const branch = await createTestBranch('Guides Branch');
    await createTestEmployee(branch.id, 'Juan Cruz');
    await createTestEmployee(branch.id, 'Juan Cruz');

    expect(await prisma.employee.count({ where: { name: 'Juan Cruz' } })).toBe(
      2
    );
  });

  it('refuses the same employee twice on one ticket', async () => {
    const { branch, ticket } = await branchWithTicket();
    const employee = await createTestEmployee(branch.id);

    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, employeeId: employee.id }
    });

    await expect(
      prisma.tripTicketEmployee.create({
        data: { tripTicketId: ticket.id, employeeId: employee.id }
      })
    ).rejects.toThrow();
  });

  it('deletes guide links with the ticket but refuses to delete a guide', async () => {
    const { branch, ticket } = await branchWithTicket();
    const employee = await createTestEmployee(branch.id);
    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, employeeId: employee.id }
    });

    // Restrict toward the reference row: someone who has ever guided a trip is
    // not silently deletable.
    await expect(
      prisma.employee.delete({ where: { id: employee.id } })
    ).rejects.toThrow();

    // Cascade from the owning parent: deleting the ticket takes its links.
    await prisma.tripTicket.delete({ where: { id: ticket.id } });
    expect(await prisma.tripTicketEmployee.count()).toBe(0);
    expect(await prisma.employee.count()).toBe(1);
  });

  it('truncateAll clears employees and their guide links', async () => {
    const { branch, ticket } = await branchWithTicket();
    const employee = await createTestEmployee(branch.id);
    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, employeeId: employee.id }
    });

    await truncateAll();
    expect(await prisma.employee.count()).toBe(0);
    expect(await prisma.tripTicketEmployee.count()).toBe(0);
  });
});
```

Do **not** touch `apps/api/src/test/db.ts` yet — see Step 9 for why the order matters.

- [ ] **Step 2: Run the test and watch it fail for the right reason**

```bash
pnpm --filter @mms/api test -- src/test/employees-schema
```

Expected: all five specs fail, the first one with

```
TypeError: Cannot read properties of undefined (reading 'create')
```

thrown from `createTestEmployee` in `src/test/factories.ts`.

That message is exact — verified against the generated client in this repo: `prisma.employee` is `undefined` because the model does not exist yet, so `.create` blows up on `undefined`. If you instead see `relation "employees" does not exist` you edited `db.ts` early; revert that and re-run.

The first run also pays for `prisma migrate deploy` against `TEST_DATABASE_URL` in `src/test/global-setup.ts`, so it is slower than the rest.

`pnpm --filter @mms/api typecheck` will also be red right now (`Property 'employee' does not exist on type 'PrismaClient'`). That is expected until Step 7 regenerates the client; do not run it until Step 13.

- [ ] **Step 3: Add the two Prisma models**

In `apps/api/prisma/schema.prisma`, insert `model Employee` **immediately after `model OfficeHead`** (which ends at line 257) and before the `// ---------- Fleet (spec §4.2) ----------` banner at line 259. Employees are an org reference table shaped after `OfficeHead`, so they belong in the org-reference section.

```prisma
model Employee {
  id         String    @id @default(uuid()) @db.Uuid
  name       String
  position   String?
  phone      String?
  branchId   String    @map("branch_id") @db.Uuid
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @default(now()) @updatedAt @map("updated_at")
  // NULL means active. Set by POST /employees/:id/archive, cleared by /restore.
  archivedAt DateTime? @map("archived_at")

  branch      Branch               @relation(fields: [branchId], references: [id])
  tripTickets TripTicketEmployee[]

  @@index([branchId])
  // NOTE: there is deliberately NO unique index on name here, unlike
  // branches_name_lower_unique and department_offices_branch_name_lower_unique.
  // Employees are people, and two of them named Juan Cruz is not an error
  // (organization/service.ts:185 states the same rule for office heads).
  @@map("employees")
}
```

The NOTE sits between `@@index` and `@@map`, matching `TrackerDevice` at `schema.prisma:687-689`.

Insert `model TripTicketEmployee` **immediately after `model TripTicket`** (which ends at line 401) and before `model FuelAllocation` at line 403 — the same placement `JobOrderSparePart` has relative to `JobOrder` at 469.

```prisma
model TripTicketEmployee {
  tripTicketId String   @map("trip_ticket_id") @db.Uuid
  employeeId   String   @map("employee_id") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @default(now()) @updatedAt @map("updated_at")

  tripTicket TripTicket @relation(fields: [tripTicketId], references: [id], onDelete: Cascade)
  employee   Employee   @relation(fields: [employeeId], references: [id])

  @@id([tripTicketId, employeeId])
  @@index([employeeId])
  @@map("trip_ticket_employees")
}
```

The asymmetric cascade is the `JobOrderSparePart` shape (`schema.prisma:476-477`): `Cascade` from the owning parent, default `Restrict` toward the reference row.

- [ ] **Step 4: Wire the two relation lists**

**`Branch`** — current relation block, lines 206-213:

```prisma
  users             User[]
  drivers           Driver[]
  vehicles          Vehicle[]
  departmentOffices DepartmentOffice[]
  officeHeads       OfficeHead[]
  tripTickets       TripTicket[]
  jobOrders         JobOrder[]
  fuelAllocations   FuelAllocation[]
```

Replace with (one line added after `officeHeads`; column widths are unchanged because `employees` is shorter than `departmentOffices`):

```prisma
  users             User[]
  drivers           Driver[]
  vehicles          Vehicle[]
  departmentOffices DepartmentOffice[]
  officeHeads       OfficeHead[]
  employees         Employee[]
  tripTickets       TripTicket[]
  jobOrders         JobOrder[]
  fuelAllocations   FuelAllocation[]
```

**`TripTicket`** — current relation block, lines 381-395:

```prisma
  branch             Branch              @relation(fields: [branchId], references: [id])
  driver             Driver              @relation(fields: [driverId], references: [id])
  vehicle            Vehicle             @relation(fields: [vehicleId], references: [id])
  office             DepartmentOffice?   @relation(fields: [officeId], references: [id])
  officeHead         OfficeHead?         @relation(fields: [officeHeadId], references: [id])
  requestedBy        User?               @relation("TicketRequestedBy", fields: [requestedById], references: [id])
  approvedByAdmin    User?               @relation("TicketApprovedByAdmin", fields: [approvedByAdminId], references: [id])
  preTripGuard       User?               @relation("TicketPreTripGuard", fields: [preTripGuardId], references: [id])
  postTripGuard      User?               @relation("TicketPostTripGuard", fields: [postTripGuardId], references: [id])
  preTripCheckedBy   User?               @relation("TicketPreTripCheckedBy", fields: [preTripCheckedById], references: [id])
  postTripCheckedBy  User?               @relation("TicketPostTripCheckedBy", fields: [postTripCheckedById], references: [id])
  fuelAllocation     FuelAllocation?
  gpsData            GpsData[]
  geofenceViolations GeofenceViolation[]
  dates              TripDate[]
```

Replace the whole block with:

```prisma
  branch             Branch               @relation(fields: [branchId], references: [id])
  driver             Driver               @relation(fields: [driverId], references: [id])
  vehicle            Vehicle              @relation(fields: [vehicleId], references: [id])
  office             DepartmentOffice?    @relation(fields: [officeId], references: [id])
  officeHead         OfficeHead?          @relation(fields: [officeHeadId], references: [id])
  requestedBy        User?                @relation("TicketRequestedBy", fields: [requestedById], references: [id])
  approvedByAdmin    User?                @relation("TicketApprovedByAdmin", fields: [approvedByAdminId], references: [id])
  preTripGuard       User?                @relation("TicketPreTripGuard", fields: [preTripGuardId], references: [id])
  postTripGuard      User?                @relation("TicketPostTripGuard", fields: [postTripGuardId], references: [id])
  preTripCheckedBy   User?                @relation("TicketPreTripCheckedBy", fields: [preTripCheckedById], references: [id])
  postTripCheckedBy  User?                @relation("TicketPostTripCheckedBy", fields: [postTripCheckedById], references: [id])
  fuelAllocation     FuelAllocation?
  gpsData            GpsData[]
  geofenceViolations GeofenceViolation[]
  dates              TripDate[]
  guides             TripTicketEmployee[]
```

**Every `@relation` moved right by exactly one space.** That is not cosmetic churn: `TripTicketEmployee[]` is 20 characters against `GeofenceViolation[]`'s 19, so `prisma format` widens the type column for the whole group. Do it now and the formatter is a no-op; skip it and the next person to run `prisma format` gets an 11-line surprise diff.

Confirm both:

```bash
pnpm --filter @mms/api exec prisma format
pnpm --filter @mms/api exec prisma validate
```

Expected: `prisma format` reports `Formatted ... 🚀` and `git diff` shows **no** further change to `schema.prisma`; `prisma validate` prints `The schema at ...\schema.prisma is valid 🚀`. (Both were run against this exact edit — the formatter is a no-op.)

- [ ] **Step 5: Generate the migration without applying it**

```bash
pnpm --filter @mms/api exec prisma migrate dev --create-only --name add_employees_and_trip_guides
```

This writes `apps/api/prisma/migrations/<timestamp>_add_employees_and_trip_guides/migration.sql` and stops — it does **not** apply the migration and does **not** regenerate the Prisma client. `prisma.employee` stays `undefined` until Step 7.

**Warning:** if `prisma migrate dev` reports drift and offers to **reset**, decline. Against the shared dev database a reset is data loss for the whole team. Drift here is most likely the orphaned `20260820100000_notification_type_trip_date_cancelled` row documented in `docs/multi-date-trip-tickets-rollout.md` §1.1 — delete that row and retry.

- [ ] **Step 6: Check the generated SQL and append the NOTE**

The generated `migration.sql` must be exactly this — verified by running `prisma migrate diff` between the old and new datamodels in this repo:

```sql
-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "branch_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_ticket_employees" (
    "trip_ticket_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_ticket_employees_pkey" PRIMARY KEY ("trip_ticket_id","employee_id")
);

-- CreateIndex
CREATE INDEX "employees_branch_id_idx" ON "employees"("branch_id");

-- CreateIndex
CREATE INDEX "trip_ticket_employees_employee_id_idx" ON "trip_ticket_employees"("employee_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_ticket_employees" ADD CONSTRAINT "trip_ticket_employees_trip_ticket_id_fkey" FOREIGN KEY ("trip_ticket_id") REFERENCES "trip_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_ticket_employees" ADD CONSTRAINT "trip_ticket_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

**If the file contains anything else, stop and read it.** In particular, delete any `DROP INDEX` for `branches_name_lower_unique`, `department_offices_branch_name_lower_unique`, `tracker_devices_active_vehicle_unique` or `tool_borrows_open_unique` — those four are hand-written functional/partial indexes that Prisma cannot represent in `schema.prisma`, and dropping them silently removes a live uniqueness guarantee. (Prisma has left them alone through the last four migrations, so this is a guard, not an expectation.)

Then append this block to the **end** of the same file — §4.3 asks for the omission to be recorded here as well as in the schema:

```sql
-- NOTE: no unique index on employees.name, deliberately. branches and
-- department_offices both carry a case-insensitive functional unique index;
-- employees does not, and must not. Employees are people, and two of them
-- named Juan Cruz at one branch is not an error — the same rule
-- organization/service.ts:185 already states for office heads. Adding one
-- later would reject legitimate rows with a 409 that has no correct fix.
```

- [ ] **Step 7: Apply the migration and regenerate the client**

```bash
pnpm --filter @mms/api exec prisma migrate dev
```

Expected: `The following migration(s) have been applied: ... <timestamp>_add_employees_and_trip_guides` followed by `✔ Generated Prisma Client`. That `generate` is what puts `prisma.employee` and `prisma.tripTicketEmployee` on the client — `--create-only` in Step 5 did not.

No backfill runs and none is wanted: existing tickets have zero guides and there is nothing in the database from which a guide could be derived (spec §11).

- [ ] **Step 8: Run the test again — it should now pass**

```bash
pnpm --filter @mms/api test -- src/test/employees-schema
```

Expected: `Test Files  1 passed (1)` / `Tests  5 passed (5)`.

`src/test/global-setup.ts` runs `prisma migrate deploy` against `TEST_DATABASE_URL` before the suite, so the new migration reaches `mms_test` on its own — no separate command.

If `refuses the same employee twice on one ticket` passes but `deletes guide links with the ticket but refuses to delete a guide` fails on the `prisma.employee.delete` line, the employee foreign key was written with `ON DELETE CASCADE` instead of `RESTRICT`. Fix the migration, do not weaken the test.

- [ ] **Step 9: Add both tables to the truncation list**

In `apps/api/src/test/db.ts`, replace the whole `TABLES` array (lines 3-31):

```ts
const TABLES = [
  'refresh_tokens',
  'user_roles',
  'users',
  'roles',
  'fuel_allocations',
  'trip_ticket_employees',
  'trip_tickets',
  'job_order_spare_parts',
  'job_orders',
  'maintenance_completion_logs',
  'vehicle_maintenance_tracking',
  'maintenance_schedule_items',
  'maintenance_standards',
  'maintenance',
  'borrow_requests',
  'tool_borrows',
  'tools',
  'spare_parts',
  'gps_data',
  'geofence_violation',
  'geofence_area',
  'vehicle_status_audit',
  'drivers',
  'tracker_devices',
  'vehicles',
  'department_offices',
  'office_heads',
  'employees',
  'branches'
];
```

Two entries, both positioned deliberately (spec §12):

- `'trip_ticket_employees'` goes **before** `'trip_tickets'`, child ahead of parent — exactly how `'job_order_spare_parts'` sits ahead of `'job_orders'` two lines down. `trip_dates` is omitted from this list because it cascades, and it would have been defensible to omit this one too; it is listed because `job_order_spare_parts` is the model this join copies, and an unlisted table that `RESTART IDENTITY` never reaches leaks rows across suites as unrelated flaky failures somewhere else.
- `'employees'` goes **before** `'branches'`, beside the other branch-scoped reference tables it sits with in the schema.

The `CASCADE` on the `TRUNCATE` would reach both anyway; being named is what makes them explicit and identity-reset.

- [ ] **Step 10: Seed employees for both branches**

In `apps/api/prisma/seed.ts`, insert this block after line 63 (`await prisma.departmentOffice.update({ where: { id: northOffice.id }, data: { headId: northHead.id } });`) and its blank line 64, directly above `// One user per role (+ linked driver row for the driver-role user)` at line 65:

```ts
// Branch employees — the roster a ticket picks its guides from. BOTH branches
// get one: the guide picker is locked to the ticket's own branch, so a North
// Branch trip against an empty North roster could not be booked at all, and
// the picker would just be blank with nothing on screen to say why.
//
// Explicit element type for the same reason `drivers` has one below: the array
// is read back inside the ticket loop, and an evolving `[]` falls to an
// implicit any[] under this project's strict settings.
const mainEmployees: { id: string }[] = [];
const employeeSpecs = [
  {
    id: '00000000-0000-4000-8000-000000000031',
    name: 'Ana Bautista',
    position: 'Tour Guide',
    phone: '+63 917 555 0131',
    branchId: mainBranch.id
  },
  {
    id: '00000000-0000-4000-8000-000000000032',
    name: 'Rico Mendoza',
    position: 'Safety Officer',
    phone: '+63 917 555 0132',
    branchId: mainBranch.id
  },
  {
    id: '00000000-0000-4000-8000-000000000033',
    name: 'Liza Domingo',
    position: 'Nurse',
    phone: '+63 917 555 0133',
    branchId: mainBranch.id
  },
  {
    id: '00000000-0000-4000-8000-000000000034',
    name: 'Paolo Cruz',
    position: 'Tour Guide',
    phone: '+63 917 555 0134',
    branchId: northBranch.id
  },
  {
    id: '00000000-0000-4000-8000-000000000035',
    name: 'Grace Lim',
    position: 'Safety Officer',
    phone: '+63 917 555 0135',
    branchId: northBranch.id
  }
];
for (const e of employeeSpecs) {
  const employee = await prisma.employee.upsert({
    where: { id: e.id },
    update: {},
    create: e
  });
  if (e.branchId === mainBranch.id) mainEmployees.push(employee);
}
```

Fixed uuids in the `...0031`-`...0035` range, continuing the file's own scheme (branches `...01/02`, offices `...11/12`, heads `...21/22`); `...31`-`...35` are unused anywhere in `apps/` or `packages/`. `upsert` on the id makes a re-run a no-op, matching every other reference row in this file.

**Do not run prettier on `seed.ts`** — the file is deliberately outside prettier's reach and formatting it produces an ~800-line diff. Match the dense one-line-per-record style above by hand.

- [ ] **Step 11: Attach guides to every seeded ticket**

Still in `apps/api/prisma/seed.ts`, inside the `for (const [i, status] of statuses.entries())` loop.

Current lines 345-350:

```ts
      const live = dates.filter((d) => d.status !== 'cancelled');
      const spanRows = live.length > 0 ? live : dates;
      const startTs = new Date(Math.min(...spanRows.map((d) => d.startTs.getTime())));
      const endTs = new Date(Math.max(...spanRows.map((d) => d.endTs.getTime())));

      await prisma.tripTicket.create({
```

Replace with:

```ts
      const live = dates.filter((d) => d.status !== 'cancelled');
      const spanRows = live.length > 0 ? live : dates;
      const startTs = new Date(Math.min(...spanRows.map((d) => d.startTs.getTime())));
      const endTs = new Date(Math.max(...spanRows.map((d) => d.endTs.getTime())));

      // Every ticket needs at least one guide (spec §5.3), and the picker is
      // locked to the ticket's own branch — so these come from Main Branch's
      // roster, which is the branch every seeded ticket is raised for. The
      // approved ticket takes TWO: a multi-guide ticket is the case the capacity
      // arithmetic can get wrong, and nothing else in the demo data exercises it.
      // Seeded vehicles seat 4-9 against 2 participants, so 1 guide (2 on the
      // approved ticket, whose van seats 6) stays inside capacity — a seeded
      // ticket over capacity would be un-editable in the UI from day one.
      const guides = status === 'approved'
        ? mainEmployees.slice(0, 2)
        : [mainEmployees[i % mainEmployees.length]!];

      await prisma.tripTicket.create({
```

Then, in the same `create`'s `data`, current line 365:

```ts
          dates: { create: dates },
```

becomes:

```ts
          dates: { create: dates },
          guides: { create: guides.map((e) => ({ employeeId: e.id })) },
```

The nested unchecked create (`{ employeeId }` rather than `{ employee: { connect: ... } }`) is the shape this file already uses for the other composite-PK join at line 397: `spareParts: ... { create: [{ sparePartId: parts[2]!.id, quantity: 2 }] }`.

The non-null assertion on `mainEmployees[i % mainEmployees.length]` matches `drivers[i % drivers.length]!` on line 352 — a fixed-length array seeded just above, safe under `noUncheckedIndexedAccess`.

- [ ] **Step 12: Re-seed and assert the seed data**

```bash
pnpm --filter @mms/api db:seed
```

Expected: ends with `Seed complete.`

Assert the employees landed, on any database:

```bash
pnpm --filter @mms/api exec prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM "employees" WHERE "id" IN (
    '00000000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000032',
    '00000000-0000-4000-8000-000000000033',
    '00000000-0000-4000-8000-000000000034',
    '00000000-0000-4000-8000-000000000035'
  );
  IF n <> 5 THEN RAISE EXCEPTION 'expected 5 seeded employees, found %', n; END IF;

  SELECT count(*) INTO n FROM "employees"
   WHERE "branch_id" = '00000000-0000-4000-8000-000000000002'
     AND "id" IN ('00000000-0000-4000-8000-000000000034',
                  '00000000-0000-4000-8000-000000000035');
  IF n <> 2 THEN RAISE EXCEPTION 'expected 2 North Branch employees, found %', n; END IF;
END $$;
SQL
```

Expected: `Script executed successfully.` A failure prints `Error: ERROR: expected 5 seeded employees, found N` — the assertion is real, both branches were exercised against this database before being written down.

Note `--schema prisma/schema.prisma` is **required**; without it the CLI stops with `Error: Either --url or --schema must be provided.`

The guides assertion only holds on a database seeded from empty, because the ticket block sits behind `if ((await prisma.tripTicket.count()) === 0)` at line 297 — an already-populated dev database keeps its guideless tickets, which is exactly what §11's "no backfill" means in practice. On a fresh database, also run:

```bash
pnpm --filter @mms/api exec prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM "trip_tickets" t
   WHERE NOT EXISTS (SELECT 1 FROM "trip_ticket_employees" g
                      WHERE g."trip_ticket_id" = t."id");
  IF n <> 0 THEN RAISE EXCEPTION '% trip ticket(s) have no guide', n; END IF;
END $$;
SQL
```

Expected on a fresh database: `Script executed successfully.`

- [ ] **Step 13: Typecheck and run the whole suite**

```bash
pnpm --filter @mms/api typecheck
pnpm --filter @mms/api test
```

Expected: typecheck clean, every suite green including the new `src/test/employees-schema.test.ts` and the existing `src/test/db.test.ts`.

Nothing outside this task reads the new tables yet, so a red suite here means the truncation-list edit or the migration broke something, not the feature. The seven fixtures that POST trip tickets (`trip-ticket-booking.test.ts:103`, `trip-tickets.test.ts:68-69`, and the e2e specs listed in §12) must still pass — `guideIds` does not become required until Task 3.

- [ ] **Step 14: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/prisma/seed.ts apps/api/src/test/db.ts apps/api/src/test/factories.ts apps/api/src/test/employees-schema.test.ts
git commit -m "feat(api): add branch employees and the trip-guide join"
```

Do not push.

---

## Task 2: Employee contracts and the organization API

> **Corrections applied to this task — these override anything below that disagrees.**
>
> 1. **`createTestEmployee` is owned by Task 1.** Its canonical signature is `createTestEmployee(branchId: string, name = 'Ana Bautista')`. Do not redefine it here and do not assume a different default name — `employees.test.ts` filters by name.
> 2. **Drop the live-ticket `IN_USE` case from `employees.test.ts`.** Task 6's `employee-archive.test.ts` owns the whole archive-blocker sweep. Keep only the restore-under-archived-branch case here, matching `offices.test.ts`.
> 3. **`OrgRefs.employeeIds` is `?: string[] | null`** — the nullable form, matching its three sibling keys.
> 4. **Additionally: pre-seed `guideIds` into the four `enforcement.test.ts` POST bodies.** See Step 18 at the end of this task. This is inert today and prevents a red build in Task 3.

**Files:**

- [modify] packages/shared/src/contracts/organization.ts @ 36-44 (the office-head schemas; new code is appended after line 44, end of file) — createEmployeeBodySchema / updateEmployeeBodySchema / employeesListQuerySchema + their inferred types
- [modify] apps/api/src/lib/org-refs.ts @ 4-8 (OrgRefs interface) and 42-51 (the officeHeadId check block; new block inserted after line 51) — employeeIds key so PARENT_ARCHIVED covers a referenced (guide) employee
- [modify] apps/api/src/modules/organization/repository.ts @ 43-57 (listOfficeHeads; new function appended after 57) — listEmployees(skipTake, includeArchived, branchId) using the existing archiveWhere helper
- [modify] apps/api/src/modules/organization/guard.ts @ 27-34 (branchBlockers doc comment), 59-65 (officeHeads entry → insert employees entry after it), 100-115 (officeHeadBlockers → append employeeBlockers after it) — employeeBlockers(id) + the employees entry inside branchBlockers
- [modify] apps/api/src/modules/organization/service.ts @ 1-20 (imports) and 229-241 (restoreOfficeHead; new functions appended after 241, end of file) — createEmployee / updateEmployee / archiveEmployee / restoreEmployee / listEmployees + loadEmployee
- [modify] apps/api/src/modules/organization/controller.ts @ 1-24 (imports + helpers) and 127-132 (restoreOfficeHead; new handlers appended after 132, end of file) — five thin employee handlers; listEmployees parses employeesListQuerySchema, NOT listQuery()
- [modify] apps/api/src/modules/organization/router.ts @ 1-14 (imports) and 114-119 (office-head restore; new routes appended after 119, end of file) — five employee routes with PER-ROUTE guards (never router-wide — see the file's own comment at 18-24)
- [test] apps/api/src/modules/organization/employees.test.ts — NEW FILE. Full employee API suite: CRUD, required branchId, no name uniqueness, ?branchId= filter, includeArchived, archive/restore, IN_USE blockers, restore-under-archived-branch, role matrix
- [test] apps/api/src/modules/organization/guard.test.ts @ 4-19 (imports), 83-93 (office-head blocker test → insert after), 231-248 (sibling-branch isolation test → extend), 262-276 (last sibling test → append after) — MODIFY. branchBlockers employees rule, employeeBlockers rule, sibling isolation on both
- [test] apps/api/src/lib/org-refs.test.ts @ 1-10 (imports) and 98-125 (the join test → append after 125, before the closing `});`) — MODIFY. employeeIds: empty/null skipped, all-active passes, any-archived throws PARENT_ARCHIVED
- [test] apps/api/src/modules/organization/enforcement.test.ts @ 5-13 (imports) and 335-364 (the archived-officeHeadId test → insert the two employee tests after line 364, before the 'leaves records' test at 366) — MODIFY. POST /api/employees AND PATCH /api/employees/:id both reject an archived branchId (the G-1 rule)

**Interfaces:**

_Produces:_

- packages/shared/src/contracts/organization.ts: export const createEmployeeBodySchema — z.object({ name: z.string().min(1); position: nullableString; phone: nullableString; branchId: z.string().uuid() })
- packages/shared: export type CreateEmployeeBody = { name: string; position?: string | null; phone?: string | null; branchId: string }
- packages/shared: export const updateEmployeeBodySchema = createEmployeeBodySchema.partial()
- packages/shared: export type UpdateEmployeeBody = { name?: string; position?: string | null; phone?: string | null; branchId?: string }
- packages/shared: export const employeesListQuerySchema = organizationListQuerySchema.extend({ branchId: z.string().uuid().optional() })
- packages/shared: export type EmployeesListQuery = { page?: number; limit?: number; includeArchived?: boolean; branchId?: string }
- NOTE for later slices: packages/shared/src/index.ts needs NO edit — line 16 already does `export * from './contracts/organization.js'`, so all of the above are importable from '@mms/shared' after `pnpm --filter @mms/shared build`
- apps/api/src/lib/org-refs.ts: interface OrgRefs gains `employeeIds?: string[] | null` — PLURAL. assertOrgRefsActive(refs: OrgRefs): Promise<void> throws 409 PARENT_ARCHIVED with message 'Cannot reference an archived employee' when ANY id in the list is archived; an empty or null list is skipped. Task 3 calls it as assertOrgRefsActive({ branchId, officeId, officeHeadId, employeeIds: body.guideIds })
- apps/api/src/modules/organization/repository.ts: export async function listEmployees(skipTake: SkipTake, includeArchived?: boolean, branchId?: string): Promise<{ data: Employee[]; count: number }> — orderBy name asc
- apps/api/src/modules/organization/guard.ts: export function employeeBlockers(id: string): Promise<Blocker[]> — one check, resource 'tripTickets', counts tickets where guides some employeeId AND status in LIVE_TRIP_STATUSES
- apps/api/src/modules/organization/guard.ts: branchBlockers(id) now also returns { resource: 'employees', count } for ACTIVE (archivedAt: null) employees on that branch
- apps/api/src/modules/organization/service.ts: listEmployees(query: EmployeesListQuery); createEmployee(body: CreateEmployeeBody): Promise<Employee>; updateEmployee(id: string, body: UpdateEmployeeBody): Promise<Employee>; archiveEmployee(id: string): Promise<Employee>; restoreEmployee(id: string): Promise<Employee>
- apps/api/src/modules/organization/controller.ts: listEmployees / createEmployee / updateEmployee / archiveEmployee / restoreEmployee — each (req: Request, res: Response): Promise<void>
- HTTP surface for Task 4 (web): GET /api/employees?branchId=&includeArchived=&page=&limit= (requireAuth) -> { data, count }; POST /api/employees (admin) -> 201 Employee; PATCH /api/employees/:id (admin) -> 200 Employee; POST /api/employees/:id/archive (admin) -> 200 Employee; POST /api/employees/:id/restore (admin) -> 200 Employee
- Blocker resource keys Task 4 must label in lib/api/organization.ts: 'employees' (on a branch) and 'tripTickets' (on an employee) — an unlabelled key renders raw in the archive dialog

_Consumes:_

- FROM Task 1 — prisma.employee delegate for `model Employee { id String @id @db.Uuid; name String; position String?; phone String?; branchId String @map("branch_id") @db.Uuid; createdAt; updatedAt; archivedAt DateTime? @map("archived_at"); branch Branch @relation(...); tripTickets TripTicketEmployee[] } @@map("employees")` — I use .findMany, .findUnique, .create, .update, .updateMany and .count on it
- FROM Task 1 — prisma.tripTicketEmployee delegate; tests call prisma.tripTicketEmployee.create({ data: { tripTicketId: string, employeeId: string } })
- FROM Task 1 — the relation field `guides TripTicketEmployee[]` on model TripTicket. employeeBlockers queries prisma.tripTicket.count({ where: { guides: { some: { employeeId: id } }, status: liveTicket } }); if Task 1 names it anything other than `guides`, that one line changes
- FROM Task 1 — apps/api/src/test/factories.ts: export async function createTestEmployee(branchId: string, name = 'Ana Bautista'): Promise<Employee> — assumed to be prisma.employee.create({ data: { name, branchId } }) with position/phone left null. Used in employees.test.ts, guard.test.ts, enforcement.test.ts and org-refs.test.ts
- FROM Task 1 — apps/api/src/test/db.ts TABLES must contain 'employees' and 'trip_ticket_employees', with 'trip_ticket_employees' listed BEFORE 'trip_tickets' (spec §12). Without them truncateAll leaves rows behind and my per-test counts (e.g. `expect(all.body.count).toBe(2)`) fail intermittently in whichever suite runs next
- FROM Task 1 — `pnpm --filter @mms/api exec prisma generate` must have been run after the schema change, or prisma.employee is undefined at runtime
- ALREADY IN REPO (verified today) — archiveWhere(includeArchived: boolean | undefined) at organization/repository.ts:8-10 (module-private, same file); toSkipTake(q: PaginationQuery) at lib/pagination.ts:4; assertArchivable(name: string, blockers: Blocker[]): void and collect(...) and `const liveTicket = { in: [...LIVE_TRIP_STATUSES] }` at guard.ts:25; AppError(statusCode, code, message, details?) at lib/errors.ts:3; nullableString at contracts/common.ts:36; organizationListQuerySchema at contracts/organization.ts:12; USER_ROLES.admin; requireAuth; requireRole; validateBody; the local requireIdParam at organization/controller.ts:19

**Before you start — gotchas found while drafting this task:**

- SILENT-FAILURE TRAP #1 — zod strips unknown keys. If listEmployees in controller.ts calls the existing `listQuery(req)` helper (which parses organizationListQuerySchema) instead of employeesListQuerySchema, `?branchId=` is dropped with NO error, no 400, no log. The picker then offers every branch's roster and the branch-locking in spec §5.2 is silently gone. The test 'filters the list to one branch with ?branchId=' is the only thing that catches it.
- SILENT-FAILURE TRAP #2 — @mms/shared resolves to packages/shared/dist. apps/api/tsconfig.json has no `paths` mapping and packages/shared/package.json points main/exports at ./dist. Editing contracts/organization.ts without running `pnpm --filter @mms/shared build` leaves the API importing a stale module and the failure reads as `SyntaxError: [vite] The requested module '@mms/shared' does not provide an export named 'createEmployeeBodySchema'` — which looks like a typo, not a stale build. The repo's own older plans encode this as `pnpm --filter @mms/shared build && pnpm --filter @mms/api test -- ...`.
- SILENT-FAILURE TRAP #3 — the enforcement tests go 404 -> green in one step, so neither has ever been observed failing for the reason it exists. Step 16 is not optional: delete updateEmployee's assertOrgRefsActive line, confirm ONLY the PATCH test fails (expected 200 to be 409) while the POST test stays green, restore, confirm `git diff` is empty.
- SPEC UNDER-SPECIFIED — the name of the employees list-query schema. §7 names only the two body schemas. I chose `employeesListQuerySchema` / `EmployeesListQuery`, plural, to match driversListQuerySchema, usersListQuerySchema, vehiclesListQuerySchema, toolsListQuerySchema and tripTicketsListQuerySchema. The singular `organizationListQuerySchema` is the odd one out because it is resource-less.
- SPEC UNDER-SPECIFIED — §5.2 says assertOrgRefsActive 'gains an employee key' without saying singular or plural. I made it `employeeIds?: string[] | null` and implemented it as ONE `prisma.employee.count({ where: { id: { in: ids }, archivedAt: { not: null } } })`. A singular `employeeId` would force Task 3 to loop and issue N round-trips per booking, and the shared error message ('Cannot reference an archived employee') would name only whichever one was checked last. The message stays singular even when several guides are archived, matching how 'branch' / 'department office' / 'office head' name the KIND, not the count.
- SPEC UNDER-SPECIFIED — the blocker resource key for a branch's employees. I chose `'employees'`, which must match the `OrgResource` union member and the blocker-label key Task 4 adds in apps/web/src/lib/api/organization.ts (spec §9.1 warns: `blocker labels gain employees: ['employee', 'employees'] or the archive dialog renders a raw key`). If Task 4 uses a different string the dialog shows `employees` untranslated rather than '2 employees'.
- employeeBlockers counts TICKETS (`prisma.tripTicket.count({ where: { guides: { some: ... } } })`), not join rows. Counting prisma.tripTicketEmployee gives the identical number today only because the composite PK forbids a duplicate (ticket, employee) pair — but the blocker is labelled `tripTickets`, so counting tickets is the honest query and stays honest if a `role` column is ever added to the join.
- LIVE_STATUSES rule respected: employeeBlockers reuses the module-level `liveTicket` constant (guard.ts:25, built from LIVE_TRIP_STATUSES) rather than inlining a status array. completed / cancelled / disapproved tickets never block archiving an employee — history keeps the guide's name through the join (§8) and the roster still lets them go. The same constant is used for the new `employees` entry's sibling checks in branchBlockers.
- branchId uses `z.string().uuid()` and NOT `nullableUuid`, deliberately. `nullableUuid` is a z.preprocess that maps '' -> null and is optional-nullable; using it here would reintroduce exactly the NULL-branch state §4.3 makes unrepresentable. `.partial()` on the create schema turns it into `z.string().uuid().optional()` for PATCH, which is the right semantics: absent means leave the branch alone, and there is no way to clear it.
- restoreEmployee checks branchId; restoreOffice deliberately does not check headId. The asymmetry is safe here because there is no reference cycle — nothing points a Branch at an Employee — so an archived branch+employee pair is always restorable branch-first. This mirrors restoreOfficeHead, not restoreOffice.
- Step 4's red state is a vitest COLLECTION failure (`does not provide an export named 'employeeBlockers'`), so the whole guard.test.ts file reports as failed, not one test. The exact wording of that message comes from vite's SSR transform and can shift with the vite version bundled by vitest 3 — what matters is that the suite fails to load before Step 5 and loads cleanly after.
- employees.test.ts deliberately does NOT duplicate the POST/PATCH archived-branchId cases; those live in enforcement.test.ts per spec §12. It does keep the restore-under-archived-branch case, which is where offices.test.ts keeps its equivalent. That split matches the repo as it stands.
- The 'refuses to restore an employee whose branch is still archived' test doubles as proof that branchBlockers counts only ACTIVE employees: the branch archive at the top of it returns 200 only because the employee was archived first.
- This task touches nothing in apps/web and nothing in apps/api/src/modules/trip-tickets. The trip-ticket create-spread blanking of guideIds, tripTicketInclude, replaceTripTicketGuides, the capacity arithmetic and POST /api/trip-tickets/:id/guides are all Task 3, and they consume OrgRefs.employeeIds from here.

### Steps

- [ ] **Step 1 — Red: branchBlockers must count a branch's ACTIVE employees**
      `branchBlockers` is what stops a branch being archived out from under its own roster (spec §10). Add the test **before** touching `guard.ts`.

First, extend the factory import block. **Replace** `apps/api/src/modules/organization/guard.test.ts:4-12`:

```ts
import {
  createTestBranch,
  createTestDriver,
  createTestOffice,
  createTestOfficeHead,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
```

**with:**

```ts
import {
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestOffice,
  createTestOfficeHead,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
```

Then **insert** this test immediately after the office-head blocker test that ends at line 93 (the `});` closing `'blocks on an ACTIVE child office head but NOT an archived one'`), before `'blocks on a live trip ticket but NOT a completed one'` at line 95:

```ts
it('blocks on an ACTIVE employee but NOT an archived one', async () => {
  const branch = await createTestBranch();
  const employee = await createTestEmployee(branch.id);
  expect(names(await branchBlockers(branch.id))).toContain('employees');

  // Same reasoning as the office and the head above: employees can only be
  // archived, never deleted, so an archived one must release the branch or a
  // branch that ever had a roster could never be closed.
  await prisma.employee.update({
    where: { id: employee.id },
    data: { archivedAt: new Date() }
  });
  expect(await branchBlockers(branch.id)).toEqual([]);
});
```

Also extend the sibling-isolation test the spec §12 asks for. **Replace** line 231:

```ts
  it("does not count a sibling branch's vehicle, driver, office, or head", async () => {
```

**with:**

```ts
  it("does not count a sibling branch's vehicle, driver, office, head, or employee", async () => {
```

and **replace** line 245:

```ts
await createTestOfficeHead(branchB.id, null, 'Sibling Head');
```

**with:**

```ts
await createTestOfficeHead(branchB.id, null, 'Sibling Head');
await createTestEmployee(branchB.id, 'Sibling Staff');
```

Note honestly: the sibling test is a regression guard, not a red-green driver — it asserts `toEqual([])` and passes both before and after Step 2. Only the new `'blocks on an ACTIVE employee'` test goes red.

- [ ] **Step 2 — Run it and confirm the exact failure**

```
pnpm --filter @mms/api test -- src/modules/organization/guard
```

Expected:

```
 FAIL  src/modules/organization/guard.test.ts > organization archive guard > blocks on an ACTIVE employee but NOT an archived one
AssertionError: expected [] to contain 'employees'
```

`branchBlockers` returns `[]` because it has no employees check at all. Every other test in the file stays green.

- [ ] **Step 3 — Green: add the employees entry to branchBlockers**
      Two edits in `apps/api/src/modules/organization/guard.ts`.

**(a) The doc comment.** Replace lines 32-34:

```ts
// completed trip ticket. Child offices and heads block only while ACTIVE;
// counting archived children would make a branch impossible to empty, because
// children can only be archived and never deleted.
```

with:

```ts
// completed trip ticket. Child offices, heads and employees block only while
// ACTIVE; counting archived children would make a branch impossible to empty,
// because children can only be archived and never deleted.
```

**(b) The check.** The current array runs `officeHeads` (lines 59-64) straight into `tripTickets` (lines 65-70). Replace this exact snippet:

```ts
    {
      resource: 'officeHeads',
      count: prisma.officeHead.count({
        where: { branchId: id, archivedAt: null }
      })
    },
    {
      resource: 'tripTickets',
```

with:

```ts
    {
      resource: 'officeHeads',
      count: prisma.officeHead.count({
        where: { branchId: id, archivedAt: null }
      })
    },
    {
      resource: 'employees',
      count: prisma.employee.count({
        where: { branchId: id, archivedAt: null }
      })
    },
    {
      resource: 'tripTickets',
```

Re-run:

```
pnpm --filter @mms/api test -- src/modules/organization/guard
```

All green.

- [ ] **Step 4 — Red: employeeBlockers, and history never blocks**
      Extend the guard import. **Replace** `guard.test.ts:14-19`:

```ts
import {
  assertArchivable,
  branchBlockers,
  officeBlockers,
  officeHeadBlockers
} from './guard.js';
```

**with:**

```ts
import {
  assertArchivable,
  branchBlockers,
  employeeBlockers,
  officeBlockers,
  officeHeadBlockers
} from './guard.js';
```

Then **append** both tests after the last test in the `'organization archive guard'` describe — the one ending at line 276 (`"does not count a sibling head's office in officeHeadBlockers"`), before the `});` on line 277 that closes the describe:

```ts
it('blocks an employee on live guided tickets only', async () => {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(branch.id, 'inactive');
  const employee = await createTestEmployee(branch.id);
  expect(await employeeBlockers(employee.id)).toEqual([]);

  const ticket = await createTestTicket({
    branchId: branch.id,
    driverId: driver.id,
    vehicleId: vehicle.id,
    status: 'in_progress'
  });
  await prisma.tripTicketEmployee.create({
    data: { tripTicketId: ticket.id, employeeId: employee.id }
  });
  expect(names(await employeeBlockers(employee.id))).toEqual(['tripTickets']);

  // History never blocks (§10): the finished ticket keeps rendering the
  // guide's name through the join, but the roster has to let them go.
  await prisma.tripTicket.update({
    where: { id: ticket.id },
    data: { status: 'completed' }
  });
  expect(await employeeBlockers(employee.id)).toEqual([]);
});

it("does not count another employee's ticket in employeeBlockers", async () => {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(branch.id, 'inactive');
  const guiding = await createTestEmployee(branch.id, 'On The Trip');
  const idle = await createTestEmployee(branch.id, 'Back At Base');
  const ticket = await createTestTicket({
    branchId: branch.id,
    driverId: driver.id,
    vehicleId: vehicle.id,
    status: 'approved'
  });
  // The ticket is guided by `guiding`, not `idle`. Drop the employeeId
  // filter in guard.ts and every employee in the app would be blocked by
  // every live ticket — the I-5 gap, one level down.
  await prisma.tripTicketEmployee.create({
    data: { tripTicketId: ticket.id, employeeId: guiding.id }
  });

  expect(await employeeBlockers(idle.id)).toEqual([]);
});
```

Run:

```
pnpm --filter @mms/api test -- src/modules/organization/guard
```

Expected — a **collection** failure, not an assertion one, because `employeeBlockers` is not exported yet:

```
 FAIL  src/modules/organization/guard.test.ts [ src/modules/organization/guard.test.ts ]
SyntaxError: [vite] The requested module '/src/modules/organization/guard.ts' does not provide an export named 'employeeBlockers'
```

The whole file fails to load, so every test in it is reported as failed. That is the expected red state.

- [ ] **Step 5 — Green: add employeeBlockers**
      **Append** to `apps/api/src/modules/organization/guard.ts` after `officeHeadBlockers`, which ends at line 115, and before the `assertArchivable` comment block at line 117:

```ts
// An employee is referenced by exactly one thing: the trip tickets they guide
// (TripTicketEmployee). Counting TICKETS rather than join rows keeps the
// `tripTickets` resource name honest — the composite PK means the two numbers
// agree today, but only the ticket count is what the dialog claims to show.
export function employeeBlockers(id: string): Promise<Blocker[]> {
  return collect([
    {
      resource: 'tripTickets',
      count: prisma.tripTicket.count({
        where: { guides: { some: { employeeId: id } }, status: liveTicket }
      })
    }
  ]);
}
```

`liveTicket` is the module constant at `guard.ts:25` (`const liveTicket = { in: [...LIVE_TRIP_STATUSES] };`) — reuse it, never inline a status list, or history starts blocking the moment `LIVE_TRIP_STATUSES` changes.

Run:

```
pnpm --filter @mms/api test -- src/modules/organization/guard
```

All green. Commit:

```
git add apps/api/src/modules/organization/guard.ts apps/api/src/modules/organization/guard.test.ts
git commit -m "feat(api): block branch and employee archiving on live trip guides"
```

- [ ] **Step 6 — Red: assertOrgRefsActive must cover a list of employee ids**
      Guides are referenced as a **list**, so this key is plural where every other `OrgRefs` key is singular.

**Replace** `apps/api/src/lib/org-refs.test.ts:2-6`:

```ts
import {
  createTestBranch,
  createTestOffice,
  createTestOfficeHead
} from '../test/factories.js';
```

**with:**

```ts
import {
  createTestBranch,
  createTestEmployee,
  createTestOffice,
  createTestOfficeHead
} from '../test/factories.js';
```

Then **append** these three tests after the `'joins two archived parents...'` test, which ends at line 125, before the `});` on line 126 closing the describe:

```ts
it('skips an employeeIds list that is empty or null', async () => {
  // An empty guide list is a NO_GUIDES 400 raised by the trip-ticket
  // service (§5.3), not an archived-parent problem — this function has to
  // stay silent on it or the wrong error code reaches the booking form.
  await expect(
    assertOrgRefsActive({ employeeIds: [] })
  ).resolves.toBeUndefined();
  await expect(
    assertOrgRefsActive({ employeeIds: null })
  ).resolves.toBeUndefined();
});

it('does not throw when every employee in the list is active', async () => {
  const branch = await createTestBranch();
  const a = await createTestEmployee(branch.id, 'Active One');
  const b = await createTestEmployee(branch.id, 'Active Two');
  await expect(
    assertOrgRefsActive({ employeeIds: [a.id, b.id] })
  ).resolves.toBeUndefined();
});

// The archived member is deliberately NOT first in the list: a check that
// only looked at employeeIds[0] would pass the test above and this one too
// if the order were reversed.
it('throws PARENT_ARCHIVED when any employee in the list is archived', async () => {
  const branch = await createTestBranch();
  const live = await createTestEmployee(branch.id, 'Still Here');
  const gone = await createTestEmployee(branch.id, 'Archived');
  await prisma.employee.update({
    where: { id: gone.id },
    data: { archivedAt: new Date() }
  });

  let caught: unknown;
  try {
    await assertOrgRefsActive({ employeeIds: [live.id, gone.id] });
  } catch (e) {
    caught = e;
  }

  expect(caught).toBeInstanceOf(AppError);
  const err = caught as AppError;
  expect(err.statusCode).toBe(409);
  expect(err.code).toBe('PARENT_ARCHIVED');
  expect(err.message).toBe('Cannot reference an archived employee');
});
```

Run:

```
pnpm --filter @mms/api test -- src/lib/org-refs
```

Expected — vitest does not typecheck, so the unknown `employeeIds` key is simply ignored at runtime and only the third test fails:

```
 FAIL  src/lib/org-refs.test.ts > assertOrgRefsActive > throws PARENT_ARCHIVED when any employee in the list is archived
AssertionError: expected undefined to be an instance of AppError
```

- [ ] **Step 7 — Green: add the employeeIds key to org-refs**
      Two edits in `apps/api/src/lib/org-refs.ts`.

**(a) The interface.** Replace lines 4-8:

```ts
export interface OrgRefs {
  branchId?: string | null;
  officeId?: string | null;
  officeHeadId?: string | null;
}
```

with:

```ts
export interface OrgRefs {
  branchId?: string | null;
  officeId?: string | null;
  officeHeadId?: string | null;
  // Plural, unlike the three above: employees are referenced as a LIST — a
  // ticket's guides (§5.2) — never one at a time.
  employeeIds?: string[] | null;
}
```

**(b) The check.** Insert after the `officeHeadId` block that ends at line 51, before the blank line preceding `const archived = ...` at line 53:

```ts
if (refs.employeeIds?.length) {
  // One count, not N findUniques: the caller passes every guide on the
  // ticket and only needs to know whether ANY of them is archived. An empty
  // list falls through to the NO_GUIDES check in the trip-ticket service.
  checks.push(
    prisma.employee
      .count({
        where: { id: { in: refs.employeeIds }, archivedAt: { not: null } }
      })
      .then((n) => (n > 0 ? 'employee' : null))
  );
}
```

Run both the test and the typecheck — the typecheck is what proves the interface edit landed, since vitest never sees it:

```
pnpm --filter @mms/api test -- src/lib/org-refs
pnpm --filter @mms/api typecheck
```

Both clean. Commit:

```
git add apps/api/src/lib/org-refs.ts apps/api/src/lib/org-refs.test.ts
git commit -m "feat(api): cover referenced employees with the archived-parent check"
```

- [ ] **Step 8 — Red: the whole employee API suite**
      Create `apps/api/src/modules/organization/employees.test.ts`. Modelled on `offices.test.ts` — same `adminHeader()` helper, same `beforeEach(truncateAll)` / `afterAll` pair.

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestTicket,
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

describe('organization — employees', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates an employee under a branch', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', header)
      .send({
        name: 'Ana Bautista',
        position: 'Tour Guide',
        phone: '0917-000-0000',
        branchId: branch.id
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Ana Bautista');
    expect(res.body.position).toBe('Tour Guide');
    expect(res.body.branchId).toBe(branch.id);
    expect(res.body.archivedAt).toBeNull();
  });

  it('creates an employee with position and phone omitted', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', header)
      .send({ name: 'Ana Bautista', branchId: branch.id });
    expect(res.status).toBe(201);
    expect(res.body.position).toBeNull();
    expect(res.body.phone).toBeNull();
  });

  // §4.3: branchId is REQUIRED here, diverging from OfficeHead.branchId. The
  // guide picker is branch-locked, so an employee with no branch would appear
  // in no branch's picker anywhere, with no error and no way to notice.
  it('refuses to create an employee with no branch', async () => {
    const header = await adminHeader();
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', header)
      .send({ name: 'Ana Bautista' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('allows two employees with the same name', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    await createTestEmployee(branch.id, 'Juan Cruz');
    // Employees are people, like office heads. Two Juan Cruzes at one branch
    // is not an error — which is why no unique index exists (§4.3).
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', header)
      .send({ name: 'Juan Cruz', branchId: branch.id });
    expect(res.status).toBe(201);
  });

  it('renames an employee and moves them between branches', async () => {
    const header = await adminHeader();
    const from = await createTestBranch('From');
    const to = await createTestBranch('To');
    const employee = await createTestEmployee(from.id, 'Ana Bautista');

    const res = await request(app)
      .patch(`/api/employees/${employee.id}`)
      .set('Authorization', header)
      .send({ name: 'Ana Bautista-Cruz', branchId: to.id });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ana Bautista-Cruz');
    expect(res.body.branchId).toBe(to.id);
  });

  // The picker calls GET /api/employees?branchId=<ticket branch> (§5.2). Zod
  // STRIPS unknown keys, so parsing organizationListQuerySchema on this route
  // instead of employeesListQuerySchema drops the filter with no error at all
  // and every branch's roster leaks into every other branch's picker.
  it('filters the list to one branch with ?branchId=', async () => {
    const header = await adminHeader();
    const mine = await createTestBranch('Mine');
    const theirs = await createTestBranch('Theirs');
    await createTestEmployee(mine.id, 'Ours');
    await createTestEmployee(theirs.id, 'Sibling');

    const all = await request(app)
      .get('/api/employees')
      .set('Authorization', header);
    expect(all.body.count).toBe(2);

    const res = await request(app)
      .get(`/api/employees?branchId=${mine.id}`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Ours');
  });

  it('hides archived employees from the default list', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const employee = await createTestEmployee(branch.id);

    const archived = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).not.toBeNull();

    expect(
      (await request(app).get('/api/employees').set('Authorization', header))
        .body.count
    ).toBe(0);
    expect(
      (
        await request(app)
          .get('/api/employees?includeArchived=true')
          .set('Authorization', header)
      ).body.count
    ).toBe(1);
  });

  // Both filters at once. A repository that returned `branchId ? {branchId} :
  // archiveWhere(...)` passes every test above and fails only here.
  it('applies ?branchId= and ?includeArchived= together', async () => {
    const header = await adminHeader();
    const mine = await createTestBranch('Mine');
    const theirs = await createTestBranch('Theirs');
    await createTestEmployee(mine.id, 'Ours');
    await createTestEmployee(theirs.id, 'Theirs');
    await prisma.employee.updateMany({ data: { archivedAt: new Date() } });

    const res = await request(app)
      .get(`/api/employees?branchId=${mine.id}&includeArchived=true`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].name).toBe('Ours');
  });

  it('restores an archived employee, and refuses to restore an active one', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const employee = await createTestEmployee(branch.id);
    await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);

    const restored = await request(app)
      .post(`/api/employees/${employee.id}/restore`)
      .set('Authorization', header);
    expect(restored.status).toBe(200);
    expect(restored.body.archivedAt).toBeNull();

    const again = await request(app)
      .post(`/api/employees/${employee.id}/restore`)
      .set('Authorization', header);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_ARCHIVED');
  });

  it('refuses to archive an already-archived employee', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const employee = await createTestEmployee(branch.id);
    await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    const res = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_ARCHIVED');
  });

  // restoreOfficeHead's twin. Restoring under an archived branch recreates
  // the exact state the branch guard exists to prevent. Unlike restoreOffice
  // there is no reference cycle here — nothing points a branch at an employee
  // — so checking branchId cannot deadlock a pair.
  it('refuses to restore an employee whose branch is still archived', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('Closing');
    const employee = await createTestEmployee(branch.id);

    // Empty the branch first — this is the ordering branchBlockers forces.
    await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    const branchArchived = await request(app)
      .post(`/api/branches/${branch.id}/archive`)
      .set('Authorization', header);
    expect(branchArchived.status).toBe(200);

    const res = await request(app)
      .post(`/api/employees/${employee.id}/restore`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('refuses to archive an employee guiding a live trip, and says so', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id, 'inactive');
    const employee = await createTestEmployee(branch.id);
    const ticket = await createTestTicket({
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      status: 'approved'
    });
    await prisma.tripTicketEmployee.create({
      data: { tripTicketId: ticket.id, employeeId: employee.id }
    });

    const blocked = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('IN_USE');
    expect(blocked.body.error.details.blockers).toContainEqual({
      resource: 'tripTickets',
      count: 1
    });

    // History never blocks (§10): the completed ticket keeps the guide's name
    // through the join, and the roster lets them go.
    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { status: 'completed' }
    });
    const ok = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(ok.status).toBe(200);
  });

  it('404s on an unknown id', async () => {
    const header = await adminHeader();
    const res = await request(app)
      .patch('/api/employees/00000000-0000-4000-8000-0000000000ff')
      .set('Authorization', header)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('lets any authenticated role READ but only admin WRITE', async () => {
    const { user } = await createTestUser({
      email: 'req@test.local',
      role: 'requester'
    });
    const header = authHeader(user.id, user.email, 'requester');
    const branch = await createTestBranch();
    const employee = await createTestEmployee(branch.id);

    // The booking form's guide picker is requester-facing, so the READ has to
    // stay open — the same reasoning as GET /api/branches.
    expect(
      (await request(app).get('/api/employees').set('Authorization', header))
        .status
    ).toBe(200);

    for (const call of [
      request(app)
        .post('/api/employees')
        .set('Authorization', header)
        .send({ name: 'X', branchId: branch.id }),
      request(app)
        .patch(`/api/employees/${employee.id}`)
        .set('Authorization', header)
        .send({ name: 'Y' }),
      request(app)
        .post(`/api/employees/${employee.id}/archive`)
        .set('Authorization', header),
      request(app)
        .post(`/api/employees/${employee.id}/restore`)
        .set('Authorization', header)
    ]) {
      expect((await call).status).toBe(403);
    }
  });
});
```

Now the two enforcement tests the spec §12 names. **Replace** `enforcement.test.ts:5-13`:

```ts
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestOffice,
  createTestOfficeHead,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
```

**with:**

```ts
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestOffice,
  createTestOfficeHead,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
```

and **insert** these two tests after line 364 (the `});` closing `'POST /api/trip-tickets rejects an archived officeHeadId (officeId absent)'`), before the `'leaves records that already point at a newly archived branch alone'` test at line 366:

```ts
it('POST /api/employees rejects an archived branchId', async () => {
  const header = await adminHeader();
  const branch = await archivedBranch(header);
  const res = await request(app)
    .post('/api/employees')
    .set('Authorization', header)
    .send({ name: 'Ghost Guide', branchId: branch.id });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('PARENT_ARCHIVED');
});

// Same reasoning as G-1 above: the create test cannot tell us whether the
// `update` call site exists at all. Employees are the one org resource whose
// branchId is REQUIRED, so a PATCH that moves someone into a closed branch
// is a single-field request an admin can make by accident.
it('PATCH /api/employees/:id rejects an archived branchId', async () => {
  const header = await adminHeader();
  const live = await createTestBranch('Live');
  const employee = await createTestEmployee(live.id);
  const dead = await archivedBranch(header);
  const res = await request(app)
    .patch(`/api/employees/${employee.id}`)
    .set('Authorization', header)
    .send({ branchId: dead.id });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('PARENT_ARCHIVED');
});
```

- [ ] **Step 9 — Run and confirm the exact failure**

```
pnpm --filter @mms/api test -- src/modules/organization/employees
pnpm --filter @mms/api test -- src/modules/organization/enforcement
```

Expected — no `/api/employees` route exists, so Express's catch-all at `app.ts:98-102` answers everything with 404:

```
 FAIL  src/modules/organization/employees.test.ts > organization — employees > creates an employee under a branch
AssertionError: expected 404 to be 201 // Object.is equality
```

```
 FAIL  src/modules/organization/enforcement.test.ts > archived branches are rejected on write, not just hidden > POST /api/employees rejects an archived branchId
AssertionError: expected 404 to be 409 // Object.is equality
```

Every new test in both files is red; nothing else in `enforcement.test.ts` moves.

- [ ] **Step 10 — Contracts: the Employee schemas in packages/shared**
      The office-head schemas immediately above are the style to match — `packages/shared/src/contracts/organization.ts:36-44`:

```ts
export const createOfficeHeadBodySchema = z.object({
  name: z.string().min(1),
  branchId: nullableUuid,
  officeId: nullableUuid
});
export type CreateOfficeHeadBody = z.infer<typeof createOfficeHeadBodySchema>;

export const updateOfficeHeadBodySchema = createOfficeHeadBodySchema.partial();
export type UpdateOfficeHeadBody = z.infer<typeof updateOfficeHeadBodySchema>;
```

**Append** after line 44 (end of file):

```ts
// Employees are people, like office heads — no name uniqueness (§4.3). What
// differs is branchId: REQUIRED and non-nullable, so `nullableUuid` is
// deliberately NOT used here. The guide picker is branch-locked (§5.2), so an
// employee with a NULL branch would appear in no branch's picker anywhere,
// with no error and no way to notice.
export const createEmployeeBodySchema = z.object({
  name: z.string().min(1),
  position: nullableString,
  phone: nullableString,
  branchId: z.string().uuid()
});
export type CreateEmployeeBody = z.infer<typeof createEmployeeBodySchema>;

export const updateEmployeeBodySchema = createEmployeeBodySchema.partial();
export type UpdateEmployeeBody = z.infer<typeof updateEmployeeBodySchema>;

// Employees are the only org resource with a list filter: the guide picker
// asks for one branch's roster. includeArchived/page/limit come from
// organizationListQuerySchema above — EXTEND it, never redeclare it. Zod
// strips unknown keys, so the employees route must parse THIS schema; parsing
// the base one drops ?branchId= silently and shows every branch's roster.
export const employeesListQuerySchema = organizationListQuerySchema.extend({
  branchId: z.string().uuid().optional()
});
export type EmployeesListQuery = z.infer<typeof employeesListQuerySchema>;
```

`nullableString` is already imported at line 4; `nullableUuid` stays imported for the office/head schemas; no import-block edit is needed.

**`packages/shared/src/index.ts` needs NO edit.** Line 16 is already `export * from './contracts/organization.js';` — the whole file is re-exported flat, so the three new schemas and four new types are available from `@mms/shared` the moment the package is rebuilt.

Rebuild — `apps/api/tsconfig.json` has no path mapping, so `@mms/shared` resolves to `packages/shared/dist`:

```
pnpm --filter @mms/shared build
```

- [ ] **Step 11 — Repository: listEmployees**
      `archiveWhere` is module-private in this same file. Its real signature, at `apps/api/src/modules/organization/repository.ts:8-10`:

```ts
function archiveWhere(includeArchived: boolean | undefined) {
  return includeArchived ? {} : { archivedAt: null };
}
```

**Append** after `listOfficeHeads`, which ends at line 57 (end of file):

```ts
export async function listEmployees(
  skipTake: SkipTake,
  includeArchived?: boolean,
  branchId?: string
) {
  // BOTH filters, never one or the other: the guide picker asks for one
  // branch's active roster, and the Organization tab asks for one branch's
  // full roster with ?includeArchived=true.
  const where = {
    ...archiveWhere(includeArchived),
    ...(branchId ? { branchId } : {})
  };
  const [data, count] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: { name: 'asc' },
      ...skipTake
    }),
    prisma.employee.count({ where })
  ]);
  return { data, count };
}
```

The `...(branchId ? { branchId } : {})` spread is the house pattern for an optional list filter — `trip-tickets/service.ts:46` builds its `where` the same way.

- [ ] **Step 12 — Service: the five employee functions**
      `createOfficeHead` / `updateOfficeHead` at `service.ts:197-212` are the shape to match:

```ts
export async function createOfficeHead(body: CreateOfficeHeadBody) {
  await assertOrgRefsActive({
    branchId: body.branchId,
    officeId: body.officeId
  });
  return prisma.officeHead.create({ data: body });
}

export async function updateOfficeHead(id: string, body: UpdateOfficeHeadBody) {
  await loadOfficeHead(id);
  await assertOrgRefsActive({
    branchId: body.branchId,
    officeId: body.officeId
  });
  return prisma.officeHead.update({ where: { id }, data: body });
}
```

**(a) Imports.** Replace `service.ts:1-9`:

```ts
import type {
  CreateBranchBody,
  CreateOfficeBody,
  CreateOfficeHeadBody,
  OrganizationListQuery,
  UpdateBranchBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody
} from '@mms/shared';
```

with:

```ts
import type {
  CreateBranchBody,
  CreateEmployeeBody,
  CreateOfficeBody,
  CreateOfficeHeadBody,
  EmployeesListQuery,
  OrganizationListQuery,
  UpdateBranchBody,
  UpdateEmployeeBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody
} from '@mms/shared';
```

and replace `service.ts:14-19`:

```ts
import {
  assertArchivable,
  branchBlockers,
  officeBlockers,
  officeHeadBlockers
} from './guard.js';
```

with:

```ts
import {
  assertArchivable,
  branchBlockers,
  employeeBlockers,
  officeBlockers,
  officeHeadBlockers
} from './guard.js';
```

**(b) The functions.** Append after `restoreOfficeHead`, which ends at line 241 (end of file):

```ts
// Employees have NO name uniqueness either, for the reason stated above: two
// people named Juan Cruz at one branch is not an error (§4.3). There is no
// assertEmployeeNameFree and the migration records the omission as deliberate.
async function loadEmployee(id: string) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) throw new AppError(404, 'NOT_FOUND', 'Employee not found');
  return employee;
}

export function listEmployees(query: EmployeesListQuery) {
  return repo.listEmployees(
    toSkipTake(query),
    query.includeArchived,
    query.branchId
  );
}

export async function createEmployee(body: CreateEmployeeBody) {
  await assertOrgRefsActive({ branchId: body.branchId });
  return prisma.employee.create({ data: body });
}

export async function updateEmployee(id: string, body: UpdateEmployeeBody) {
  await loadEmployee(id);
  // NOT create-only. branchId is required on this resource, so "move Ana to
  // North" is a one-field PATCH an admin makes routinely — and without this
  // line it lands an active employee under a closed branch. This is the G-1
  // case that enforcement.test.ts exists to catch.
  await assertOrgRefsActive({ branchId: body.branchId });
  return prisma.employee.update({ where: { id }, data: body });
}

export async function archiveEmployee(id: string) {
  const employee = await loadEmployee(id);
  if (employee.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Employee is already archived');
  assertArchivable(employee.name, await employeeBlockers(id));
  return prisma.employee.update({
    where: { id },
    data: { archivedAt: new Date() }
  });
}

export async function restoreEmployee(id: string) {
  const employee = await loadEmployee(id);
  if (!employee.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Employee is not archived');
  // restoreOfficeHead's reasoning, minus the cycle: nothing points a branch at
  // an employee, so requiring the branch to be active cannot deadlock a pair
  // the way it would for the office/head cycle documented in restoreOffice.
  await assertOrgRefsActive({ branchId: employee.branchId });
  return prisma.employee.update({
    where: { id },
    data: { archivedAt: null }
  });
}
```

- [ ] **Step 13 — Controller: five thin handlers**
      **(a) Imports.** Replace `controller.ts:2-10`:

```ts
import type {
  CreateBranchBody,
  CreateOfficeBody,
  CreateOfficeHeadBody,
  UpdateBranchBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody
} from '@mms/shared';
import { organizationListQuerySchema } from '@mms/shared';
```

with:

```ts
import type {
  CreateBranchBody,
  CreateEmployeeBody,
  CreateOfficeBody,
  CreateOfficeHeadBody,
  UpdateBranchBody,
  UpdateEmployeeBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody
} from '@mms/shared';
import {
  employeesListQuerySchema,
  organizationListQuerySchema
} from '@mms/shared';
```

**(b) Handlers.** Append after `restoreOfficeHead`, which ends at line 132 (end of file):

```ts
export async function listEmployees(
  req: Request,
  res: Response
): Promise<void> {
  // NOT listQuery(): zod strips unknown keys, so the shared schema would drop
  // ?branchId= silently and hand the guide picker every branch's roster.
  res.json(
    await service.listEmployees(employeesListQuerySchema.parse(req.query))
  );
}

export async function createEmployee(
  req: Request,
  res: Response
): Promise<void> {
  res
    .status(201)
    .json(await service.createEmployee(req.body as CreateEmployeeBody));
}

export async function updateEmployee(
  req: Request,
  res: Response
): Promise<void> {
  res.json(
    await service.updateEmployee(
      requireIdParam(req),
      req.body as UpdateEmployeeBody
    )
  );
}

export async function archiveEmployee(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.archiveEmployee(requireIdParam(req)));
}

export async function restoreEmployee(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.restoreEmployee(requireIdParam(req)));
}
```

`requireIdParam` is this file's own local helper at lines 19-24 — not the one in `lib/http.ts` that `trip-tickets/controller.ts` imports. Keep using the local one here.

- [ ] **Step 14 — Router: five routes, guards per route**
      **(a) Imports.** Replace `router.ts:2-10`:

```ts
import {
  USER_ROLES,
  createBranchBodySchema,
  createOfficeBodySchema,
  createOfficeHeadBodySchema,
  updateBranchBodySchema,
  updateOfficeBodySchema,
  updateOfficeHeadBodySchema
} from '@mms/shared';
```

with:

```ts
import {
  USER_ROLES,
  createBranchBodySchema,
  createEmployeeBodySchema,
  createOfficeBodySchema,
  createOfficeHeadBodySchema,
  updateBranchBodySchema,
  updateEmployeeBodySchema,
  updateOfficeBodySchema,
  updateOfficeHeadBodySchema
} from '@mms/shared';
```

**(b) Routes.** Append after `restoreOfficeHead`'s route, which ends at line 119 (end of file):

```ts
// Per-route guards again, never organizationRouter.use(...) — see the comment
// at the top of this file: a router-wide requireAuth here 401s the device-key
// GPS routes that share the '/api' mount.
//
// The read stays open to every authenticated role for the same reason
// /branches does: the booking form's guide picker is requester-facing.
organizationRouter.get('/employees', requireAuth, controller.listEmployees);

organizationRouter.post(
  '/employees',
  requireAuth,
  requireRole(USER_ROLES.admin),
  validateBody(createEmployeeBodySchema),
  controller.createEmployee
);
organizationRouter.patch(
  '/employees/:id',
  requireAuth,
  requireRole(USER_ROLES.admin),
  validateBody(updateEmployeeBodySchema),
  controller.updateEmployee
);
organizationRouter.post(
  '/employees/:id/archive',
  requireAuth,
  requireRole(USER_ROLES.admin),
  controller.archiveEmployee
);
organizationRouter.post(
  '/employees/:id/restore',
  requireAuth,
  requireRole(USER_ROLES.admin),
  controller.restoreEmployee
);
```

No change to `app.ts` — `organizationRouter` is already mounted at `/api` (line 79).

- [ ] **Step 15 — Green: run the two suites**

```
pnpm --filter @mms/api test -- src/modules/organization/employees
pnpm --filter @mms/api test -- src/modules/organization/enforcement
```

Both fully green. If `employees.test.ts` dies with

```
SyntaxError: [vite] The requested module '@mms/shared' does not provide an export named 'createEmployeeBodySchema'
```

the shared package was not rebuilt after Step 10 — re-run `pnpm --filter @mms/shared build`. The API imports `packages/shared/dist`, not `src`.

- [ ] **Step 16 — Prove the PATCH enforcement assertion can actually fail**
      Both enforcement tests went from 404 straight to green, so neither has yet been shown to distinguish a present `assertOrgRefsActive` call site from a missing one. Spec §12: _"Every assertion must be able to fail: break the line it covers, confirm a real failure, restore, confirm byte-identical."_

Temporarily delete this line from `updateEmployee` in `apps/api/src/modules/organization/service.ts`:

```ts
await assertOrgRefsActive({ branchId: body.branchId });
```

Run:

```
pnpm --filter @mms/api test -- src/modules/organization/enforcement
```

Expected:

```
 FAIL  src/modules/organization/enforcement.test.ts > archived branches are rejected on write, not just hidden > PATCH /api/employees/:id rejects an archived branchId
AssertionError: expected 200 to be 409 // Object.is equality
```

and note that the `POST /api/employees` test stays **green** — which is exactly why the pair is needed and a create-only test is not enough.

Restore the line, re-run, confirm green, and confirm the file is byte-identical:

```
git diff --stat apps/api/src/modules/organization/service.ts
```

Repeat the same check for `createEmployee` if you want both halves pinned.

- [ ] **Step 17 — Full suite, typecheck, commit**

```
pnpm --filter @mms/shared build
pnpm --filter @mms/api test
pnpm typecheck
```

All suites green, typecheck clean across shared, api and web.

Commit in two, matching the split the reviewer will want:

```
git add packages/shared/src/contracts/organization.ts
git commit -m "feat(shared): add Employee body and list-query contracts"

git add apps/api/src/modules/organization apps/api/src/lib/org-refs.ts
git commit -m "feat(api): add branch-scoped employees to the organization module"
```

Do not push — pushing is done by hand.

- [ ] **Step 1: Pre-seed `guideIds` into the four `enforcement.test.ts` ticket POSTs**

This step ships no feature. It stops Task 3 from turning this file red for a reason that has nothing to do with archived parents.

`enforcement.test.ts` contains four inline `POST /api/trip-tickets` bodies. The moment Task 3 lands `guideIds: …min(1)`, all four return `400 VALIDATION_ERROR` — but two of them assert `409 PARENT_ARCHIVED`, so the failure reads as an organization bug, exactly the misdiagnosis design §12 warns about.

Right now `createTripTicketBodySchema` is a plain `z.object`, which **strips unknown keys**. Adding `guideIds` today is therefore a complete no-op — nothing validates it, nothing stores it, no assertion changes. It becomes meaningful the instant Task 3 lands, with no edit needed in between.

Each of the four tests already builds its own `live` branch for the fleet. Add a guide on that same branch and send it.

The first, at `enforcement.test.ts:171-201` — current body:

```ts
const live = await createTestBranch('Live');
const vehicle = await createTestVehicle(live.id);
const driver = await createTestDriver(live.id);
const dead = await archivedBranch(header);
```

becomes:

```ts
const live = await createTestBranch('Live');
const vehicle = await createTestVehicle(live.id);
const driver = await createTestDriver(live.id);
// guideIds becomes REQUIRED when the trip-guides contract lands in the next
// task. Adding it now is inert — createTripTicketBodySchema is still a plain
// z.object and strips unknown keys — and it stops this file going red for a
// reason that has nothing to do with archived parents.
const guide = await createTestEmployee(live.id, 'Enforcement Guide');
const dead = await archivedBranch(header);
```

and inside that test's `.send({ … })`, immediately after the `preparedBy: 'Test',` line:

```ts
        guideIds: [guide.id],
```

Apply the identical pair of edits to the other three ticket POSTs in this file: the `PATCH /api/trip-tickets/:id` test that follows it, and the two archived-office / archived-officeHead tests further down. Each already declares its own `live` branch, so each gets its own `guide`.

`createTestEmployee` is already in this file's import block from the earlier steps in this task. If it is not, add it.

- [ ] **Step 2: Run the organization suite and commit**

```bash
pnpm --filter @mms/api test -- src/modules/organization
```

Expected: green, and **unchanged** — no assertion in `enforcement.test.ts` moves, because the added key is stripped. If any of the four ticket tests changed behaviour, `createTripTicketBodySchema` is not what this step assumes; stop and re-read it before continuing.

```bash
npx prettier --write apps/api/src/modules/organization/enforcement.test.ts
git add apps/api/src/modules/organization/enforcement.test.ts
git commit -m "test(api): pre-seed guideIds into enforcement ticket fixtures"
```

Do not push.

---

## Task 3: Trip-ticket guides — contract, capacity, reads, reassign

> **Corrections applied to this task — these override anything below that disagrees.**
>
> 1. **`packages/shared/src/contracts/trip-tickets.test.ts`: append after line 49, not 48.** Line 48 is the `});` closing the last `it`; line 49 closes `describe('normaliseTripDates')`. Appending after 48 nests the guide tests inside a describe about trip dates. Add them as a new top-level `describe('createTripTicketBodySchema — guideIds', …)`.
> 2. **`trip-ticket-booking.test.ts` scaffold return is at 72-82**, not 69-80.
> 3. **Empty `guideIds` on create or PATCH is `400 VALIDATION_ERROR`** (zod — `.min(1)` survives `.partial()`), not `NO_GUIDES`. `NO_GUIDES` is thrown only by `replaceTripTicketGuides` via `POST /:id/guides`, whose body schema deliberately has no `.min(1)`. The spec's §10 table is wrong to say "on create"; this plan is correct.
> 4. **Additionally: repair the three Playwright fixtures this task breaks.** See Steps 18-21 at the end of this task. Task 3 is the task that makes `guideIds` required, so Task 3 is the task that keeps the e2e suite green.

**Files:**

- [modify] packages/shared/src/contracts/trip-tickets.ts @ 20-37 (create body), 42 (.partial()), 82-83 (reasonBodySchema — insertion point for the reassign body) — createTripTicketBodySchema gains `guideIds: z.array(z.string().uuid()).min(1)`; a new reassignGuidesBodySchema for POST /:id/guides
- [test] packages/shared/src/contracts/trip-tickets.test.ts @ 1-49 (whole file today; append after line 49 (the `});` closing describe('normaliseTripDates') — NOT 48, which closes the last `it`)) — pins the absent-vs-empty guideIds semantics that .partial() produces, and that the reassign body deliberately allows an empty list
- [create] apps/api/src/modules/trip-tickets/guides.ts — replaceTripTicketGuides(tx, tripTicketId, employeeIds) and assertSeatsFit(capacity, participants, guides) — the sibling of dates.ts, shared by service.ts and transitions.ts
- [test] apps/api/src/modules/trip-tickets/guides.test.ts — pure unit tests for the seat arithmetic and the NO_GUIDES refusal, no database — mirrors dates.test.ts
- [modify] apps/api/src/modules/trip-tickets/repository.ts @ 6-13 — tripTicketInclude gains `guides: { include: { employee: true } }` so guides come back on BOTH the detail and the list read
- [modify] apps/api/src/modules/trip-tickets/service.ts @ 16-21 (imports), 90-101 (assertBookable signature), 181-199 (capacity block), 254-258 (create org-refs), 273-292 (create transaction), 304-308 (update org-refs), 370-379 (update assertBookable call), 382 (destructure), 408-418 (update transaction) — assertBookable's Pick<> gains guideIds and the headcount adds them; create destructures guideIds out of the Prisma spread and writes the join rows; update gates on absent-vs-present and re-validates capacity against the stored guides
- [modify] apps/api/src/modules/trip-tickets/transitions.ts @ 1-22 (imports), 437 (end of file) — new reassignGuides(id, guideIds) transition following loadInState(id, ['approved','in_progress'])
- [modify] apps/api/src/modules/trip-tickets/transitions.controller.ts @ 1-9 (imports), 74 (end of file) — thin reassignGuides handler
- [modify] apps/api/src/modules/trip-tickets/router.ts @ 2-10 (imports), 64-71 (cancel-date route — insert after it) — POST /:id/guides with requireRole(admin) + validateBody(reassignGuidesBodySchema)
- [test] apps/api/src/modules/trip-tickets/trip-ticket-guides.test.ts — integration: capacity including guides, empty-vs-absent on create and PATCH, guides on both reads, archived-guide history, and the reassign endpoint's allowed-from list / admin-only / NO_GUIDES / re-run capacity
- [test] apps/api/src/modules/trip-tickets/trip-ticket-booking.test.ts @ 5-9 (factory imports), 72-82 (scaffold return), 96-108 (body fixture; line 103 is the insertion point named in spec §12) — fixture repair — the shared body() must carry a guide now that guideIds is required
- [test] apps/api/src/modules/trip-tickets/trip-tickets.test.ts @ 5-9 (factory imports), 14-41 (scaffold), 53-74 (ticketBody; lines 68-69 named in spec §12) — fixture repair — ticketBody() must carry a guide
- [test] apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts @ 5-10 (factory imports), 568-580 (rebook POST) — fixture repair the spec MISSED — the rebook POST at :568-580 also creates a ticket through the endpoint

**Interfaces:**

_Produces:_

- packages/shared/src/contracts/trip-tickets.ts — createTripTicketBodySchema gains `guideIds: z.array(z.string().uuid()).min(1)`; so `type CreateTripTicketBody` gains `guideIds: string[]` (REQUIRED)
- packages/shared/src/contracts/trip-tickets.ts — `updateTripTicketBodySchema = createTripTicketBodySchema.partial()` is UNCHANGED and now yields `type UpdateTripTicketBody` with `guideIds?: string[]`; the `.min(1)` survives `.partial()`, so an explicitly empty array is rejected by zod (400 VALIDATION_ERROR) and an absent key parses to a body with no `guideIds` property at all
- packages/shared/src/contracts/trip-tickets.ts — `export const reassignGuidesBodySchema = z.object({ guideIds: z.array(z.string().uuid()) })` and `export type ReassignGuidesBody = { guideIds: string[] }` (deliberately NO .min(1))
- apps/api/src/modules/trip-tickets/guides.ts — `export function assertSeatsFit(capacity: number, participants: number, guides: number): void` — throws AppError(409, 'OVER_CAPACITY', `That vehicle seats ${capacity}; the trip is for ${participants} participant(s) and ${guides} guide(s)`)
- apps/api/src/modules/trip-tickets/guides.ts — `export async function replaceTripTicketGuides(tx: Prisma.TransactionClient, tripTicketId: string, employeeIds: string[]): Promise<void>` — throws AppError(400, 'NO_GUIDES', 'A trip ticket must keep at least one guide') on an empty list, before any query
- apps/api/src/modules/trip-tickets/repository.ts — `tripTicketInclude` gains `guides: { include: { employee: true } }`, so every read through `findTripTicketById` and `listTripTickets` returns `guides: { tripTicketId, employeeId, createdAt, updatedAt, employee: Employee }[]`
- apps/api/src/modules/trip-tickets/transitions.ts — `export async function reassignGuides(id: string, guideIds: string[])` — returns the full ticket via findTripTicketById; allowed from ['approved','in_progress'] only; takes NO AuthenticatedUser
- apps/api/src/modules/trip-tickets/transitions.controller.ts — `export async function reassignGuides(req: Request, res: Response): Promise<void>`
- HTTP route `POST /api/trip-tickets/:id/guides` — requireAuth (router-wide, line 19) + requireRole(USER_ROLES.admin) + validateBody(reassignGuidesBodySchema); body `{ guideIds: string[] }`; 200 with the full ticket, 400 NO_GUIDES, 403, 404, 409 INVALID_TRANSITION, 409 OVER_CAPACITY, 409 PARENT_ARCHIVED

_Consumes:_

- Prisma model `Employee` with `id String @id @db.Uuid`, `name String`, `position String?`, `phone String?`, `branchId String`, `archivedAt DateTime?` — accessed as `prisma.employee` and as the `employee` relation on the join (Task 1)
- Prisma model `TripTicketEmployee` with `tripTicketId String @map("trip_ticket_id")`, `employeeId String @map("employee_id")`, `@@id([tripTicketId, employeeId])` — accessed as `tx.tripTicketEmployee.deleteMany/createMany` and `prisma.tripTicketEmployee.count/findMany` (Task 1)
- `TripTicket.guides TripTicketEmployee[]` and `TripTicketEmployee.employee Employee` relation fields — without the named relation on TripTicket, `tripTicketInclude`'s `guides` key does not typecheck (Task 1)
- `prisma generate` must have run against the new schema before any of this compiles — `tx.tripTicketEmployee` does not exist on the generated client otherwise (Task 1)
- `assertOrgRefsActive(refs: OrgRefs): Promise<void>` in apps/api/src/lib/org-refs.ts, with `OrgRefs` extended to `{ branchId?: string | null; officeId?: string | null; officeHeadId?: string | null; employeeIds?: string[] }` — an archived employee among `employeeIds` must contribute the label `'employee'` to the existing 409 PARENT_ARCHIVED throw (Task 2). Today's signature is `assertOrgRefsActive(refs: OrgRefs)` with only the first three keys.
- `createTestEmployee(branchId: string, name?: string)` in apps/api/src/test/factories.ts, returning the created Employee row with `.id` — assumed shape `prisma.employee.create({ data: { name, branchId } })`, mirroring `createTestOfficeHead` (Task 2)
- `TABLES` in apps/api/src/test/db.ts must include `'employees'` and `'trip_ticket_employees'`, with `'trip_ticket_employees'` ordered before `'trip_tickets'` (Task 1/B) — otherwise these suites leak rows into unrelated files

**Before you start — gotchas found while drafting this task:**

- VERIFIED, and it changes the code the spec asked for: `guideIds: undefined` cannot be written into the Prisma `data` literal the way `dates: undefined` is. TypeScript excess-property-checks a key you write EXPLICITLY in an object literal even when the literal also spreads — I confirmed this with the repo's own tsc (`error TS2353: Object literal may only specify known properties, and 'extra' does not exist in type 'Target'`). `dates` gets away with it because `dates` IS a key on Prisma's create input; `guideIds` never will be. So the create path must DESTRUCTURE (`const { guideIds, ...ticketData } = body;`), which is also the idiom `update()` already uses at :382. The spec's §7.1 wording "guideIds must be blanked out the same way dates is" does not compile.
- VERIFIED, and the same test confirms the trap is real: a spread whose source carries an unknown key is NOT excess-checked, so leaving `guideIds` inside `...body` compiles clean and throws PrismaClientValidationError at runtime, which the error handler maps to a 500. That is exactly the failure the first integration run should show — `expected 500 to be 409`.
- VERIFIED with the repo's zod 3.25: `.partial()` wraps each field in ZodOptional and does NOT strip the inner `.min(1)`. So on PATCH, absent parses to a body with no `guideIds` key at all (`{"destination":"Site B"}`) and empty is rejected by zod. Consequence the spec gets half right: §5.3's OUTCOME is correct (absent = leave alone, empty = 400, never a silent no-op) but its MECHANISM claim — "the same rule service.ts:349-355 applies to dates" — is not. `dates` is `.default([])` with no `.min(1)`, which is precisely why its empty case reaches the service and throws NO_TRIP_DATES. An equivalent NO_GUIDES gate in `update()` would be unreachable dead code that no test could honestly cover, so I did not add one; `replaceTripTicketGuides` carries the guard instead, exactly as `replaceTripDates` does.
- Following from that: §10's error table promises `NO_GUIDES` 400 "on create or on the reassign endpoint", but `.min(1)` on the create body means create can only ever produce VALIDATION_ERROR. The reassign body schema is under-specified in §7 (it lists only the create-body line), so I deliberately gave it NO `.min(1)` — that is the one place NO_GUIDES has a reachable HTTP surface, and it makes §10's row true. If a reviewer prefers `.min(1)` there for symmetry, the §10 row should be struck instead; it cannot be both.
- `assertSeatsFit` is an export beyond the brief's item 2. It exists because §6 says the reassign endpoint "re-runs the capacity check", and two copies of that arithmetic would drift — which is the same risk §5.1 already accepts between the server and the web form. It lives in guides.ts rather than service.ts because `transitions.ts` has no precedent for importing its own module's service, while `dates.ts` is the established precedent for a helper module imported by BOTH service.ts and transitions.ts.
- `reassignGuides` must NOT call `assertBookable`, only the seat check. `assertBookable` re-runs the date rules, and an approved two-date event whose first outing is already driven and closed would fail `TRIP_IN_THE_PAST` (400) on a request that never touched its dates — `update()` reaches those rows through `existing.dates.filter(d => d.status !== 'cancelled')`, which includes `completed` ones.
- Design §12's list of breaking fixtures is INCOMPLETE. Two more files POST tickets through the endpoint: `apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts:568-580` (the rebook), which I fix in step 14; and `apps/api/src/modules/organization/enforcement.test.ts` at lines 181-198, 214-231, 312-329 and 343-360, which I did NOT touch because Task 2 is also editing that file to add the employee PARENT_ARCHIVED cases. Whoever lands second must add `guideIds: [<an employee of the LIVE branch>]` to all four payloads. The first two assert `409 PARENT_ARCHIVED` and will otherwise get `400 VALIDATION_ERROR` — a failure that reads as an organization bug, the same misdiagnosis §12 warns about for `organization.spec.ts`.
- `@mms/shared` resolves through `packages/shared/dist/index.js` (its package.json `main`), so `pnpm --filter @mms/shared build` MUST run between the contract change and any API test. Skipping it produces a confusing `guideIds` "unrecognized key" silence rather than a clear error.
- A guideId that does not exist AT ALL is not pre-checked. `assertOrgRefsActive` only refuses ARCHIVED rows (`r?.archivedAt ? label : null` — a missing row yields null), so a bogus uuid falls through to `createMany`, raises Prisma P2003, and the error handler maps it to 409 CONFLICT. That matches today's behaviour for a non-existent `branchId`, so it is consistent rather than a new hole — but it is worth knowing the code is CONFLICT, not NOT_FOUND.
- Duplicate ids inside one `guideIds` array violate the composite PK → P2002 → 409 CONFLICT. Unreachable from the app because the picker excludes already-selected employees (§9.2), and arguably correct (loud) rather than de-duplicating silently — but it is an ugly error message if anyone hits the API directly.
- `reassignGuides` takes no `AuthenticatedUser` and raises no notification, unlike every neighbouring transition. The spec is silent on both. If an audit trail is wanted for post-approval re-staffing, that is a follow-up: the signature grows an actor and an `events.*` call, and `TripTicket` would need somewhere to record it (there is no column today).
- Server-side branch membership is deliberately unchecked on both the create/update path and the reassign endpoint — §1's non-goals and §5.2. An admin can POST a North Branch employee onto a Main Branch ticket and the server accepts it. This matches the current server, which enforces branch matching for nothing at all.

### Steps

- [ ] **Step 1: Write the failing contract test for guideIds (shared)**

The absent-vs-empty rule is a property of the _schema_, not of the service, so it is pinned where the schema lives. `packages/shared/src/contracts/trip-tickets.test.ts` already exists (5 tests for `normaliseTripDates`).

Edit the import on line 2 and append a new `describe` after line 48.

**Line 2 today:**

```ts
import { normaliseTripDates, tripDateInputSchema } from './trip-tickets.js';
```

**Replace with:**

```ts
import {
  createTripTicketBodySchema,
  normaliseTripDates,
  tripDateInputSchema,
  updateTripTicketBodySchema
} from './trip-tickets.js';
```

**Append at the end of the file (after the closing `});` on line 49):**

```ts
// A guide is a real row with an id, unlike a participant, and every ticket
// needs at least one. The interesting half is what `.partial()` does with the
// `.min(1)`: it wraps the field in ZodOptional and does NOT reach inside to
// strip the refinement, so ABSENT and EMPTY stay genuinely different cases on
// PATCH — absent leaves the guides alone, empty is refused. An empty list must
// never be mistaken for "no change".
describe('guideIds on the trip-ticket bodies', () => {
  const ok = {
    branchId: '11111111-1111-4111-8111-111111111111',
    driverId: '22222222-2222-4222-8222-222222222222',
    vehicleId: '33333333-3333-4333-8333-333333333333',
    destination: 'Site A',
    purpose: 'Delivery',
    dateRequested: '2026-09-10',
    guideIds: ['44444444-4444-4444-8444-444444444444']
  };

  it('requires at least one guide on create', () => {
    expect(createTripTicketBodySchema.safeParse(ok).success).toBe(true);

    const noGuides: Record<string, unknown> = { ...ok };
    delete noGuides.guideIds;
    expect(createTripTicketBodySchema.safeParse(noGuides).success).toBe(false);

    expect(
      createTripTicketBodySchema.safeParse({ ...ok, guideIds: [] }).success
    ).toBe(false);
  });

  it('PATCH: absent means leave the guides alone, empty is refused', () => {
    const absent = updateTripTicketBodySchema.safeParse({
      destination: 'Site B'
    });
    expect(absent.success).toBe(true);
    // Not merely undefined — the key is ABSENT from the parsed body, which is
    // what lets service.update() tell "not editing guides" from "set guides to
    // nothing". (No `.default([])` here, deliberately: that is what makes
    // `dates` behave differently — see the NO_TRIP_DATES gate in service.ts.)
    expect(absent.success && 'guideIds' in absent.data).toBe(false);

    expect(updateTripTicketBodySchema.safeParse({ guideIds: [] }).success).toBe(
      false
    );
    expect(
      updateTripTicketBodySchema.safeParse({
        guideIds: ['44444444-4444-4444-8444-444444444444']
      }).success
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the contract test and watch it fail**

```
pnpm --filter @mms/shared exec vitest run src/contracts/trip-tickets.test.ts
```

**Expected failure** — the create schema has no `guideIds`, so a body without one parses fine and a body with an empty one parses fine too:

```
 FAIL  src/contracts/trip-tickets.test.ts > guideIds on the trip-ticket bodies > requires at least one guide on create
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 Test Files  1 failed (1)
      Tests  2 failed | 5 passed (7)
```

Both new tests fail; the five existing `normaliseTripDates` tests stay green.

- [ ] **Step 3: Add guideIds to the create body and the reassign body schema**

In `packages/shared/src/contracts/trip-tickets.ts`.

**Current, lines 18-43:**

```ts
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
  endTs: z.coerce.date().nullable().optional(),
  dates: z.array(tripDateInputSchema).default([])
});
export type CreateTripTicketBody = z.infer<typeof createTripTicketBodySchema>;

// PATCH is only legal while pending_admin_approval (service-enforced); status is
// never editable here — transitions own it.
export const updateTripTicketBodySchema = createTripTicketBodySchema.partial();
export type UpdateTripTicketBody = z.infer<typeof updateTripTicketBodySchema>;
```

**Replace with** (only the `dates` line gains a trailing comma and a new field follows it; the `.partial()` line is UNCHANGED and is what carries `guideIds` to update):

```ts
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
  endTs: z.coerce.date().nullable().optional(),
  dates: z.array(tripDateInputSchema).default([]),
  // The employees who go along to guide the participants. At least one, always
  // — in practice every trip has one, and until now their name was either
  // missing or typed into `participants`, indistinguishable from a passenger.
  // Ids, not names: guides are real rows, so they never pass through a
  // comma-joined string the way participants do.
  //
  // NOTE the interaction with `.partial()` below: it wraps this in ZodOptional
  // but does not strip the `.min(1)`, which gives PATCH exactly the semantics
  // we want — ABSENT means "leave the guides alone", PRESENT-BUT-EMPTY is a
  // 400, never a silent no-op. That is the same OUTCOME the `dates` field gets
  // from the NO_TRIP_DATES gate in service.ts, by a different mechanism:
  // `dates` is `.default([])` with no `.min(1)`, so its empty case reaches the
  // service; this one is answered by zod before the controller runs.
  guideIds: z.array(z.string().uuid()).min(1)
});
export type CreateTripTicketBody = z.infer<typeof createTripTicketBodySchema>;

// PATCH is only legal while pending_admin_approval (service-enforced); status is
// never editable here — transitions own it.
export const updateTripTicketBodySchema = createTripTicketBodySchema.partial();
export type UpdateTripTicketBody = z.infer<typeof updateTripTicketBodySchema>;
```

**Then, current lines 81-83:**

```ts
// disapprove / cancel require a reason.
export const reasonBodySchema = z.object({ reason: z.string().min(1) });
export type ReasonBody = z.infer<typeof reasonBodySchema>;
```

**Replace with:**

```ts
// disapprove / cancel require a reason.
export const reasonBodySchema = z.object({ reason: z.string().min(1) });
export type ReasonBody = z.infer<typeof reasonBodySchema>;

// Reassign the guides on an already-approved ticket (admin only) — the generic
// PATCH is frozen the moment a ticket leaves pending_admin_approval, and a
// guide changing on the morning of the trip is the ordinary case.
//
// Deliberately NOT `.min(1)`, unlike the create body: `.min(1)` would have zod
// answer an empty list with a generic 400 VALIDATION_ERROR, and on THIS
// endpoint the empty case is the one that needs its own name —
// replaceTripTicketGuides throws 400 NO_GUIDES for it. Same reason `dates` on
// the create body is `.default([])` rather than `.min(1)`.
export const reassignGuidesBodySchema = z.object({
  guideIds: z.array(z.string().uuid())
});
export type ReassignGuidesBody = z.infer<typeof reassignGuidesBodySchema>;
```

Re-run and confirm green, then build — `@mms/shared` resolves through `packages/shared/dist`, so the API will not see any of this until it is compiled:

```
pnpm --filter @mms/shared exec vitest run src/contracts/trip-tickets.test.ts
pnpm --filter @mms/shared build
```

Expected: `Test Files  1 passed (1) / Tests  7 passed (7)`.

Commit: `feat(shared): require at least one guide on a trip ticket`

- [ ] **Step 4: Write the failing unit test for guides.ts**

New file `apps/api/src/modules/trip-tickets/guides.test.ts`. Both behaviours are pure enough to exercise with no database — the seat rule is arithmetic, and the empty-list refusal fires before the first query. Same reasoning as `dates.test.ts`, which unit-tests `deriveTicketStatus` rather than reaching it through six integration paths.

```ts
import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { assertSeatsFit, replaceTripTicketGuides } from './guides.js';

describe('assertSeatsFit', () => {
  it('accepts a party that exactly fills the van', () => {
    expect(() => assertSeatsFit(5, 4, 1)).not.toThrow();
  });

  it('counts a guide as a seat, exactly like a participant', () => {
    // Five participants alone fit a five-seater; one guide is the seat too
    // many. This is design §5.1's "consequence to accept" made executable — a
    // trip previously bookable at exactly capacity now needs a bigger vehicle.
    expect(() => assertSeatsFit(5, 5, 0)).not.toThrow();
    expect(() => assertSeatsFit(5, 5, 1)).toThrow(AppError);
  });

  it('names BOTH figures in the message, or the error is unactionable', () => {
    // "That vehicle seats 12; the trip is for 13" tells a requester who can
    // see ten names typed in nothing at all about the three seats they cannot
    // account for.
    try {
      assertSeatsFit(12, 10, 3);
      throw new Error('unreachable: assertSeatsFit accepted 13 in a 12-seater');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.statusCode).toBe(409);
      expect(e.code).toBe('OVER_CAPACITY');
      expect(e.message).toBe(
        'That vehicle seats 12; the trip is for 10 participant(s) and 3 guide(s)'
      );
    }
  });
});

describe('replaceTripTicketGuides', () => {
  // Any property access on this explodes, so the assertion below proves the
  // refusal happens BEFORE the deleteMany. An empty replace that deleted the
  // rows it then declined to rebuild would leave a ticket with no guides at
  // all and no error anywhere — the same trap replaceTripDates documents.
  const explodingTx = new Proxy(
    {},
    {
      get() {
        throw new Error('replaceTripTicketGuides reached the database');
      }
    }
  ) as unknown as Prisma.TransactionClient;

  it('refuses an empty list with 400 NO_GUIDES, before touching the database', async () => {
    await expect(
      replaceTripTicketGuides(
        explodingTx,
        '00000000-0000-4000-8000-000000000000',
        []
      )
    ).rejects.toMatchObject({ statusCode: 400, code: 'NO_GUIDES' });
  });
});
```

- [ ] **Step 5: Run the unit test and watch it fail on the missing module**

```
pnpm --filter @mms/api exec vitest run src/modules/trip-tickets/guides.test.ts
```

**Expected failure** (verified against this repo's vitest 3.2.6 / vite 7.1.12):

```
⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modules/trip-tickets/guides.test.ts [ src/modules/trip-tickets/guides.test.ts ]
Error: Cannot find module './guides.js' imported from 'C:/Users/larry/Documents/GitHub/motorpool-management-system-web/apps/api/src/modules/trip-tickets/guides.test.ts'
 ❯ src/modules/trip-tickets/guides.test.ts:4:1

Caused by: Error: Failed to load url ./guides.js (resolved id: ./guides.js) in .../src/modules/trip-tickets/guides.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 6: Write apps/api/src/modules/trip-tickets/guides.ts**

New file. It is the sibling of `dates.ts` — a helper module holding the rules that both `service.ts` and `transitions.ts` need, which is exactly the role `dates.ts` already plays (`recomputeTicketSpan` and `syncTicketStatus` are imported by both). That is why `assertSeatsFit` lives here and not in `service.ts`: `transitions.ts` has no precedent for importing its own module's service, and "re-runs the capacity check" (design §6) must mean one implementation, not two.

`replaceTripTicketGuides` copies `dates.ts:60-81` exactly — `tx` first, refuse empty, `deleteMany` then `createMany`, all inside the caller's transaction.

```ts
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

/**
 * Seats. A guide occupies one exactly as a participant does.
 *
 * The driver is deliberately not counted — the driver is not a passenger, and
 * that exclusion is not precedent for excluding anyone who rides. Nor do guides
 * ever reconcile against `participantsCount`: that count is a claim about the
 * participant NAMES, which is why PARTICIPANTS_MISMATCH (service.ts) is a
 * separate rule that runs before this one and is untouched by guides.
 *
 * The message names BOTH figures. "That vehicle seats 12; the trip is for 13"
 * is unactionable to a requester who can see only ten names typed in — the
 * three seats they cannot account for are the guides they just added.
 */
export function assertSeatsFit(
  capacity: number,
  participants: number,
  guides: number
): void {
  const headcount = participants + guides;
  if (headcount > capacity) {
    throw new AppError(
      409,
      'OVER_CAPACITY',
      `That vehicle seats ${capacity}; the trip is for ${participants} participant(s) and ${guides} guide(s)`
    );
  }
}

/**
 * Replace a ticket's guide rows wholesale.
 *
 * Delete-all-then-recreate, never a diff — the house pattern for child rows,
 * the same one `replaceTripDates` above and `job-orders/transitions.ts:95-105`
 * use. The composite primary key on (trip_ticket_id, employee_id) makes a
 * duplicate assignment unrepresentable, so a caller that names the same
 * employee twice fails loudly on the createMany rather than quietly seating
 * them twice.
 *
 * An EMPTY list is refused rather than obeyed, for the reason `replaceTripDates`
 * refuses one: obeying it would delete every guide and return 200, leaving a
 * ticket that violates the at-least-one-guide rule with no error anywhere.
 * `guideIds` is `.min(1)` on the create body and `.partial()` keeps that
 * refinement, so create and PATCH never reach this throw — zod answers them
 * first. POST /:id/guides does reach it: its body schema is deliberately not
 * `.min(1)`, so the empty case on that endpoint gets its own name instead of a
 * generic VALIDATION_ERROR.
 */
export async function replaceTripTicketGuides(
  tx: Prisma.TransactionClient,
  tripTicketId: string,
  employeeIds: string[]
): Promise<void> {
  if (employeeIds.length === 0) {
    throw new AppError(
      400,
      'NO_GUIDES',
      'A trip ticket must keep at least one guide'
    );
  }
  await tx.tripTicketEmployee.deleteMany({ where: { tripTicketId } });
  await tx.tripTicketEmployee.createMany({
    data: employeeIds.map((employeeId) => ({ tripTicketId, employeeId }))
  });
}
```

Run it green:

```
pnpm --filter @mms/api exec vitest run src/modules/trip-tickets/guides.test.ts
```

Expected: `Test Files  1 passed (1) / Tests  4 passed (4)`.

Commit: `feat(api): add the trip-ticket guide helpers`

- [ ] **Step 7: Write the failing integration test — scaffold, capacity, create, PATCH and reads**

New file `apps/api/src/modules/trip-tickets/trip-ticket-guides.test.ts`. Part 1 of 2; the reassign block is appended in the next step.

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { TripTicketStatus } from '@prisma/client';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestEmployee,
  createTestUser
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

// Windows are relative to NOW, never hardcoded. A trip cannot be booked
// entirely in the past, and a fixture pinned to a literal date silently rots
// into one the moment the wall clock passes it. Same convention as the sibling
// suites in this directory.
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number, hour = 8) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function scaffold() {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T',
      model: 'H',
      year: 2021,
      vin: 'VG1',
      licensePlate: 'PG1',
      capacity: 5,
      fuelType: 'diesel',
      mileage: 1000,
      status: 'available',
      branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-01-01')
    }
  });
  const driver = await prisma.driver.create({
    data: {
      email: 'dg@test.local',
      fullName: 'DG',
      status: 'active',
      branchId: branch.id
    }
  });
  const guideA = await createTestEmployee(branch.id, 'Ana Guide');
  const guideB = await createTestEmployee(branch.id, 'Ben Guide');
  const guideC = await createTestEmployee(branch.id, 'Cara Guide');
  const { user: admin } = await createTestUser({
    email: 'ag@test.local',
    role: 'admin'
  });
  const { user: requester } = await createTestUser({
    email: 'rg@test.local',
    role: 'requester'
  });
  return {
    branch,
    vehicle,
    driver,
    guideA,
    guideB,
    guideC,
    header: authHeader(admin.id, admin.email, 'admin'),
    requesterHeader: authHeader(requester.id, requester.email, 'requester')
  };
}

type Scaffold = Awaited<ReturnType<typeof scaffold>>;

const body = (s: Scaffold, over: Record<string, unknown> = {}) => ({
  branchId: s.branch.id,
  driverId: s.driver.id,
  vehicleId: s.vehicle.id,
  destination: 'Site A',
  purpose: 'Delivery',
  dateRequested: inDays(1),
  participants: ['Alice'],
  guideIds: [s.guideA.id],
  startTs: inDays(14, 8),
  endTs: inDays(14, 17),
  ...over
});

const post = (s: Scaffold, over: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/trip-tickets')
    .set('Authorization', s.header)
    .send(body(s, over));

const guideIdsOf = (t: { guides: { employeeId: string }[] }) =>
  t.guides.map((g) => g.employeeId).sort();

describe('trip-ticket guides: capacity', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('counts guides against the vehicle’s seats', async () => {
    const s = await scaffold(); // capacity 5
    const res = await post(s, {
      participants: ['A', 'B', 'C', 'D'],
      participantsCount: 4,
      guideIds: [s.guideA.id, s.guideB.id]
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVER_CAPACITY');
    expect(res.body.error.message).toBe(
      'That vehicle seats 5; the trip is for 4 participant(s) and 2 guide(s)'
    );
  });

  it('a party that exactly fills the van no longer fits once a guide is added', async () => {
    const s = await scaffold(); // capacity 5
    const res = await post(s, {
      participants: ['A', 'B', 'C', 'D', 'E'],
      participantsCount: 5,
      guideIds: [s.guideA.id]
    });
    // Design §5.1's "consequence to accept": stricter, on purpose. It reads as
    // a regression only to someone who books at the limit.
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVER_CAPACITY');
  });

  it('PARTICIPANTS_MISMATCH still ignores the guides entirely', async () => {
    const s = await scaffold();
    const res = await post(s, {
      participants: ['Alice'],
      participantsCount: 4,
      guideIds: [s.guideA.id, s.guideB.id]
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PARTICIPANTS_MISMATCH');
    // The count is a claim about the NAMES. Two guides do not make "1 name,
    // count 4" add up, and the message must not pretend they do.
    expect(res.body.error.message).toBe(
      '1 participant name(s) given but the count says 4'
    );
  });
});

describe('trip-ticket guides: create', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('writes the join rows for the guides it was given', async () => {
    const s = await scaffold();
    const res = await post(s, { guideIds: [s.guideA.id, s.guideB.id] });
    expect(res.status).toBe(201);
    expect(guideIdsOf(res.body)).toEqual([s.guideA.id, s.guideB.id].sort());
    expect(
      await prisma.tripTicketEmployee.count({
        where: { tripTicketId: res.body.id }
      })
    ).toBe(2);
  });

  it('refuses a create with an EMPTY guide list, and writes nothing', async () => {
    const s = await scaffold();
    const res = await post(s, { guideIds: [] });
    // `.min(1)` on the create body means zod answers this, not the service, so
    // the code is VALIDATION_ERROR rather than NO_GUIDES. Both are 400 and
    // both refuse; what matters is that an empty list is never accepted.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.tripTicket.count()).toBe(0);
  });

  it('refuses a create with no guideIds key at all', async () => {
    const s = await scaffold();
    const payload: Record<string, unknown> = body(s);
    delete payload.guideIds;
    const res = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', s.header)
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.tripTicket.count()).toBe(0);
  });
});

describe('trip-ticket guides: PATCH', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('leaves the guides alone when guideIds is ABSENT', async () => {
    const s = await scaffold();
    const created = await post(s, { guideIds: [s.guideA.id, s.guideB.id] });
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({ destination: 'Site B' });
    expect(patched.status).toBe(200);
    expect(patched.body.destination).toBe('Site B');
    expect(guideIdsOf(patched.body)).toEqual([s.guideA.id, s.guideB.id].sort());
  });

  it('refuses an EMPTY guideIds rather than silently keeping the old set', async () => {
    const s = await scaffold();
    const created = await post(s, { guideIds: [s.guideA.id] });
    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({ guideIds: [] });
    // A 200 that changed nothing would be the worst outcome here: the caller
    // asked for zero guides and would be told it worked.
    expect(patched.status).toBe(400);
    expect(patched.body.error.code).toBe('VALIDATION_ERROR');
    expect(
      await prisma.tripTicketEmployee.count({
        where: { tripTicketId: created.body.id }
      })
    ).toBe(1);
  });

  it('replaces the guide set wholesale when guideIds is sent', async () => {
    const s = await scaffold();
    const created = await post(s, { guideIds: [s.guideA.id, s.guideB.id] });
    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({ guideIds: [s.guideC.id] });
    expect(patched.status).toBe(200);
    expect(guideIdsOf(patched.body)).toEqual([s.guideC.id]);
    // Delete-all-then-recreate, not a diff: the two it had are gone.
    expect(
      await prisma.tripTicketEmployee.count({
        where: { tripTicketId: created.body.id }
      })
    ).toBe(1);
  });

  it('re-checks capacity when the guide list grows on an edit', async () => {
    const s = await scaffold(); // capacity 5
    const guideD = await createTestEmployee(s.branch.id, 'Dee Guide');
    const guideE = await createTestEmployee(s.branch.id, 'Eve Guide');
    const created = await post(s, {
      participants: ['A', 'B'],
      participantsCount: 2,
      guideIds: [s.guideA.id]
    });
    expect(created.status).toBe(201); // 2 + 1 = 3 of 5
    const patched = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header)
      .send({
        guideIds: [s.guideA.id, s.guideB.id, s.guideC.id, guideD.id, guideE.id]
      });
    expect(patched.status).toBe(409);
    expect(patched.body.error.code).toBe('OVER_CAPACITY');
  });
});

describe('trip-ticket guides: reads', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('returns the guides with their employee on BOTH the detail and the list read', async () => {
    const s = await scaffold();
    const created = await post(s, { guideIds: [s.guideA.id] });
    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header);
    expect(detail.status).toBe(200);
    expect(detail.body.guides).toHaveLength(1);
    expect(detail.body.guides[0].employee.name).toBe('Ana Guide');

    // The list read shares ONE include with the detail read, and there is no
    // response contract anywhere that would catch a relation dropped from one
    // and not the other — so both are asserted, always.
    const list = await request(app)
      .get('/api/trip-tickets')
      .set('Authorization', s.header);
    expect(list.status).toBe(200);
    expect(list.body.data[0].guides).toHaveLength(1);
    expect(list.body.data[0].guides[0].employee.name).toBe('Ana Guide');
  });

  it('keeps rendering an ARCHIVED employee’s name on a ticket they already guided', async () => {
    const s = await scaffold();
    const created = await post(s, { guideIds: [s.guideA.id] });
    await prisma.employee.update({
      where: { id: s.guideA.id },
      data: { archivedAt: new Date() }
    });
    const detail = await request(app)
      .get(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', s.header);
    // Archiving stops someone being OFFERED for future bookings; it never
    // rewrites history (design §8).
    expect(detail.status).toBe(200);
    expect(detail.body.guides[0].employee.name).toBe('Ana Guide');
    expect(detail.body.guides[0].employee.archivedAt).not.toBeNull();
  });
});
```

- [ ] **Step 8: Append the failing reassign-endpoint block to the same test file**

Append to `apps/api/src/modules/trip-tickets/trip-ticket-guides.test.ts`.

```ts
// A counter, not a fixed window: every ticket below shares one vehicle and one
// driver, and assertBookable refuses a second booking over the first's hours.
// Same device as `twoDateTicketSeq` in trip-ticket-transitions.test.ts.
let reassignTicketSeq = 0;

async function ticketAt(s: Scaffold, status: TripTicketStatus) {
  const day = 20 + ++reassignTicketSeq;
  const created = await post(s, {
    guideIds: [s.guideA.id],
    startTs: inDays(day, 8),
    endTs: inDays(day, 17)
  });
  if (created.status !== 201) {
    throw new Error(
      `ticketAt(${status}) could not book: ${created.status} ${JSON.stringify(created.body)}`
    );
  }
  const id = created.body.id as string;
  // Forced directly, the way the sibling transition suites do — the approval
  // chain is not what is under test here.
  await prisma.tripTicket.update({ where: { id }, data: { status } });
  return id;
}

describe('POST /api/trip-tickets/:id/guides', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('reassigns guides on an APPROVED ticket', async () => {
    const s = await scaffold();
    const id = await ticketAt(s, 'approved');
    const res = await request(app)
      .post(`/api/trip-tickets/${id}/guides`)
      .set('Authorization', s.header)
      .send({ guideIds: [s.guideB.id, s.guideC.id] });
    expect(res.status).toBe(200);
    expect(guideIdsOf(res.body)).toEqual([s.guideB.id, s.guideC.id].sort());
  });

  it('reassigns guides on an IN_PROGRESS ticket', async () => {
    const s = await scaffold();
    const id = await ticketAt(s, 'in_progress');
    const res = await request(app)
      .post(`/api/trip-tickets/${id}/guides`)
      .set('Authorization', s.header)
      .send({ guideIds: [s.guideB.id] });
    expect(res.status).toBe(200);
    expect(guideIdsOf(res.body)).toEqual([s.guideB.id]);
  });

  it('the allowed-from list is EXACTLY approved + in_progress', async () => {
    const s = await scaffold();
    // The two pending states are out because the ordinary PATCH already
    // handles guides there — one edit with two doors and two different guards
    // on them is how the freeze gets holes in it. The three terminal states
    // are out because a finished trip's record of who was on it is history.
    const refused: TripTicketStatus[] = [
      'pending_admin_approval',
      'pending_fuel_allocation_approval',
      'completed',
      'cancelled',
      'disapproved'
    ];
    for (const status of refused) {
      const id = await ticketAt(s, status);
      const res = await request(app)
        .post(`/api/trip-tickets/${id}/guides`)
        .set('Authorization', s.header)
        .send({ guideIds: [s.guideB.id] });
      expect(res.status, status).toBe(409);
      expect(res.body.error.code, status).toBe('INVALID_TRANSITION');
      // ...and the guides it had are untouched.
      expect(
        await prisma.tripTicketEmployee.findMany({
          where: { tripTicketId: id },
          select: { employeeId: true }
        }),
        status
      ).toEqual([{ employeeId: s.guideA.id }]);
    }
  });

  it('is admin-only — a requester does not re-staff their own approved trip', async () => {
    const s = await scaffold();
    const id = await ticketAt(s, 'approved');
    const res = await request(app)
      .post(`/api/trip-tickets/${id}/guides`)
      .set('Authorization', s.requesterHeader)
      .send({ guideIds: [s.guideB.id] });
    expect(res.status).toBe(403);
  });

  it('refuses an EMPTY guide list with 400 NO_GUIDES', async () => {
    const s = await scaffold();
    const id = await ticketAt(s, 'approved');
    const res = await request(app)
      .post(`/api/trip-tickets/${id}/guides`)
      .set('Authorization', s.header)
      .send({ guideIds: [] });
    // This endpoint's body schema is deliberately not `.min(1)`, so the empty
    // case reaches the service and gets its own name instead of a generic
    // VALIDATION_ERROR.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_GUIDES');
    // The delete and the insert are one transaction and the refusal precedes
    // both, so the guide it already had is still there.
    expect(
      await prisma.tripTicketEmployee.count({ where: { tripTicketId: id } })
    ).toBe(1);
  });

  it('re-runs the seat check — swapping one guide for five overflows the van', async () => {
    const s = await scaffold(); // capacity 5
    const guideD = await createTestEmployee(s.branch.id, 'Dee Guide');
    const guideE = await createTestEmployee(s.branch.id, 'Eve Guide');
    const created = await post(s, {
      participants: ['A', 'B', 'C'],
      participantsCount: 3,
      guideIds: [s.guideA.id],
      startTs: inDays(60, 8),
      endTs: inDays(60, 17)
    });
    expect(created.status).toBe(201); // 3 + 1 = 4 of 5
    await prisma.tripTicket.update({
      where: { id: created.body.id },
      data: { status: 'approved' }
    });

    const res = await request(app)
      .post(`/api/trip-tickets/${created.body.id}/guides`)
      .set('Authorization', s.header)
      .send({
        guideIds: [s.guideA.id, s.guideB.id, s.guideC.id, guideD.id, guideE.id]
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVER_CAPACITY');
    // The participants come off the STORED ticket — this endpoint does not
    // edit them, and reading them from the request would let a caller shrink
    // the party on paper to fit the guides they are adding.
    expect(res.body.error.message).toBe(
      'That vehicle seats 5; the trip is for 3 participant(s) and 5 guide(s)'
    );
  });

  it('404s on a ticket that does not exist', async () => {
    const s = await scaffold();
    const res = await request(app)
      .post('/api/trip-tickets/00000000-0000-4000-8000-000000000000/guides')
      .set('Authorization', s.header)
      .send({ guideIds: [s.guideB.id] });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 9: Run the integration suite and watch it fail**

```
pnpm --filter @mms/api exec vitest run src/modules/trip-tickets/trip-ticket-guides.test.ts
```

**Expected failure.** `guideIds` now parses, so it reaches `service.create`, where `data: { ...body, ... }` spreads a field Prisma has never heard of. That is the trap design §7.1 names: it compiles clean (TypeScript does not excess-property-check spread members — verified) and throws `PrismaClientValidationError` at runtime, which the error handler maps to a 500. So the very first assertion sees a 500 where it wanted a 409:

```
 FAIL  src/modules/trip-tickets/trip-ticket-guides.test.ts > trip-ticket guides: capacity > counts guides against the vehicle’s seats
AssertionError: expected 500 to be 409 // Object.is equality

- Expected
+ Received

- 409
+ 500

 Test Files  1 failed (1)
      Tests  16 failed (16)
```

Every test in the file fails; the reassign block additionally 404s because the route does not exist yet.

- [ ] **Step 10: Add guides to the read include**

In `apps/api/src/modules/trip-tickets/repository.ts`.

**Current, lines 4-13:**

```ts
// Relations the FE renders (spec §6.1 read contract). The FE flattens
// fuelAllocation into allocation_* names in Plan 7.
export const tripTicketInclude = {
  driver: true,
  vehicle: true,
  office: true,
  officeHead: true,
  fuelAllocation: true,
  dates: { orderBy: { startTs: 'asc' as const } }
} satisfies Prisma.TripTicketInclude;
```

**Replace with:**

```ts
// Relations the FE renders (spec §6.1 read contract). The FE flattens
// fuelAllocation into allocation_* names in Plan 7.
export const tripTicketInclude = {
  driver: true,
  vehicle: true,
  office: true,
  officeHead: true,
  fuelAllocation: true,
  dates: { orderBy: { startTs: 'asc' as const } },
  // Guides come back through the join WITH the employee attached, so a ticket
  // keeps rendering an archived employee's name: archiving hides someone from
  // future bookings, it never rewrites history. This one const serves both the
  // detail read and the list read — and there is no response contract anywhere
  // that would catch it if guides went missing from either.
  guides: { include: { employee: true } }
} satisfies Prisma.TripTicketInclude;
```

This alone flips the two read tests. Confirm the direction of travel:

```
pnpm --filter @mms/api exec vitest run src/modules/trip-tickets/trip-ticket-guides.test.ts
```

Still red (the reads depend on create working), but the failure is unchanged at 500 rather than a new one.

- [ ] **Step 11: Teach assertBookable to count guides**

In `apps/api/src/modules/trip-tickets/service.ts`.

**(a) Imports — current, lines 16-23:**

```ts
import {
  findTripTicketById,
  listTripTickets,
  tripTicketInclude
} from './repository.js';
import { replaceTripDates } from './dates.js';
import * as events from '../notifications/events.js';
import { formatDisplayDate } from '../../lib/timezone.js';
```

**Replace with:**

```ts
import {
  findTripTicketById,
  listTripTickets,
  tripTicketInclude
} from './repository.js';
import { replaceTripDates } from './dates.js';
import { assertSeatsFit, replaceTripTicketGuides } from './guides.js';
import * as events from '../notifications/events.js';
import { formatDisplayDate } from '../../lib/timezone.js';
```

**(b) The signature — current, lines 90-101:**

```ts
async function assertBookable(
  body: Pick<
    CreateTripTicketBody,
    | 'vehicleId'
    | 'driverId'
    | 'startTs'
    | 'endTs'
    | 'participants'
    | 'participantsCount'
  > & { dates?: TripDateInput[] },
  excludeTicketId?: string
): Promise<void> {
```

**Replace with:**

```ts
async function assertBookable(
  body: Pick<
    CreateTripTicketBody,
    | 'vehicleId'
    | 'driverId'
    | 'startTs'
    | 'endTs'
    | 'participants'
    | 'participantsCount'
    | 'guideIds'
  > & { dates?: TripDateInput[] },
  excludeTicketId?: string
): Promise<void> {
```

`guideIds` is required on `CreateTripTicketBody`, so `Pick<>` makes it required here too — which is deliberate: it forces the `update` caller below to decide explicitly what the proposed guide list is instead of silently validating a party with no staff in it.

**(c) The arithmetic — current, lines 181-199:**

```ts
// The names are the truth; the count is a claim about them. If both are given
// they have to agree, or the headcount the vehicle is sized against is fiction.
const named = body.participants?.length ?? 0;
const claimed = body.participantsCount ?? null;
if (claimed !== null && named > 0 && claimed !== named) {
  throw new AppError(
    400,
    'PARTICIPANTS_MISMATCH',
    `${named} participant name(s) given but the count says ${claimed}`
  );
}
const headcount = Math.max(named, claimed ?? 0);
if (headcount > vehicle.capacity) {
  throw new AppError(
    409,
    'OVER_CAPACITY',
    `That vehicle seats ${vehicle.capacity}; the trip is for ${headcount}`
  );
}
```

**Replace with:**

```ts
// The names are the truth; the count is a claim about them. If both are given
// they have to agree, or the headcount the vehicle is sized against is fiction.
const named = body.participants?.length ?? 0;
const claimed = body.participantsCount ?? null;
if (claimed !== null && named > 0 && claimed !== named) {
  throw new AppError(
    400,
    'PARTICIPANTS_MISMATCH',
    `${named} participant name(s) given but the count says ${claimed}`
  );
}
// Guides ride in the same van, so they take the same seats (design §5.1).
// They are deliberately NOT reconciled against participantsCount above —
// that count is a claim about the participant NAMES, and a guide is not a
// participant. The rule lives in guides.ts because POST /:id/guides re-runs
// exactly this check after approval, and two copies of it would drift.
assertSeatsFit(
  vehicle.capacity,
  Math.max(named, claimed ?? 0),
  body.guideIds.length
);
```

At this point `pnpm --filter @mms/api typecheck` reports the two call sites that do not yet pass `guideIds` — `create` (fine, its body has one) and `update` (fixed two steps down).

- [ ] **Step 12: Write the guide rows on create — and get guideIds out of the Prisma spread**

In `apps/api/src/modules/trip-tickets/service.ts`.

**(a) Org-refs — current, lines 254-258:**

```ts
await assertOrgRefsActive({
  branchId: body.branchId,
  officeId: body.officeId,
  officeHeadId: body.officeHeadId
});
```

**Replace with:**

```ts
await assertOrgRefsActive({
  branchId: body.branchId,
  officeId: body.officeId,
  officeHeadId: body.officeHeadId,
  employeeIds: body.guideIds
});
```

**(b) The transaction — current, lines 273-292:**

```ts
const dates = normaliseTripDates(body);
const ticket = await prisma.$transaction(async (tx) => {
  const created = await tx.tripTicket.create({
    // The legacy pair is still written, but only as the seed of the derived
    // span — replaceTripDates recomputes it from the rows immediately after.
    data: {
      ...body,
      // `dates` on the body is the validated request list, not Prisma's `dates`
      // relation (added in Task 1) — those are shaped differently. Keep it out
      // of the ticket write; replaceTripDates below wires it into the
      // trip_dates rows instead.
      dates: undefined,
      requestedById,
      status: 'pending_admin_approval' // status is never client-chosen
    },
    select: { id: true }
  });
  await replaceTripDates(tx, created.id, dates);
  return created;
});
```

**Replace with:**

```ts
const dates = normaliseTripDates(body);
// `guideIds` is pulled OUT of the body rather than blanked with
// `guideIds: undefined` the way `dates` is below, and the difference matters:
// `dates` IS a key on Prisma's create input (the relation), `guideIds` is not
// — and TypeScript excess-property-checks a key you write EXPLICITLY in an
// object literal, so `guideIds: undefined` is a compile error (TS2353) while
// leaving it inside the spread is not checked at all. Left in the spread it
// compiles clean and throws PrismaClientValidationError at runtime, on the
// create path only. Same idiom as `const { requestedById, ...editable }` in
// update() below.
const { guideIds, ...ticketData } = body;
const ticket = await prisma.$transaction(async (tx) => {
  const created = await tx.tripTicket.create({
    // The legacy pair is still written, but only as the seed of the derived
    // span — replaceTripDates recomputes it from the rows immediately after.
    data: {
      ...ticketData,
      // `dates` on the body is the validated request list, not Prisma's `dates`
      // relation (added in Task 1) — those are shaped differently. Keep it out
      // of the ticket write; replaceTripDates below wires it into the
      // trip_dates rows instead.
      dates: undefined,
      requestedById,
      status: 'pending_admin_approval' // status is never client-chosen
    },
    select: { id: true }
  });
  await replaceTripDates(tx, created.id, dates);
  // Inside the SAME transaction: a ticket that committed without its guides
  // would be a booking nobody is staffing, and there is no later write that
  // would notice.
  await replaceTripTicketGuides(tx, created.id, guideIds);
  return created;
});
```

- [ ] **Step 13: Handle guides on the update path, absent-means-leave-alone**

In `apps/api/src/modules/trip-tickets/service.ts`.

**(a) Org-refs — current, lines 304-308:**

```ts
await assertOrgRefsActive({
  branchId: body.branchId,
  officeId: body.officeId,
  officeHeadId: body.officeHeadId
});
```

**Replace with:**

```ts
await assertOrgRefsActive({
  branchId: body.branchId,
  officeId: body.officeId,
  officeHeadId: body.officeHeadId,
  // Undefined when the caller is not editing guides — assertOrgRefsActive
  // checks only the keys actually present, so an untouched guide list is
  // never re-validated against an employee archived since.
  employeeIds: body.guideIds
});
```

**(b) The capacity call — current, lines 370-379:**

```ts
await assertBookable(
  {
    vehicleId: body.vehicleId ?? existing.vehicleId,
    driverId: body.driverId ?? existing.driverId,
    participants: body.participants ?? existing.participants,
    participantsCount: body.participantsCount ?? existing.participantsCount,
    dates: proposedDates
  },
  id
);
```

**Replace with:**

```ts
await assertBookable(
  {
    vehicleId: body.vehicleId ?? existing.vehicleId,
    driverId: body.driverId ?? existing.driverId,
    participants: body.participants ?? existing.participants,
    participantsCount: body.participantsCount ?? existing.participantsCount,
    // Same fallback shape as the fields above it: a PATCH that adds two
    // participants without touching the guides must still be sized against
    // the guides the ticket already has, or an edit could quietly push the
    // party past the van's capacity.
    guideIds: body.guideIds ?? existing.guides.map((g) => g.employeeId),
    dates: proposedDates
  },
  id
);
```

**(c) The destructure — current, line 382:**

```ts
const { requestedById, ...editable } = body;
```

**Replace with:**

```ts
const { requestedById, guideIds, ...editable } = body;
```

(`guideIds` is not a column and not a Prisma relation — see the note in `create` above. `editable` is spread straight into `tx.tripTicket.update`, so it has to come out here too, and on THIS path a stray relation-shaped key is not even a compile error.)

**(d) The transaction — current, lines 408-418:**

```ts
await prisma.$transaction(async (tx) => {
  await tx.tripTicket.update({ where: { id }, data });
  // Only touch the date rows when the caller actually sent dates — a `dates`
  // array with rows, or the legacy startTs/endTs pair. A PATCH that edits only
  // e.g. `destination` sends neither, and must leave the rows untouched.
  const sentDates =
    (body.dates && body.dates.length > 0) || (body.startTs && body.endTs);
  if (sentDates) {
    await replaceTripDates(tx, id, normaliseTripDates(body));
  }
});
```

**Replace with:**

```ts
await prisma.$transaction(async (tx) => {
  await tx.tripTicket.update({ where: { id }, data });
  // Only touch the date rows when the caller actually sent dates — a `dates`
  // array with rows, or the legacy startTs/endTs pair. A PATCH that edits only
  // e.g. `destination` sends neither, and must leave the rows untouched.
  const sentDates =
    (body.dates && body.dates.length > 0) || (body.startTs && body.endTs);
  if (sentDates) {
    await replaceTripDates(tx, id, normaliseTripDates(body));
  }
  // The same rule for the guide rows, one case simpler: there is no legacy
  // pair to fold in, so ABSENT is the only "leave them alone" spelling.
  //
  // There is deliberately no empty-list gate here to match the NO_TRIP_DATES
  // one at :349 — it would be unreachable. `.partial()` wraps `guideIds` in
  // ZodOptional without stripping its `.min(1)`, so `{ guideIds: [] }` is
  // refused by zod before this controller ever runs. If that `.min(1)` is
  // ever dropped, replaceTripTicketGuides still answers an empty list with
  // 400 NO_GUIDES rather than deleting every row.
  if (guideIds !== undefined) {
    await replaceTripTicketGuides(tx, id, guideIds);
  }
});
```

Run — the capacity, create, PATCH and read blocks should now be green and only the reassign block red:

```
pnpm --filter @mms/api exec vitest run src/modules/trip-tickets/trip-ticket-guides.test.ts
```

Expected: `Tests  7 failed | 9 passed (16)` — all seven failures inside `POST /api/trip-tickets/:id/guides`, each `expected 404 to be 200` / `expected 404 to be 409` because the route does not exist.

- [ ] **Step 14: Add the reassignGuides transition**

In `apps/api/src/modules/trip-tickets/transitions.ts`.

**(a) Imports — current, lines 1-22:**

```ts
import type { TripDate } from '@prisma/client';
import type {
  ApproveTripTicketBody,
  CheckInBody,
  CheckOutBody
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import {
  advanceOdometer,
  changeVehicleStatus,
  claimVehicleStatus
} from '../vehicles/status.js';
import * as events from '../notifications/events.js';
import { findTripTicketById } from './repository.js';
import {
  recomputeTicketSpan,
  resolveOutingForCheckIn,
  resolveOutingForCheckOut,
  syncTicketStatus
} from './dates.js';
```

**Replace with:**

```ts
import type { TripDate } from '@prisma/client';
import type {
  ApproveTripTicketBody,
  CheckInBody,
  CheckOutBody
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { assertOrgRefsActive } from '../../lib/org-refs.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import {
  advanceOdometer,
  changeVehicleStatus,
  claimVehicleStatus
} from '../vehicles/status.js';
import * as events from '../notifications/events.js';
import { findTripTicketById } from './repository.js';
import {
  recomputeTicketSpan,
  resolveOutingForCheckIn,
  resolveOutingForCheckOut,
  syncTicketStatus
} from './dates.js';
import { assertSeatsFit, replaceTripTicketGuides } from './guides.js';
```

**(b) Append at the end of the file, after `checkIn`'s closing brace (line 437):**

```ts
/**
 * Swap the people guiding an already-approved trip.
 *
 * The generic PATCH is frozen the moment a ticket leaves
 * `pending_admin_approval`, and a guide changing on the morning of the trip is
 * the ordinary case rather than an exception — so guides get their own
 * transition instead of a hole in the freeze.
 *
 * Allowed from `approved` and `in_progress` ONLY. Not from `completed`,
 * `cancelled` or `disapproved`: a finished trip's record of who was on it is
 * history, and rewriting it would make the ticket disagree with what actually
 * happened. Not from the two pending states either — the ordinary PATCH
 * already handles guides there, and one edit reachable through two doors with
 * two different guards on them is how a freeze stops meaning anything.
 *
 * The seat check runs again: swapping one guide for five can overflow the van.
 * The participant figures come off the STORED ticket, never off the request —
 * this endpoint does not edit participants, and reading them from the body
 * would let a caller shrink the party on paper to make room for the guides
 * they are adding.
 *
 * No `actor` and no notification, unlike the transitions above: this is an
 * admin-only correction to a staffing list, there is no approval decision in it
 * and nobody is holding it for signature. If either changes it takes an
 * AuthenticatedUser and an events.* call like the rest.
 */
export async function reassignGuides(id: string, guideIds: string[]) {
  const ticket = await loadInState(id, ['approved', 'in_progress']);
  // An archived employee is off the roster and must not be sent to a ticket by
  // the back door — removing them from the pickers stops them being OFFERED,
  // not being POSTED. Branch membership is deliberately NOT checked, here or
  // anywhere: the picker is branch-locked in the UI only (design §5.2).
  await assertOrgRefsActive({ employeeIds: guideIds });

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: ticket.vehicleId },
    select: { capacity: true }
  });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  assertSeatsFit(
    vehicle.capacity,
    Math.max(ticket.participants.length, ticket.participantsCount ?? 0),
    guideIds.length
  );

  // Deliberately NOT assertBookable: that would re-run the date rules too, and
  // an approved two-date event whose first outing is already driven and closed
  // would fail TRIP_IN_THE_PAST on a request that never touched its dates.
  await prisma.$transaction(async (tx) => {
    // deleteMany + createMany must not half-apply — a failure between them
    // would leave an approved trip with no guides at all.
    await replaceTripTicketGuides(tx, id, guideIds);
  });
  return findTripTicketById(id);
}
```

- [ ] **Step 15: Wire the controller and the route**

**(a) `apps/api/src/modules/trip-tickets/transitions.controller.ts` — current, lines 1-9:**

```ts
import type { Request, Response } from 'express';
import type {
  ApproveTripTicketBody,
  CheckInBody,
  CheckOutBody,
  ReasonBody
} from '@mms/shared';
import { requireIdParam, requireParam, requireUser } from '../../lib/http.js';
import * as transitions from './transitions.js';
```

**Replace with:**

```ts
import type { Request, Response } from 'express';
import type {
  ApproveTripTicketBody,
  CheckInBody,
  CheckOutBody,
  ReasonBody,
  ReassignGuidesBody
} from '@mms/shared';
import { requireIdParam, requireParam, requireUser } from '../../lib/http.js';
import * as transitions from './transitions.js';
```

**Append at the end of the file, after `checkIn`'s closing brace (line 74):**

```ts
// No requireUser here, unlike its neighbours: reassignGuides takes no actor —
// the route is admin-gated and the transition raises no notification.
export async function reassignGuides(
  req: Request,
  res: Response
): Promise<void> {
  res.json(
    await transitions.reassignGuides(
      requireIdParam(req),
      (req.body as ReassignGuidesBody).guideIds
    )
  );
}
```

**(b) `apps/api/src/modules/trip-tickets/router.ts` — current, lines 2-10:**

```ts
import {
  USER_ROLES,
  approveTripTicketBodySchema,
  checkInBodySchema,
  checkOutBodySchema,
  createTripTicketBodySchema,
  reasonBodySchema,
  updateTripTicketBodySchema
} from '@mms/shared';
```

**Replace with:**

```ts
import {
  USER_ROLES,
  approveTripTicketBodySchema,
  checkInBodySchema,
  checkOutBodySchema,
  createTripTicketBodySchema,
  reasonBodySchema,
  reassignGuidesBodySchema,
  updateTripTicketBodySchema
} from '@mms/shared';
```

**Current, lines 64-71:**

```ts
// Cancel ONE date on the event without voiding the rest — narrower than
// whole-ticket cancel above (see transitions.cancelDate's doc comment).
tripTicketsRouter.post(
  '/:id/dates/:dateId/cancel',
  requireRole(USER_ROLES.admin, USER_ROLES.requester),
  validateBody(reasonBodySchema),
  transitionsController.cancelDate
);
```

**Replace with** (the new route is appended directly after it — it belongs with the other post-approval amendments, above the gate block):

```ts
// Cancel ONE date on the event without voiding the rest — narrower than
// whole-ticket cancel above (see transitions.cancelDate's doc comment).
tripTicketsRouter.post(
  '/:id/dates/:dateId/cancel',
  requireRole(USER_ROLES.admin, USER_ROLES.requester),
  validateBody(reasonBodySchema),
  transitionsController.cancelDate
);
// Re-staff an approved trip. Admin ONLY, no requester override: the generic
// PATCH is frozen once a ticket is approved, and the point of this endpoint is
// to reopen exactly one field of it — for the admin who approved the trip, not
// for the person who asked for it.
tripTicketsRouter.post(
  '/:id/guides',
  requireRole(USER_ROLES.admin),
  validateBody(reassignGuidesBodySchema),
  transitionsController.reassignGuides
);
```

Run the file green:

```
pnpm --filter @mms/api exec vitest run src/modules/trip-tickets/trip-ticket-guides.test.ts
```

Expected: `Test Files  1 passed (1) / Tests  16 passed (16)`.

Commit: `feat(api): require and reassign trip-ticket guides`

- [ ] **Step 16: Repair the three existing fixtures that POST a ticket through the endpoint**

`guideIds` is required now, so every fixture that books through `POST /api/trip-tickets` returns 400 until it carries one. Design §12 names two of these; the third (`trip-ticket-transitions.test.ts`) it missed.

**(a) `trip-ticket-booking.test.ts`.** Lines 5-9 today:

```ts
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../../test/factories.js';
```

→

```ts
import {
  authHeader,
  createTestBranch,
  createTestEmployee,
  createTestUser
} from '../../test/factories.js';
```

Lines 64-80 today:

```ts
  const { user: admin } = await createTestUser({
    email: 'a@test.local',
    role: 'admin'
  });
  return {
    branch,
    vehicle,
    otherVehicle,
    deadVehicle,
    driver,
    otherDriver,
    inactiveDriver,
    header: authHeader(admin.id, admin.email, 'admin'),
    adminId: admin.id
  };
}
```

→

```ts
  const { user: admin } = await createTestUser({
    email: 'a@test.local',
    role: 'admin'
  });
  // Every ticket needs at least one guide now, and a guide takes a seat: this
  // van holds 5, so the fixture's one participant plus one guide leaves three.
  const employee = await createTestEmployee(branch.id, 'Ana Guide');
  return {
    branch,
    vehicle,
    otherVehicle,
    deadVehicle,
    driver,
    otherDriver,
    inactiveDriver,
    employee,
    header: authHeader(admin.id, admin.email, 'admin'),
    adminId: admin.id
  };
}
```

Line 103 today is `  participants: ['Alice'],`. Insert one line after it, so lines 96-108 read:

```ts
const body = (s: Scaffold, over: Record<string, unknown> = {}) => ({
  branchId: s.branch.id,
  driverId: s.driver.id,
  vehicleId: s.vehicle.id,
  destination: 'Site A',
  purpose: 'Delivery',
  dateRequested: inDays(1),
  participants: ['Alice'],
  guideIds: [s.employee.id],
  requestedById: s.adminId,
  startTs: inDays(14, 8),
  endTs: inDays(14, 17),
  ...over
});
```

The existing `refuses more passengers than the vehicle seats` test still passes (8 + 1 > 5) and `refuses a participant count that disagrees` still gets PARTICIPANTS_MISMATCH, which runs before the seat check.

**(b) `trip-tickets.test.ts`.** Lines 5-9 take the same `createTestEmployee` import. Lines 32-40 today:

```ts
  const driver = await prisma.driver.create({
    data: {
      email: 'd@test.local',
      fullName: 'D',
      status: 'active',
      branchId: branch.id
    }
  });
  return { branch, vehicle, driver };
}
```

→

```ts
  const driver = await prisma.driver.create({
    data: {
      email: 'd@test.local',
      fullName: 'D',
      status: 'active',
      branchId: branch.id
    }
  });
  const employee = await createTestEmployee(branch.id, 'Ana Guide');
  return { branch, vehicle, driver, employee };
}
```

Lines 53-74 today:

```ts
function ticketBody(
  s: {
    branch: { id: string };
    vehicle: { id: string };
    driver: { id: string };
  },
  requestedById: string
) {
  return {
    branchId: s.branch.id,
    driverId: s.driver.id,
    vehicleId: s.vehicle.id,
    destination: 'Site A',
    purpose: 'Delivery',
    dateRequested: inDays(1),
    participants: ['Alice', 'Bob'],
    participantsCount: 2,
    requestedById,
    startTs: inDays(7, 8),
    endTs: inDays(7, 17)
  };
}
```

→

```ts
function ticketBody(
  s: {
    branch: { id: string };
    vehicle: { id: string };
    driver: { id: string };
    employee: { id: string };
  },
  requestedById: string
) {
  return {
    branchId: s.branch.id,
    driverId: s.driver.id,
    vehicleId: s.vehicle.id,
    destination: 'Site A',
    purpose: 'Delivery',
    dateRequested: inDays(1),
    participants: ['Alice', 'Bob'],
    participantsCount: 2,
    // Guides take seats: 2 participants + 1 guide, in a 5-seater.
    guideIds: [s.employee.id],
    requestedById,
    startTs: inDays(7, 8),
    endTs: inDays(7, 17)
  };
}
```

**(c) `trip-ticket-transitions.test.ts` — NOT in design §12's list.** Lines 5-10 take the same `createTestEmployee` import. Lines 568-580 today:

```ts
const rebook = await request(app)
  .post('/api/trip-tickets')
  .set('Authorization', adminHeader)
  .send({
    branchId: s.branch.id,
    driverId: s.driver.id,
    vehicleId: s.vehicle.id,
    destination: 'Elsewhere',
    purpose: 'A different event',
    dateRequested: new Date().toISOString(),
    startTs: secondDate.startTs.toISOString(),
    endTs: secondDate.endTs.toISOString()
  });
```

→

```ts
const guide = await createTestEmployee(s.branch.id, 'Rebook Guide');
const rebook = await request(app)
  .post('/api/trip-tickets')
  .set('Authorization', adminHeader)
  .send({
    branchId: s.branch.id,
    driverId: s.driver.id,
    vehicleId: s.vehicle.id,
    destination: 'Elsewhere',
    purpose: 'A different event',
    dateRequested: new Date().toISOString(),
    startTs: secondDate.startTs.toISOString(),
    endTs: secondDate.endTs.toISOString(),
    guideIds: [guide.id]
  });
```

- [ ] **Step 17: Run the whole module, typecheck, and commit**

```
pnpm --filter @mms/api exec vitest run src/modules/trip-tickets
pnpm --filter @mms/api typecheck
```

Expected: all eight files in `src/modules/trip-tickets` pass, and typecheck is silent.

Then the full API suite, which is where the `organization/enforcement.test.ts` breakage flagged in the notes will surface if nobody has taken it yet:

```
pnpm --filter @mms/api test
```

Finally, prove each new assertion can actually fail. Take them one at a time — break the line it covers, confirm a real failure, restore, confirm byte-identical:

- Delete `+ guides` from `assertSeatsFit`'s `headcount` → the two capacity tests and the reassign seat test go red.
- Delete `guides: { include: { employee: true } }` from `tripTicketInclude` → the read test goes red on the detail assertion AND on the list one.
- Change `['approved', 'in_progress']` to `['approved']` in `reassignGuides` → the in_progress test goes red.
- Change `if (guideIds !== undefined)` to `if (guideIds)` in `update` → still green (an empty array is unreachable), which is the point: the gate is about ABSENT, and the note above it says so.
- Put `guideIds` back in the create spread → the create tests go red with 500.

```
git add -A
git commit -m "test(api): cover guides on trip-ticket booking, editing and reassignment"
```

These three Playwright specs POST trip tickets directly through the API. `guideIds` became required in Step 3 of this task, so all three are red right now. They are repaired **here**, in the task that broke them, so the e2e suite is never left red across a task boundary.

Start the app first — Playwright drives an already-running stack, it does not boot one:

```bash
pnpm dev
```

Web on :5173, API on :3001. Confirm both respond before running any spec.

- [ ] **Step 18: Repair trip-lifecycle.spec.ts**

This spec has **no teardown of any kind** — it is the anti-pattern the design document names. So its guide must come from the seeded roster; creating one here would leave a row behind on every run.

**Edit — lines 40-62.** Replace:

```ts
const vehicle = vehicles.find((v) => v.status === 'available');
expect(vehicle, 'a free vehicle is available for the sim').toBeTruthy();
const linkedDriver =
  drivers.find((d) => d.userId === driver.user.id) ?? drivers[0];
const destination = `UI-E2E ${Date.now()}`;

// Requester submits → always born pending_admin_approval.
const created = await apiPost(request, '/api/trip-tickets', requester.token, {
  branchId: branches[0].id as string,
  driverId: linkedDriver.id as string,
  vehicleId: vehicle!.id as string,
  officeId: (offices[0]?.id as string) ?? null,
  officeHeadId: (heads[0]?.id as string) ?? null,
  destination,
  purpose: 'E2E UI lifecycle',
  dateRequested: new Date().toISOString(),
  participants: ['E2E'],
  participantsCount: 1,
  preparedBy: 'E2E',
  requestedById: requester.user.id,
  startTs: new Date().toISOString(),
  endTs: new Date(Date.now() + 3_600_000).toISOString()
});
```

with:

```ts
const vehicle = vehicles.find((v) => v.status === 'available');
expect(vehicle, 'a free vehicle is available for the sim').toBeTruthy();
const linkedDriver =
  drivers.find((d) => d.userId === driver.user.id) ?? drivers[0];

// Every ticket needs at least one employee guiding it. This spec creates
// nothing and cleans up nothing, so the guide is BORROWED from the seeded
// roster rather than being a row this run would leave behind. Prefer one
// from the branch the ticket is filed under, and fall back to any active
// employee — the same shape as linkedDriver above, and safe because the
// server checks only that a guide is not archived, never that they belong
// to the ticket's branch.
const employees = listData(
  await apiGet(request, '/api/employees', admin.token)
);
const guide =
  employees.find((e) => e.branchId === branches[0].id) ?? employees[0];
expect(guide, 'a seeded employee is available to guide the trip').toBeTruthy();

const destination = `UI-E2E ${Date.now()}`;

// Requester submits → always born pending_admin_approval.
const created = await apiPost(request, '/api/trip-tickets', requester.token, {
  branchId: branches[0].id as string,
  driverId: linkedDriver.id as string,
  vehicleId: vehicle!.id as string,
  officeId: (offices[0]?.id as string) ?? null,
  officeHeadId: (heads[0]?.id as string) ?? null,
  destination,
  purpose: 'E2E UI lifecycle',
  dateRequested: new Date().toISOString(),
  participants: ['E2E'],
  participantsCount: 1,
  guideIds: [guide.id as string],
  preparedBy: 'E2E',
  requestedById: requester.user.id,
  startTs: new Date().toISOString(),
  endTs: new Date(Date.now() + 3_600_000).toISOString()
});
```

No import changes: `apiGet` and `listData` are already imported (lines 2-11). One participant plus one guide is two seats — inside every seeded van (the smallest holds 3).

```bash
pnpm --filter @mms/web exec playwright test e2e/trip-lifecycle.spec.ts
```

- [ ] **Step 19: Repair multi-date-trip.spec.ts — one lookup, three POSTs**

This spec books three tickets. Resolve the guide once with the other fixtures, then use it in all three.

**Edit 1 — after the `drivers` lookup at line 92, before the `vehicle` line at 94.** Insert:

```ts
// A guide is required on every booking and counts against the van's seats.
// Taken from the SEEDED roster: this spec's teardown handles the tickets it
// creates, and an employee has no hard-delete route to tear down at all
// (only archive/restore), so it borrows one rather than leaving one behind.
const employees = listData(
  await apiGet(request, '/api/employees', admin.token)
);
const guide =
  employees.find((e) => e.branchId === branches[0].id) ?? employees[0];
```

and extend the assertion block just below it — after `expect(vehicle, ...)` at line 95 add:

```ts
expect(guide, 'a seeded employee is available to guide the trips').toBeTruthy();
```

**Edit 2 — the two-date booking, lines 124-125.** Replace:

```ts
        participants: ['E2E'],
        participantsCount: 1,
```

with:

```ts
        participants: ['E2E'],
        participantsCount: 1,
        guideIds: [guide.id as string],
```

**Edit 3 — the gap-day booking, lines 197-198.** Replace:

```ts
      participants: ['E2E'],
      participantsCount: 1,
```

with:

```ts
      participants: ['E2E'],
      participantsCount: 1,
      guideIds: [guide.id as string],
```

**Edit 4 — the freed-window booking, lines 257-258.** Identical replacement to Edit 3 (the indentation matches Edit 3, not Edit 2 — the first booking is nested one level deeper).

All three carry one participant and one guide against the same van, so nothing here approaches capacity, and none of the three windows moves.

```bash
pnpm --filter @mms/web exec playwright test e2e/multi-date-trip.spec.ts
```

- [ ] **Step 20: Repair organization.spec.ts — borrow the guide, never create one on the branch under test**

This is the branch-archive spec, so its failure reads as an organization bug rather than a guides bug. It is also the one place where the _obvious_ fix is wrong: this test archives its own branch at line 527 and asserts that archive succeeds. `branchBlockers` now counts a branch's active employees, so creating the guide on that new branch would make the archive fail with `409 IN_USE` — a self-inflicted failure two hundred lines away from the edit that caused it.

**Edit — lines 470-503.** Replace:

```ts
// A branch created a moment ago owns no vehicles and no drivers, so the
// ticket borrows them from the seeded fleet. That is a supported workflow
// and has no bearing on the branch/office names being asserted.
const vehicles = listData(await apiGet(request, '/api/vehicles', admin.token));
const drivers = listData(await apiGet(request, '/api/drivers', admin.token));
const vehicle = vehicles.find((v) => v.status === 'available') ?? vehicles[0];
expect(vehicle, 'a vehicle exists to file the ticket against').toBeTruthy();
expect(drivers[0], 'a driver exists to file the ticket against').toBeTruthy();
```

with:

```ts
// A branch created a moment ago owns no vehicles, no drivers and no staff, so
// the ticket borrows all three from the seeded fleet and roster. That is a
// supported workflow and has no bearing on the branch/office names being
// asserted.
//
// The guide in particular must NOT be created on the new branch: this test
// archives that branch below, and branchBlockers counts a branch's ACTIVE
// employees — one of our own would refuse the archive with 409 IN_USE and
// fail this test two hundred lines from the line that caused it. Borrowing
// is legitimate: the server validates only that a guide is not archived,
// never that they belong to the ticket's branch.
const vehicles = listData(await apiGet(request, '/api/vehicles', admin.token));
const drivers = listData(await apiGet(request, '/api/drivers', admin.token));
const employees = listData(
  await apiGet(request, '/api/employees', admin.token)
);
const vehicle = vehicles.find((v) => v.status === 'available') ?? vehicles[0];
expect(vehicle, 'a vehicle exists to file the ticket against').toBeTruthy();
expect(drivers[0], 'a driver exists to file the ticket against').toBeTruthy();
expect(employees[0], 'an employee exists to guide the trip').toBeTruthy();
```

and in the POST body, replace lines 493-494:

```ts
    participants: ['E2E'],
    participantsCount: 1,
```

with:

```ts
    participants: ['E2E'],
    participantsCount: 1,
    guideIds: [employees[0].id as string],
```

The ticket is cancelled at line 511 before anything is archived, so the borrowed employee is only ever attached to a piece of history and never blocks anything.

```bash
pnpm --filter @mms/web exec playwright test e2e/organization.spec.ts
```

- [ ] **Step 21: Run the repaired e2e suite green, then commit**

```bash
pnpm --filter @mms/web test:e2e
```

All 17 pre-existing tests must pass (the repairs add none). If `multi-date-trip.spec.ts` fails with `VEHICLE_DOUBLE_BOOKED`, that is a leftover row from the failing runs in step 10, not a regression — the failed runs' `finally` blocks should have cleaned up, but check the console for the `multi-date-trip cleanup failed for …` lines they print before assuming otherwise.

```bash
git add apps/web/e2e/trip-lifecycle.spec.ts apps/web/e2e/multi-date-trip.spec.ts \
  apps/web/e2e/organization.spec.ts
git commit -m "test(e2e): give the trip-ticket fixtures a guide"
```

---

## Task 4: The Organization Employees tab

> **Corrections applied to this task — these override anything below that disagrees.**
>
> 1. **`e2e/organization.spec.ts` anchors:** the id arrays are at **31-32** (not 29-31) and the `test.afterAll` head is at **34** (not 33-34).
> 2. **This task must land before Tasks 5 and 6.** Task 5's guide picker reads `['employees', branchId]`; without the `useOrgInvalidation` employees branch added here, renaming or archiving an employee leaves that picker stale indefinitely. Task 6 creates its employee _through_ this tab.

**Files:**

- [test] apps/web/e2e/organization.spec.ts @ 29-31 (createdBranchIds/createdOfficeIds), 33-34 (test.afterAll head), 88-93 (selectTab), append after 575 (EOF) — Adds createdEmployeeIds + its archive-first cleanup loop, widens selectTab's name union to include 'Employees', and adds the create/validate/edit/archive/restore test for the new tab.
- [modify] apps/web/src/lib/api/organization.ts @ 1-13 (imports + OrgResource), 15-23 (OrgRecord), 25-32 (CreateOrgBody/UpdateOrgBody), 40-48 (BLOCKER_LABELS) — 'employees' joins the OrgResource union so listResource's `/${resource}` template hits GET /api/employees; OrgRecord gains position/phone; the create/update body unions gain the employee bodies; BLOCKER_LABELS gains the employees key so the archive dialog renders 'employee(s)' rather than the raw API key.
- [modify] apps/web/src/lib/query/organization.ts @ 11-13 — Adds useEmployeesAdmin() — orgQuery('employees'), keyed ['organization','employees'], includeArchived baked in like its three siblings.
- [modify] apps/web/src/lib/mutation/organization.ts @ 14-18 (LABELS), 29-32 (the prefix-match guard comment), 48-52 (the per-resource invalidation branches) — LABELS gains 'Employee' (toasts read 'Employee created/updated/archived/restored'); useOrgInvalidation gains the employees branch that keeps the booking form's guide picker from going stale forever; the guard comment is extended to name the employee twins the prefix carries.
- [modify] apps/web/src/components/pages/organization/index.tsx @ 6-14 (leading comment + PageHeader description), 24-27 (last TabsTrigger + </TabsList>), 34-37 (last TabsContent + </Tabs>) — Fourth TabsTrigger/TabsContent pair with className={ACTIVE_TAB}, and the PageHeader description updated from 'branches, offices and office heads' to include employees.
- [modify] apps/web/src/components/pages/organization/resource-tab.tsx @ 17-21 (query imports), 28 (Column union), 44-49 (RESOURCE_META tail), 55-64 (component comment + hook calls), 72-77 (query selector), 97-98 (the Location cell case) — RESOURCE_META.employees ({ title: 'Employees', addLabel: 'Add Employee', columns: ['Name','Position','Branch'] }), 'Position' added to Column, useEmployeesAdmin() called, the query ternary extended to a fourth arm, and the Position cell renderer added.
- [modify] apps/web/src/components/pages/organization/record-dialog.tsx @ 30-34 (shared type imports), 49-53 (RESOURCE_LABELS), 55-64 (schema/FormData/FieldKey), 65-75 (FieldConfig), 85-93 (defaultsFor), 143-147 + 149-158 + 160-164 + 180-187 (toBody), 215-218 (useForm), 223-226 (hydration effect), 228-240 (onSubmit), 288-309 (the fields switch tail), 336-339 (FieldLabel), 362-363 (the NONE SelectItem) — case 'employees' FieldConfig (name required text, position optional text, phone optional text, branch REQUIRED select via withCurrent), a required-aware schema, a required-aware defaultsFor, the employees create/update arms of toBody, and the two render tweaks a required select needs.

**Interfaces:**

_Produces:_

- apps/web/src/lib/api/organization.ts: export type OrgResource = 'branches' | 'offices' | 'office-heads' | 'employees'
- apps/web/src/lib/api/organization.ts: export interface OrgRecord { id: string; name: string; archivedAt: string | null; location?: string | null; branchId?: string | null; headId?: string | null; officeId?: string | null; position?: string | null; phone?: string | null }
- apps/web/src/lib/api/organization.ts: export type CreateOrgBody = CreateBranchBody | CreateOfficeBody | CreateOfficeHeadBody | CreateEmployeeBody
- apps/web/src/lib/api/organization.ts: export type UpdateOrgBody = UpdateBranchBody | UpdateOfficeBody | UpdateOfficeHeadBody | UpdateEmployeeBody
- apps/web/src/lib/api/organization.ts: BLOCKER_LABELS (module-private) gains employees: ['employee', 'employees']
- apps/web/src/lib/query/organization.ts: export const useEmployeesAdmin: () => UseQueryResult<OrgRecord[], Error> — queryKey ['organization', 'employees'], fetched with includeArchived=true
- apps/web/src/lib/mutation/organization.ts: useOrgInvalidation now also invalidates queryKey ['employees'] (prefix match) for resource 'employees'; LABELS.employees = 'Employee'
- apps/web/src/components/pages/organization/resource-tab.tsx: <ResourceTab resource="employees" /> renders columns Name | Position | Branch
- apps/web/src/components/pages/organization/record-dialog.tsx: FieldConfig gains `required?: boolean`; `schemaFor(resource: OrgResource)` returns the employees-aware zod schema; `defaultsFor(record: OrgRecord | null, resource: OrgResource): FormData` (signature CHANGED — second parameter added)

_Consumes:_

- @mms/shared: export type CreateEmployeeBody = { name: string; position?: string | null; phone?: string | null; branchId: string } (z.infer of createEmployeeBodySchema — branchId NON-nullable, position/phone via nullableString)
- @mms/shared: export type UpdateEmployeeBody = Partial<CreateEmployeeBody> (z.infer of createEmployeeBodySchema.partial())
- API GET /api/employees?includeArchived=true -> { data: Array<{ id: string; name: string; position: string | null; phone: string | null; branchId: string; archivedAt: string | null; createdAt: string; updatedAt: string }>; count: number } — requireAuth only
- API POST /api/employees (body CreateEmployeeBody) -> the employee row; admin only
- API PATCH /api/employees/:id (body UpdateEmployeeBody) -> the employee row; admin only
- API POST /api/employees/:id/archive -> the employee row; 409 IN_USE with details.blockers when still on a live ticket; admin only
- API POST /api/employees/:id/restore -> the employee row; admin only
- apps/api/src/modules/organization/guard.ts: branchBlockers emits a blocker whose `resource` key is exactly the string 'employees' (BLOCKER_LABELS is keyed on it)

**Before you start — gotchas found while drafting this task:**

- THE ONE EDIT TSC CANNOT CATCH: the `const query = resource === 'branches' ? ... : headsQuery` ternary at resource-tab.tsx:72-77. Leave it at three arms and the Employees tab silently renders the OFFICE HEADS list — no type error, no runtime error. Everything else is compiler-enforced: RESOURCE_META (Record<OrgResource,…>), LABELS, RESOURCE_LABELS, and both exhaustive switches in record-dialog.tsx (a missing case makes the function return `| undefined`, which fails against its declared return type).
- The NONE sentinel does NOT extend to a required select. Verified in @radix-ui/react-select@2.2.x's dist/index.mjs: `function shouldShowPlaceholder(value) { return value === "" || value === void 0; }`. So a value of 'none' with no matching SelectItem renders a COMPLETELY BLANK trigger — not the placeholder — which is the same defect the withCurrent comment at record-dialog.tsx:95-103 documents. Hence two coupled changes: defaultsFor seeds '' for employees' branchId, and the None SelectItem is suppressed when `f.required`. Changing one without the other is a silent UI break.
- schemaFor uses `schema.superRefine(...)` and NOT `schema.extend({ branchId: ... })` for a type reason, verified by compiling the exact code with `pnpm --filter @mms/web exec tsc -b` (exit 0). `.extend()` yields a SECOND ZodObject type, and zodResolver's `Zod3Type<Output, Input>` overload does not infer a union of two schemas cleanly against `useForm<FormData>`. superRefine returns one ZodEffects<typeof schema, FormData, FormData>, whose \_input/\_output are exactly FormData. Also note `z.ZodType<FormData>` is NOT a valid annotation here — zodResolver requires `_def: { typeName: string }`, which bare ZodTypeDef does not have.
- Accepted wart from superRefine: a ZodEffects refinement runs only when the inner object parse succeeds. Submitting an employee with BOTH a blank name and no branch shows only 'Name is required' on the first submit and 'Branch is required' on the second. Both fields carry ` *` in their labels, so this is a second-click annoyance rather than a dead end. Worth a line in review.
- The useOrgInvalidation employees branch is the design's explicitly named easy omission (§9.1, and §243 quotes the guard comment). That guard comment is at lib/mutation/organization.ts:28-37, and its load-bearing sentence is: 'Naming the twins again below would be a no-op; this comment is the guard against someone re-keying them out from under the prefix.' The single `['employees']` invalidation is a PREFIX match and therefore also reaches the branch-scoped picker's ['employees', <branchId>] that Task 5 adds — do not add those keys again, and do not re-key them.
- defaultsFor's signature CHANGES (it gains a `resource` parameter). It has exactly three call sites, all inside RecordDialog: line 217 (useForm defaultValues), line 224 (the hydration effect), and line 234 (the `original` snapshot handed to toBody). Miss the third and every PATCH diffs against a snapshot built with the wrong branch default, which for employees would resend an untouched branchId and re-trigger assertOrgRefsActive — the exact hazard the comment at record-dialog.tsx:115-127 exists to prevent.
- apps/web has no `typecheck` script (only `build: tsc -b && vite build`), and apps/api has no `lint` script. Baselines were confirmed green on the untouched tree before drafting: `pnpm --filter @mms/web exec tsc -b` exit 0 and `pnpm --filter @mms/web exec eslint .` exit 0.
- `tsc -b` does not cover apps/web/e2e — tsconfig.app.json includes only `src`, tsconfig.node.json only `vite.config.ts`. `eslint .` does cover it, but with tseslint's non-type-checked `recommended` config, and Playwright transpiles via esbuild without typechecking. A type error in the spec surfaces only as a runtime failure.
- MERGE COLLISION WARNING: design §12 lists organization.spec.ts:493-494 (the `POST /api/trip-tickets` inside the last test) as a fixture that must gain `guideIds` once guides become required. That is Task 5's edit to the SAME FILE this task appends to. Expect to rebase; the two hunks are far apart (line ~493 vs. EOF at 575) so it should be mechanical.
- Screenshot numbering: organization.spec.ts already ends with `shot(page, 'organization-6-archived-parents-still-named')`, so the new test starts at organization-7. Reusing 6 would silently overwrite an existing screenshot.
- ResourceTab now issues four admin list requests on every tab (hooks cannot be called conditionally, and only one ResourceTab is mounted at a time because Radix unmounts inactive TabsContent). Employees adds a request that only the Employees tab reads. Cheap and cached, consistent with the existing comment, but it is a real fourth round-trip.
- Under-specified in the spec and decided here: the design says only 'branch (required select)' and does not say where the requirement is enforced client-side, nor what the error text is. This task enforces it in the dialog with the message 'Branch is required' and drops the None option; the e2e asserts both. If a reviewer prefers letting the API answer with a 400, the schemaFor/required/defaultsFor trio all come back out together.
- Also under-specified: §9.1 lists the RESOURCE_META columns as ['Name','Position','Branch'] but names no ordering for the dialog's fields. This task orders them Name, Position, Phone, Branch — text fields first, the picker last, matching how office-heads puts Name before its two selects.
- The design's §13.2 limit applies from day one: this tab has no search and no pagination, and getOrgRecords sends no page/limit, so a branch roster of a few hundred employees renders as one unpaginated table. Recorded, not solved here.

### Steps

- [ ] **Step 1: Scaffold the e2e spec for a fourth tab: cleanup list + selectTab union**

Two small edits to `apps/web/e2e/organization.spec.ts` before the test itself, so the test in the next step compiles and cleans up after itself.

**1. Cleanup list + an archive-first loop.** The spec's `afterAll` archives offices then branches; employees have to go first, because `branchBlockers` counts an ACTIVE employee (design §10).

CURRENT (lines 30-36):

```ts
const createdBranchIds: string[] = [];
const createdOfficeIds: string[] = [];

test.afterAll(async ({ request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);

  for (const id of createdOfficeIds) {
```

REPLACEMENT:

```ts
const createdBranchIds: string[] = [];
const createdOfficeIds: string[] = [];
// Employees archive FIRST: branchBlockers counts an ACTIVE employee, so a
// branch this spec created cannot close while one is still on its roster.
const createdEmployeeIds: string[] = [];

test.afterAll(async ({ request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);

  for (const id of createdEmployeeIds) {
    try {
      const r = await apiPost(
        request,
        `/api/employees/${id}/archive`,
        admin.token,
        {}
      );
      // 409 here just means a test already archived it — not a cleanup failure.
      if (!r.ok && r.status !== 409) {
        console.error(
          `organization cleanup: archiving employee ${id} failed (HTTP ${r.status})`
        );
      }
    } catch (err) {
      console.error(
        `organization cleanup: archiving employee ${id} threw:`,
        err
      );
    }
  }

  for (const id of createdOfficeIds) {
```

**2. Widen the local `selectTab` helper.**

CURRENT (lines 88-93):

```ts
async function selectTab(
  page: Page,
  name: 'Branches' | 'Offices' | 'Office Heads'
): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
}
```

REPLACEMENT:

```ts
async function selectTab(
  page: Page,
  name: 'Branches' | 'Offices' | 'Office Heads' | 'Employees'
): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
}
```

Nothing else in the file changes. `branchGroup(dialog)` (lines 118-120) is reused as-is by the next step: it filters `getByRole('group')` on `hasText: 'Branch'`, and the employees dialog's four field groups are Name / Position / Phone / Branch, so only one matches.

- [ ] **Step 2: Write the failing e2e test for the Employees tab**

Append this test to the end of `apps/web/e2e/organization.spec.ts` (currently 575 lines; the file's last statement is the `'a trip ticket filed under a branch and office that have since closed…'` test ending at line 575). Screenshot numbering continues from `organization-6-archived-parents-still-named`, which that test already takes.

```ts
// The fourth tab (design §9.1). Everything here is ResourceTab configuration
// except one thing that is not: Employee.branchId is NOT NULL, so this is the
// only picker on the page that is required, offers no "None", and has to be
// refused in the dialog rather than by the API.
test('admin adds a branch employee, edits it, and archives it away', async ({
  page,
  request
}) => {
  await login(page, 'admin');
  const stamp = Date.now();
  const employeeName = `E2E Guide ${stamp}`;
  const renamedName = `${employeeName} Renamed`;

  await goToOrganization(page);
  await selectTab(page, 'Employees');

  // ---------- Create: the branch is REQUIRED, unlike every other picker here ----------
  await page.getByRole('button', { name: 'Add Employee' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Create a new employee.')).toBeVisible({
    timeout: 15_000
  });
  await dialog.locator('#name').fill(employeeName);
  await dialog.locator('#position').fill('Tour Guide');
  await dialog.locator('#phone').fill('09171234567');

  // Design §4.3: a branchless employee would appear in no branch's guide
  // picker at all, with no error anywhere — so the dialog refuses the submit
  // and stays open rather than letting the API answer.
  await dialog.getByRole('button', { name: 'Add Employee' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Branch is required')).toBeVisible({
    timeout: 15_000
  });

  await branchGroup(dialog).getByRole('combobox').click();
  // A required select offers no "None": the NONE sentinel the three nullable
  // pickers use would be a click straight into the error above.
  await expect(
    page.getByRole('option', { name: 'None', exact: true })
  ).toHaveCount(0);
  await page.getByRole('option', { name: 'Main Branch', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add Employee' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const row = page.getByRole('row').filter({ hasText: employeeName });
  await expect(row).toBeVisible({ timeout: 15_000 });
  // The three columns RESOURCE_META declares for this tab.
  await expect(row).toContainText('Tour Guide');
  await expect(row).toContainText('Main Branch');
  await shot(page, 'organization-7-employee-created');

  // The UI never shows the id, and cleanup needs it.
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const created = listData(
    await apiGet(request, '/api/employees?includeArchived=true', admin.token)
  ).find((e) => e.name === employeeName);
  expect(created, 'the created employee resolves via the API').toBeTruthy();
  createdEmployeeIds.push(created!.id as string);
  expect(created!.position, 'position round-trips').toBe('Tour Guide');
  expect(created!.phone, 'phone round-trips').toBe('09171234567');

  // ---------- Edit: rename only, leaving the branch untouched ----------
  await row.getByRole('button', { name: 'Edit' }).click();
  await expect(dialog.getByText('Update this employee.')).toBeVisible({
    timeout: 15_000
  });
  await expect(branchGroup(dialog).getByRole('combobox')).toContainText(
    'Main Branch'
  );
  await dialog.locator('#name').fill(renamedName);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const renamedRow = page.getByRole('row').filter({ hasText: renamedName });
  await expect(renamedRow).toBeVisible({ timeout: 15_000 });
  // The PATCH sent only `name`, so the branch is still resolved in its column.
  await expect(renamedRow).toContainText('Main Branch');

  const after = listData(
    await apiGet(request, '/api/employees?includeArchived=true', admin.token)
  ).find((e) => e.id === created!.id);
  expect(
    after?.branchId,
    "the employee's branch is unchanged by the rename"
  ).toBe(created!.branchId);

  // ---------- Archive, then restore ----------
  await renamedRow.getByRole('button', { name: 'Archive' }).click();
  const archiveDialog = page.getByRole('alertdialog');
  await expect(archiveDialog).toContainText(`Archive "${renamedName}"?`);
  await archiveDialog
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await expect(archiveDialog).toBeHidden({ timeout: 15_000 });
  await expect(renamedRow.getByText('Archived')).toBeVisible({
    timeout: 15_000
  });
  await shot(page, 'organization-8-employee-archived');

  await renamedRow.getByRole('button', { name: 'Restore' }).click();
  await expect(renamedRow.getByText('Archived')).toHaveCount(0, {
    timeout: 15_000
  });
  await expect(renamedRow.getByRole('button', { name: 'Archive' })).toBeVisible(
    { timeout: 15_000 }
  );
});
```

No new imports: `login`, `shot`, `CREDENTIALS`, `apiLogin`, `apiGet`, `apiPost` and `listData` are all already imported at lines 2-10, and `goToOrganization`, `selectTab` and `branchGroup` are local to this file.

- [ ] **Step 3: Run the test and confirm it fails for the right reason**

The suite drives the already-running app — `playwright.config.ts:5-7` says so explicitly (web on `http://localhost:5173`, API on `http://localhost:3001`). Start the stack in a second terminal first:

```
pnpm dev
```

Then, from the repo root:

```
pnpm --filter @mms/web exec playwright test e2e/organization.spec.ts -g "branch employee"
```

Expected failure — there is no fourth tab yet, so `selectTab(page, 'Employees')` never finds its target and the default 30s test timeout expires inside the click:

```
  1) [chromium] › e2e\organization.spec.ts:577:1 › admin adds a branch employee, edits it, and archives it away

    Error: locator.click: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for getByRole('tab', { name: 'Employees', exact: true })

  1 failed
```

The load-bearing line is `waiting for getByRole('tab', { name: 'Employees', exact: true })`. If you instead see a failure at `getByRole('button', { name: 'Add Employee' })` or a 404 from `/api/employees`, the API slices (A–C) are not in the tree yet — this task cannot go green without them.

- [ ] **Step 4: Extend the OrgResource union, OrgRecord and BLOCKER_LABELS**

`apps/web/src/lib/api/organization.ts`. There is **no** fetch/shape-mapping switch in this file: `listResource` (lines 65-74) builds `/${resource}`, so `'employees'` resolves to `GET /api/employees` with no further edit, and the four write helpers (lines 81-100) follow the same template. Only the types and the label map change.

**1. Imports and the union.** CURRENT (lines 1-13):

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
```

REPLACEMENT:

```ts
import { api, ApiError } from './client';
import type {
  CreateBranchBody,
  CreateOfficeBody,
  CreateOfficeHeadBody,
  CreateEmployeeBody,
  UpdateBranchBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody,
  UpdateEmployeeBody
} from '@mms/shared';

// The four tabs are the same table with different columns, so one union keeps
// the mutation hooks from being written four times.
export type OrgResource = 'branches' | 'offices' | 'office-heads' | 'employees';
```

(That union line is exactly 80 characters — prettier keeps it on one line; do not pre-wrap it.)

**2. OrgRecord.** CURRENT (lines 15-23):

```ts
export interface OrgRecord {
  id: string;
  name: string;
  archivedAt: string | null;
  location?: string | null;
  branchId?: string | null;
  headId?: string | null;
  officeId?: string | null;
}
```

REPLACEMENT:

```ts
export interface OrgRecord {
  id: string;
  name: string;
  archivedAt: string | null;
  location?: string | null;
  branchId?: string | null;
  headId?: string | null;
  officeId?: string | null;
  // Employees only, and optional for the same reason every field above it is:
  // one record type covers four tables and each tab reads the subset it has.
  position?: string | null;
  phone?: string | null;
}
```

**3. Body unions.** CURRENT (lines 25-32):

```ts
export type CreateOrgBody =
  | CreateBranchBody
  | CreateOfficeBody
  | CreateOfficeHeadBody;
export type UpdateOrgBody =
  | UpdateBranchBody
  | UpdateOfficeBody
  | UpdateOfficeHeadBody;
```

REPLACEMENT:

```ts
export type CreateOrgBody =
  | CreateBranchBody
  | CreateOfficeBody
  | CreateOfficeHeadBody
  | CreateEmployeeBody;
export type UpdateOrgBody =
  | UpdateBranchBody
  | UpdateOfficeBody
  | UpdateOfficeHeadBody
  | UpdateEmployeeBody;
```

**4. Blocker labels.** Without this, `describeBlockers` falls through to its `: resource` branch (line 60) and the archive dialog reads "1 employees". CURRENT (lines 39-48):

```ts
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
```

REPLACEMENT:

```ts
// What the API means by each blocker key, singular and plural.
const BLOCKER_LABELS: Record<string, [string, string]> = {
  vehicles: ['vehicle', 'vehicles'],
  drivers: ['driver', 'drivers'],
  users: ['user', 'users'],
  departmentOffices: ['department office', 'department offices'],
  officeHeads: ['office head', 'office heads'],
  employees: ['employee', 'employees'],
  tripTickets: ['active trip ticket', 'active trip tickets'],
  jobOrders: ['open job order', 'open job orders']
};
```

- [ ] **Step 5: Add the useEmployeesAdmin query hook**

`apps/web/src/lib/query/organization.ts`. `orgQuery` (lines 6-9) already bakes in `includeArchived: true` and the `['organization', resource]` key, so this is one line.

CURRENT (lines 11-13):

```ts
export const useBranchesAdmin = () => useQuery(orgQuery('branches'));
export const useOfficesAdmin = () => useQuery(orgQuery('offices'));
export const useOfficeHeadsAdmin = () => useQuery(orgQuery('office-heads'));
```

REPLACEMENT:

```ts
export const useBranchesAdmin = () => useQuery(orgQuery('branches'));
export const useOfficesAdmin = () => useQuery(orgQuery('offices'));
export const useOfficeHeadsAdmin = () => useQuery(orgQuery('office-heads'));
export const useEmployeesAdmin = () => useQuery(orgQuery('employees'));
```

Hook order follows tab order, matching the existing file.

- [ ] **Step 6: Add the LABELS entry and — the easy omission — the useOrgInvalidation branch**

`apps/web/src/lib/mutation/organization.ts`. Two edits plus one comment amendment. Design §9.1 calls the invalidation branch out by name: without it, renaming or archiving an employee leaves the booking form's guide picker stale indefinitely.

**1. LABELS.** This one _is_ caught by the compiler — it is `Record<OrgResource, string>`, so widening the union without it is an error. CURRENT (lines 14-18):

```ts
const LABELS: Record<OrgResource, string> = {
  branches: 'Branch',
  offices: 'Office',
  'office-heads': 'Office head'
};
```

REPLACEMENT:

```ts
const LABELS: Record<OrgResource, string> = {
  branches: 'Branch',
  offices: 'Office',
  'office-heads': 'Office head',
  employees: 'Employee'
};
```

**2. The guard comment.** This is the comment §9.1 points at — it exists precisely so nobody re-keys a picker out from under the prefix match. It has to learn about the employee keys. CURRENT (lines 29-32):

```ts
// These invalidations are PREFIX matches (TanStack's default is
// exact: false), which is what carries the archived-inclusive display
// twins with them: ['branches'] also invalidates ['branches', 'all'], and
// ['departmentOffices'] also invalidates ['departmentOffices', 'all'].
```

REPLACEMENT:

```ts
// These invalidations are PREFIX matches (TanStack's default is
// exact: false), which is what carries the archived-inclusive display
// twins with them: ['branches'] also invalidates ['branches', 'all'],
// ['departmentOffices'] also invalidates ['departmentOffices', 'all'], and
// ['employees'] reaches BOTH ['employees', 'all'] and the branch-scoped
// guide picker's ['employees', <branchId>].
```

**3. The branch itself.** CURRENT (lines 48-52):

```ts
    if (resource === 'offices')
      queryClient.invalidateQueries({ queryKey: ['departmentOffices'] });
    if (resource === 'office-heads')
      queryClient.invalidateQueries({ queryKey: ['officeHeads'] });
  };
```

REPLACEMENT:

```ts
    if (resource === 'offices')
      queryClient.invalidateQueries({ queryKey: ['departmentOffices'] });
    if (resource === 'office-heads')
      queryClient.invalidateQueries({ queryKey: ['officeHeads'] });
    // Without this the booking form's guide picker keeps offering an employee
    // who was just renamed, archived or moved to another branch, for as long
    // as the tab stays open (design §9.1).
    if (resource === 'employees')
      queryClient.invalidateQueries({ queryKey: ['employees'] });
  };
```

Nothing else in the file changes: all four mutation hooks (lines 55-106) read `LABELS[resource]` and call `invalidate()` generically.

- [ ] **Step 7: Add the fourth tab to the Organization page**

`apps/web/src/components/pages/organization/index.tsx`.

**1. Comment + PageHeader description.** CURRENT (lines 6-14):

```tsx
// Branches, Offices and Office Heads are the same table shape wearing
// different columns, so one tab control switches between three ResourceTab
// instances rather than three separate pages.
const Organization = () => (
  <div>
    <PageHeader
      title="Organization"
      description="Manage the branches, offices and office heads used across the app."
    />
```

REPLACEMENT:

```tsx
// Branches, Offices, Office Heads and Employees are the same table shape
// wearing different columns, so one tab control switches between four
// ResourceTab instances rather than four separate pages.
const Organization = () => (
  <div>
    <PageHeader
      title="Organization"
      description="Manage the branches, offices, office heads and employees used across the app."
    />
```

**2. The trigger.** CURRENT (lines 24-27):

```tsx
        <TabsTrigger value="office-heads" className={ACTIVE_TAB}>
          Office Heads
        </TabsTrigger>
      </TabsList>
```

REPLACEMENT:

```tsx
        <TabsTrigger value="office-heads" className={ACTIVE_TAB}>
          Office Heads
        </TabsTrigger>
        <TabsTrigger value="employees" className={ACTIVE_TAB}>
          Employees
        </TabsTrigger>
      </TabsList>
```

**3. The content.** CURRENT (lines 34-37):

```tsx
      <TabsContent value="office-heads" className="mt-6">
        <ResourceTab resource="office-heads" />
      </TabsContent>
    </Tabs>
```

REPLACEMENT:

```tsx
      <TabsContent value="office-heads" className="mt-6">
        <ResourceTab resource="office-heads" />
      </TabsContent>
      <TabsContent value="employees" className="mt-6">
        <ResourceTab resource="employees" />
      </TabsContent>
    </Tabs>
```

`ACTIVE_TAB` is the shared string from `@/components/shared/view-tabs` (already imported at line 2) — it exists exactly so a second tab control matches the asset lists' look without redefining the classes (`view-tabs.tsx:14-17`).

- [ ] **Step 8: Teach ResourceTab about employees: RESOURCE_META, the Column union, the query and the cell**

`apps/web/src/components/pages/organization/resource-tab.tsx`. Five edits.

**1. Import the hook.** CURRENT (lines 17-21):

```ts
import {
  useBranchesAdmin,
  useOfficesAdmin,
  useOfficeHeadsAdmin
} from '@/lib/query/organization';
```

REPLACEMENT:

```ts
import {
  useBranchesAdmin,
  useOfficesAdmin,
  useOfficeHeadsAdmin,
  useEmployeesAdmin
} from '@/lib/query/organization';
```

**2. The Column union.** CURRENT (line 28):

```ts
type Column = 'Name' | 'Location' | 'Branch' | 'Office' | 'Office Head';
```

REPLACEMENT:

```ts
type Column =
  | 'Name'
  | 'Location'
  | 'Position'
  | 'Branch'
  | 'Office'
  | 'Office Head';
```

**3. RESOURCE_META.** It is `Record<OrgResource, …>`, so this one is compiler-enforced. CURRENT (lines 44-49):

```ts
  'office-heads': {
    title: 'Office Heads',
    addLabel: 'Add Office Head',
    columns: ['Name', 'Branch', 'Office']
  }
};
```

REPLACEMENT:

```ts
  'office-heads': {
    title: 'Office Heads',
    addLabel: 'Add Office Head',
    columns: ['Name', 'Branch', 'Office']
  },
  employees: {
    title: 'Employees',
    addLabel: 'Add Employee',
    columns: ['Name', 'Position', 'Branch']
  }
};
```

The title drives the empty state ("No employees found", line 203) and the error state ("Error loading employees", line 140); `addLabel` drives the page button, which must read the same as the dialog's submit button (`Add ${resourceLabel}`) — it does.

**4. Comment + the fourth hook call.** CURRENT (lines 55-65):

```ts
// One table for all three tabs: which columns render and where each row's
// data comes from is driven by RESOURCE_META, not three near-duplicate
// components. All three admin lists are fetched unconditionally regardless of
// which resource this instance shows — Offices and Office Heads both need to
// resolve names from the other two lists, and react-query dedupes the
// requests a sibling tab already made.
export function ResourceTab({ resource }: ResourceTabProps) {
  const branchesQuery = useBranchesAdmin();
  const officesQuery = useOfficesAdmin();
  const headsQuery = useOfficeHeadsAdmin();
  const restore = useRestoreOrgRecord(resource);
```

REPLACEMENT:

```ts
// One table for all four tabs: which columns render and where each row's
// data comes from is driven by RESOURCE_META, not four near-duplicate
// components. All four admin lists are fetched unconditionally regardless of
// which resource this instance shows — Offices and Office Heads both need to
// resolve names from the other lists, hooks cannot be called conditionally
// anyway, and react-query dedupes the requests a sibling tab already made.
export function ResourceTab({ resource }: ResourceTabProps) {
  const branchesQuery = useBranchesAdmin();
  const officesQuery = useOfficesAdmin();
  const headsQuery = useOfficeHeadsAdmin();
  const employeesQuery = useEmployeesAdmin();
  const restore = useRestoreOrgRecord(resource);
```

**5. The query selector — the one edit tsc will NOT catch.** Leave this ternary at three arms and the Employees tab silently renders the office-head list, with no type error anywhere. CURRENT (lines 72-77):

```ts
const query =
  resource === 'branches'
    ? branchesQuery
    : resource === 'offices'
      ? officesQuery
      : headsQuery;
```

REPLACEMENT:

```ts
const query =
  resource === 'branches'
    ? branchesQuery
    : resource === 'offices'
      ? officesQuery
      : resource === 'office-heads'
        ? headsQuery
        : employeesQuery;
```

**6. The Position cell.** The Branch case (lines 99-102) already resolves through `branchesById`, so employees' Branch column works unchanged. CURRENT (lines 97-98):

```ts
      case 'Location':
        return record.location || '—';
```

REPLACEMENT (note the em dash, copied from the existing cases):

```ts
      case 'Location':
        return record.location || '—';
      case 'Position':
        return record.position || '—';
```

- [ ] **Step 9: Add the employees case to the record dialog, with a REQUIRED branch select**

`apps/web/src/components/pages/organization/record-dialog.tsx`. This is the only file in the task with real logic, because `Employee.branchId` is the one NOT-NULL parent reference on this page.

**On the NONE sentinel.** `NONE = 'none'` (line 47) exists because Radix forbids an empty-string `SelectItem` value, and it means "no parent" for the three nullable pickers. It does **not** apply to a required select, for a concrete reason: Radix's `shouldShowPlaceholder(value)` is `value === '' || value === undefined` (verified in `@radix-ui/react-select@2.2.x`'s `dist/index.mjs`). Seed a required branch select with `NONE` and then omit the `None` item, and the trigger renders **completely blank** — not the placeholder — which is the exact defect the `withCurrent` comment at lines 95-103 documents. So a required select seeds `''`, and drops the `None` item.

**`withCurrent`'s real signature** (lines 104-113), reused verbatim for the branch options:

```ts
function withCurrent(
  active: OrgRecord[],
  currentId: string | null | undefined,
  all: OrgRecord[]
): OrgRecord[];
```

**1. Shared type import.** CURRENT (lines 30-34):

```ts
import type {
  UpdateBranchBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody
} from '@mms/shared';
```

REPLACEMENT:

```ts
import type {
  UpdateBranchBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody,
  UpdateEmployeeBody
} from '@mms/shared';
```

**2. RESOURCE_LABELS** (compiler-enforced, `Record<OrgResource, string>`). CURRENT (lines 49-53):

```ts
const RESOURCE_LABELS: Record<OrgResource, string> = {
  branches: 'Branch',
  offices: 'Office',
  'office-heads': 'Office Head'
};
```

REPLACEMENT:

```ts
const RESOURCE_LABELS: Record<OrgResource, string> = {
  branches: 'Branch',
  offices: 'Office',
  'office-heads': 'Office Head',
  employees: 'Employee'
};
```

**3. Schema, FormData, FieldKey.** CURRENT (lines 55-64):

```ts
const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  location: z.string().optional(),
  branchId: z.string().optional(),
  headId: z.string().optional(),
  officeId: z.string().optional()
});
type FormData = z.infer<typeof schema>;

type FieldKey = 'name' | 'location' | 'branchId' | 'headId' | 'officeId';
```

REPLACEMENT:

```ts
const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  location: z.string().optional(),
  position: z.string().optional(),
  phone: z.string().optional(),
  branchId: z.string().optional(),
  headId: z.string().optional(),
  officeId: z.string().optional()
});
type FormData = z.infer<typeof schema>;

// Employee.branchId is NOT NULL (design §4.3: a branchless employee would
// appear in no branch's guide picker at all, with no error), so employees get
// one extra rule the other three resources do not have. It is a superRefine
// on the shared object rather than an .extend() of it deliberately: .extend()
// would produce a SECOND ZodObject type, and `zodResolver(a | b)` does not
// infer cleanly against useForm<FormData>. superRefine returns a single
// ZodEffects<typeof schema, FormData, FormData>, which does.
const schemaFor = (resource: OrgResource) =>
  schema.superRefine((data, ctx) => {
    if (resource === 'employees' && (!data.branchId || data.branchId === NONE))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branchId'],
        message: 'Branch is required'
      });
  });

type FieldKey =
  | 'name'
  | 'location'
  | 'position'
  | 'phone'
  | 'branchId'
  | 'headId'
  | 'officeId';
```

**4. FieldConfig gains `required`.** CURRENT (lines 65-75):

```ts
interface FieldConfig {
  key: FieldKey;
  label: string;
  kind: 'text' | 'select';
  /**
   * Active (non-archived) options for a select field, plus the record's
   * current value spliced back in if that parent has since been archived —
   * see `withCurrent`.
   */
  options?: OrgRecord[];
}
```

REPLACEMENT:

```ts
interface FieldConfig {
  key: FieldKey;
  label: string;
  kind: 'text' | 'select';
  /**
   * Active (non-archived) options for a select field, plus the record's
   * current value spliced back in if that parent has since been archived —
   * see `withCurrent`.
   */
  options?: OrgRecord[];
  /**
   * A select whose value may not be empty. It gets the ` *` the name field
   * carries, and it renders NO "None" item — the NONE sentinel is a value
   * schemaFor rejects, so offering it would be a click straight into an
   * error. Only employees' branch is required; every other parent here is
   * nullable on the API.
   */
  required?: boolean;
}
```

**5. defaultsFor.** CURRENT (lines 85-93):

```ts
function defaultsFor(record: OrgRecord | null): FormData {
  return {
    name: record?.name ?? '',
    location: record?.location ?? '',
    branchId: record?.branchId ?? NONE,
    headId: record?.headId ?? NONE,
    officeId: record?.officeId ?? NONE
  };
}
```

REPLACEMENT:

```ts
function defaultsFor(
  record: OrgRecord | null,
  resource: OrgResource
): FormData {
  return {
    name: record?.name ?? '',
    location: record?.location ?? '',
    position: record?.position ?? '',
    phone: record?.phone ?? '',
    // A required select falls back to '' rather than the NONE sentinel:
    // employees' branch picker deliberately renders no "None" item, and Radix
    // draws a value with no matching item as a BLANK trigger — not the
    // placeholder (shouldShowPlaceholder is `value === '' || undefined`).
    branchId: record?.branchId ?? (resource === 'employees' ? '' : NONE),
    headId: record?.headId ?? NONE,
    officeId: record?.officeId ?? NONE
  };
}
```

`idOrNull` (lines 77-78) already maps `''` to `null`, so nothing downstream needs a second guard.

**6. toBody — the derived locals.** CURRENT (lines 143-147):

```ts
const name = data.name.trim();
const location = textOrNull(data.location);
const branchId = idOrNull(data.branchId);
const headId = idOrNull(data.headId);
const officeId = idOrNull(data.officeId);
```

REPLACEMENT:

```ts
const name = data.name.trim();
const location = textOrNull(data.location);
const position = textOrNull(data.position);
const phone = textOrNull(data.phone);
const branchId = idOrNull(data.branchId);
const headId = idOrNull(data.headId);
const officeId = idOrNull(data.officeId);
```

**7. toBody — the create switch.** CURRENT (lines 149-158):

```ts
if (!original) {
  switch (resource) {
    case 'branches':
      return { name, location };
    case 'offices':
      return { name, branchId, headId };
    case 'office-heads':
      return { name, branchId, officeId };
  }
}
```

REPLACEMENT:

```ts
if (!original) {
  switch (resource) {
    case 'branches':
      return { name, location };
    case 'offices':
      return { name, branchId, headId };
    case 'office-heads':
      return { name, branchId, officeId };
    case 'employees':
      // CreateEmployeeBody.branchId is NOT nullable, and schemaFor's
      // employees rule rejects an unset branch before a submit ever reaches
      // here — the `?? ''` exists to satisfy the type, never to be sent.
      return { name, position, phone, branchId: branchId ?? '' };
  }
}
```

**8. toBody — the original-snapshot locals.** CURRENT (lines 160-164):

```ts
const origName = original.name.trim();
const origLocation = textOrNull(original.location);
const origBranchId = idOrNull(original.branchId);
const origHeadId = idOrNull(original.headId);
const origOfficeId = idOrNull(original.officeId);
```

REPLACEMENT:

```ts
const origName = original.name.trim();
const origLocation = textOrNull(original.location);
const origPosition = textOrNull(original.position);
const origPhone = textOrNull(original.phone);
const origBranchId = idOrNull(original.branchId);
const origHeadId = idOrNull(original.headId);
const origOfficeId = idOrNull(original.officeId);
```

**9. toBody — the update switch.** The only-changed-keys rule (lines 115-127) is what keeps an employee whose branch was since archived renamable. CURRENT (lines 180-187):

```ts
    case 'office-heads': {
      const body: UpdateOfficeHeadBody = {};
      if (name !== origName) body.name = name;
      if (branchId !== origBranchId) body.branchId = branchId;
      if (officeId !== origOfficeId) body.officeId = officeId;
      return body;
    }
  }
```

REPLACEMENT:

```ts
    case 'office-heads': {
      const body: UpdateOfficeHeadBody = {};
      if (name !== origName) body.name = name;
      if (branchId !== origBranchId) body.branchId = branchId;
      if (officeId !== origOfficeId) body.officeId = officeId;
      return body;
    }
    case 'employees': {
      const body: UpdateEmployeeBody = {};
      if (name !== origName) body.name = name;
      if (position !== origPosition) body.position = position;
      if (phone !== origPhone) body.phone = phone;
      // Guarded on truthiness as well as on change, because branchId is
      // `string` and not `string | null` on UpdateEmployeeBody: an employee
      // can be MOVED between branches but never unparented, matching the
      // NOT NULL column.
      if (branchId && branchId !== origBranchId) body.branchId = branchId;
      return body;
    }
  }
```

**10. The three defaultsFor / resolver call sites.** CURRENT (lines 215-218):

```ts
const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: defaultsFor(null)
});
```

REPLACEMENT:

```ts
const form = useForm<FormData>({
  resolver: zodResolver(schemaFor(resource)),
  defaultValues: defaultsFor(null, resource)
});
```

(Rebuilding the resolver each render is safe: react-hook-form assigns `control._options = props` on every render, so the current resolver is always the one that runs.)

CURRENT (line 224):

```ts
if (open) form.reset(defaultsFor(record));
```

REPLACEMENT:

```ts
if (open) form.reset(defaultsFor(record, resource));
```

CURRENT (line 234):

```ts
const body = toBody(resource, data, defaultsFor(record));
```

REPLACEMENT:

```ts
const body = toBody(resource, data, defaultsFor(record, resource));
```

**11. The fields switch.** CURRENT (lines 288-308):

```ts
      case 'office-heads':
        return [
          { key: 'name', label: 'Name', kind: 'text' },
          {
            key: 'branchId',
            label: 'Branch',
            kind: 'select',
            options: withCurrent(
              activeBranches,
              record?.branchId,
              branches ?? []
            )
          },
          {
            key: 'officeId',
            label: 'Office',
            kind: 'select',
            options: withCurrent(activeOffices, record?.officeId, offices ?? [])
          }
        ];
    }
```

REPLACEMENT:

```ts
      case 'office-heads':
        return [
          { key: 'name', label: 'Name', kind: 'text' },
          {
            key: 'branchId',
            label: 'Branch',
            kind: 'select',
            options: withCurrent(
              activeBranches,
              record?.branchId,
              branches ?? []
            )
          },
          {
            key: 'officeId',
            label: 'Office',
            kind: 'select',
            options: withCurrent(activeOffices, record?.officeId, offices ?? [])
          }
        ];
      case 'employees':
        return [
          { key: 'name', label: 'Name', kind: 'text' },
          { key: 'position', label: 'Position', kind: 'text' },
          { key: 'phone', label: 'Phone', kind: 'text' },
          {
            key: 'branchId',
            label: 'Branch',
            kind: 'select',
            // The only required parent on this page — no NONE item is drawn
            // for it, and defaultsFor seeds '' rather than the sentinel.
            required: true,
            options: withCurrent(
              activeBranches,
              record?.branchId,
              branches ?? []
            )
          }
        ];
    }
```

`activeBranches` is already computed at line 248 and needs no change. The employees dialog never reads `activeOffices` / `activeHeads`, which stay in use by the other two cases.

**12. The label asterisk.** CURRENT (lines 336-339):

```tsx
<FieldLabel htmlFor={f.key}>
  {f.label}
  {f.key === 'name' ? ' *' : ''}
</FieldLabel>
```

REPLACEMENT:

```tsx
<FieldLabel htmlFor={f.key}>
  {f.label}
  {f.key === 'name' || f.required ? ' *' : ''}
</FieldLabel>
```

**13. The NONE item.** CURRENT (lines 362-363):

```tsx
                          <SelectContent>
                            <SelectItem value={NONE}>None</SelectItem>
```

REPLACEMENT:

```tsx
                          <SelectContent>
                            {/* A required select offers no "None": NONE is a
                                value schemaFor rejects, so listing it would be
                                a click straight into a validation error. */}
                            {!f.required && (
                              <SelectItem value={NONE}>None</SelectItem>
                            )}
```

- [ ] **Step 10: Typecheck, lint and format**

`apps/web` has **no** `typecheck` script — the only tsc invocation is inside `build` — so run the compiler directly. Run all three from the repo root; each was verified green on the untouched tree first, so any output is yours.

```
pnpm --filter @mms/web exec tsc -b
pnpm --filter @mms/web exec eslint .
pnpm exec prettier --check apps/web/src/lib/api/organization.ts apps/web/src/lib/query/organization.ts apps/web/src/lib/mutation/organization.ts apps/web/src/components/pages/organization/index.tsx apps/web/src/components/pages/organization/resource-tab.tsx apps/web/src/components/pages/organization/record-dialog.tsx apps/web/e2e/organization.spec.ts
```

All three must print nothing and exit 0 (`prettier --check` prints `All matched files use Prettier code style!`).

Two things worth knowing about this gate:

- **`tsc -b` does not see the e2e directory.** `tsconfig.app.json` includes only `src` and `tsconfig.node.json` only `vite.config.ts`. `eslint .` _does_ cover `apps/web/e2e`, and Playwright transpiles with esbuild without typechecking — so a type mistake in the spec surfaces only at runtime.
- **If `tsc` cannot find `CreateEmployeeBody` / `UpdateEmployeeBody`**, Task 1 has not landed or `@mms/shared` has not been rebuilt. Rebuild it with `pnpm --filter @mms/shared build` and re-run.

- [ ] **Step 11: Run the e2e green, then verify by hand in the browser**

With `pnpm dev` still up:

```
pnpm --filter @mms/web exec playwright test e2e/organization.spec.ts -g "branch employee"
```

Expect `1 passed`. Then run the whole file to prove nothing else on the page regressed:

```
pnpm --filter @mms/web exec playwright test e2e/organization.spec.ts
```

**Browser check** — sign in at `http://localhost:5173/login` as `admin@mms.local` / `Password123!`, then sidebar → **Organization**:

1. The header subtitle now reads _"Manage the branches, offices, office heads and employees used across the app."_ and there are **four** tabs.
2. Click **Employees**. Column headers are `Name | Position | Branch | Actions`; with an empty table the row reads _"No employees found"_. (If it shows office heads instead, the query ternary in `resource-tab.tsx` was left at three arms — the one edit tsc cannot catch.)
3. **Add Employee** → the dialog title is _Add Employee_, description _Create a new employee._, fields **Name \***, Position, Phone, **Branch \***. Open the Branch select: it shows the placeholder _Select branch_ and there is **no "None" option**.
4. Fill only Name and press **Add Employee** → the dialog stays open and _Branch is required_ appears under the Branch field. Nothing is created.
5. Pick **Main Branch**, add a Position (`Tour Guide`) and a Phone, submit → toast _Employee created_; the row appears with its position and branch resolved.
6. **Edit** → change only the name → **Save Changes** → toast _Employee updated_; the Branch column is unchanged (the PATCH carried only `name`).
7. **Archive** → the alert dialog reads `Archive "<name>"?` → confirm → toast _Employee archived_; the row stays, greys out and shows the **Archived** badge. **Restore** → toast _Employee restored_, badge gone.
8. **Blocker-label regression** (needs the API guard change from the earlier slices): go to the **Branches** tab and try to archive **Main Branch** while an active employee sits on it. The blocked dialog must list _"1 employee"_ — a line reading _"1 employees"_ means `BLOCKER_LABELS` never got its `employees` key and `describeBlockers` fell through to the raw resource name.
9. **Invalidation** (the design's named trap, §9.1): the cheapest proof today is to open React Query Devtools, rename an employee on this tab, and watch every `['employees', …]` query invalidate alongside `['organization','employees']`. Once Task 5 lands, the real check is: open the booking form's Guides picker, rename the employee on this tab, reopen the picker — the new name must be there without a page reload.

- [ ] **Step 12: Commit**

Two commits, both taken from a green tree so neither lands red. Conventional Commits with a package scope; no AI attribution trailer, and no `git push` — pushing is manual.

```
git add apps/web/src/lib/api/organization.ts apps/web/src/lib/query/organization.ts apps/web/src/lib/mutation/organization.ts apps/web/src/components/pages/organization/index.tsx apps/web/src/components/pages/organization/resource-tab.tsx apps/web/src/components/pages/organization/record-dialog.tsx
git commit -m "feat(web): manage branch employees from the Organization page"

git add apps/web/e2e/organization.spec.ts
git commit -m "test(e2e): cover creating, editing and archiving a branch employee"
```

If the branch is `main`, branch first.

---

## Task 5: The booking form Guides picker, the ticket detail, and reassign

> **Corrections applied to this task — these override anything below that disagrees.**
>
> 1. **`NewTripTicket.guideIds` is REQUIRED, not optional.** The drafted `guideIds?: string[]` lets a caller omit it, compile cleanly, and 400 at runtime. `dates?` is legitimately optional because the legacy `startTs`/`endTs` path still works; guides have no such fallback. Declare it as:
>
>    ```ts
>    export type NewTripTicket = TablesInsert<'trip_tickets'> & {
>      dates?: { startTs: string; endTs: string }[];
>      /** REQUIRED by createTripTicketBodySchema (.min(1)). Not optional like
>       *  `dates` — there is no legacy fallback path for guides. */
>      guideIds: string[];
>    };
>    ```
>
> 2. **Empty `guideIds` is `400 VALIDATION_ERROR`, not `NO_GUIDES`.** Correct every comment in the drafted code that says otherwise. `NO_GUIDES` exists only on `POST /api/trip-tickets/:id/guides`.
> 3. **Pin the seat-counter template exactly**, so the component and the e2e assertion cannot drift:
>
>    ```tsx
>    `${namedCount + guideCount} of ${seats} seat${seats === 1 ? '' : 's'} (${guideCount} guide${guideCount === 1 ? '' : 's'})`;
>    ```
>
> 4. **Delete `useEmployeesForDisplay` and do not ship it.** Guides embed their employee through `tripTicketInclude`, so a ticket payload already carries the guide's _name_ — there is no bare-id to resolve. The branches and offices display twins exist because those payloads carry only ids. An exported hook with no caller is dead code.
> 5. **Two additions the drafts missed** — see Steps 13 and 14 at the end of this task. Without them, spec §8 and one of §1's goals ship unimplemented.

**Files:**

- [test] apps/web/e2e/trip-guides.spec.ts — RED-first test. apps/web has NO unit runner (package.json ships only test:e2e), so Playwright is the only harness that can fail first. Stages an employee via API, books a trip through the real form picking that employee as guide, asserts the seat counter counts the guide, reads the ticket back via API to prove guideIds survived mapCreateBody.
- [modify] apps/web/src/lib/api/shared.ts @ 1-2 imports; 25-38 getAllBranches (file ends at :38) — EmployeeRow + getEmployees(branchId?, includeArchived?) — the fetch behind both new hooks, sibling of getAllBranches.
- [modify] apps/web/src/lib/query/shared.ts @ 1-2 imports; 4-29 the useBranches/useBranchesForDisplay pair incl. the :23 rule comment (file ends at :29) — useEmployees(branchId?) — the picker hook, carrying the branches pair's NEVER-populate-a-form-control rule. NO display twin (correction 4).
- [modify] apps/web/src/lib/api/trip-tickets.ts @ 64-66 after dateToSnake; 98-99 participants on TripTicketApiResponse; 135-136 participants in toSnake; 182-199 TripTicketRequestBody; 205-224 mapCreateBody; 232-279 mapUpdateBody — TripGuideRow + api shape + mapper; guides on the read response and on toSnake; guideIds on the outgoing body and both mappings.
- [modify] apps/web/src/lib/types.ts @ 9 TripDateRow import; 85-94 TripTicket/NewTripTicket — TripTicket gains guides: TripGuideRow[] (forced — toSnake's typed return is what enforces every key); NewTripTicket gains guideIds?: string[] beside dates.
- [modify] apps/web/src/components/pages/trip-tickets/add-trip-ticket/actions.ts @ 80-86 purpose/participants block; 115-136 defaultValues; 150-160 submit mapping — guide_ids zod field (array of uuids, min 1), its default row, and the guide_ids -> guideIds rename at submit.
- [modify] apps/web/src/components/pages/trip-tickets/add-trip-ticket/form.tsx @ 13 import; 49-59 STEPS[1].fields; 139-141 seats; 175-176 namedCount/full; 200-202 tripBranchId; 240-244 officeHeadsForOffice; 259-266 head-clearing effect; 282-296 onSubmit; 499-512 vehicle shrink; 714-718 insertion point; 727-732 seat span; 1005-1006 review — The Guides field, its state/handlers, the branch-change clearing effect, and the seat arithmetic that now subtracts guides.

**Interfaces:**

_Produces:_

- apps/web/src/lib/api/shared.ts: export interface EmployeeRow { id: string; name: string; position: string | null; phone: string | null; branch_id: string; archived_at: string | null }
- apps/web/src/lib/api/shared.ts: export const getEmployees: (branchId?: string, includeArchived?: boolean) => Promise<EmployeeRow[]> — GET /employees, active-only by default
- apps/web/src/lib/query/shared.ts: export const useEmployees: (branchId?: string) => UseQueryResult<EmployeeRow[], Error>, queryKey ['employees', branchId] — ACTIVE ONLY, the hook form controls use
- ~~useEmployeesForDisplay~~ — DROPPED, do not ship (see correction 4). A ticket's guides arrive with their employee embedded, so there is no bare id to resolve.
- apps/web/src/lib/api/trip-tickets.ts: export interface TripGuideRow { id: string; name: string; position: string | null }
- apps/web/src/lib/types.ts: TripTicket = Tables<'trip_tickets'> & { dates: TripDateRow[]; guides: TripGuideRow[] }
- apps/web/src/lib/types.ts: NewTripTicket = TablesInsert<'trip_tickets'> & { dates?: { startTs: string; endTs: string }[]; guideIds?: string[] }
- apps/web/.../add-trip-ticket/actions.ts: TripTicketFormData gains guide_ids: string[] (zod: z.array(z.string().uuid('Pick an employee for this row')).min(1, 'A trip needs at least one guide')); default ['']
- mapUpdateBody accepts the snake_case key u.guide_ids: string[] and forwards it as body.guideIds — an empty array is forwarded as-is, never folded to undefined
- Wire contract used by the web layer: POST/PATCH /api/trip-tickets body key guideIds: string[]; read responses carry guides: [{ tripTicketId, employeeId, employee: { id, name, position, phone, branchId, archivedAt } }]
- e2e accessibility handles for later slices: the guide row triggers are getByRole('combobox', { name: 'Guide N' }); remove buttons are getByRole('button', { name: 'Remove guide N' }); the add button is 'Add guide'; the seat counter text is `${participants + guides} of ${seats} seats (N guides)`

_Consumes:_

- GET /api/employees?branchId=<uuid>&includeArchived=true — returns { data: [{ id, name, position: string | null, phone: string | null, branchId: string, createdAt, updatedAt, archivedAt: string | null }], count } and is requireAuth only (design §7). Omitting page/limit must return the full set.
- POST /api/employees with body { name: string; position: string | null; phone: string | null; branchId: string } returning the created row with an `id` — used by the e2e fixture (admin only).
- POST /api/employees/:id/archive — used by the e2e teardown; there is no DELETE route for employees.
- packages/shared contracts/trip-tickets.ts: createTripTicketBodySchema gains guideIds: z.array(z.string().uuid()).min(1), carried to updateTripTicketBodySchema by .partial() — absent means leave guides alone, present-but-empty is 400 NO_GUIDES.
- apps/api trip-tickets/repository.ts tripTicketInclude gains guides: { include: { employee: true } }, so BOTH the detail read and the list read embed guides — toSnake maps them on every response path.
- apps/api trip-tickets/service.ts create path must blank guideIds out of the `data: { ...body }` spread the way `dates` is (design §7.1), or the POST this task's e2e makes fails at runtime.
- assertBookable counts guides in the headcount (max(named, claimed) + guideIds.length) — this task's client-side seatSummary/`full`/onSubmit guard reproduce exactly that arithmetic and will disagree visibly if the server's differs.

**Before you start — gotchas found while drafting this task:**

- apps/web has NO unit-test runner — apps/web/package.json has no vitest/jest and no `test` script, only `test:e2e` (Playwright). There is no way to write a fast failing unit test for this task; the RED test is the e2e, and it needs the app already running (`pnpm dev`; web on :5173, API on :3001) because playwright.config.ts starts no servers.
- `guide_ids: ['']` in useTripTicketForm's defaultValues is load-bearing, not cosmetic. form.watch('guide_ids') returns undefined without it and guideCount throws on the first render — a white screen, not a validation error.
- DELIBERATE FIX inside the arithmetic being changed: the existing over-capacity guard sets its error on `participants_count`, which has no rendered control (the count is derived from the participant rows, form.tsx:161-173), so the message was invisible and submit just stopped. Counting guides makes that path ordinary rather than near-unreachable, so step 9c reports on `participants` instead. If a reviewer wants the guard left byte-identical, the message must at least be surfaced somewhere or the stricter capacity becomes a silent dead end.
- TripTicket (lib/types.ts:88) had to gain `guides` even though the brief only named NewTripTicket: toSnake's declared return type is exactly what makes tsc enforce every key, so returning guides without declaring it does not compile. toSnake is the only place a TripTicket is constructed (api/trip-tickets.ts:122), so nothing else needed touching.
- The submit payload carries BOTH `guide_ids` (from the `...data` spread) and `guideIds` (the explicit rename). Only `guideIds` is read — mapCreateBody whitelists keys — so the stray one is inert. It is the same shape the `dates` key already has, but the differing name makes it easier to miss; the comment in step 6c is the guard.
- No duplicate check in the zod schema. guideOptionsFor() removes an already-picked employee from every other row's options, so a duplicate is unrepresentable from the UI, and the join's composite primary key is the database-level backstop. If the picker is ever driven programmatically, add a superRefine mirroring the dates overlap check.
- The new clearing effect re-runs on every render, because branchEmployees is a fresh array each time — exactly like the two office/head effects it copies (form.tsx:249-266). The `if` guard is what stops it looping. It is not a new defect; it is the existing pattern, and diverging from it here would look like an accident.
- One deliberate divergence from those effects: the guides one returns early while employeesLoading. Mid-fetch the roster is empty so every pick looks stranded; the office effects have the same hole but nothing is preselected on a create form, and guides being required makes a silent wipe much more expensive.
- components/ui/multi-select.tsx is deliberately unused (design §9.3): its trigger is a bare <div onClick> with no role/aria/keyboard handling, so getByRole('combobox') could never reach it, and it paints raw bg-white at :59/:97/:101 — broken in dark mode. Repeating Selects also match the participants field it sits beside.
- Task 4 owes this task an invalidation: `lib/mutation/organization.ts`'s useOrgInvalidation needs `if (resource === 'employees') queryClient.invalidateQueries({ queryKey: ['employees'] })`. The prefix carries BOTH ['employees', branchId] and ['employees','all']. Without it, renaming or archiving an employee leaves this picker stale indefinitely — the exact failure the comment at mutation/organization.ts:29-37 exists to prevent.
- Spec under-specification worth flagging: §9.2 says guides are 'registered with react-hook-form directly' but not how the rows are keyed. useFieldArray is not usable on a string[] (it needs object rows with ids), so this task uses per-index Controllers over a watched array. If a later change wants drag-reorder or stable row identity, guide_ids would have to become an array of objects and this whole field changes shape.
- The e2e asserts the seat counter with /2 of \d+ seats \(1 guide\)/. If step 7d's seatSummary wording is changed, that assertion has to move with it — it is the only automated proof that the client counts guides the same way the server does.

### Steps

- [ ] **Step 1: Write the failing e2e spec**

apps/web has no unit-test runner — `apps/web/package.json` scripts are dev/build/lint/preview/`test:e2e`/`test:e2e:*` only. Playwright is the harness. Create `apps/web/e2e/trip-guides.spec.ts`:

```ts
import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  login,
  shot,
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiPost,
  apiDelete,
  listData
} from './helpers';

// Every trip is accompanied by at least one branch employee, and the booking
// form is where they are picked. This spec drives that picker in a real
// browser and then reads the ticket back through the API, because the FE
// renames guide_ids -> guideIds in exactly one place (lib/api/trip-tickets.ts)
// and a key dropped there produces no compile error and no runtime error —
// just a ticket with no guides (design §7.1). Only an end-to-end booking
// catches that.

// Employees have no hard-delete route — POST /employees/:id/archive and
// /restore are all that exist — so cleanup archives what this spec created,
// per-id, the way organization.spec.ts does. Tickets DO have a delete, but
// only while still pending_admin_approval (service.remove); this spec never
// approves the ticket it books, so DELETE is the right teardown for it, and
// it runs BEFORE the employee archive so the employee is no longer held by a
// live ticket (409 IN_USE).
const createdTicketIds: string[] = [];
const createdEmployeeIds: string[] = [];

test.afterAll(async ({ request }) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);

  for (const id of createdTicketIds) {
    try {
      const r = await apiDelete(
        request,
        `/api/trip-tickets/${id}`,
        admin.token
      );
      if (!r.ok) {
        console.error(
          `trip-guides cleanup: deleting ticket ${id} failed (HTTP ${r.status})`
        );
      }
    } catch (err) {
      console.error(`trip-guides cleanup: deleting ticket ${id} threw:`, err);
    }
  }

  for (const id of createdEmployeeIds) {
    try {
      const r = await apiPost(
        request,
        `/api/employees/${id}/archive`,
        admin.token,
        {}
      );
      if (!r.ok) {
        console.error(
          `trip-guides cleanup: archiving employee ${id} failed (HTTP ${r.status})`
        );
      }
    } catch (err) {
      console.error(
        `trip-guides cleanup: archiving employee ${id} threw:`,
        err
      );
    }
  }
});

// ---------- Local helpers, specific to this spec's UI paths ----------

// The same booking dialog organization.spec.ts opens. Kept local to each spec
// rather than promoted into helpers.ts, matching how that spec already does it.
async function openBookingDialog(page: Page): Promise<Locator> {
  await page
    .getByRole('link', { name: 'Trip Tickets', exact: true })
    .first()
    .click();
  await page.waitForURL(/\/trip-tickets/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Create Trip Ticket' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText('Submit a trip ticket request for admin approval.')
  ).toBeVisible({ timeout: 15_000 });
  return dialog;
}

// The booking form's labels point at controls with no matching id (see
// organization.spec.ts:112-121), so a field is reached through the role="group"
// its Field wrapper renders, filtered by a word unique to that field.
function fieldGroup(dialog: Locator, label: string): Locator {
  return dialog.getByRole('group').filter({ hasText: label });
}

// Picks the first real option in a Select. The empty state inside
// SelectContent is a plain <div>, not an option, so first() can only ever
// match a real row.
async function pickFirstOption(page: Page, trigger: Locator): Promise<void> {
  await trigger.click();
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

// Reads one fact out of the review step: every value is a <dd> next to its
// <dt> (components/shared/detail-view.tsx).
function detailValue(page: Page, label: string): Locator {
  return page.locator(
    `xpath=//dt[normalize-space()=${JSON.stringify(label)}]/following-sibling::dd[1]`
  );
}

test('a guide picked on the booking form rides along on the ticket', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);

  // ---------- Stage an employee on the branch the trip is booked for ----------
  const branches = listData(
    await apiGet(request, '/api/branches', admin.token)
  );
  const branch = branches.find((b) => b.name === 'Main Branch') ?? branches[0];
  expect(branch, 'a branch to book against').toBeTruthy();

  const guideName = `E2E Guide ${Date.now()}`;
  const employee = await apiPost(request, '/api/employees', admin.token, {
    name: guideName,
    position: 'Tour Guide',
    phone: null,
    branchId: branch.id as string
  });
  expect(employee.ok, 'admin creates a branch employee').toBeTruthy();
  createdEmployeeIds.push((employee.body as { id: string }).id);

  // ---------- Book a trip through the form, picking that employee ----------
  await login(page, 'admin');
  const dialog = await openBookingDialog(page);

  await fieldGroup(dialog, 'Branch').getByRole('combobox').click();
  await page
    .getByRole('option', { name: branch.name as string, exact: true })
    .click();
  await pickFirstOption(
    page,
    fieldGroup(dialog, 'Department/Office/College').getByRole('combobox')
  );
  await dialog.getByRole('button', { name: 'Continue' }).click();

  await pickFirstOption(
    page,
    fieldGroup(dialog, 'Vehicle').getByRole('combobox')
  );
  await pickFirstOption(
    page,
    fieldGroup(dialog, 'Driver').getByRole('combobox')
  );

  // Destination first, then the fields below it: the picker's suggestion
  // popover is dismissed by the next mousedown (destination-picker.tsx's
  // click-away handler), so nothing later is clicked through it.
  const destination = `TG-E2E ${Date.now()}`;
  await dialog.locator('#destination').fill(destination);
  await dialog.locator('#purpose').fill('E2E guides');
  await dialog.getByPlaceholder('Participant 1').fill('E2E Passenger');

  // The guide picker: this branch's unarchived employees, and an ordinary
  // combobox — the e2e suite drives getByRole('combobox')/getByRole('option'),
  // which is why components/ui/multi-select.tsx (bare <div onClick>, no roles)
  // could not be used here (design §9.3).
  await dialog.getByRole('combobox', { name: 'Guide 1' }).click();
  await page
    .getByRole('option', { name: `${guideName} — Tour Guide`, exact: true })
    .click();

  // The seat budget counts the guide, exactly as the server does
  // (assertBookable: participants PLUS guides against vehicle.capacity).
  await expect(dialog.getByText(/2 of \d+ seats \(1 guide\)/)).toBeVisible({
    timeout: 15_000
  });
  await shot(page, 'trip-guides-1-picked');

  await dialog.getByRole('button', { name: 'Continue' }).click();

  // Far-future window: the seeded demo data and every other spec share this
  // database, and an overlap fails with VEHICLE_DOUBLE_BOOKED (409) — a
  // fixture collision, not a product bug. Times default to 08:00-17:00.
  const day = new Date(Date.now() + 75 * 86_400_000);
  const isoDay = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(day.getDate()).padStart(2, '0')}`;
  await dialog.locator('input[type="date"]').first().fill(isoDay);
  await dialog.getByRole('button', { name: 'Continue' }).click();

  // The review reads the guide back by name, not by id.
  await expect(detailValue(page, 'Guides')).toContainText(guideName, {
    timeout: 15_000
  });

  await dialog.getByRole('button', { name: 'Submit Request' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Submit Request' })
    .click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // ---------- The booked ticket carries the guide ----------
  const tickets = listData(
    await apiGet(request, '/api/trip-tickets', admin.token)
  );
  const booked = tickets.find((t) => t.destination === destination) as
    | { id: string; guides: { employee: { name: string } }[] }
    | undefined;
  expect(booked, 'the booked ticket resolves via the API').toBeTruthy();
  createdTicketIds.push(booked!.id);
  expect(
    booked!.guides.map((g) => g.employee.name),
    'the guide picked in the form reached the ticket'
  ).toEqual([guideName]);
});
```

- [ ] **Step 2: Run it — confirm RED, and confirm it is red for the RIGHT reason**

The suite drives the already-running app; start it first (`pnpm dev` from the repo root) and confirm `grep DATABASE_URL apps/api/.env` points at local Docker Postgres, not Neon — this spec creates and deletes rows.

```bash
pnpm --filter @mms/web test:e2e -- trip-guides
```

Expected failure — the booking form has no Guides field yet:

```
  1) [chromium] › trip-guides.spec.ts:… › a guide picked on the booking form rides along on the ticket

    Error: locator.click: Timeout 30000ms exceeded.
    Call log:
      - waiting for getByRole('dialog').getByRole('combobox', { name: 'Guide 1' })
```

If it instead fails earlier at `expect(employee.ok, 'admin creates a branch employee').toBeTruthy()` (received `false`), the API-side employee slices are not merged into this branch — stop and fix that ordering, do not work around it here.

- [ ] **Step 3: apps/web/src/lib/api/shared.ts — getEmployees**

This file currently ends at line 38 with `getAllBranches`. Append below it (imports at :1-2 are unchanged — `api` and `Branch` are already imported):

```ts
// Shape of an employee row as returned by GET /employees (Prisma camelCase).
interface EmployeeResponse {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  branchId: string;
  archivedAt: string | null;
}

// The FE's snake_case employee row. Declared here rather than in
// types/supabase.ts for the same reason TripDateRow is declared in
// api/trip-tickets.ts: that file is the generated Supabase schema, and the
// API's newer tables were never added back to it.
export interface EmployeeRow {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  branch_id: string;
  archived_at: string | null;
}

function toSnakeEmployee(e: EmployeeResponse): EmployeeRow {
  return {
    id: e.id,
    name: e.name,
    position: e.position,
    phone: e.phone,
    branch_id: e.branchId,
    archived_at: e.archivedAt
  };
}

// A branch's staff roster — the list the trip form's guide picker reads.
//
// Defaults to active-only for the same reason getAllBranches does: a picker
// must stop offering someone who has been archived. `branchId` narrows it
// server-side because the picker is branch-locked (design §5.2); omitted, the
// whole roster comes back. Pass `true` only to render a guide's name against a
// historical ticket — the employee is embedded on the ticket payload.
export const getEmployees = async (
  branchId?: string,
  includeArchived = false
): Promise<EmployeeRow[]> => {
  const res = await api.get<{ data: EmployeeResponse[]; count: number }>(
    '/employees',
    {
      // buildUrl (api/client.ts:95-100) drops undefined/null/'' keys, so an
      // omitted branch is simply not sent rather than sent as "undefined".
      branchId,
      includeArchived: includeArchived ? 'true' : undefined
    }
  );
  return res.data.map(toSnakeEmployee);
};
```

No page/limit is passed: omitting them returns the full set (`lib/pagination.ts:7`), which is what a picker wants.

- [ ] **Step 4: apps/web/src/lib/query/shared.ts — useEmployees**

> **Write `useEmployees` only. Do NOT write `useEmployeesForDisplay`** (correction 4 at the top of this task). The drafted code for it is shown below struck through in prose so you can see what was considered and why it was dropped — a display twin exists for branches and offices because those payloads carry only a bare `branch_id` / `office_id` that the UI must resolve against a list. Guides are different: `tripTicketInclude` embeds the whole employee, so the guide's name arrives on the ticket itself. A twin here would be an exported hook with no caller.

The whole file today is the branches pair. `useBranches` (:6-11) is the picker list; `useBranchesForDisplay` (:24-29) carries the rule at :23 — **"NEVER populate a form control from this hook. Use useBranches() for that."** `useEmployees` repeats that rule in its own terms.

Change the import at :1-2:

```ts
import { useQuery } from '@tanstack/react-query';
import { getAllBranches } from '../api/shared';
```

to:

```ts
import { useQuery } from '@tanstack/react-query';
import { getAllBranches, getEmployees } from '../api/shared';
```

Then append after `useBranchesForDisplay` (the file ends at :29):

```ts
// Active employees only — the roster every guide PICKER reads, narrowed to one
// branch because a guide belongs to the trip's own branch (design §5.2). The
// branch id is part of the key, so switching branches on the booking form
// fetches that branch's roster instead of being served the previous one.
//
// The key stays under the ['employees'] prefix so the Organization tab's
// invalidation (lib/mutation/organization.ts) reaches it: TanStack matches
// prefixes, so invalidating ['employees'] refreshes every branch's list AND
// the display twin below. Without that branch in useOrgInvalidation, renaming
// or archiving an employee leaves this picker stale indefinitely.
export const useEmployees = (branchId?: string) => {
  return useQuery({
    queryKey: ['employees', branchId],
    queryFn: () => getEmployees(branchId)
  });
};
```

**Do not add a display twin.** The version considered and rejected was:

```ts
// DROPPED — do not write this. Kept here only to record the decision.
// export const useEmployeesForDisplay = () => useQuery({
//   queryKey: ['employees', 'all'],
//   queryFn: () => getEmployees(undefined, true)
// });
```

The branches and offices twins exist because a ticket carries `branch_id` and `office_id` as bare ids that must be looked up in a list that still contains archived rows. A ticket's `guides` arrive with their employee embedded (`tripTicketInclude` in Task 3), so design §8 — "an archived employee is still named on a ticket they already guided" — is satisfied by the ticket payload itself. Step 13 renders exactly that, with no second fetch.

- [ ] **Step 5: apps/web/src/lib/api/trip-tickets.ts + lib/types.ts — make guides round-trip**

**5a. New row type + mapper.** Insert after `dateToSnake` closes at :64, before the `fuelAllocation` comment at :66:

```ts
// One employee guiding a trip, flattened out of the TripTicketEmployee join the
// API embeds. The join row itself carries nothing worth rendering (a composite
// key and two timestamps), so this is the EMPLOYEE — which is what a ticket has
// to show, including after that employee has been archived (design §8).
export interface TripGuideRow {
  id: string;
  name: string;
  position: string | null;
}

// Shape of a TripTicketEmployee row as embedded on a ticket response, with its
// `employee` included (repository.ts's tripTicketInclude).
interface TripGuideApiResponse {
  tripTicketId: string;
  employeeId: string;
  employee: {
    id: string;
    name: string;
    position: string | null;
    phone: string | null;
    branchId: string;
    archivedAt: string | null;
  };
}

function guideToSnake(g: TripGuideApiResponse): TripGuideRow {
  return {
    id: g.employee.id,
    name: g.employee.name,
    position: g.employee.position ?? null
  };
}
```

**5b. Read response.** :98-99 today:

```ts
  participants: string[];
  participantsCount: number | null;
```

becomes:

```ts
  participants: string[];
  participantsCount: number | null;
  guides: TripGuideApiResponse[];
```

**5c. toSnake.** :135-136 today:

```ts
    participants: t.participants ?? [],
    participants_count: t.participantsCount ?? null,
```

becomes:

```ts
    participants: t.participants ?? [],
    participants_count: t.participantsCount ?? null,
    // `?? []` for the same reason participants above has it: if
    // tripTicketInclude is ever missing the guides embed, a ticket renders with
    // no guides instead of throwing — and there is no response contract
    // anywhere to catch that (design §7.1).
    guides: (t.guides ?? []).map(guideToSnake),
```

**5d. Outgoing body.** In `TripTicketRequestBody`, :191-192 today:

```ts
  participants?: string[];
  participantsCount?: number | null;
```

becomes:

```ts
  participants?: string[];
  participantsCount?: number | null;
  guideIds?: string[];
```

**5e. mapCreateBody.** :215-216 today:

```ts
    participants: t.participants ?? undefined,
    participantsCount: t.participants_count ?? undefined,
```

becomes:

```ts
    participants: t.participants ?? undefined,
    participantsCount: t.participants_count ?? undefined,
    guideIds: t.guideIds ?? undefined,
```

**5f. mapUpdateBody.** :257-258 today:

```ts
if (u.participants_count !== undefined)
  body.participantsCount = u.participants_count as number | null;
```

becomes:

```ts
if (u.participants_count !== undefined)
  body.participantsCount = u.participants_count as number | null;
if (u.guide_ids !== undefined) {
  // Guides are IDS. There is deliberately no comma-string branch like the
  // one `participants` needs above: nothing joins or splits a guide, so an
  // employee named "Cruz, Juan" cannot silently become two people. An empty
  // array is forwarded AS an empty array, not folded to undefined —
  // absent means "leave the guides alone", present-but-empty is a 400
  // NO_GUIDES, the same rule the server applies to `dates` (design §5.3).
  body.guideIds = u.guide_ids as string[];
}
```

**5g. lib/types.ts.** :9 today:

```ts
import type { TripDateRow } from './api/trip-tickets';
```

becomes:

```ts
import type { TripDateRow, TripGuideRow } from './api/trip-tickets';
```

and :85-94 today:

```ts
// A ticket now covers one or more non-consecutive outings — `dates` is the
// `trip_dates` rows (Tasks 2-4), not a generated column, so it is added by
// intersection rather than living in the generated `Tables<'trip_tickets'>`.
export type TripTicket = Tables<'trip_tickets'> & { dates: TripDateRow[] };
export type NewTripTicket = TablesInsert<'trip_tickets'> & {
  /** Outgoing create/update shape: already camelCase, passed straight through
   *  to the request body (see mapCreateBody/mapUpdateBody). Optional — the
   *  legacy start_ts/end_ts pair below still works on its own. */
  dates?: { startTs: string; endTs: string }[];
};
```

becomes:

```ts
// A ticket now covers one or more non-consecutive outings — `dates` is the
// `trip_dates` rows (Tasks 2-4), not a generated column, so it is added by
// intersection rather than living in the generated `Tables<'trip_tickets'>`.
// `guides` is here for the same reason: the trip_ticket_employees join is
// newer than the generated schema file.
export type TripTicket = Tables<'trip_tickets'> & {
  dates: TripDateRow[];
  guides: TripGuideRow[];
};
export type NewTripTicket = TablesInsert<'trip_tickets'> & {
  /** Outgoing create/update shape: already camelCase, passed straight through
   *  to the request body (see mapCreateBody/mapUpdateBody). Optional — the
   *  legacy start_ts/end_ts pair below still works on its own. */
  dates?: { startTs: string; endTs: string }[];
  /** The employees guiding the trip, as employee ids — same convention as
   *  `dates`: already camelCase, passed straight through. Optional on the type
   *  so existing callers still compile; the API requires at least one on
   *  create (400 NO_GUIDES). */
  guideIds?: string[];
};
```

`TripTicket` had to gain `guides` even though only `NewTripTicket` was named: `toSnake`'s declared return type is what makes tsc enforce every key, so returning `guides` without declaring it is an error. `toSnake` is the only place a `TripTicket` is constructed (`grep -n ": TripTicket\b" apps/web/src -r` → api/trip-tickets.ts:122 only), so nothing else breaks.

Gate:

```bash
pnpm --filter @mms/web exec tsc -b
```

- [ ] **Step 6: add-trip-ticket/actions.ts — the guides field carries IDS**

**6a. The schema field.** :80-82 today:

```ts
  // Trip purpose and participants
  purpose: z.string().min(1, 'Purpose is required'),
  participants: z.string().min(1, 'Participants are required'), // Will be stored as array in DB
```

becomes:

```ts
  // Trip purpose and participants
  purpose: z.string().min(1, 'Purpose is required'),
  // The employees who go along to guide the trip. IDS, one per row — never the
  // comma-joined string `participants` below is, so a guide named "Cruz, Juan"
  // cannot split into two people. An unfilled row is '' and fails .uuid(),
  // which is what the per-row message is for. At least one is required
  // (design §5.3); the server refuses an empty list with 400 NO_GUIDES.
  guide_ids: z
    .array(z.string().uuid('Pick an employee for this row'))
    .min(1, 'A trip needs at least one guide'),
  participants: z.string().min(1, 'Participants are required'), // Will be stored as array in DB
```

**6b. The default row.** In `useTripTicketForm`, :120-121 today:

```ts
      purpose: '',
      participants: '',
```

becomes:

```ts
      purpose: '',
      // One empty row, like participants' useState(['']) — the field renders
      // its rows from this array, so it must exist before the first render.
      guide_ids: [''],
      participants: '',
```

**6c. The submit mapping.** :150-160 today:

```ts
const tripTicketData = {
  ...data,
  participants: data.participants
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0),
  dates: data.dates.map((d) => ({
    startTs: new Date(`${d.date}T${d.start}`).toISOString(),
    endTs: new Date(`${d.date}T${d.end}`).toISOString()
  }))
};
```

becomes:

```ts
const tripTicketData = {
  ...data,
  participants: data.participants
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0),
  // Guides are already ids: no split, no join, no reconciliation against a
  // count. Renamed to the wire's camelCase here because mapCreateBody reads
  // `guideIds`; the snake_case `guide_ids` the spread also carries is not a
  // trip_tickets column and is dropped there.
  guideIds: data.guide_ids,
  dates: data.dates.map((d) => ({
    startTs: new Date(`${d.date}T${d.start}`).toISOString(),
    endTs: new Date(`${d.date}T${d.end}`).toISOString()
  }))
};
```

Contrast to keep in view: `participants` (:152-155) is a single string that gets `.split(',')` — the hazard §9.2 calls out. `guideIds` is an array of uuids handed over untouched.

- [ ] **Step 7: form.tsx — imports, STEPS, guide state, derived lists and handlers**

**7a. Import.** :13 today `import { useBranches } from '@/lib/query/shared';` becomes:

```ts
import { useBranches, useEmployees } from '@/lib/query/shared';
```

**7b. STEPS.** The form IS stepped; guides belong to step 1, `'The trip'`, because that is the step that owns the seat budget and the fields it shares. :49-59 today:

```ts
  {
    title: 'The trip',
    fields: [
      'vehicle_id',
      'driver_id',
      'destination',
      'participants_count',
      'purpose',
      'participants'
    ]
  },
```

becomes:

```ts
  {
    title: 'The trip',
    fields: [
      'vehicle_id',
      'driver_id',
      'destination',
      'participants_count',
      'purpose',
      'guide_ids',
      'participants'
    ]
  },
```

**7c. Watched guides + the seat maths.** :136-141 today:

```ts
// A trip cannot carry more people than the van has seats — the API refuses it
// (409 OVER_CAPACITY), so the form says so while the vehicle is being chosen
// rather than after the request has been written out in full.
const selectedVehicleId = form.watch('vehicle_id');
const seats =
  vehicles?.find((v) => v.id === selectedVehicleId)?.capacity ?? null;
```

becomes:

```ts
// A trip cannot carry more people than the van has seats — the API refuses it
// (409 OVER_CAPACITY), so the form says so while the vehicle is being chosen
// rather than after the request has been written out in full.
const selectedVehicleId = form.watch('vehicle_id');
const seats =
  vehicles?.find((v) => v.id === selectedVehicleId)?.capacity ?? null;

// Guides ride along, so they spend seats too — assertBookable counts them
// the same way (participants PLUS guides against vehicle.capacity, design
// §5.1). Registered with react-hook-form directly and read back with watch:
// guides carry ids, so none of the useState/syncParticipants machinery the
// string round-trip forces on participants applies here. Blank rows do not
// count — an unfilled row is '' until an employee is chosen.
const guideIds = form.watch('guide_ids');
const guideCount = guideIds.filter(Boolean).length;
```

**7d. The budget line.** :175-176 today:

```ts
const namedCount = participants.filter((p) => p.trim()).length;
const full = seats !== null && participants.length >= seats;
```

becomes:

```ts
const namedCount = participants.filter((p) => p.trim()).length;
// One budget, two buttons: a guide takes a seat exactly like a participant,
// so the same flag stops "Add participant" and "Add guide".
const full = seats !== null && participants.length + guideCount >= seats;

// The seat budget as one line, guides included — a counter that ignored them
// would promise room the van does not have, and the trip would be refused
// 409 OVER_CAPACITY only after the whole form had been filled in.
const seatSummary =
  seats === null
    ? 'Pick a vehicle to see the seats'
    : `${namedCount + guideCount} of ${seats} seat${seats === 1 ? '' : 's'}` +
      (guideCount > 0
        ? ` (${guideCount} guide${guideCount === 1 ? '' : 's'})`
        : '');
```

**7e. Fetch the roster.** :200-202 today ends with:

```ts
const tripBranchId: string | null | undefined =
  review.branch_id || userBranchId;
const tripBranchName = branches?.find((b) => b.id === tripBranchId)?.name;
```

Append directly after it:

```ts
// The guide roster is branch-locked, so it is fetched for the TRIP's branch,
// not the whole company's. Called here rather than up with the other list
// hooks because it needs tripBranchId, which only exists once the watched
// values above have been read — still an unconditional top-level call, so
// hook order is stable.
const { data: employees, isLoading: employeesLoading } = useEmployees(
  tripBranchId ?? undefined
);
```

**7f. Branch-locked list and the row handlers.** :240-244 today ends the office-head filter:

```ts
const officeHeadsForOffice = (officeHeads ?? []).filter((h) =>
  review.office_id
    ? h.office_id === review.office_id
    : !tripBranchId || h.branch_id === tripBranchId
);
```

Append directly after it:

```ts
// An EMPLOYEE cannot be borrowed either — a guide is one of this branch's own
// people. Filtered client-side as well as server-side (useEmployees passes
// branchId) for the same reason branchOffices above is: the guarantee should
// not depend on a query parameter surviving a cache hit.
const branchEmployees = (employees ?? []).filter(
  (e) => !tripBranchId || e.branch_id === tripBranchId
);

// Two rows must never name the same person: the join's composite primary key
// makes that unrepresentable in the database, so the picker never offers it.
// The row's OWN current pick stays in its list — Radix needs the selected
// item present to render its label.
const guideOptionsFor = (index: number) =>
  branchEmployees.filter(
    (e) => e.id === guideIds[index] || !guideIds.includes(e.id)
  );

const addGuideRow = () =>
  form.setValue('guide_ids', [...guideIds, ''], {
    shouldValidate: form.formState.isSubmitted
  });

const removeGuideRow = (index: number) =>
  form.setValue(
    'guide_ids',
    guideIds.filter((_, i) => i !== index),
    { shouldValidate: form.formState.isSubmitted }
  );
```

**7g. The clearing effect.** The two existing effects are :246-266:

```ts
// Changing the branch can strand an office (and a head) that belongs to the
// branch you just left. Drop them rather than submit a trip whose office is
// somebody else's.
useEffect(() => {
  if (
    review.office_id &&
    !branchOffices.some((o) => o.id === review.office_id)
  ) {
    form.setValue('office_id', '');
    form.setValue('office_head_id', '');
  }
}, [review.office_id, branchOffices, form]);

useEffect(() => {
  if (
    review.office_head_id &&
    !officeHeadsForOffice.some((h) => h.id === review.office_head_id)
  ) {
    form.setValue('office_head_id', '');
  }
}, [review.office_head_id, officeHeadsForOffice, form]);
```

Insert the guides equivalent directly after the second one (between :266 and the `useEffect` at :268):

```ts
// A guide is stranded by a branch change the same way an office is: an
// employee belongs to exactly one branch, so somebody picked under the old
// one is not on the new one's roster. Blank the stranded rows rather than
// book a trip guided by another branch's staff — but keep the rows
// themselves, so the field never collapses to zero and the requester can see
// what there is to re-pick.
useEffect(() => {
  // Unlike the two effects above, this one waits: mid-fetch the roster is
  // empty and EVERY pick would look stranded. Guides are required, so
  // silently wiping a valid one costs more than the extra guard.
  if (employeesLoading) return;
  const cleaned = guideIds.map((id) =>
    id && !branchEmployees.some((e) => e.id === id) ? '' : id
  );
  if (cleaned.some((id, i) => id !== guideIds[i])) {
    form.setValue('guide_ids', cleaned);
  }
}, [guideIds, branchEmployees, employeesLoading, form]);
```

- [ ] **Step 8: form.tsx — the Guides field itself**

It goes in the `<FormSection title="The trip" …>` (opens at :485, `className={step === 1 ? undefined : 'hidden'}`), inside that section's `<div className="flex flex-col gap-5">`, **directly above the Participants Controller** — i.e. between the purpose Controller's `/>` at :716 and the `<Controller name="participants"` at :718.

Structure note: no outer `Controller`. Each row is its own `Controller name={`guide_ids.${index}`}`, so a row's `fieldState.error` is a plain FieldError and renders under that row; the array-level `.min(1)` message is read from `errors.guide_ids?.root?.message`, exactly as the dates field does at :941-945.

```tsx
{
  /* Guides ride along, so they sit directly above the people they
                  accompany and spend the same seat budget. Unlike participants
                  these are IDS chosen from this branch's roster — nothing is
                  ever joined into or split out of a comma-separated string, so
                  an employee named "Cruz, Juan" cannot become two people.
                  Ordinary Selects, not components/ui/multi-select.tsx: that one
                  renders bare <div onClick> with no role and paints raw
                  bg-white (design §9.3). */
}
<Field data-invalid={!!form.formState.errors.guide_ids}>
  <div className="flex flex-wrap items-center justify-between gap-2">
    <FieldLabel htmlFor="guide_ids">Guides *</FieldLabel>
    <span className="text-muted-foreground text-xs tabular-nums">
      {guideCount} guide{guideCount === 1 ? '' : 's'}
    </span>
  </div>

  <div className="flex flex-col gap-2">
    {guideIds.map((_, index) => (
      <div key={index} className="flex items-center gap-2">
        <Controller
          name={`guide_ids.${index}`}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
                disabled={employeesLoading}
              >
                <SelectTrigger
                  aria-label={`Guide ${index + 1}`}
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue
                    placeholder={
                      employeesLoading ? 'Loading...' : 'Select an employee'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {guideOptionsFor(index).length > 0 ? (
                    guideOptionsFor(index).map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {/* The position is what tells two people
                                          with the same name apart. */}
                        {employee.position
                          ? `${employee.name} — ${employee.position}`
                          : employee.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="text-muted-foreground p-2 text-sm">
                      {tripBranchId
                        ? 'No employees left in this branch'
                        : 'Pick a branch first'}
                    </div>
                  )}
                </SelectContent>
              </Select>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove guide ${index + 1}`}
          // Never zero rows: every trip is guided by someone.
          disabled={guideIds.length === 1}
          onClick={() => removeGuideRow(index)}
        >
          <TrashIcon className="size-4" />
        </Button>
      </div>
    ))}
  </div>

  {/* Wrapped for the same reason the participants button is:
                    Field's vertical variant sets `*:w-full`, which would
                    stretch the button. */}
  <div>
    <Button
      type="button"
      variant="outline"
      size="sm"
      // The van fills up, and so does the roster — a row nobody
      // is left to fill is worse than no row.
      disabled={full || guideIds.length >= branchEmployees.length}
      onClick={addGuideRow}
    >
      <PlusIcon className="size-4" />
      Add guide
    </Button>
  </div>

  {/* Only the array's own min(1) message ("A trip needs at least
                    one guide") lands here — a row's own "Pick an employee for
                    this row" is pinned to [i] and renders under that row. The
                    remove button is disabled at one row, so this is unreachable
                    from the UI today; kept as the same safety net the dates
                    field keeps. */}
  {form.formState.errors.guide_ids?.root?.message && (
    <p className="text-destructive text-sm">
      {form.formState.errors.guide_ids.root.message}
    </p>
  )}
</Field>;
```

- [ ] **Step 9: form.tsx — the seat arithmetic (counter, vehicle shrink, submit guard, review)**

**9a. The counter.** :727-732 today:

```tsx
{
  /* The seat budget, spent and remaining. */
}
<span className="text-muted-foreground text-xs tabular-nums">
  {seats === null
    ? 'Pick a vehicle to see the seats'
    : `${namedCount} of ${seats} seat${seats === 1 ? '' : 's'}`}
</span>;
```

becomes:

```tsx
{
  /* The seat budget, spent and remaining — guides
                          included, because the API counts them against the
                          same capacity (see seatSummary above). */
}
<span className="text-muted-foreground text-xs tabular-nums">
  {seatSummary}
</span>;
```

**9b. The vehicle-shrink truncation.** :499-512 today:

```tsx
                        onValueChange={(vehicleId) => {
                          field.onChange(vehicleId);
                          // Changing the van changes how many people fit. Without
                          // this, picking a 9-seater, entering 9, then switching
                          // to a 4-seater left the count at 9 and the trip only
                          // failed on submit.
                          const nextSeats = vehicles?.find(
                            (v) => v.id === vehicleId
                          )?.capacity;
                          if (!nextSeats) return;
                          if (participants.length > nextSeats) {
                            syncParticipants(participants.slice(0, nextSeats));
                          }
                        }}
```

becomes:

```tsx
                        onValueChange={(vehicleId) => {
                          field.onChange(vehicleId);
                          // Changing the van changes how many people fit. Without
                          // this, picking a 9-seater, entering 9, then switching
                          // to a 4-seater left the count at 9 and the trip only
                          // failed on submit. Guides have already taken their
                          // seats, so the room left is what remains after them.
                          // Never below one row — a trip still has to carry
                          // someone, and a van the guides alone fill is refused
                          // by the over-capacity guard in onSubmit, not by
                          // silently deleting every participant.
                          const nextSeats = vehicles?.find(
                            (v) => v.id === vehicleId
                          )?.capacity;
                          if (!nextSeats) return;
                          const room = Math.max(nextSeats - guideCount, 1);
                          if (participants.length > room) {
                            syncParticipants(participants.slice(0, room));
                          }
                        }}
```

**9c. The submit guard.** :282-296 today:

```ts
const onSubmit = (data: TripTicketFormData) => {
  // The last word on the headcount. The count field is capped and re-clamped
  // when the vehicle changes, so this should be unreachable — but the API
  // refuses an over-capacity trip (409 OVER_CAPACITY) and a form that can send
  // one is a form that can waste someone's time filling it in.
  if (seats !== null && data.participants_count > seats) {
    form.setError('participants_count', {
      message: `That vehicle seats ${seats}`
    });
    setStep(1); // the step that owns participants_count
    return;
  }
  setPendingData(data);
  setShowConfirm(true);
};
```

becomes:

```ts
const onSubmit = (data: TripTicketFormData) => {
  // The last word on the headcount. The count field is capped and re-clamped
  // when the vehicle changes, so this should be unreachable — but the API
  // refuses an over-capacity trip (409 OVER_CAPACITY) and a form that can send
  // one is a form that can waste someone's time filling it in. Guides are in
  // the sum because the server puts them there too (assertBookable:
  // max(named, claimed) + guides against vehicle.capacity, design §5.1).
  const guides = data.guide_ids.filter(Boolean).length;
  if (seats !== null && data.participants_count + guides > seats) {
    // Reported on `participants`, not on `participants_count`: the count has
    // no rendered control (it is derived from the rows), so an error set on
    // it was invisible and the submit just stopped with no explanation. That
    // path was hard to reach before; counting guides makes it ordinary.
    form.setError('participants', {
      message:
        `That vehicle seats ${seats} — this trip is ` +
        `${data.participants_count} participant` +
        `${data.participants_count === 1 ? '' : 's'} and ` +
        `${guides} guide${guides === 1 ? '' : 's'}`
    });
    setStep(1); // the step that owns participants and guide_ids
    return;
  }
  setPendingData(data);
  setShowConfirm(true);
};
```

**9d. The review.** The Dates item closes at :1005 and the Participants item runs :1006-1016. Insert the Guides item between them, mirroring the form's own order:

```tsx
<DetailItem
  label="Guides"
  value={
    guideCount > 0
      ? guideIds
          .filter(Boolean)
          .map((id) => nameOf(branchEmployees, id) ?? '—')
          .join(', ')
      : undefined
  }
  wide
/>
```

`nameOf` is the existing helper at :71-74, `(list: { id: string; name: string }[] | undefined, id: string | undefined)` — `branchEmployees` (EmployeeRow[]) satisfies it structurally.

- [ ] **Step 10: Type-check and lint**

```bash
pnpm --filter @mms/web exec tsc -b
pnpm --filter @mms/web lint
```

Both must be clean. Two failures worth recognising rather than working around:

- `Property 'guides' is missing in type … but required in type 'TripTicket'` from `toSnake` means step 5c was applied without 5g (or vice versa) — they are one change.
- `Cannot read properties of undefined (reading 'filter')` at runtime (not tsc) means `guide_ids: ['']` is missing from `defaultValues`; `form.watch('guide_ids')` returns undefined and `guideCount` throws on first render.

- [ ] **Step 11: Run the e2e — GREEN**

With the app running:

```bash
pnpm --filter @mms/web test:e2e -- trip-guides
```

Expected: `1 passed`. Then the whole suite, because the Guides field is now required and every spec that books a ticket through the form or the API goes through it:

```bash
pnpm --filter @mms/web test:e2e
```

Expected: all green. A failure in `trip-lifecycle.spec.ts` or `multi-date-trip.spec.ts` here is the fixture list from design §12 — those POST tickets directly and need a `guideIds` on the body; that is the API slice's fixture work, not a regression in this one.

Also worth a manual look, since only the picked path is automated: open the booking form, pick a guide, then change the Branch on step 1 and confirm the guide row blanks itself rather than carrying another branch's employee forward.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/lib/api/shared.ts apps/web/src/lib/query/shared.ts apps/web/src/lib/api/trip-tickets.ts apps/web/src/lib/types.ts apps/web/src/components/pages/trip-tickets/add-trip-ticket apps/web/e2e/trip-guides.spec.ts
git commit -m "feat(web): pick trip guides on the booking form"
```

Do not push — pushing is done manually.

- [ ] **Step 13: Render the guides on the ticket detail page**

Without this, spec §8 ("a ticket keeps rendering an archived employee's name") is unverifiable in the product, `TripTicket.guides` has no reader anywhere in `apps/web`, and Task 6's e2e spec times out looking for a `Guides` row that does not exist.

Because `tripTicketInclude` embeds the whole employee, the guide's **name travels on the ticket payload**. There is no bare id to resolve — which is why this task ships no display-twin hook (correction 4 above). Contrast `branch_id` and `office_id`, which arrive as bare ids and do need one.

In `apps/web/src/components/pages/trip-tickets/trip-tickets-inner/index.tsx`, find the `Participants` `DetailItem` (currently at lines 1008-1027) and insert a `Guides` item **directly before it**, so the read order matches the form order from §9.2:

```tsx
<DetailItem
  label="Guides"
  wide
  value={
    tripTicket.guides.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {tripTicket.guides.map((g) => (
          <Badge key={g.id} variant="outline">
            {g.position ? `${g.name} — ${g.position}` : g.name}
          </Badge>
        ))}
      </div>
    ) : undefined
  }
/>
```

`Badge` is already imported at line 12 of this file. `wide` and the `undefined`-when-empty convention both copy the `Participants` item immediately below — `DetailItem` renders an em dash for an undefined value, which is what a pre-existing ticket with no guides should show.

`g.id` is the **employee** id, because `guideToSnake` flattens the join row. Keying on it is safe: the composite primary key makes a duplicate employee on one ticket unrepresentable.

- [ ] **Step 14: Ship the reassign-guides client**

Spec §1 lists "a guide can be swapped on an already-approved ticket without cancelling and rebooking it" as a goal, and Task 3 shipped `POST /api/trip-tickets/:id/guides` to serve it. Nothing calls it yet. An endpoint with no caller is a half-built feature.

**(a) The API function.** In `apps/web/src/lib/api/trip-tickets.ts`, after `cancelTripDate` (which ends at line 409):

```ts
// The ticket is frozen to PATCH once an admin approves it, but a guide calling
// in sick on the morning of the trip is routine. This is the one write that
// reaches an approved ticket, and it is admin-only server-side.
export async function reassignTripTicketGuides(
  id: string,
  guideIds: string[]
): Promise<TripTicket> {
  return toSnake(
    await api.post<TripTicketApiResponse>(`/trip-tickets/${id}/guides`, {
      guideIds
    })
  );
}
```

**(b) The mutation hook.** In `apps/web/src/lib/mutation/trip-tickets.ts`, following `useCancelTripDate` exactly — same `invalidateTripTicket` helper, same toast shape:

```ts
export const useReassignGuides = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, guideIds }: { id: string; guideIds: string[] }) =>
      reassignTripTicketGuides(id, guideIds),
    onSuccess: (_data, variables) => {
      invalidateTripTicket(queryClient, variables.id);
      toast.success('Guides reassigned successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to reassign guides: ${error.message}`);
    }
  });
};
```

Add `reassignTripTicketGuides` to the import block at the top of the file alongside `cancelTripDate`.

**(c) The control.** On the ticket detail page, an admin-only "Reassign guides" button beside the `Guides` `DetailItem`, shown only while the ticket is `approved` or `in_progress` — the same allowed-from list the server enforces, so the UI cannot offer a call that will 409.

It opens the same repeating-`Select` block built in Step 8 of this task, seeded from `tripTicket.guides.map((g) => g.id)` and filtered by `useEmployees(tripTicket.branch_id)`. Confirm through `ConfirmationModal` (already imported at line 24), then call `useReassignGuides()`.

Reuse the Step 8 rows rather than writing a second picker. If that means lifting the rows into a small `GuidePicker` component that both the booking form and this page import, do that — a second divergent copy is how the trip-ticket edit form ended up as the degraded dead code documented in the design's background section.

The server re-runs the capacity check on this endpoint, so a swap that overflows the van comes back as `409 OVER_CAPACITY`. Surface `error.message` in the toast — it names both figures — rather than a generic failure string.

- [ ] **Step 15: Typecheck, lint, and commit**

```bash
pnpm --filter @mms/shared build
pnpm --filter @mms/web exec tsc -b
pnpm --filter @mms/web lint
```

Expected: all three clean. `tsc -b` is the one that proves `TripTicket.guides` is threaded correctly — `toSnake`'s typed return makes a missing key a compile error, not a runtime surprise.

```bash
npx prettier --write apps/web/src/lib/api/trip-tickets.ts apps/web/src/lib/mutation/trip-tickets.ts apps/web/src/components/pages/trip-tickets/trip-tickets-inner/index.tsx
git add apps/web/src/lib apps/web/src/components/pages/trip-tickets
git commit -m "feat(web): show trip guides on the ticket detail and allow reassignment"
```

Do not push.

---

## Task 6: End-to-end coverage

> **Corrections applied to this task — these override anything below that disagrees.**
>
> 1. **Delete five steps that belong to earlier tasks.** `apps/api/src/test/db.ts` and `apps/api/src/test/factories.ts` are owned by Task 1; `trip-tickets.test.ts`, `trip-ticket-booking.test.ts` and `trip-ticket-transitions.test.ts` are owned by Task 3. For each, verify the edit is already present and move on. **Do not re-apply them.**
> 2. **The three Playwright fixture repairs** (`trip-lifecycle.spec.ts`, `multi-date-trip.spec.ts`, `organization.spec.ts`) moved to Task 3. Verify, don't redo.
> 3. **`apps/web/e2e/trip-guides.spec.ts` is created once, here.** Task 5's draft also proposed creating it; that content is folded in as assertions rather than a second file.
> 4. **Drop the claim that `tools.spec.ts` keeps a copy of the `detailValue` idiom.** Only `organization.spec.ts:140` defines it, and no file defines `fieldGroup`. The conclusion (don't promote it to `helpers.ts`) still stands; the stated precedent does not.
> 5. **Commit the uncommitted `apps/web/e2e/helpers.ts` change first.** `git diff` shows an unstaged `API_URL` fix from `3000` to `3001` sitting in the working tree. Until it is committed, every e2e teardown in this task talks to the wrong port.

**Files:**

- [modify] apps/api/src/test/db.ts @ 3-31 (the TABLES array) — Add `trip_ticket_employees` (immediately before `trip_tickets`) and `employees` (with the other branch-scoped reference tables) so both new tables are truncated between suites.
- [modify] apps/api/src/test/factories.ts @ 95-101 (createTestOfficeHead), append after it — Add `createTestEmployee(branchId, name?)`, shaped exactly like `createTestOfficeHead`.
- [modify] apps/api/src/modules/trip-tickets/trip-tickets.test.ts @ 5-9 (factories import), 14-41 (scaffold), 53-74 (ticketBody) — scaffold() creates an employee; ticketBody() sends `guideIds`. One edit repairs all 7 POSTs in the file.
- [modify] apps/api/src/modules/trip-tickets/trip-ticket-booking.test.ts @ 5-9 (factories import), 60-83 (end of scaffold), 96-108 (body helper) — scaffold() creates an employee; body() sends `guideIds`. One edit repairs all 4 POSTs in the file.
- [modify] apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts @ 5-9 (factories import), 101-149 (approvedTwoDateTicket tail), 568-580 (the rebook POST) — NOT named in the design spec's list. approvedTwoDateTicket() gains an employee and returns it; the inline rebook POST sends `guideIds`.
- [modify] apps/api/src/modules/organization/enforcement.test.ts @ 5-13 (factories import), 171-201, 203-240, 304-333, 335-364 — NOT named in the design spec's list. Four inline POST bodies each gain a guide created on their own live branch.
- [test] apps/api/src/modules/organization/employee-archive.test.ts — NEW. Archiving an employee is refused 409 IN_USE while they guide a live ticket, and allowed once that ticket is completed / cancelled / disapproved; the archived employee is still named on the historical ticket; a sibling employee is not counted.
- [modify] apps/web/e2e/trip-lifecycle.spec.ts @ 40-62 (fixture resolution + the POST body) — Resolve a SEEDED employee (this spec has no teardown, so it must not create rows) and send `guideIds`.
- [modify] apps/web/e2e/multi-date-trip.spec.ts @ 89-97 (fixture resolution), 111-139, 188-207, 248-267 (three POST bodies) — Resolve one seeded guide alongside the other fixtures; all three POSTs send `guideIds`.
- [modify] apps/web/e2e/organization.spec.ts @ 470-503 (fleet lookup + the POST body) — Borrow a seeded guide rather than creating one on the branch this test later archives — an active employee on that branch would block the archive at :527.
- [test] apps/web/e2e/trip-guides.spec.ts — NEW. Admin adds an employee on Organization → Employees, books a trip picking them in the Guides field, and the ticket detail names them; a sibling-branch employee is proven absent from the picker. Per-id, correctly ordered teardown.

**Interfaces:**

_Produces:_

- apps/api/src/test/factories.ts → createTestEmployee(branchId: string, name = 'Ramon Dela Cruz'): Promise<Employee> — Prisma model `Employee`, mirrors createTestOfficeHead; branchId is positional and required (Employee.branchId is non-null, unlike OfficeHead's)
- apps/api/src/test/db.ts → TABLES gains the string literals 'trip_ticket_employees' (immediately before 'trip_tickets') and 'employees' (after 'office_heads', before 'branches')
- apps/api/src/modules/trip-tickets/trip-tickets.test.ts → scaffold() return type widens to { branch, vehicle, driver, employee }; ticketBody(s, requestedById) parameter type gains `employee: { id: string }`
- apps/api/src/modules/trip-tickets/trip-ticket-booking.test.ts → scaffold() return (and therefore the exported-in-file `type Scaffold`) gains `employee`
- apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts → approvedTwoDateTicket() return gains `employee`
- apps/api/src/modules/organization/employee-archive.test.ts → new file, no exports
- apps/web/e2e/trip-guides.spec.ts → new file, no exports; local helpers fieldGroup(scope: Locator, label: string): Locator and detailValue(page: Page, label: string): Locator are deliberately NOT promoted to helpers.ts (organization.spec.ts and tools.spec.ts each keep their own copies of this idiom)

_Consumes:_

- Prisma model `Employee { id, name, position?, phone?, branchId (required), createdAt, updatedAt, archivedAt? }` with relation `tripTickets TripTicketEmployee[]` — Task 1 (schema + migration)
- Prisma model `TripTicketEmployee { tripTicketId, employeeId, createdAt, updatedAt }` with `@@id([tripTicketId, employeeId])` — accessed as `prisma.tripTicketEmployee.create({ data: { tripTicketId, employeeId } })` — Task 1
- prisma/seed.ts must upsert employees for BOTH Main Branch and North Branch, OUTSIDE the `tripTicket.count() === 0` guard at seed.ts:297 — Task 1. Three repaired e2e specs resolve their guide from `GET /api/employees` and assert it is truthy; a dev database that already has tickets would otherwise get no employees at all.
- `guideIds: z.array(z.string().uuid()).min(1)` on createTripTicketBodySchema (packages/shared/src/contracts/trip-tickets.ts) — Task 3. A missing guideIds must produce 400 VALIDATION_ERROR (ZodError → error-handler.ts:46-55); step 2's expected failure output depends on exactly that.
- `tripTicketInclude` (apps/api/src/modules/trip-tickets/repository.ts:6-13) gains `guides: { include: { employee: true } }` so `GET /api/trip-tickets/:id` returns `guides: { employeeId, employee: { name, … } }[]` — Task 3/D. Asserted in employee-archive.test.ts and in trip-guides.spec.ts.
- `employeeBlockers(id): Promise<Blocker[]>` in apps/api/src/modules/organization/guard.ts, counting `prisma.tripTicket.count({ where: { guides: { some: { employeeId: id } }, status: { in: [...LIVE_TRIP_STATUSES] } } })` under resource name `'tripTickets'` — Task 2/C
- Routes `POST /api/employees`, `POST /api/employees/:id/archive` (200 with the row, or 409 IN_USE with `details.blockers`), `POST /api/employees/:id/restore`, and `GET /api/employees` accepting `?includeArchived=true` and returning `{ data, count }` with camelCase `branchId`/`archivedAt` — Task 2
- createEmployeeBodySchema accepts `{ name, branchId }` with position/phone omitted (they are `nullableString`, i.e. optional) — Task 2; trip-guides.spec.ts posts the negative-control employee with exactly those two keys
- Organization page: a 4th tab whose TabsTrigger accessible name is exactly `Employees`; RESOURCE_META entry `{ title: 'Employees', addLabel: 'Add Employee', columns: ['Name', 'Position', 'Branch'] }`; RESOURCE_LABELS entry `employees: 'Employee'` so the create dialog reads 'Create a new employee.' and its submit button 'Add Employee' — Task 4
- record-dialog.tsx `case 'employees'` FieldConfig[] whose keys are `name`, `position`, `phone`, `branchId` — the dialog wires `id={f.key}`, so trip-guides.spec.ts addresses `#name`, `#position`, and reaches the branch combobox through its role="group" Field labelled 'Branch' — Task 4
- add-trip-ticket/form.tsx: a Guides field whose FieldLabel text contains the word `Guides`, rendered inside a `Field` (role="group"), holding one or more Radix `Select` triggers (role="combobox") whose options (role="option") are the TRIP branch's unarchived employees and whose label contains the employee's name — Task 4. A div-based picker or a multi-select without ARIA roles cannot be driven by this spec (design §9.3).
- `useOrgInvalidation` in apps/web/src/lib/mutation/organization.ts gains an employees branch — Task 4. trip-guides.spec.ts fails with a 15s timeout on the picker option if this is missing.
- trip-tickets-inner/index.tsx renders `<DetailItem label="Guides" … />` — a dt/dd pair, which is what detailValue(page, 'Guides') targets — Task 4

**Before you start — gotchas found while drafting this task:**

- ALL SEVEN line numbers in design §12 are correct as of today, verified individually: trip-lifecycle.spec.ts:56-57, multi-date-trip.spec.ts:124-125 / 197-198 / 257-258, organization.spec.ts:493-494, trip-ticket-booking.test.ts:103, trip-tickets.test.ts:68-69. All seven are the `participants:` / `participantsCount:` pair inside a create body.
- BUT the list is INCOMPLETE. `grep -rn "post('/api/trip-tickets')"` finds five more POST sites the design document does not name: apps/api/src/modules/organization/enforcement.test.ts:182, :215, :313, :344 and apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts:569. All five send inline bodies with no helper, so each needs its own edit. Two of the four enforcement ones assert 409 PARENT_ARCHIVED, which the new 400 VALIDATION_ERROR masks — the failure reads as an archived-parent bug.
- The true shape is 12 POST call sites across 7 files, but only 8 edits: trip-tickets.test.ts's `ticketBody` covers 7 of its own POSTs and trip-ticket-booking.test.ts's `body` covers 4 of its own.
- In trip-ticket-transitions.test.ts, `pendingTicket()` (line 14) and `approvedTwoDateTicket()` (line 82) both write their tickets with `prisma.tripTicket.create`, bypassing the router entirely — they need no guide. Only the `rebook` POST at :568 goes through HTTP. Same for `createTestTicket` in factories.ts and every fixture in trip-ticket-guard.test.ts.
- organization.spec.ts is the trap. Its ticket is filed under a branch the test CREATES and later ARCHIVES (line 527, asserting success). branchBlockers gains an active-employee count, so creating the guide on that branch turns a passing archive into a 409 IN_USE two hundred lines from the edit. The guide must be borrowed from the seeded roster; the server does not check branch membership (§5.2), so that is legitimate, not a workaround.
- trip-lifecycle.spec.ts has no teardown at all (design §12 names it the anti-pattern), so it must not CREATE an employee — it borrows a seeded one. multi-date-trip.spec.ts does have per-id teardown but employees have no hard-delete route, so it borrows too.
- Capacity after the change: trip-lifecycle 1 participant + 1 guide, multi-date 1+1 ×3, organization 1+1, trip-tickets.test.ts 2+1 against capacity 5, trip-ticket-booking.test.ts 1+1 against capacity 5, transitions rebook 0+1. Nothing approaches a limit. The OVER_CAPACITY test at trip-ticket-booking.test.ts:730 now sends 8+1 against 5 and still 409s for the reason it was written for; PARTICIPANTS_MISMATCH at :740 is untouched because guides never reconcile against participantsCount.
- apps/web/e2e/ is NOT typechecked. tsconfig.app.json includes only `src` and tsconfig.node.json only `vite.config.ts`, so `tsc -b` never reads a spec file; Playwright transpiles without checking. `eslint .` DOES cover `**/*.{ts,tsx}` including e2e, but non-type-aware — it catches unused vars, not a wrong property name. A typo in a spec surfaces only as a runtime failure or, worse, as `undefined`.
- Playwright's `hasText` is a case-insensitive substring match, so `fieldGroup(scope, 'Branch')` would also match a group containing "borrow from another branch". It is safe here only because `getByRole` skips elements hidden from the accessibility tree, and the booking wizard hides its other steps with a `hidden` class (display:none). Do not reuse the helper on a screen where two visible groups share a word.
- Cleanup order in trip-guides.spec.ts is load-bearing and is the same rule the new API test pins: the ticket must be DELETEd before the employee can be archived, because an employee guiding a live ticket is refused with 409 IN_USE. Reversing the two makes the teardown silently leave a live employee row behind on every run.
- Every run of trip-guides.spec.ts leaves two archived employees on the seeded branches — employees have no hard-delete route. This is the same accumulation organization.spec.ts already causes for branches and offices, and archived rows do not block anything (branchBlockers counts active children only), so it is accepted rather than solved.
- The seed dependency is easy to get wrong in Task 1: employees must be upserted OUTSIDE the `if ((await prisma.tripTicket.count()) === 0)` guard at seed.ts:297. Any developer machine that has run the seed before already has tickets, so an employee block placed inside that guard never executes and three repaired e2e specs fail on `expect(guide, 'a seeded employee is available…').toBeTruthy()` — which reads as a spec bug, not a seed bug.
- The API test database migrates itself: apps/api/src/test/global-setup.ts runs `prisma migrate deploy` against TEST_DATABASE_URL on every `vitest run`. The DEV database does not — `pnpm db:migrate` and `pnpm db:seed` are separate, and are what the browser suite reads.
- Playwright starts nothing. playwright.config.ts has no `webServer` block and says so in its header comment; `pnpm dev` (which runs `predev` → `pnpm --filter @mms/shared build` first) must already be serving web :5173 and api :3001. `API_URL` in e2e/helpers.ts defaults to http://localhost:3001 and must match PORT in apps/api/.env — when they disagree every direct call, cleanup DELETEs included, fails and leaves rows behind. That default was wrong (3000) until an uncommitted fix currently sitting in the working tree; commit it or the whole suite's teardown is dead.
- Baselines to record BEFORE starting, not after: today the repo has 48 API test files (~386 `it(` calls; 395 tests as last written down at handoff, the difference being `it.each` expansion) and 17 Playwright tests excluding `@capture`. This task adds 5 API tests in 1 new file and 1 Playwright test, so the targets are 49 files and 18 passed.
- apps/api/src/modules/organization/employee-archive.test.ts is a deliberately separate file from whatever employees CRUD suite Task 2 writes — one rule across the whole status enum, not another endpoint, exactly the split between trip-ticket-booking.test.ts and trip-tickets.test.ts. If Task 2 has already put an equivalent archive test in employees.test.ts, delete the duplicate rather than keeping both.
- `createTestEmployee` and the db.ts TABLES entries are shared test infrastructure that design §12 assigns to no particular slice. If an earlier task landed them, verify the signature matches `createTestEmployee(branchId, name = 'Ramon Dela Cruz')` and skip — a second factory with a different argument order is worse than none.
- The design document leaves one thing genuinely under-specified for this task: it never says how a guide is labelled in the picker or on the ticket detail page. trip-guides.spec.ts therefore matches the option non-exactly (the label may carry the position, per §4.1) and asserts the detail value with toContainText rather than toHaveText. If Task 4 renders guides as anything other than a `DetailItem label="Guides"`, the dt/dd assertion needs revisiting — that is the one selector here with no anchor in the design document.

### Steps

- [ ] **Step 1: Write the employee-archive test: history never blocks**

New file, `apps/api/src/modules/organization/employee-archive.test.ts`. It sits beside the employees CRUD suite rather than inside it for the same reason `trip-ticket-booking.test.ts` sits beside `trip-tickets.test.ts` — it is one rule exercised across the whole status enum, not another endpoint.

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestEmployee,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

// Design §10: `IN_USE` keeps the rule the rest of this module already keeps —
// history never blocks. A LIVE ticket holds its guide; a completed, cancelled
// or disapproved one is a record of who went, and a record must never stop an
// admin retiring somebody who has left. Getting this backwards is invisible
// until the day an employee resigns and cannot be archived, ever.
const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({
    email: 'boss@test.local',
    role: 'admin'
  });
  return authHeader(user.id, user.email, 'admin');
}

// One branch, one employee, one ticket in the requested status, with the
// employee guiding it. Everything is fresh per call — truncateAll runs before
// each test — so a blocker count below can only have come from here.
async function guideOnTicket(
  status:
    | 'pending_admin_approval'
    | 'pending_fuel_allocation_approval'
    | 'approved'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'disapproved'
) {
  const branch = await createTestBranch('Rostered');
  const vehicle = await createTestVehicle(branch.id);
  // Inactive on purpose: this suite is about the EMPLOYEE's blockers, and the
  // ticket only needs a driverId to exist.
  const driver = await createTestDriver(branch.id, 'inactive');
  const employee = await createTestEmployee(branch.id, 'Ramon Dela Cruz');
  const ticket = await createTestTicket({
    branchId: branch.id,
    driverId: driver.id,
    vehicleId: vehicle.id,
    status
  });
  // createTestTicket writes the ticket row only. The join row is what makes
  // this employee a guide — and it is written straight through Prisma so the
  // fixture can put the ticket in statuses the booking route would refuse.
  await prisma.tripTicketEmployee.create({
    data: { tripTicketId: ticket.id, employeeId: employee.id }
  });
  return { branch, employee, ticket };
}

describe('archiving an employee who is guiding a trip', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('is refused while the trip is live, and the dialog is told what blocks it', async () => {
    const header = await adminHeader();
    const { employee } = await guideOnTicket('approved');

    const res = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
    // The count, not just the code: `details.blockers` is what the archive
    // dialog renders as "1 trip ticket" instead of a flat refusal.
    expect(res.body.error.details.blockers).toContainEqual({
      resource: 'tripTickets',
      count: 1
    });

    // And it really did not archive.
    const still = await prisma.employee.findUnique({
      where: { id: employee.id }
    });
    expect(still?.archivedAt).toBeNull();
  });

  it('is still refused once the trip is out on the road (in_progress)', async () => {
    const header = await adminHeader();
    const { employee } = await guideOnTicket('in_progress');

    const res = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
  });

  it('is allowed once the trip is completed, and the trip still names them', async () => {
    const header = await adminHeader();
    const { employee, ticket } = await guideOnTicket('completed');

    const res = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).not.toBeNull();

    // Design §8: archiving hides someone from future bookings; it never
    // rewrites history. The guide is read through the join with the employee
    // included, so the finished trip keeps the name of who was on it.
    const fetched = await request(app)
      .get(`/api/trip-tickets/${ticket.id}`)
      .set('Authorization', header);
    expect(fetched.status).toBe(200);
    expect(
      (fetched.body.guides as { employee: { name: string } }[]).map(
        (g) => g.employee.name
      )
    ).toEqual(['Ramon Dela Cruz']);
  });

  it('is allowed for a cancelled trip, and for a disapproved one', async () => {
    const header = await adminHeader();
    const { employee, ticket } = await guideOnTicket('cancelled');

    const first = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(first.status).toBe(200);

    // Restore, then repeat against `disapproved`. `completed` used to be the
    // only history status any of these suites exercised — if LIVE_TRIP_STATUSES
    // quietly grew `cancelled` or `disapproved`, nothing above would fail.
    const restored = await request(app)
      .post(`/api/employees/${employee.id}/restore`)
      .set('Authorization', header);
    expect(restored.status).toBe(200);

    await prisma.tripTicket.update({
      where: { id: ticket.id },
      data: { status: 'disapproved' }
    });
    const second = await request(app)
      .post(`/api/employees/${employee.id}/archive`)
      .set('Authorization', header);
    expect(second.status).toBe(200);
  });

  it("does not count a colleague's live trip", async () => {
    const header = await adminHeader();
    const { branch } = await guideOnTicket('approved');
    // A second employee on the SAME branch, guiding nothing. Drop the
    // `employeeId` filter from employeeBlockers and this is the only test that
    // notices — every other one in this file uses exactly one employee.
    const bystander = await createTestEmployee(branch.id, 'Never Rostered');

    const res = await request(app)
      .post(`/api/employees/${bystander.id}/archive`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the new archive test, then prove every assertion can fail**

```bash
pnpm --filter @mms/api exec vitest run src/modules/organization/employee-archive.test.ts
```

Expect `Tests  5 passed (5)`.

Green on the first run is expected here — the behaviour landed in the earlier slices. So this step is not finished until each assertion has been shown to be load-bearing (design §12: _"Every assertion must be able to fail: break the line it covers, confirm a real failure, restore, confirm byte-identical."_). Three mutations, each applied and reverted one at a time:

1. **Delete the `status: liveTicket` filter** from `employeeBlockers` in `apps/api/src/modules/organization/guard.ts`. Expected: the completed / cancelled / disapproved tests flip to
   ```
   AssertionError: expected 409 to be 200 // Object.is equality
   ```
2. **Replace `liveTicket` with `{ in: ['approved'] }`** in the same check. Expected: `is still refused once the trip is out on the road (in_progress)` fails with `expected 200 to be 409`, and nothing else moves — that is the test earning its place.
3. **Drop `guides: { include: { employee: true } }`** from `tripTicketInclude` in `apps/api/src/modules/trip-tickets/repository.ts`. Expected: the history read-back throws rather than asserting, because `fetched.body.guides` is `undefined`:
   ```
   TypeError: Cannot read properties of undefined (reading 'map')
   ```
   This is the failure mode design §7.1 calls out as producing _no compile error and no runtime error, just missing data_ — this assertion is the only thing in the repo that catches it from the archive side.

After reverting all three, re-run and confirm 5 passed, then:

```bash
git add apps/api/src/modules/organization/employee-archive.test.ts
git commit -m "test(api): pin that only a live trip blocks archiving its guide"
```

- [ ] **Step 3: Write the new end-to-end spec: add an employee, book them as a guide, read them back**

New file, `apps/web/e2e/trip-guides.spec.ts`. Teardown follows `multi-date-trip.spec.ts`'s per-id try/catch, **not** `trip-lifecycle.spec.ts`, which cleans up nothing.

```ts
import { test, expect, type Locator } from '@playwright/test';
import {
  login,
  shot,
  CREDENTIALS,
  apiLogin,
  apiGet,
  apiPost,
  apiDelete,
  listData
} from './helpers';

// Design §1's whole promise, walked through the browser once: the employee
// does not exist when this starts, is created on the Organization page's
// fourth tab, is chosen in the booking form's Guides picker, and is read back
// off the ticket that results. Nothing here is staged through the API except
// the negative control and the teardown.
//
// It is also the only guard on two things that fail silently. First, the
// `useOrgInvalidation` employees branch: without it, a freshly added employee
// never reaches the booking picker and this spec times out looking for the
// option. Second, the picker's branch lock, which is enforced in the UI ONLY
// (§5.2) — the server does not check branch membership, so if the filter goes
// the negative control below is the single thing anywhere that notices.

// Scopes a control through its enclosing Field, which renders role="group"
// (components/ui/field.tsx). Both dialogs this spec drives put a FieldLabel
// against a Radix SelectTrigger with no id, so the label is orphaned and
// getByLabel cannot reach the combobox — the same reason organization.spec.ts
// has branchGroup(). getByRole skips display:none, so the wizard's three
// hidden steps never make this ambiguous.
function fieldGroup(scope: Locator, label: string): Locator {
  return scope.getByRole('group').filter({ hasText: label });
}

// One fact out of a record's read-only detail view: every value is a <dd> next
// to its <dt> (components/shared/detail-view.tsx), and a value the page cannot
// resolve renders as an em dash — so this targets the <dd> itself rather than
// searching the page for a name that may simply be absent. Same idiom as
// organization.spec.ts's detailValue() and tools.spec.ts's metricValue().
function detailValue(page: Page, label: string): Locator {
  return page.locator(
    `xpath=//dt[normalize-space()=${JSON.stringify(label)}]/following-sibling::dd[1]`
  );
}

test('an admin adds a branch employee, books them as a trip guide, and the ticket names them', async ({
  page,
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const stamp = Date.now();
  // Run-unique. Employees deliberately have NO name uniqueness (§4.3), so a
  // fixed name would not collide — it would do something worse, and make the
  // row this run created indistinguishable from the one the last run left.
  const employeeName = `E2E Guide ${stamp}`;
  const northName = `E2E North Guide ${stamp}`;
  const destination = `GUIDE-E2E ${stamp}`;

  const createdEmployeeIds: string[] = [];
  let tripId: string | undefined;

  try {
    // ---------- The negative control, staged through the API ----------
    // An employee of a DIFFERENT branch. Nothing about creating it is under
    // test; what matters is that it never appears in a Main Branch picker.
    const branches = listData(
      await apiGet(request, '/api/branches', admin.token)
    );
    const northBranchId = branches.find((b) => b.name === 'North Branch')
      ?.id as string | undefined;
    expect(northBranchId, 'the seeded North Branch resolves').toBeTruthy();
    const north = await apiPost(request, '/api/employees', admin.token, {
      name: northName,
      branchId: northBranchId
    });
    expect(north.ok, "the picker's negative control is created").toBeTruthy();
    createdEmployeeIds.push((north.body as { id: string }).id);

    await login(page, 'admin');

    // ---------- 1: add an employee on Organization → Employees ----------
    await page
      .getByRole('link', { name: 'Organization', exact: true })
      .first()
      .click();
    await page.waitForURL(/\/organization/, { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Employees', exact: true }).click();

    await page.getByRole('button', { name: 'Add Employee' }).click();
    const addDialog = page.getByRole('dialog');
    await expect(addDialog.getByText('Create a new employee.')).toBeVisible({
      timeout: 15_000
    });
    await addDialog.locator('#name').fill(employeeName);
    await addDialog.locator('#position').fill('Tour Guide');
    await fieldGroup(addDialog, 'Branch').getByRole('combobox').click();
    await page
      .getByRole('option', { name: 'Main Branch', exact: true })
      .click();
    // The dialog's submit shares its accessible name with the tab's own "Add
    // Employee" button; scoping to the dialog is what disambiguates the click.
    await addDialog.getByRole('button', { name: 'Add Employee' }).click();
    await expect(addDialog).toBeHidden({ timeout: 15_000 });

    const employeeRow = page.getByRole('row').filter({ hasText: employeeName });
    await expect(employeeRow).toBeVisible({ timeout: 15_000 });
    await expect(
      employeeRow,
      'the roster row resolves the branch and the position it was given'
    ).toContainText('Main Branch');
    await expect(employeeRow).toContainText('Tour Guide');
    await shot(page, 'trip-guides-1-employee-created');

    // The UI never shows the id, and teardown needs it.
    const employeeId = listData(
      await apiGet(request, '/api/employees?includeArchived=true', admin.token)
    ).find((e) => e.name === employeeName)?.id as string | undefined;
    expect(employeeId, 'the new employee resolves via the API').toBeTruthy();
    createdEmployeeIds.push(employeeId!);

    // ---------- 2: book a trip and pick them as the guide ----------
    await page
      .getByRole('link', { name: 'Trip Tickets', exact: true })
      .first()
      .click();
    await page.waitForURL(/\/trip-tickets/, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Create Trip Ticket' }).click();
    const booking = page.getByRole('dialog');
    await expect(
      booking.getByText('Submit a trip ticket request for admin approval.')
    ).toBeVisible({ timeout: 15_000 });

    // Step 1 of 4 — "Who it's for".
    await fieldGroup(booking, 'Branch').getByRole('combobox').click();
    await page
      .getByRole('option', { name: 'Main Branch', exact: true })
      .click();
    await fieldGroup(booking, 'Department/Office/College')
      .getByRole('combobox')
      .click();
    // Seeded under Main Branch (apps/api/prisma/seed.ts) — the same class of
    // fixture organization.spec.ts leans on Main Branch itself for.
    await page
      .getByRole('option', { name: 'Operations Office', exact: true })
      .click();
    await booking.getByRole('button', { name: 'Continue' }).click();

    // Step 2 of 4 — "The trip", where Guides sits directly above Participants.
    await fieldGroup(booking, 'Vehicle').getByRole('combobox').click();
    // Any free van: each option's label carries make/model/plate/seats, none of
    // which this spec cares about, and the smallest seeded one holds 3 — more
    // than the one participant and one guide below.
    await page.getByRole('option').first().click();
    await fieldGroup(booking, 'Driver').getByRole('combobox').click();
    await page.getByRole('option').first().click();
    await booking.locator('#destination').fill(destination);
    await booking.locator('#purpose').fill('E2E guide selection');
    await booking.getByPlaceholder('Participant 1').fill('E2E Passenger');

    const guides = fieldGroup(booking, 'Guides');
    await guides.getByRole('combobox').first().click();
    // The branch lock, proved with a positive control in the same open
    // listbox: asserting toHaveCount(0) against a popover that never opened
    // would pass for entirely the wrong reason.
    await expect(
      page.getByRole('option', { name: employeeName }),
      "this branch's own employee is offered"
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('option', { name: northName }),
      'another branch’s employee is not'
    ).toHaveCount(0);
    // Not `exact`: the picker may render the position beside the name to tell
    // two similarly-named people apart (§4.1), and the stamp already makes
    // this name unique on its own.
    await page.getByRole('option', { name: employeeName }).click();
    await expect(
      guides.getByRole('combobox').first(),
      'the picker keeps the chosen guide'
    ).toContainText(employeeName);
    await shot(page, 'trip-guides-2-guide-selected');
    await booking.getByRole('button', { name: 'Continue' }).click();

    // Step 3 of 4 — "When". Far-future and distinct from every other spec's
    // window (multi-date uses +60/+62/+64, organization +150): an overlap
    // fails with VEHICLE_DOUBLE_BOOKED, a fixture collision rather than a bug.
    const day = new Date(Date.now() + 200 * 86_400_000);
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    // Built from LOCAL parts, never toISOString(): the form parses
    // `${date}T${time}` browser-local, and a UTC round-trip shifts the day at
    // any non-zero offset. Addressed by attribute because a CSS id selector
    // would need the dots in `dates.0.date` escaped.
    await booking.locator('[id="dates.0.date"]').fill(ymd);
    // The row's times already default to 08:00-17:00 (useTripTicketForm).
    await booking.getByRole('button', { name: 'Continue' }).click();

    // Step 4 of 4 — Review, then submit. The confirmation dialog's action
    // button shares the name "Submit Request" with the form's own submit, so
    // that click is scoped to the alertdialog — the same disambiguation
    // tools.spec.ts makes for "Update Tool".
    const posted = page.waitForResponse(
      (res) =>
        res.url().endsWith('/api/trip-tickets') &&
        res.request().method() === 'POST'
    );
    await booking.getByRole('button', { name: 'Submit Request' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible({ timeout: 15_000 });
    await confirm
      .getByRole('button', { name: 'Submit Request', exact: true })
      .click();

    const response = await posted;
    expect(
      response.status(),
      'the booking carried a guide and was accepted'
    ).toBe(201);
    tripId = ((await response.json()) as { id: string }).id;
    await expect(booking).toBeHidden({ timeout: 15_000 });

    // ---------- 3: the ticket names its guide ----------
    await page.goto(`/trip-tickets/${tripId}`);
    await expect(
      detailValue(page, 'Guides'),
      'the ticket detail names the employee guiding it'
    ).toContainText(employeeName, { timeout: 15_000 });
    await shot(page, 'trip-guides-3-ticket-shows-guide');

    // And the join really was written, rather than the page echoing something
    // it still held from the form it was just submitted from.
    const detail = (await apiGet(
      request,
      `/api/trip-tickets/${tripId}`,
      admin.token
    )) as { guides?: { employee: { name: string } }[] };
    expect(
      (detail.guides ?? []).map((g) => g.employee.name),
      'the ticket carries exactly the one guide that was picked'
    ).toEqual([employeeName]);
  } finally {
    // ---------- Cleanup, in the only order that works ----------
    // The TICKET goes first, and by DELETE: nothing approved it, so it is
    // still pending_admin_approval — the only status service.remove accepts.
    // It has to be gone before the employee can be retired, because an
    // employee guiding a LIVE ticket is refused with 409 IN_USE (§10).
    if (tripId) {
      try {
        const del = await apiDelete(
          request,
          `/api/trip-tickets/${tripId}`,
          admin.token
        );
        if (!del.ok) {
          console.error(
            `trip-guides cleanup: deleting ticket ${tripId} failed (HTTP ${del.status})`
          );
        }
      } catch (err) {
        console.error(
          `trip-guides cleanup: deleting ticket ${tripId} threw:`,
          err
        );
      }
    }
    // Employees have no hard-delete route — only archive and restore (§7) — so
    // cleanup retires the rows rather than removing them, exactly as
    // organization.spec.ts's afterAll archives the branches and offices it
    // created. Per-id try/catch: a Playwright APIRequestContext throws on
    // connection-level failures, and without the isolation one bad id would
    // strand every id after it.
    for (const id of createdEmployeeIds) {
      try {
        const arch = await apiPost(
          request,
          `/api/employees/${id}/archive`,
          admin.token,
          {}
        );
        // A 409 means something still holds it — worth reporting, not throwing.
        if (!arch.ok) {
          console.error(
            `trip-guides cleanup: archiving employee ${id} failed (HTTP ${arch.status})`
          );
        }
      } catch (err) {
        console.error(
          `trip-guides cleanup: archiving employee ${id} threw:`,
          err
        );
      }
    }
  }
});
```

Add `type Page` to the Playwright import at the top (`import { test, expect, type Locator, type Page } from '@playwright/test';`) — `detailValue` needs it.

- [ ] **Step 4: Run the new spec, prove its assertions can fail, then commit**

```bash
pnpm --filter @mms/web exec playwright test e2e/trip-guides.spec.ts
```

Expect `1 passed`. Then make each of the three load-bearing assertions fail, one at a time, reverting after each:

1. **Remove `employees` from the invalidation map** in `apps/web/src/lib/mutation/organization.ts` (`useOrgInvalidation`). Expected: the picker never learns about the new employee and the spec fails at
   ```
   Error: this branch's own employee is offered
   Timed out 15000ms waiting for expect(locator).toBeVisible()
   ```
   This is the omission the comment at `lib/mutation/organization.ts:37` exists to guard against, and nothing else in the suite catches it.
2. **Drop the branch filter** from the guides picker's option list in `add-trip-ticket/form.tsx` (offer every active employee instead of the trip branch's). Expected:
   ```
   Error: another branch's employee is not
   Expected: 0
   Received: 1
   ```
3. **Delete the `<DetailItem label="Guides" …>`** from `trip-tickets-inner/index.tsx`. Expected the detail assertion to fail on an empty locator rather than on wrong text — the `<dd>` does not exist at all:
   ```
   Error: the ticket detail names the employee guiding it
   Timed out 15000ms waiting for expect(locator).toContainText(expected)
   ```

After reverting all three, re-run, confirm `1 passed`, and confirm the run left nothing behind: the ticket is gone and both employees are archived.

```bash
git add apps/web/e2e/trip-guides.spec.ts
git commit -m "test(e2e): cover adding a branch employee and booking them as a trip guide"
```

- [ ] **Step 5: Run the full repo verification set, in order**

The order is not cosmetic. `@mms/shared` compiles to `dist/`, and both `@mms/api` and `@mms/web` import it from there — so a stale `dist` makes every downstream typecheck fail on the new contracts, or worse, pass against the old ones.

```bash
# 0. Postgres, if it is not already up
pnpm db:up

# 1. FIRST, always — api and web import the BUILT dist, not the source
pnpm --filter @mms/shared build

# 2-3. API
pnpm --filter @mms/api typecheck
pnpm --filter @mms/api test          # vitest globalSetup migrates mms_test itself

# 4-5. Web (note: tsconfig.app.json includes only `src`, so this does NOT
#      typecheck e2e/ — `lint` is the only thing that reads those files)
pnpm --filter @mms/web exec tsc -b
pnpm --filter @mms/web lint

# 6. The DEV database the browser suite drives — the test database above is a
#    different one, and migrating it does nothing for this
pnpm db:migrate
pnpm db:seed

# 7. In a SECOND terminal, and leave it running. Playwright starts no servers.
pnpm dev                             # web :5173, api :3001 (predev builds shared)

# 8. Back in the first terminal
pnpm --filter @mms/web test:e2e
```

Expected at the end of this task:

- **API:** 49 test files (48 today, plus `employee-archive.test.ts`), all passing. Record the exact figure from step 2's baseline run and confirm it grew by exactly the 5 tests this task adds plus whatever slices A-E added.
- **Playwright:** **18 passed** (17 before this task; `trip-guides.spec.ts` adds one). `--grep-invert @capture` keeps the eight screenshot specs out of the count.

If Corepack has drifted off the pinned pnpm again and every plain `pnpm` command aborts wanting to purge `node_modules`, prefix each with `corepack pnpm@10.27.0`. Do not set `CI=true` or `confirmModulesPurge=false` to get past it — both let it actually wipe `node_modules`.

Do not push. Pushing is manual, by the user.

---

## Final Verification

Run in this order. The `@mms/shared` build is first because both apps import the contracts from its built `dist` — skip it and a contract change is invisible to every typecheck that follows.

- [ ] `pnpm --filter @mms/shared build`
- [ ] `pnpm --filter @mms/shared test` — the contract tests, including the `guideIds` absent-vs-empty pins
- [ ] `pnpm --filter @mms/api typecheck` — 0 errors
- [ ] `pnpm --filter @mms/api test` — all green
- [ ] `pnpm --filter @mms/web exec tsc -b` — clean (`apps/web` has no `typecheck` script)
- [ ] `pnpm --filter @mms/web lint` — clean (`apps/api` has no `lint` script)
- [ ] `pnpm dev` in one terminal, then `pnpm --filter @mms/web test:e2e` in another — Playwright drives an already-running stack on :5173 / :3001
- [ ] `git status` shows no unintended files, and no commit carries an AI attribution trailer
- [ ] `git log --oneline` — every commit is Conventional with a package scope, and nothing has been pushed

### Behaviour to confirm by hand

- [ ] Organization → **Employees** lists both branches' rosters, and Add / Edit / Archive / Restore all work
- [ ] Archiving a branch that still has an active employee is refused, and the dialog names the employee count
- [ ] Booking a trip shows a **Guides** field above Participants, offering only the selected branch's employees
- [ ] Changing the branch mid-form clears a stranded guide selection
- [ ] The seat counter reads `N of M seats (K guides)` and the form blocks at capacity counting guides
- [ ] The server agrees: a booking over capacity returns `409 OVER_CAPACITY` naming both participants and guides
- [ ] The ticket detail shows a **Guides** row naming each guide
- [ ] An archived employee still appears by name on a ticket they already guided, and is gone from the picker
- [ ] On an `approved` ticket, an admin can reassign guides; a non-admin cannot see the control

### Before deploying

- [ ] Write `docs/branch-employees-trip-guides-rollout.md` in the shape of `docs/approval-history-and-tool-borrow-rollout.md`: §1 pre-deploy SQL probes and the rollback statement, §2 the API behaviour change for consumers (`guideIds` is now required on `POST /api/trip-tickets`), §3 the known-gaps table from spec §13, and a final verification with real numbers.
- [ ] Add a row per new endpoint to the `docs/DEVELOPER_GUIDE.md` endpoint table: the five `/api/employees` routes and `POST /api/trip-tickets/:id/guides`.
- [ ] Note in the rollout doc that **existing trip tickets keep zero guides**. There is no backfill (spec §11) and none is possible — the requirement binds new writes only. Any tooling that assumes every ticket has a guide will be wrong about historical rows.
