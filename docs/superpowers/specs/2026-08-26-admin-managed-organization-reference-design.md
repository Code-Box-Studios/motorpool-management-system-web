# Admin-Managed Organization Reference — Design

**Date:** 2026-08-26
**Status:** Draft for review
**Scope:** Let an admin add, edit, archive and restore **branches**, **department offices** and **office heads** from inside the app, instead of those rows being writable only by `prisma/seed.ts`.

---

## 1. Summary & goals

Branches, department offices and office heads are already real tables with real foreign keys, and they are already served to the frontend by `GET /api/branches`, `/api/offices` and `/api/office-heads`. What does not exist is any way to **write** them. `apps/api/src/modules/reference/router.ts` is GET-only, so the only thing that has ever created a branch is the seed — two branches, two offices, two office heads, against hardcoded uuids.

The practical consequence is that opening a third branch requires a developer and a deploy, and an office head is immortal: `Maria Santos` signs trip tickets forever, including after she leaves the company.

This design adds the write half, plus archiving.

**Goals**

- An admin can create, rename and edit branches, department offices and office heads.
- An admin can archive a record so it stops being offered anywhere, and restore it later.
- Archiving never destroys history: a trip ticket filed under a closed branch still displays that branch's name.
- Archiving cannot silently strand a resource — it is refused while anything live still points at the record, and the refusal says exactly what.
- Existing dropdowns across the app stop offering archived records without those files being edited.

**Non-goals**

- **Roles.** `roles` is the fourth read-only reference table, but role *names* are load-bearing authorization: `requireRole(USER_ROLES.admin)` compares against the literal string `'admin'` from `packages/shared/src/enums.ts`. An admin renaming a role would lock the organization out of the application. Roles stay read-only.
- **Deleting.** Archive only. `trip_tickets.branch_id` and `job_orders.branch_id` are NOT NULL, so Postgres will physically refuse to delete a branch that has ever carried a trip. There is no `DELETE` endpoint for any of the three resources.
- **Status enums.** Vehicle status, trip-ticket status, job-order status, fuel type and notification type are Postgres enums with code branching on every value (`deriveTicketStatus`, the transition state machine, the guard gate). They are not reference data and are out of scope.
- **Picklists from free text.** Driver license types, maintenance interval types, destinations and vehicle makes are free-text columns that would benefit from managed lists. Each needs its own table and a migration of existing values. Separate spec.
- **Geofence areas.** `GeofenceArea` exists in the schema with no module, router or UI. Building it is a separate subsystem (map drawing, violation detection). Separate spec.

---

## 2. Background: how this data works today

- **Schema.** `Branch`, `DepartmentOffice` and `OfficeHead` live in `apps/api/prisma/schema.prisma` under the `Org reference` heading. `Branch` has eight relations: `users`, `drivers`, `vehicles`, `departmentOffices`, `officeHeads`, `tripTickets`, `jobOrders`, `fuelAllocations`.
- **Reads.** `apps/api/src/modules/reference/` (router / controller / repository) exposes four paginated list endpoints, mounted at `/api` so the paths are `/api/roles`, `/api/branches`, `/api/offices`, `/api/office-heads`. All four require auth only — no role gate — because the booking forms need them.
- **Frontend.** `useBranches()` lives in `apps/web/src/lib/query/shared.ts`; offices and heads are fetched through `apps/web/src/lib/api/offices.ts`. Around ten call sites consume them, including `add-user`, the trip-ticket form, the vehicle form and the job-order form.
- **Writes.** None. `apps/api/prisma/seed.ts` upserts two branches (`Main Branch`, `North Branch`), two offices and two office heads against fixed uuids.
- **No soft-delete convention exists anywhere in this repository.** There is no `archivedAt`, `isActive` or `deletedAt` column in the schema. Whatever this design picks becomes the house pattern.

---

## 3. Decisions taken

Settled during brainstorming; load-bearing:

1. **Scope is the three org-reference tables.** Roles, picklists, geofences and settings are explicitly out.
2. **Archive, not delete.** Required foreign keys make deletion impossible for any record that has ever been used.
3. **Archiving is blocked while anything live points at the record** — it is not a cascade and it is not a UI-only hide. The refusal enumerates what still refers to it.
4. **"Live" excludes history.** Completed, cancelled and disapproved trip tickets never block. A branch with four hundred finished trips must still be closable; if history blocked the archive, no branch that had ever been used could ever be closed.
5. **One `organization` module**, three resources, sharing one in-use guard.
6. **One `/organization` page** with Branches / Offices / Office Heads tabs, admin-only, in its own sidebar group.

---

## 4. Data model

### 4.1 The archive column

Add to `branches`, `department_offices` and `office_heads`:

| Column | Type | Notes |
| --- | --- | --- |
| `archivedAt` | `DateTime?` mapped to `archived_at` | `NULL` means active |

`archivedAt` rather than `isActive Boolean`: it records *when* a branch was closed, which a boolean throws away, and it needs no backfill — every existing row is already active by virtue of being `NULL`.

### 4.2 Uniqueness

None of the three tables constrains `name` today, so two branches called `Main Branch` are currently possible. That is a data bug in its own right, and it becomes an active hazard once archiving exists: an admin asked to archive "Main Branch" would be choosing between two identical rows.

| Table | Constraint | Rationale |
| --- | --- | --- |
| `branches` | `lower(name)` unique | Branch names identify a place; duplicates are always an error |
| `department_offices` | `(branch_id, lower(name))` unique | "Operations Office" may legitimately exist at both Main and North |
| `office_heads` | **none** | These are people. Two employees named Juan Cruz is not an error |

Uniqueness is **case-insensitive**, so `main branch` cannot slip in beside `Main Branch`. Prisma cannot express a functional index in the schema, so both are added by raw SQL in the migration, with a `NOTE` comment on the model — exactly as `tracker_devices_active_vehicle_unique` is handled today.

Uniqueness applies across active **and** archived rows. Restoring an archived "North Branch" must not collide with a new one created in the meantime, and letting the name be reused would make the archived row ambiguous in historical records.

---

## 5. The in-use guard

The core of the feature. Archiving asks one question — "does anything live still point at this?" — of three different foreign-key sets.

### 5.1 Branch

| Blocker | Condition |
| --- | --- |
| Vehicles | any row with `branch_id = :id` |
| Drivers | `branch_id = :id` AND `status <> 'inactive'` |
| Users | `branch_id = :id` AND `status <> 'inactive'` |
| Department offices | `branch_id = :id` AND `archived_at IS NULL` |
| Office heads | `branch_id = :id` AND `archived_at IS NULL` |
| Trip tickets | `branch_id = :id` AND `status IN (LIVE_STATUSES)` |
| Job orders | `branch_id = :id` AND `status <> 'repaired'` |

### 5.2 Department office

| Blocker | Condition |
| --- | --- |
| Office heads | `office_id = :id` AND `archived_at IS NULL` |
| Trip tickets | `office_id = :id` AND `status IN (LIVE_STATUSES)` |

### 5.3 Office head

| Blocker | Condition |
| --- | --- |
| Department offices | `head_id = :id` AND `archived_at IS NULL` |
| Trip tickets | `office_head_id = :id` AND `status IN (LIVE_STATUSES)` |

### 5.4 Three properties that are easy to get wrong

**Archived children must not block.** Offices and heads can only ever be archived, never deleted. If an archived office still blocked its branch, no branch could ever be emptied and the feature would deadlock on its own first use. Every child check is scoped `archived_at IS NULL`.

**Vehicles always block; inactive drivers and users do not.** An inactive driver or user is history — the same category as a completed trip ticket. A vehicle is a physical object, and a depot cannot be closed while vans are parked in it. This asymmetry is deliberate.

**Fuel allocations are not checked.** `FuelAllocation.tripTicketId` is unique with `onDelete: Cascade` — every allocation belongs to exactly one trip ticket. The live-ticket check subsumes it.

### 5.5 `LIVE_STATUSES` is promoted

`LIVE_STATUSES` is currently a module-private const at `apps/api/src/modules/trip-tickets/service.ts:87`:

```ts
const LIVE_STATUSES = [
  'pending_admin_approval',
  'pending_fuel_allocation_approval',
  'approved',
  'in_progress'
] as const;
```

This module needs the identical list. Two copies of "which statuses still hold a resource" will drift, and the drift would be silent — an archive that wrongly succeeds strands a van. It moves to `packages/shared/src/enums.ts` beside `USER_ROLES`, and `trip-tickets/service.ts` imports it from there. Its existing comment moves with it.

### 5.6 The archived-parent invariant

Archiving is only half the guarantee. The other half:

> **No write may point a non-archived record at an archived parent.**

That covers creating an office under an archived branch, reparenting a head into an archived branch, and restoring an office whose branch is still archived. All are rejected with `409 PARENT_ARCHIVED`.

### 5.7 Enforcement beyond the picker

Excluding archived rows from the list endpoint stops them being *offered*. It does not stop them being *sent* — `POST /api/trip-tickets` with an archived `branch_id` is directly reachable, and archiving would be UI-only theatre without this section.

So the create and update paths of **trip tickets**, **users**, **vehicles** and **drivers** reject an archived `branchId` (and, for trip tickets, an archived `officeId` or `officeHeadId`) with `409 PARENT_ARCHIVED`.

This is a deliberate widening beyond the three-resource module. It is what makes the archive real, and it is four small validations rather than four new features. It does **not** touch any existing record: rows already pointing at a branch that is later archived stay exactly as they are, because the check runs on write, not on read.

**Trip-ticket transitions are deliberately not gated.** Approve, disapprove, cancel, check-out and check-in do not re-validate the branch, and must not: a ticket that was valid when raised has to stay completable. This costs nothing, because the guard already makes the bad case unreachable — a ticket in any live status blocks its branch, office and head from being archived in the first place (§5.1–5.3). The archive can only land once every ticket referencing the record has reached a terminal state, and terminal tickets have no transitions left to gate.

---

## 6. API surface

A new `organization` module: `router.ts`, `controller.ts`, `service.ts`, `repository.ts`, plus `guard.ts` for the shared in-use logic.

The three existing GET handlers **move** out of `reference/` into it, mounted at the same paths — so no frontend call site changes, and `reference/` is left holding roles alone, which is what its name claims. Splitting `GET /branches` and `POST /branches` across two modules would be worse than either module being slightly wrong.

```
GET    /api/branches?includeArchived=true
POST   /api/branches
PATCH  /api/branches/:id
POST   /api/branches/:id/archive
POST   /api/branches/:id/restore
```

Identical five for `/api/offices` and `/api/office-heads`.

**Auth.** Reads keep their current gate — `requireAuth` only, because every booking form needs them. Every write is `requireRole(USER_ROLES.admin)`, matching `standards.router.ts` and `spare-parts/router.ts`.

**Why `POST /:id/archive` and not `DELETE` or a `PATCH` field.** Archive is an operation that can fail with a structured payload listing its blockers. Neither `DELETE` nor a partial update reads like something that returns reasons.

**Bodies** (Zod, in a new `packages/shared/src/contracts/organization.ts`):

| Schema | Fields |
| --- | --- |
| `createBranchBodySchema` | `name` (min 1), `location` (nullable string) |
| `updateBranchBodySchema` | the above, all optional |
| `createOfficeBodySchema` | `name` (min 1), `branchId` (nullable uuid), `headId` (nullable uuid) |
| `updateOfficeBodySchema` | the above, all optional |
| `createOfficeHeadBodySchema` | `name` (min 1), `branchId` (nullable uuid), `officeId` (nullable uuid) |
| `updateOfficeHeadBodySchema` | the above, all optional |

Archive and restore take no body. **`archivedAt` is not settable through `PATCH`** — it is absent from every update schema, so archive state changes only through the two dedicated endpoints and always passes the guard.

**Offices and heads reference each other**, so neither can be created fully-formed in one call: `DepartmentOffice.headId` points at an `OfficeHead`, and `OfficeHead.officeId` points back. Both fields are nullable precisely so the cycle can be built in three steps — create the office with a null head, create the head pointing at it, then `PATCH` the office's `headId`. The UI does this transparently when an admin fills both fields on the create form.

---

## 7. Read semantics

`GET /branches` (and offices, and heads) **excludes archived rows by default**. `?includeArchived=true` returns everything, and is used only by the Organization page.

This is the property that makes the feature cheap. Every dropdown in the application — `add-user`, the trip-ticket form, the vehicle form, the job-order form — stops offering archived branches **without one of those files being edited**. Around ten call sites get the behaviour for free.

Historical records are unaffected, because a trip ticket resolves its branch by joining on `branch_id`, not by looking it up in the list response. A ticket filed under North Branch still reads "North Branch" after North Branch is archived.

`includeArchived` is parsed with the existing `booleanFromString` helper from `packages/shared/src/contracts/common.ts`.

---

## 8. Frontend

**Route.** `apps/web/src/routes/_authenticated/organization.tsx`, carrying `staticData` with `group: 'Settings'` and `allowedRoles: [USER_ROLES.admin]` — the sidebar in `apps/web/src/components/app-sidebar/index.tsx` builds itself from route `staticData`, so the entry appears with no sidebar edit. `Settings` is the existing admin-only group that `tracker-devices` already uses; the three groups in play are `Assets`, `Management` and `Settings`, and this design adds no fourth.

**`ApiError` must learn to carry `details`.** `apps/web/src/lib/api/client.ts` constructs `ApiError(status, code, message)` and discards the response's `details` object entirely. The blocked-archive dialog cannot render its blocker list until that field survives the throw, so the class gains an optional fourth constructor argument.

**The frontend row types are hand-maintained.** `apps/web/src/lib/types/supabase.ts` is a legacy generated-style file the FE still types against; `Branch` is `Tables<'branches'>`. Its `branches`, `department_offices` and `office_heads` entries each need `archived_at: string | null` added to `Row`, `Insert` and `Update`.

**Components.** `apps/web/src/components/pages/organization/`:

- `index.tsx` — the tab shell (Branches / Offices / Office Heads)
- `branches-tab.tsx`, `offices-tab.tsx`, `office-heads-tab.tsx` — one table each, with Add / Edit / Archive / Restore
- `archive-dialog.tsx` — shared confirm dialog, and the renderer for a blocked archive

**Data layer**, following the app's existing three-way split:

- `lib/api/organization.ts` — fetchers and mutators
- `lib/query/organization.ts` — `useBranchesAdmin()`, `useOfficesAdmin()`, `useOfficeHeadsAdmin()` (the `includeArchived` variants)
- `lib/mutation/organization.ts` — create / update / archive / restore

`useBranches()` stays in `lib/query/shared.ts` where ten call sites already import it. Only its underlying fetcher learns the new parameter, and its default behaviour — active only — is what every one of those call sites wants.

**Archived rows stay visible** on the Organization page, muted with an "Archived" badge and a Restore action. Archiving is never a one-way door.

**A blocked archive** renders the blocker list from the error payload:

```
Cannot archive "North Branch" — still in use:
  • 1 department office
  • 1 office head
  • 2 vehicles
  • 1 driver
Reassign or archive these first.
```

---

## 9. Errors

All via the existing `AppError(statusCode, code, message, details)` from `apps/api/src/lib/errors.ts`.

| Code | Status | When |
| --- | --- | --- |
| `NOT_FOUND` | 404 | Unknown id |
| `DUPLICATE_NAME` | 409 | Name collides case-insensitively, active or archived |
| `IN_USE` | 409 | Archive blocked; `details.blockers` carries the counts |
| `PARENT_ARCHIVED` | 409 | A write points a live record at an archived parent (§5.6, §5.7) |
| `ALREADY_ARCHIVED` | 409 | Archiving an archived record, or restoring an active one |

`IN_USE` detail shape — this is what drives the dialog in §8:

```json
{
  "code": "IN_USE",
  "message": "North Branch is still in use",
  "details": {
    "blockers": [
      { "resource": "departmentOffices", "count": 1 },
      { "resource": "officeHeads", "count": 1 },
      { "resource": "vehicles", "count": 2 },
      { "resource": "drivers", "count": 1 }
    ]
  }
}
```

Only non-zero blockers appear. `AppError` already carries the `details` slot; no error-handling change is needed.

---

## 10. Testing

**Per resource** (branches, offices, office heads), in `apps/api/src/modules/organization/`:

- create; create with a duplicate name → 409; create with a case-differing duplicate → 409
- rename; rename onto another record's name → 409
- create or reparent under an archived parent → 409 `PARENT_ARCHIVED`
- archive a clean record → 200, and it disappears from the default list
- the same list with `?includeArchived=true` still returns it
- restore; restore while the parent is archived → 409
- every write as a non-admin → 403

**The blocker matrix** is the part that matters. Each row of the three tables in §5 needs two tests:

1. the blocker present → 409 `IN_USE`, with that resource named in `details.blockers`
2. the same blocker in its non-blocking form → archive succeeds

Specifically: an **inactive** driver and an **inactive** user must NOT block; a **completed** trip ticket must NOT block; a **repaired** job order must NOT block; an **archived** child office or head must NOT block. Each of those is the negative case for a rule that cannot be verified by inspection, and the archived-child case is the one that would deadlock the feature if it regressed.

**Enforcement (§5.7)** — one test per module: `POST /api/trip-tickets`, `/api/users`, `/api/vehicles`, `/api/drivers` with an archived `branchId` → 409.

**E2E**, `apps/web/e2e/organization.spec.ts`: admin creates a branch, sees it in the trip-ticket form's branch dropdown, archives it, sees it gone from that dropdown while an existing ticket still displays its name.

---

## 11. Migration and seed

**The migration** does three things:

1. Add nullable `archived_at` to the three tables. No default, no backfill — every existing row is active.
2. `CREATE UNIQUE INDEX branches_name_lower_unique ON branches (lower(name))` and `CREATE UNIQUE INDEX department_offices_branch_name_lower_unique ON department_offices (branch_id, lower(name))`.
3. Nothing else.

**Index creation will fail** on a database that already holds a case-insensitive duplicate. That is the correct behaviour — the migration must not silently pick a winner. Before deploying, run:

```sql
SELECT lower(name), count(*) FROM branches GROUP BY 1 HAVING count(*) > 1;
SELECT branch_id, lower(name), count(*) FROM department_offices GROUP BY 1, 2 HAVING count(*) > 1;
```

Both must return zero rows. The seeded data has no duplicates, so a fresh install is safe; a long-lived dev database may not be.

**The seed** keeps its two branches, two offices and two heads at their existing fixed uuids — tests reference them. It gains no archived rows: seeding an archived record would make the default-excluded list endpoint's fixture count differ from the table count for no benefit.

---

## 12. Follow-ups

Not part of this work, recorded so they are not lost:

- **Roles remain read-only.** If role management is ever wanted, it needs a separate design that decouples authorization from the display name — probably an immutable `key` column beside an editable `name`.
- **Tier 3 picklists** — driver license types, maintenance interval types, trip destinations, vehicle makes. Each is free text today; each needs a table plus a migration of existing values, and destinations must keep accepting free entry.
- **Geofence areas** — `GeofenceArea` and `GeofenceViolation` exist in the schema with no module and no UI. Dormant, half-built.
- **Settings** — the display timezone is hardcoded `Asia/Manila` in `apps/api/src/lib/timezone.ts`. A singleton config row is a different shape from a CRUD list and wants its own design.
- **A branch that owns nothing cannot lend anything.** `seed.ts` already carries a comment about this. Once admins can create branches, a newly created branch with no vehicles, drivers or offices will produce empty dropdowns in the trip-ticket form until it is populated. The form's existing fallback groups handle it, but the empty state is worth a look.
