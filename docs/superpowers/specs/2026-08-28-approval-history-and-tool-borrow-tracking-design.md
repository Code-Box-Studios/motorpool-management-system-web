# Approval History and Tool Borrow Tracking — Design

**Date:** 2026-08-28

**Goal:** give the EVP a record of the fuel and repair decisions they have
already made, and give the tools page a ranking of which tools actually get
borrowed.

Two independent features in one spec. They share no code and no tables. They are
together because each is small and both were asked for at once.

---

## 1. Scope

**In scope**

- A History tab on the EVP screen listing fuel decisions (approved and declined)
  and repair approvals, whoever made them.
- A `tool_borrows` table, written whenever a tool changes hands, plus a metric
  strip and a most-borrowed panel on the tools page.

**Out of scope — deliberately**

- **The per-user activity log.** Asked for in the same conversation, deferred to
  its own spec. It touches every module and has design questions these two do
  not: what counts as an action, whether reads are logged, retention, and what
  an admin may see about another user. See §6.
- **A borrow-request workflow.** Without one, nothing records a request that was
  declined, so this work delivers "frequently borrowed" and **not** "frequently
  asked". That was an explicit decision, not an oversight.
- **Explicit Sign out / Return actions on tools.** Borrowing stays what it is
  today — an admin editing fields on the tool. See §4.3 for what that costs.

---

## 2. What exists today

Findings from reading the code, because several contradict what the schema
suggests.

| Finding | Evidence |
| --- | --- |
| Fuel approvals are fully recorded | `FuelAllocation` holds litres, type, date, purpose, destination, `approvedByEvpId`, status |
| **Fuel declines record no decider** | `transitions.disapprove` sets the allocation's status via `updateMany` and nothing else |
| **`fuel_allocations.disapproved_reason` is a dead column** | Declared in the schema; no code writes it. The reason goes onto the *ticket* instead |
| **`job_orders.date_approved` is `@db.Date`** | Day precision. `transitions.approve` passes a full `new Date()` and Postgres truncates it |
| Repairs have no decline path | The EVP screen offers approve only; `JobOrderStatus` has no declined state |
| **`borrow_requests` is a dead table** | No API, no service, no seed, no UI, no writes. It exists in the schema and nothing else |
| Tools carry borrow state, not history | `borrowed_by` / `borrowed_date` / `estimated_return_date` on the tool row, cleared on return |
| The tools service enforces nothing | `service.update` is a documented "permissive passthrough" |
| `/approve-evp` admits an admin as well as an EVP | `trip-tickets/router.ts` — an override so a ticket is not stranded when no EVP is on duty |

That last row is why the history is not filtered to the signed-in user: fuel
approved by an admin override would be missing, and an EVP looking for a trip
they remember deciding would not find it.

---

## 3. Feature A — EVP decision history

### 3.1 Schema changes

Three, all in one migration.

```prisma
model FuelAllocation {
  // ...existing fields unchanged...
  decidedById String?   @map("decided_by") @db.Uuid
  decidedAt   DateTime? @map("decided_at")

  decidedBy User? @relation("AllocationDecidedBy", fields: [decidedById], references: [id])

  @@index([decidedAt])
}
```

A named relation needs its other half or Prisma refuses to generate, so `User`
gains the matching back-reference beside its two existing allocation relations:

```prisma
model User {
  // ...alongside requestedAllocations and evpApprovedAllocations...
  decidedAllocations FuelAllocation[] @relation("AllocationDecidedBy")
}
```

- **`decided_by` + `decided_at`** record the decider and the moment on **both**
  outcomes. `updated_at` looks like it would serve, but it moves on any later
  write to the row — a history built on it corrupts silently and invisibly,
  which is the worst failure mode a record can have.
- `approved_by_evp` is **left exactly as it is**. The trip-ticket detail screen
  reads it (`web/src/lib/api/trip-tickets.ts` → `allocation_approved_by_evp_operations`).
  It overlaps with `decided_by` on approvals, but both are written from
  `actor.id` inside one statement, so they cannot drift. Collapsing them is a
  follow-up, not this work.

```sql
ALTER TABLE "job_orders" ALTER COLUMN "date_approved" TYPE timestamp(3);
```

- Day precision sorts every repair approval to midnight, i.e. below every fuel
  decision made the same day, in a list whose whole purpose is chronological
  order. Widening is safe in Postgres and needs no data migration: existing rows
  become midnight of their recorded date, which is the truth as recorded.
- The Prisma field drops its `@db.Date` attribute and becomes a plain
  `DateTime?`.

**Nullability.** Both new columns are nullable with no backfill. Allocations
decided before this ships have no recorded decider or moment, and inventing one
would be worse than admitting it. The UI renders those as an em dash (§3.4).

**Rollback** is a plain column drop plus a narrowing of `date_approved` back to
`date`, which loses only the time-of-day added after this ships.

### 3.2 Write-path changes

In `trip-tickets/transitions.ts`:

- `approveEvp` — add `decidedById: actor.id, decidedAt: new Date()` to the
  existing `fuelAllocation.update`. Same transaction, no new statement.
- `disapprove` — add the same two fields **and** `disapprovedReason: reason` to
  the existing `fuelAllocation.updateMany`. The reason column already exists and
  has never been written; a decline without its reason is a history entry that
  raises the exact question it exists to answer.
- `cancel` — **unchanged**. It already sets the allocation to `cancelled` and
  writes no decider, which is correct: a cancellation is the requester
  withdrawing, not the EVP deciding. The history query filters on
  `status IN ('approved', 'disapproved')`, so a cancelled allocation is excluded
  by status rather than by a null decider — a withdrawn request must not appear
  as a decision anybody made.

No change to `job-orders/transitions.approve`; it already writes `approvedById`
and `dateApproved`, and the type widening is what makes them usable.

### 3.3 API

A new `approvals` module — `apps/api/src/modules/approvals/` with the standard
`{controller,repository,service,router}.ts` — owning one cross-cutting read.

```
GET /api/approvals/history?page=&limit=&kind=fuel|repair
```

- **Roles:** admin and `evp_operations`, matching who is allowed to decide.
- **`kind`** is optional; omitted means both, merged.
- **Ordering:** decision time, newest first.
- **Response:** `{ data: DecisionRecord[], count: number }`, matching every other
  list endpoint in this codebase.

```ts
type DecisionRecord = {
  kind: 'fuel' | 'repair';
  id: string;              // allocation id or job-order id
  ref: string;             // 'TT-2044' | 'JO-118' — matches web's formatRef
  linkTo: string;          // '/trip-tickets/<uuid>' | '/job-order/<uuid>'
  outcome: 'approved' | 'declined';
  decidedAt: string | null;
  decidedByName: string | null;
  decidedByRole: string | null;   // so an admin override can be labelled
  reason: string | null;          // declines only
  title: string;                  // destination | incident details
  subtitle: string | null;        // vehicle make/model + plate
  liters: number | null;          // fuel only
  fuelType: string | null;        // fuel only
};
```

**Why a discriminated record rather than two lists:** the tab is one
chronological column. Merging in the client means the client owns pagination
across two sources, which is where off-by-one bugs live.

**Merging and pagination.** The service reads `skip + take` rows from each
source, merges by `decidedAt`, then slices. Correct, and honest at this fleet's
volumes (hundreds of rows). It is not correct at tens of thousands — at that
point it becomes a single SQL `UNION ALL` with one `ORDER BY`. That threshold
goes in a code comment; it is not built now.

**Null decision times sort last**, not first. A row with no `decidedAt` is a
pre-migration record, and a list that opens with "unknown date" reads as broken.

### 3.4 UI

`EvpApprovalPage` splits into three files. The current one is 353 lines and
history would push it past 500.

| File | Responsibility |
| --- | --- |
| `evp-approval/index.tsx` | Shell, headline, tab bar |
| `evp-approval/queue.tsx` | The two pending sections, moved verbatim |
| `evp-approval/history.tsx` | New. Paginated decision list |

- Tabs: **Needs you** (with the pending count) and **History**. Same `Tabs`
  primitive and `ACTIVE_TAB` styling the trip-tickets page already uses, so the
  segmented control does not read inverted on a light card.
- The headline still counts **pending only**. "Nothing needs you" keeps meaning
  what it says while a full History tab sits beside it.
- Each row shows the reference, title, outcome, decider and date. Declines show
  their reason. Fuel rows show litres and type; repair rows do not, and the
  column is simply absent rather than showing "0 L".
- **An admin override is labelled.** A decision made by an admin says so, or the
  EVP sees a sign-off they have no memory of making.
- Missing decider or date renders as an em dash — the same treatment the tools
  grid already gives an absent borrower.
- Empty state: "No decisions recorded yet."

### 3.5 Tests

API, in `approvals/approvals.test.ts`:

- An approved allocation appears with `outcome: 'approved'`, its decider and its
  litres.
- A declined allocation appears with `outcome: 'declined'` **and its reason** —
  the assertion that fails if `disapprovedReason` is left unwritten.
- An approved job order appears as a repair record.
- Both kinds in one response are ordered by decision time, with a fuel decision
  and a repair approval **on the same day** proving the type widening — this test
  fails against `@db.Date`.
- A record with no `decidedAt` sorts last.
- `?kind=fuel` excludes repairs; `?kind=repair` excludes fuel.
- A cancelled ticket's allocation does **not** appear.
- A requester, driver and guard each get 403.

Transition tests, extending the existing files:

- `approveEvp` writes `decidedById` and `decidedAt`.
- `disapprove` writes `decidedById`, `decidedAt` and `disapprovedReason`.

---

## 4. Feature B — Tool borrow history and cards

### 4.1 Schema

```prisma
model ToolBorrow {
  id         String    @id @default(uuid()) @db.Uuid
  toolId     String    @map("tool_id") @db.Uuid
  borrowerId String    @map("borrower_id") @db.Uuid
  borrowedAt DateTime  @map("borrowed_at")
  dueAt      DateTime? @map("due_at") @db.Date
  returnedAt DateTime? @map("returned_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")

  tool     Tool   @relation(fields: [toolId], references: [id], onDelete: Cascade)
  borrower Driver @relation(fields: [borrowerId], references: [id])

  @@index([toolId, borrowedAt])
  @@index([returnedAt])
  @@map("tool_borrows")
}
```

- **`returned_at IS NULL` means still out.** A nullable timestamp rather than a
  boolean, matching `Notification.readAt`: "when" answers "whether" as well.
- **`onDelete: Cascade` on the tool.** Deleting a tool deletes its history. The
  alternative — `Restrict` — would refuse to delete any tool ever borrowed, newly
  breaking a working button. A deleted tool has no place on a leaderboard anyway.
- `borrower` is `Restrict` by default, which is correct: a driver with borrow
  history should not be silently deletable.

**At most one open borrow per tool.** Prisma cannot express a partial unique
index, so it goes in raw SQL — the same way `tracker_devices_active_vehicle_unique`
already does in this repo:

```sql
CREATE UNIQUE INDEX "tool_borrows_open_unique"
  ON "tool_borrows" ("tool_id") WHERE "returned_at" IS NULL;
```

This is the invariant the whole feature rests on. Without it a bug in the write
path silently double-counts a tool as out, and every metric on the page is wrong
with nothing to indicate it.

### 4.2 Migration and backfill

**The migration must backfill open borrows.** One seeded tool is signed out right
now and more will be by deploy time. Without this, those tools have no opening
row, so their eventual return closes nothing, and "tools out" derived from
history disagrees permanently with the tools table.

```sql
INSERT INTO "tool_borrows" ("id", "tool_id", "borrower_id", "borrowed_at", "due_at")
SELECT gen_random_uuid(), "id", "borrowed_by",
       COALESCE("borrowed_date"::timestamp, now()),
       "estimated_return_date"
FROM "tools"
WHERE "borrowed_by" IS NOT NULL;
```

Runs after the table and before the unique index, so a pre-existing duplicate
would fail the migration loudly rather than corrupt the index. `gen_random_uuid()`
is built into Postgres 13+; this database is Neon, which is well past that.

**Pre-deploy check** — the index fails on a database that already violates it,
which cannot happen from this backfill (one row per tool) but is worth confirming
on any database that has been hand-edited:

```sql
SELECT tool_id, count(*) FROM tool_borrows
WHERE returned_at IS NULL GROUP BY 1 HAVING count(*) > 1;
```

### 4.3 Write path

In `tools/service.ts`, covering **both** `create` and `update` — the contract
lets a tool be created already borrowed.

`update` already loads the existing tool for its 404 and its image logic, so the
previous borrower is in hand. Respecting the three-valued multipart convention
(`undefined` = leave, `null` = clear, value = set):

```
prev = existing.borrowedById
next = body.borrowedById === undefined ? prev : body.borrowedById

if (prev !== next):
    if (prev !== null) close the open borrow  -> returnedAt = now()
    if (next !== null) open a new borrow      -> borrowedAt = body.borrowedDate ?? now()
                                                  dueAt      = body.estimatedReturnDate
```

- A → B (a handoff) closes one borrow and opens another. Two statements, one
  transition, correct on both sides.
- **The tool update and the borrow writes go in one `prisma.$transaction`.** A
  tool must never show a borrower with no matching open row; that is exactly the
  inconsistency the unique index cannot catch.
- `borrowedAt` uses the admin's entered `borrowed_date` when there is one — that
  is the truth about when the tool left the shelf — and the save time otherwise.
- Closing a borrow when no open row exists is a **no-op, not an error**. Tools
  edited before this shipped have no open row, and refusing their return would
  break a working screen over a record that was never taken.

**The cost of detecting rather than declaring** (§1, out of scope): an admin who
picks the wrong driver and corrects it produces a close plus a fresh open — one
phantom borrow on the count. That is noise on a leaderboard, not a broken number,
and the fix is explicit actions, which is a UI rebuild that was not asked for.
Note that a zero-day borrow is **not** evidence of this: a tool taken and
returned the same day is ordinary, and discarding those would drop real data.

### 4.4 API

```
GET /api/tools/stats
```

- **Declared before `/:id` in the router.** Express matches in order, so
  `/:id` would otherwise swallow "stats" and hand it to Prisma as a uuid — a
  500 from `P2023` that looks like a database fault. This is the single easiest
  thing to get wrong in this feature.
- **Roles:** `INVENTORY_READ_ROLES`, matching the rest of the tools module.
  Admin and driver are the two that actually reach the page.

```ts
type ToolBorrowStats = {
  toolsOut: number;          // open borrows
  overdue: number;           // open borrows with dueAt < today
  borrowsInWindow: number;   // borrows opened in the last 90 days
  avgDaysOut: number | null; // over RETURNED borrows in the window; null if none
  topBorrowed: {
    toolId: string;
    name: string;
    borrows: number;
    isOut: boolean;
    isOverdue: boolean;
  }[];                       // top 5, borrows desc, then name asc
};
```

**Why 90 days:** "frequently" means lately — a tool retired in March should not
outrank one in daily use. It changes nothing at launch, since the log starts
empty and the first 90 days are all-time either way. The window is one exported
constant, not a literal buried in a query.

**Ties break by name**, so the ranking does not reshuffle between two reads.

**`overdue` reads the borrow row's `dueAt`, not the tool's `estimated_return_date`.**
They are written together and should agree; reading one source keeps the strip
and the panel from ever disagreeing with each other.

**`avgDaysOut` counts returned borrows only.** An open borrow has no duration
yet, and treating it as zero would drag the average toward zero exactly when the
most tools are out.

### 4.5 UI

In `tools/index.tsx`, above the existing `ViewTabs`:

- `MetricStrip` with **Tools out · Overdue · Borrows (90d) · Avg days out**.
- A new `tools/borrow-leaderboard.tsx` — the top five with rank, name, borrow
  count, and a marker for out-now and overdue.

**The empty state carries real weight here.** For the first weeks this panel has
nothing in it, and an empty panel reads as broken software. It says instead that
borrows are recorded from now on and the list fills as tools move — so nobody
files a bug against a feature that is working correctly. `avgDaysOut` of `null`
renders as an em dash, never `0`.

Both admin and driver reach this page and both see the same panel; a driver
knowing which tools are in demand is useful, not a leak.

### 4.6 Tests

API, in `tools/tool-borrows.test.ts`:

- Setting a borrower on an available tool opens exactly one borrow row.
- Clearing the borrower closes it and stamps `returnedAt`.
- A → B closes the first and opens a second; the first keeps its original
  `borrowedAt`.
- A `PATCH` that omits `borrowedById` entirely leaves the open borrow untouched
  — the assertion that fails if `undefined` is read as "clear".
- Creating a tool with a borrower opens a borrow.
- Clearing a borrower on a tool with no open row succeeds and creates nothing.
- The partial unique index rejects a second open borrow for one tool, asserted by
  a direct insert.
- Deleting a tool removes its borrows and does not 409.

Stats, in the same file:

- `toolsOut` counts open borrows only.
- `overdue` counts open borrows past `dueAt` and excludes returned ones that were
  late — an assertion that fails if the query forgets `returnedAt IS NULL`.
- `topBorrowed` ranks by count, breaks ties by name, and caps at 5.
- A borrow opened 100 days ago is outside the 90-day window; one opened 80 days
  ago is inside. **Both dates are seeded relative to a fixed clock**, since
  `apps/api/vitest.config.ts` pins `TZ: 'UTC'`.
- `avgDaysOut` is `null` when nothing has been returned, and ignores open borrows
  when something has.
- A security guard gets 403; a driver gets 200.

E2E, extending `apps/web/e2e/`:

- The tools page renders the strip and the leaderboard's empty state on a clean
  database — the one assertion that catches a `/stats` route shadowed by `/:id`,
  because that failure renders as an empty panel rather than an error.

---

## 5. Testing standard

Every assertion must fail under the bug it exists to catch. Two in this spec are
there specifically because their obvious form would not:

- The same-day fuel-and-repair ordering test passes trivially if both are seeded
  on different days. It must seed them on one day.
- The `overdue` test passes trivially without a returned-but-late borrow in the
  fixture.

Test data uses fixed dates, never `new Date()` offsets, so a suite that passes in
August still passes in December.

---

## 6. Follow-ups

- **The per-user activity log**, deferred here, gets its own brainstorm. When it
  lands, the tool borrow write should emit an activity entry from the same
  function that writes the borrow row — one call site fanning out, the way
  `notifications/events.ts` already does. Two call sites for one real-world event
  drift.
- **`approved_by_evp` and `decided_by` overlap** on approvals. Collapsing them
  means touching the trip-ticket detail screen; worth doing, not worth doing now.
- **`components/pages/job-order/evp-approval/`** is the EVP's entire interface
  and is mostly about fuel, yet lives under job orders. Moving it is a one-line
  import change in `dashboard/index.tsx`. Left in place to keep this diff about
  the feature.
- **`borrow_requests` is still a dead table** after this work. `tool_borrows`
  deliberately does not reuse it: that table models a request-and-approval cycle
  that does not exist, so every column but three would stay null. Dropping it
  belongs with whatever eventually builds that workflow.
- **The EVP queue reads `useTripTickets(1, 100)` and filters client-side.** With
  more than 100 tickets in the system, a pending one on page 2 never reaches the
  queue and is invisible to the EVP. Pre-existing, out of scope here, and worth
  fixing: the list endpoint already accepts `?status=`.
