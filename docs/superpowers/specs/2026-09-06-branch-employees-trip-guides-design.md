# Branch Employees as Trip Guides — Design

**Date:** 2026-09-06
**Status:** Draft for review
**Scope:** Add an admin-managed **employee** roster to each branch, and require **one or more employees** to be assigned to every trip ticket as the staff who accompany and guide the participants.

---

## 1. Summary & goals

A trip ticket already records who is _carried_ — `participants`, a `TEXT[]` of typed-in names — and who _drives_ — `driverId`, a real foreign key. What it does not record is who **goes along to guide the participants**. In practice every trip has at least one such person, and today their name is either absent or typed into the participants list, indistinguishable from a passenger.

Separately, a branch already owns four kinds of people (`users`, `drivers`, `departmentOffices`, `officeHeads`) but has no general staff roster. There is no way for an admin to say "these are the people who work at North Branch."

This design adds both halves: an `Employee` table an admin manages per branch, and a required many-to-many link from a trip ticket to the employees guiding it.

**Goals**

- An admin can add, edit, archive and restore employees, scoped to a branch, from inside the app.
- Booking a trip requires selecting at least one employee as a guide; more than one is allowed.
- Guides count against the vehicle's seat capacity, because they occupy seats.
- The guide picker offers only the employees of the ticket's own branch.
- A guide can be swapped on an already-approved ticket without cancelling and rebooking it.
- Archiving an employee stops them being offered anywhere, but a historical ticket still shows their name.

**Non-goals (v1)**

- **Changing how `participants` works.** Participants stay a free-text `TEXT[]` on the ticket. Promoting them to employee records has no unambiguous mapping for existing rows (the seed's `'Staff A'` matches no real person), and there is no precedent in `apps/api/prisma/migrations/` for dropping a column. Guides are an additional, separate list.
- **Reusing or extending `Driver`.** Rejected in §3. `Driver.email` is `String @unique` and required, and driver rows already double as job-order mechanics and tool borrowers with no type discriminator, so every existing driver picker would silently gain non-driving staff.
- **An employee detail page, photos, employee numbers, hire dates, emergency contacts.** That is the `Driver` template, a second HR module. An employee is a name, a position, a phone and a branch.
- **Employee logins.** An `Employee` is a reference record with no `User` relation. Someone who needs to sign in gets a user account through the existing `POST /api/users`.
- **Per-date guides.** Guides attach to the ticket, not to individual `TripDate` rows. See §13.
- **Fixing `components/ui/multi-select.tsx`.** It is unusable (§9.3) and this design routes around it rather than dragging a rewrite into scope.
- **Server-enforced branch matching.** The picker is branch-locked in the UI, matching how offices and office heads already behave. The server validates that a referenced employee is not archived, not that it belongs to the ticket's branch — consistent with today, where the server enforces neither.

---

## 2. Background: how people on a trip work today

- **Participants are not an entity.** `apps/api/prisma/schema.prisma:351` — `participants String[] @default([])`, plus `participantsCount Int?` at `:352`. Untouched by any migration since the 2026-07-03 init.
- **Every other person on the ticket is a foreign key.** `TripTicket` carries eight User/Driver/OfficeHead FKs: `driverId` (`:344`, required), `officeHeadId` (`:347`), `requestedById` (`:354`), `approvedByAdminId` (`:358`), `preTripGuardId` (`:361`), `preTripCheckedById` (`:362`), `postTripGuardId` (`:365`), `postTripCheckedById` (`:366`). Participants is the only people-field that is not a relation.
- **Capacity is already enforced.** `assertBookable` in `apps/api/src/modules/trip-tickets/service.ts` computes `headcount = Math.max(namedParticipants, participantsCount ?? 0)` and throws `409 OVER_CAPACITY` when it exceeds `Vehicle.capacity` (`schema.prisma:267`). It also throws `400 PARTICIPANTS_MISMATCH` when a count is given that contradicts the names. The driver is not counted.
- **A ticket is frozen at approval.** Any `PATCH` once status leaves `pending_admin_approval` returns `409 INVALID_TRANSITION`; a non-owner gets `403 NOT_TICKET_OWNER`.
- **Reads have no response contract.** `apps/api/src/modules/trip-tickets/repository.ts:6-13` exports one `tripTicketInclude`; whatever it names is what the client sees. `packages/shared/src/contracts/trip-tickets.ts` defines request bodies only.
- **There is no `Employee` anywhere.** A case-insensitive search across `apps/` and `packages/` returns two prose comments and nothing else. Likewise no "guide" concept.
- **Branch-scoped reference people already have a home.** `OfficeHead` (`schema.prisma:241-257`) is `{ name, branchId?, officeId?, archivedAt? }` — a named person belonging to a branch, admin-managed, no login, no email. `apps/api/src/modules/organization/service.ts:185` documents the matching uniqueness rule: _"Office heads have NO name uniqueness — they are people, and two employees named Juan Cruz is not an error."_
- **The org admin UI is already generic.** `apps/web/src/components/pages/organization/index.tsx` is one `<Tabs>` rendering three `<ResourceTab resource=... />`. There is no branch detail page and no `/organization/$id` route.

---

## 3. Decisions taken

Settled during brainstorming; load-bearing.

1. **A new `Employee` table, shaped after `OfficeHead`, not `Driver`.** Two reasons dominate. `Driver.email` is required and unique (`schema.prisma:301`), so every field employee would need a distinct email address — and a synthetic one risks colliding with `users/service.ts:83-129`, which auto-links a driver-role signup to a driver row _by email match_. Second, `Driver` rows are already the app's mechanics (`JobOrder.assignedMechanicId`) and tool borrowers (`ToolBorrow`, `BorrowRequest`); the trip form's driver dropdown filters only on `status === 'active'`, so non-driving staff would appear in the **driver** picker, the mechanic picker and the tool-borrower picker unless all three gained a type filter.
2. **Guides are a separate list from participants.** Participants are unchanged.
3. **Guides count against vehicle capacity.** A guide occupies a seat. The driver's exclusion is not precedent — the driver is not a passenger.
4. **The guide picker is locked to the ticket's branch**, like offices and office heads (`add-trip-ticket/form.tsx:237-245`), not borrowable like vehicles and drivers.
5. **At least one guide is required at booking**, and guides can be reassigned after approval through a dedicated endpoint. The generic `PATCH` freeze stays intact.
6. **`archivedAt`, not a status enum.** Employees live on the Organization page, and that entire tab UI — archive dialog, blocker counts, `archiveWhere` default — assumes `archivedAt`. `Driver` uses `DriverStatus` instead, but Driver is not an org reference table.
7. **`Employee.branchId` is required**, diverging from `OfficeHead.branchId String?`. Justified in §4.3.
8. **Guides attach to the ticket, not to a `TripDate`.**

---

## 4. Data model

### 4.1 New: `Employee`

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
  @@map("employees")
}
```

`position` is free text (`"Tour Guide"`, `"Safety Officer"`) — it disambiguates two similarly-named people in a picker and is not branched on anywhere. `phone` exists so a guide is reachable mid-trip.

`Branch` gains `employees Employee[]` in its relation list at `schema.prisma:206-213`.

### 4.2 New: `TripTicketEmployee`

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

This is the `JobOrderSparePart` shape (`schema.prisma:469-481`): composite primary key, and the **asymmetric cascade** that model documents — `Cascade` from the owning parent so deleting a ticket takes its links with it, default `Restrict` toward the reference row so an employee who has ever guided a trip cannot be hard-deleted. The composite PK also makes a duplicate assignment unrepresentable.

No `role` column on the join. Guides are the only kind of employee-on-a-ticket; a discriminator would be speculative.

`TripTicket` gains `guides TripTicketEmployee[]` alongside its other collections at `schema.prisma:392-395`.

### 4.3 Uniqueness and the required branch

**No name uniqueness.** Two employees named Juan Cruz is not an error — the rule `organization/service.ts:185` already states for office heads. So, deliberately, **no functional unique index** is added, unlike `branches_name_lower_unique` and `department_offices_branch_name_lower_unique`. This is a conscious omission and should be noted in the migration.

**`branchId` is required**, where `OfficeHead.branchId` and `DepartmentOffice.branchId` are nullable. Because the guide picker is branch-locked (§5.2), an employee with a `NULL` branch would appear in no branch's picker, anywhere, with no error and no way to notice. Required makes that state unrepresentable rather than merely unlikely. The cost is that an employee cannot be parked between branches; they are moved by editing `branchId`.

---

## 5. Booking and validation

### 5.1 Capacity

`assertBookable`'s `Pick<>` signature gains the guide list, and the headcount becomes:

```ts
const named = body.participants?.length ?? 0;
const claimed = body.participantsCount ?? null;
// unchanged: the names are the truth, the count is a claim about them
if (claimed !== null && named > 0 && claimed !== named)
  throw PARTICIPANTS_MISMATCH;
const headcount = Math.max(named, claimed ?? 0) + guideIds.length;
if (headcount > vehicle.capacity) throw OVER_CAPACITY;
```

The `PARTICIPANTS_MISMATCH` rule is untouched — guides are not participants and never reconcile against `participantsCount`. The `OVER_CAPACITY` message must name both figures so the error is actionable: _"That vehicle seats 12; the trip is for 10 participants and 3 guides."_

The web form's seat budget (`add-trip-ticket/form.tsx:139-141`, `:176`, `:731-735`) subtracts guides by the same arithmetic, so the live counter and the server cannot disagree.

**Consequence to accept:** an existing ticket sitting exactly at capacity now fails validation if it is edited and a guide is added. It is not retroactively invalidated — validation runs only on write.

### 5.2 Branch scoping

The picker lists `GET /api/employees?branchId=<ticket branch>` filtered to unarchived rows. Changing the branch on the form clears any stranded guide selection, mirroring the two effects at `add-trip-ticket/form.tsx:250-267` that clear a stranded office and head.

The server checks only that each referenced employee exists and is not archived, via the existing `assertOrgRefsActive` path (`apps/api/src/lib/org-refs.ts`), which gains an employee key so `PARENT_ARCHIVED` covers it. It does **not** check branch membership — consistent with the current server, which enforces branch matching for nothing.

### 5.3 Minimum one

`guideIds` is `z.array(z.string().uuid()).min(1)` on the create body. `updateTripTicketBodySchema = createTripTicketBodySchema.partial()` carries it to update automatically, which yields the right semantics: **absent means leave the guides alone; present-but-empty is a 400, not a silent no-op** — the same rule `service.ts:349-355` applies to `dates`.

Existing ticket rows have zero guides and stay valid. The requirement binds new writes only.

---

## 6. Reassigning guides after approval

A guide changing on the morning of the trip is the normal case, and the generic `PATCH` refuses it once the ticket is approved. So guides get their own transition, following the `loadInState(id, [...])` pattern in `apps/api/src/modules/trip-tickets/transitions.ts`:

```
POST /api/trip-tickets/:id/guides   { guideIds: [...] }   admin only
```

- Allowed from `pending_fuel_allocation_approval`, `approved` and `in_progress`. Not from `completed`, `cancelled` or `disapproved` — a finished trip's record of who was on it is history.
- Not from `pending_admin_approval`: that is the one state the ordinary `PATCH` still accepts (`service.ts`), so guides are editable there through the booking form and a second door would only add a second guard.
- `pending_fuel_allocation_approval` **is** in the list, corrected after review. Admin approval moves _every_ ticket into it (`transitions.ts` `approve`), and `PATCH` is refused from it — so an earlier draft of this section, which allowed only `approved` and `in_progress` on the grounds that "the ordinary `PATCH` path already handles guides", left a dead zone: between booking and EVP fuel sign-off the guides could not be changed through any door at all. That justification held for `pending_admin_approval` alone and was wrong to extend to both pending states.
- Re-runs the capacity check. Swapping two guides for four can overflow the van.
- Admin only. The requester does not get to re-staff their own approved trip.

---

## 7. API surface

Employees join the **organization** module — they are an admin-managed branch-scoped reference table, exactly like offices and office heads.

| Route                               | Guard                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /api/employees`                | `requireAuth` only — the booking form's picker needs it, same reasoning as `organization/router.ts:26-27` |
| `POST /api/employees`               | `requireAuth`, `requireRole(admin)`                                                                       |
| `PATCH /api/employees/:id`          | `requireAuth`, `requireRole(admin)`                                                                       |
| `POST /api/employees/:id/archive`   | `requireAuth`, `requireRole(admin)`                                                                       |
| `POST /api/employees/:id/restore`   | `requireAuth`, `requireRole(admin)`                                                                       |
| `POST /api/trip-tickets/:id/guides` | `requireAuth`, `requireRole(admin)`                                                                       |

Guards stay **per-route** in the organization router, never router-wide: it is mounted at the bare `/api` prefix and a blanket guard would 401 the device-key GPS routes (`organization/router.ts:18-24`).

`GET /api/employees` accepts `?branchId=` and the standard `?includeArchived=`, `?page=`, `?limit=` from `contracts/common.ts`. Omitting page and limit returns the full set (`lib/pagination.ts:7`), which is what the picker wants.

Contracts, in `packages/shared/src/contracts/organization.ts`:

```ts
export const createEmployeeBodySchema = z.object({
  name: z.string().min(1),
  position: nullableString,
  phone: nullableString,
  branchId: z.string().uuid()
});
export const updateEmployeeBodySchema = createEmployeeBodySchema.partial();
```

and in `contracts/trip-tickets.ts`, `guideIds: z.array(z.string().uuid()).min(1)` on the create body.

### 7.1 Writing the link rows

A `replaceTripTicketGuides(tx, tripTicketId, employeeIds)` helper copies `replaceTripDates` (`apps/api/src/modules/trip-tickets/dates.ts:60-81`) exactly: **`tx` first**, refuse an empty list, `deleteMany` then `createMany`, all inside the caller's transaction. Delete-all-then-recreate, never a diff — the house pattern for child rows, also used by `job-orders/transitions.ts:95-105`.

Two failure modes that produce **no compile error and no runtime error, just missing data**:

1. **The create spread.** `service.ts:279` writes `data: { ...body, dates: undefined, ... }`. A relation-shaped field left in that spread is a runtime Prisma error on the create path only. `guideIds` must be blanked out the same way `dates` is.
2. **`tripTicketInclude`.** `repository.ts:6-13` must gain `guides: { include: { employee: true } }`, or guides are absent from every read — detail and list — and there is no response contract anywhere to catch it.

---

## 8. Read semantics

`archiveWhere(includeArchived)` (`organization/repository.ts:8-10`) applies to employees the same way it does to the other three resources, so archived employees leave every dropdown in the app without any call site being edited.

A trip ticket's guides are read through the join with the employee included, so a ticket keeps rendering an archived employee's name. Archiving hides someone from future bookings; it never rewrites history.

---

## 9. Frontend

### 9.1 Organization: a fourth tab

`ResourceTab` is already generic, so this is mostly configuration:

| File                                   | Change                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/organization/index.tsx`         | 4th `TabsTrigger`/`TabsContent` pair with `className={ACTIVE_TAB}`                                                                                                                    |
| `lib/api/organization.ts`              | `OrgResource` union gains `'employees'`; `OrgRecord` gains `position` and `phone`; blocker labels gain `employees: ['employee', 'employees']` or the archive dialog renders a raw key |
| `pages/organization/resource-tab.tsx`  | `RESOURCE_META` entry — `{ title: 'Employees', addLabel: 'Add Employee', columns: ['Name', 'Position', 'Branch'] }` — plus the `Column` union and query selector                      |
| `pages/organization/record-dialog.tsx` | `case 'employees'` in the `FieldConfig[]` switch: name, position, phone, and a branch select via `withCurrent(...)`                                                                   |
| `lib/query/organization.ts`            | `orgQuery('employees')`                                                                                                                                                               |
| `lib/mutation/organization.ts`         | a `LABELS` entry **and** a branch in `useOrgInvalidation`                                                                                                                             |
| `lib/query/shared.ts`                  | `useEmployees(branchId)` (active only, for form controls) and `useEmployeesForDisplay()` (`['employees','all']`, for rendering a name on a historical ticket)                         |

The `useOrgInvalidation` branch is the easy omission: without it, renaming or archiving an employee leaves the booking picker stale indefinitely. The comment at `lib/mutation/organization.ts:37` exists as a guard against exactly this.

The `PATCH`-only-changed-keys rule (`record-dialog.tsx:115-127`) applies unchanged: sending an untouched `branchId` re-triggers `assertOrgRefsActive` and makes an employee whose branch was since archived permanently unrenamable.

`ResourceTab` has no pagination and no search. A branch roster is plausibly larger than a list of office heads, so this is a real limit — recorded in §13 rather than solved here, because no list page in the app has a search input and inventing one is a separate change.

### 9.2 The guide picker

A **Guides** field sits directly above Participants in the booking form: repeating rows, each an ordinary `Select` of that branch's unarchived employees, with add and remove buttons. Already-selected employees are excluded from the remaining rows' options, so the composite primary key can never be violated from the UI. The remove button is disabled at one row, matching the participants rule at `form.tsx:755-756`.

Unlike participants, guides carry **ids** and never pass through a comma-joined string. This sidesteps the existing hazard where a participant typed as `"Cruz, Juan"` silently splits into two people.

The field is registered with react-hook-form directly, not the `useState`-plus-`syncParticipants` arrangement participants use (`form.tsx:133`, `:166-173`) — that pattern exists for the string round-trip, which guides do not have.

### 9.3 Why not `components/ui/multi-select.tsx`

It exists and it is the obvious candidate, and it is not usable here:

- Its trigger is a bare `<div onClick>` (`:57-62`) and its options are `<div onClick>`, with **no `role`, no `aria-*`, no keyboard handling**. Every picker spec in the e2e suite drives `getByRole('combobox')` / `getByRole('option')`, so a guide picker built on it could not be tested.
- It paints raw `bg-white` at `:59`, `:97` and `:101` — the exact defect `ui/select.tsx:38-41` was rewritten to remove. It is broken in dark mode.
- It has one consumer and has never been wired to react-hook-form.

Fixing it is worth doing and is not this feature's job. The repeating-`Select` approach also matches the participants field it sits beside, which is the better UI regardless.

---

## 10. Errors

| Code                 | Status | When                                                                                         |
| -------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `OVER_CAPACITY`      | 409    | participants + guides exceed `vehicle.capacity`; message names both figures                  |
| `NO_GUIDES`          | 400    | `guideIds` present but empty, on create or on the reassign endpoint                          |
| `PARENT_ARCHIVED`    | 409    | a referenced employee is archived                                                            |
| `IN_USE`             | 409    | archiving an employee still assigned to a live ticket; `details.blockers` carries the counts |
| `INVALID_TRANSITION` | 409    | reassigning guides on a completed, cancelled or disapproved ticket                           |

`IN_USE` follows the existing rule that **history never blocks**: completed, cancelled and disapproved tickets do not prevent archiving an employee, exactly as they do not prevent archiving a branch (`LIVE_STATUSES`).

`branchBlockers` in `organization/guard.ts:35-81` gains an employee count. Without it a branch can be archived out from under its own roster, silently.

---

## 11. Migration and seed

One additive migration, `<timestamp>_add_employees_and_trip_guides`, created with `prisma migrate dev --create-only`:

- `CREATE TABLE employees` and `trip_ticket_employees`, with the FKs and the two indexes.
- **No unique index on employee name** — deliberate, per §4.3. A `NOTE:` comment goes in `schema.prisma` recording that the omission is intentional, matching the convention at `schema.prisma:215-216`.
- No backfill. Existing tickets have no guides and cannot have one invented; there is no precedent in the repo for a backfill that cannot be derived from existing columns.

`prisma/seed.ts` gains employees for **both** seeded branches (Main and North) and attaches guides to every ticket it seeds (created at `seed.ts:350`, behind the `count() === 0` guard at `:297`) — otherwise a fresh install shows an empty picker and a booking cannot be completed. Note the repo rule: **never run prettier on `seed.ts`**, it produces an ~800-line diff.

---

## 12. Testing

- **`apps/api/src/test/db.ts`** — **both** `employees` and `trip_ticket_employees` join `TABLES`, and `trip_ticket_employees` must be ordered before `trip_tickets`. The repo is inconsistent here: `trip_dates` is omitted because it cascades from `trip_tickets`, but `job_order_spare_parts` **is** listed (`db.ts:10`) despite cascading from `job_orders` — and that is the model this join copies. Listing it explicitly is harmless; omitting it risks cross-suite row leakage that surfaces as unrelated flaky failures elsewhere.
- **`apps/api/src/test/factories.ts`** — `createTestEmployee(branchId, name)`, alongside `createTestOfficeHead`.
- **`organization/enforcement.test.ts`** — a `POST` **and** a matching `PATCH` asserting `409 PARENT_ARCHIVED`. The G-1 comment at `:88-90` explains why create-only coverage is insufficient.
- **`organization/guard.test.ts`** — the employee blocker rule, plus the "does not count a sibling branch's employees" isolation test.
- **`trip-tickets/`** — capacity arithmetic including guides; `NO_GUIDES`; absent-vs-empty `guideIds` on `PATCH`; the reassign endpoint's allowed-from list; and that guides come back on both the detail and list reads.
- **Fixtures that break the moment a guide is required:** `trip-lifecycle.spec.ts:56-57`, `multi-date-trip.spec.ts:124-125/197-198/257-258`, `organization.spec.ts:493-494`, `trip-ticket-booking.test.ts:103`, `trip-tickets.test.ts:68-69`. All seven POST tickets directly and all seven need a guide. `organization.spec.ts` is the branch-archive spec, so its failure will look like an organization bug — worth fixing early to avoid the misdiagnosis.
- **E2E** — an admin adds an employee on the Organization tab, then books a trip selecting that employee as guide. `multi-date-trip.spec.ts` is the pattern to copy (per-id cleanup); `trip-lifecycle.spec.ts` is the no-cleanup anti-pattern.
- Every assertion must be able to fail: break the line it covers, confirm a real failure, restore, confirm byte-identical.

---

## 13. Risks and follow-ups

1. **Per-date guides.** A multi-date trip may rotate staff between outings, and `TripDate` already carries its own per-outing people (`preTripGuardId`, `postTripGuardId`). v1 attaches guides to the ticket. Moving to per-date later means re-parenting the join's FK from `trip_ticket_id` to `trip_date_id` — additive if guides stay on the ticket as the default and dates override, destructive if not. Flagged as the most likely thing to revisit.
2. **No search or pagination on the Organization tab.** A roster of a few hundred employees renders as one unpaginated table. Acceptable at current scale; the fix is a shared list-controls change across all four tabs, not an employees-only patch.
3. **Two overlapping people tables become three.** `User`, `Driver`, `OfficeHead` and now `Employee` all describe humans. This is a real cost, accepted because the alternative (a `Driver` discriminator) requires making `Driver.email` nullable — a destructive change to a live unique index that also sits on the user-signup auto-link path.
4. **Capacity is now stricter.** Trips previously bookable at exactly capacity need a larger vehicle once guides are counted. This is the intended behaviour, but it will read as a regression to anyone who books at the limit.
5. **`multi-select.tsx` stays broken.** Routed around, not fixed. Worth its own change: ARIA roles, keyboard support, and the `bg-white` → token fix.
