# Approval History and Tool Borrow Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give the EVP a record of the fuel and repair decisions already made, and give the tools page a ranking of which tools actually get borrowed.

**Architecture:** Two independent features. Feature A (Tasks 1–3) adds decider/timestamp columns to `fuel_allocations`, widens `job_orders.date_approved` to a timestamp, and serves a merged decision list from a new `approvals` module behind a History tab. Feature B (Tasks 4–7) adds a `tool_borrows` table written by diffing the borrower on every tool save, and reads it for a metric strip and a most-borrowed panel.

**Tech Stack:** pnpm monorepo — `apps/api` (Express 5, Prisma 6, Postgres), `apps/web` (React 19, TanStack Router/Query, Tailwind, shadcn/ui), `packages/shared` (Zod contracts), Vitest + supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-28-approval-history-and-tool-borrow-tracking-design.md`

## Global Constraints

- **Never run `git push`.** Commit only. The user pushes manually.
- **Never add `Co-Authored-By: Claude` or any AI attribution** to a commit message.
- Work directly on `main`. No feature branches.
- `apps/api` has `noUncheckedIndexedAccess: true`; `apps/web` does **not**. Indexing an array in API code yields `T | undefined` and must be narrowed.
- `apps/api/vitest.config.ts` pins `TZ: 'UTC'`. Every date in a test is a fixed literal, never a `Date.now()` offset — a suite that passes in August must pass in December.
- **Every assertion must fail under the bug it exists to catch.** Before committing a test, break the line it covers, confirm a real failure, restore, and confirm the file is byte-identical.
- API list endpoints return `{ data, count }`. Match it.
- Tool endpoints are **multipart**, not JSON — supertest uses `.field(...)`, not `.send({...})`.
- `queryClient.invalidateQueries({ queryKey: ['tools'] })` is **prefix-matching**, so a key of `['tools', 'stats']` is already invalidated by the existing tool mutations. Do not add a second invalidation.
- The 90-day window is one exported constant, never a literal inside a query.
- Run `pnpm --filter @mms/shared build` after editing `packages/shared` — the API and web import the built output.

---

## File Structure

**Feature A — EVP decision history**

| File | Responsibility |
| --- | --- |
| `apps/api/prisma/schema.prisma` | `FuelAllocation.decidedById/decidedAt` + relation, `User.decidedAllocations` back-reference, `JobOrder.dateApproved` loses `@db.Date` |
| `apps/api/prisma/migrations/<ts>_add_decision_fields/migration.sql` | Two columns, one index, one column-type widening |
| `apps/api/src/modules/trip-tickets/transitions.ts` | `approveEvp` and `disapprove` write the decider and moment |
| `packages/shared/src/contracts/approvals.ts` | `DecisionRecord`, the query schema, `APPROVAL_KINDS` |
| `apps/api/src/modules/approvals/repository.ts` | The two Prisma reads |
| `apps/api/src/modules/approvals/service.ts` | Shape, merge, sort, slice |
| `apps/api/src/modules/approvals/controller.ts` | Parse query, call service |
| `apps/api/src/modules/approvals/router.ts` | One route, admin + EVP |
| `apps/web/src/lib/api/approvals.ts`, `lib/query/approvals.ts` | Fetch + hook |
| `apps/web/.../evp-approval/index.tsx` | Shell, headline, tabs |
| `apps/web/.../evp-approval/queue.tsx` | The two pending sections, moved verbatim |
| `apps/web/.../evp-approval/history.tsx` | The decision list |

**Feature B — Tool borrow tracking**

| File | Responsibility |
| --- | --- |
| `apps/api/prisma/schema.prisma` | `ToolBorrow` model, `Tool.borrows` and `Driver.toolBorrows` back-references |
| `apps/api/prisma/migrations/<ts>_add_tool_borrows/migration.sql` | Table, backfill, partial unique index — in that order |
| `apps/api/src/test/db.ts` | `tool_borrows` added to `TABLES` |
| `apps/api/src/modules/tools/borrows.ts` | The borrower diff and its two writes — isolated so it is unit-testable and the service stays readable |
| `apps/api/src/modules/tools/service.ts` | `create` and `update` call into `borrows.ts` inside a transaction; new `stats()` |
| `apps/api/src/modules/tools/repository.ts` | The four stats queries |
| `apps/api/src/modules/tools/{controller,router}.ts` | `GET /stats`, declared **before** `/:id` |
| `packages/shared/src/contracts/tools.ts` | `ToolBorrowStats`, `BORROW_WINDOW_DAYS` |
| `apps/web/src/lib/api/tools.ts`, `lib/query/tools.ts` | Fetch + hook |
| `apps/web/src/components/pages/tools/borrow-leaderboard.tsx` | The ranked panel |
| `apps/web/src/components/pages/tools/index.tsx` | Strip + panel above `ViewTabs` |

---

## Task 1: Decision fields on fuel allocations and job orders

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_decision_fields/migration.sql`
- Modify: `apps/api/src/modules/trip-tickets/transitions.ts` (`approveEvp`, `disapprove`)
- Test: `apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `fuel_allocations.decided_by` (uuid, nullable), `fuel_allocations.decided_at` (timestamp, nullable), `fuel_allocations.disapproved_reason` now written on decline, `job_orders.date_approved` as `timestamp(3)`. Task 2 reads all four.

- [ ] **Step 1: Edit the schema**

In `model FuelAllocation`, add two fields and the relation (keep `approvedByEvpId` exactly as it is):

```prisma
  decidedById       String?          @map("decided_by") @db.Uuid
  decidedAt         DateTime?        @map("decided_at")

  decidedBy     User?      @relation("AllocationDecidedBy", fields: [decidedById], references: [id])

  @@index([decidedAt])
```

In `model User`, beside `requestedAllocations` and `evpApprovedAllocations`:

```prisma
  decidedAllocations       FuelAllocation[]          @relation("AllocationDecidedBy")
```

In `model JobOrder`, remove `@db.Date` from `dateApproved` so the line reads:

```prisma
  dateApproved        DateTime?      @map("date_approved")
```

A named relation without its other half fails `prisma generate` before a single test runs — the `User` line is not optional.

- [ ] **Step 2: Generate the migration without applying it**

```bash
pnpm --filter @mms/api exec prisma migrate dev --create-only --name add_decision_fields
```

- [ ] **Step 3: Inspect the generated SQL**

Open the new `migration.sql`. It must contain an `ALTER ... SET DATA TYPE TIMESTAMP(3)` for `date_approved`:

```sql
ALTER TABLE "fuel_allocations" ADD COLUMN "decided_at" TIMESTAMP(3),
ADD COLUMN "decided_by" UUID;

ALTER TABLE "job_orders" ALTER COLUMN "date_approved" SET DATA TYPE TIMESTAMP(3);

CREATE INDEX "fuel_allocations_decided_at_idx" ON "fuel_allocations"("decided_at");

ALTER TABLE "fuel_allocations" ADD CONSTRAINT "fuel_allocations_decided_by_fkey"
  FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

**If it instead contains `DROP COLUMN "date_approved"` followed by `ADD COLUMN`, stop and replace those two statements with the `ALTER ... SET DATA TYPE` line above.** A drop-and-add silently deletes every recorded approval date, and nothing downstream would fail — the history would just be empty, which reads as "no approvals yet".

- [ ] **Step 4: Apply the migration**

```bash
pnpm --filter @mms/api exec prisma migrate dev
```

- [ ] **Step 5: Write the failing tests**

Append to `apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts`, inside the existing top-level `describe`:

```ts
  it('approveEvp records the decider and the moment on the allocation', async () => {
    const { ticket } = await pendingTicket();
    const { user: admin } = await createTestUser({
      email: 'a1@test.local',
      role: 'admin'
    });
    const { user: evp } = await createTestUser({
      email: 'e1@test.local',
      role: 'evp_operations'
    });
    await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(fuelBody);

    const before = new Date();
    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve-evp`)
      .set('Authorization', authHeader(evp.id, evp.email, 'evp_operations'));
    expect(res.status).toBe(200);

    const allocation = await prisma.fuelAllocation.findUniqueOrThrow({
      where: { tripTicketId: ticket.id }
    });
    expect(allocation.status).toBe('approved');
    expect(allocation.decidedById).toBe(evp.id);
    expect(allocation.decidedAt).not.toBeNull();
    expect(allocation.decidedAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000
    );
  });

  it('disapprove records the decider, the moment AND the reason on the allocation', async () => {
    const { ticket } = await pendingTicket();
    const { user: admin } = await createTestUser({
      email: 'a2@test.local',
      role: 'admin'
    });
    const { user: evp } = await createTestUser({
      email: 'e2@test.local',
      role: 'evp_operations'
    });
    await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(fuelBody);

    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/disapprove`)
      .set('Authorization', authHeader(evp.id, evp.email, 'evp_operations'))
      .send({ reason: 'Budget exhausted this quarter' });
    expect(res.status).toBe(200);

    const allocation = await prisma.fuelAllocation.findUniqueOrThrow({
      where: { tripTicketId: ticket.id }
    });
    expect(allocation.status).toBe('disapproved');
    expect(allocation.decidedById).toBe(evp.id);
    expect(allocation.decidedAt).not.toBeNull();
    // The column has existed since the first migration and nothing has ever
    // written it. This is the assertion that notices.
    expect(allocation.disapprovedReason).toBe('Budget exhausted this quarter');
  });

  it('cancel settles the allocation without recording a decider', async () => {
    const { ticket, requester } = await pendingTicket();
    const { user: admin } = await createTestUser({
      email: 'a3@test.local',
      role: 'admin'
    });
    await request(app)
      .post(`/api/trip-tickets/${ticket.id}/approve`)
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(fuelBody);

    const res = await request(app)
      .post(`/api/trip-tickets/${ticket.id}/cancel`)
      .set(
        'Authorization',
        authHeader(requester.id, requester.email, 'requester')
      )
      .send({ reason: 'No longer needed' });
    expect(res.status).toBe(200);

    const allocation = await prisma.fuelAllocation.findUniqueOrThrow({
      where: { tripTicketId: ticket.id }
    });
    // A withdrawal is not a decision. Task 2's history must never show it.
    expect(allocation.status).toBe('cancelled');
    expect(allocation.decidedById).toBeNull();
    expect(allocation.decidedAt).toBeNull();
  });
```

- [ ] **Step 6: Run them and watch them fail**

```bash
pnpm --filter @mms/api test -- trip-ticket-transitions
```

Expected: the first two FAIL (`decidedById` is `null`, `disapprovedReason` is `null`). The third already PASSES — it pins existing behaviour so a later change to `cancel` cannot quietly leak withdrawals into the history.

- [ ] **Step 7: Write the decider into `approveEvp`**

In `apps/api/src/modules/trip-tickets/transitions.ts`, replace the body of `approveEvp`'s transaction:

```ts
export async function approveEvp(id: string, actor: AuthenticatedUser) {
  const ticket = await loadInState(id, ['pending_fuel_allocation_approval']);
  const decidedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.tripTicket.update({ where: { id }, data: { status: 'approved' } });
    await tx.fuelAllocation.update({
      where: { tripTicketId: id },
      data: {
        status: 'approved',
        approvedByEvpId: actor.id,
        // decidedBy/decidedAt are the history's source (spec §3.1). They overlap
        // with approvedByEvpId on approvals but are written from the same
        // actor.id in the same statement, so they cannot drift. approvedByEvpId
        // stays because the trip-ticket detail screen reads it.
        decidedById: actor.id,
        decidedAt
      }
    });
  });
  await events.tripApprovedByEvp(ticket, actor);
  return findTripTicketById(id);
}
```

- [ ] **Step 8: Write the decider and the reason into `disapprove`**

In the same file, in `disapprove`, hoist `const decidedAt = new Date();` above the transaction and change the allocation write:

```ts
    await tx.fuelAllocation.updateMany({
      where: { tripTicketId: id },
      data: {
        status: 'disapproved',
        // The column has existed since the first migration and nothing wrote it,
        // so a declined allocation could never say why (spec §2).
        disapprovedReason: reason,
        decidedById: actor.id,
        decidedAt
      }
    });
```

Leave `cancel` alone.

- [ ] **Step 9: Run the tests**

```bash
pnpm --filter @mms/api test -- trip-ticket-transitions
```

Expected: PASS.

- [ ] **Step 10: Prove the new assertions can fail**

For each of the two new lines (`disapprovedReason: reason` and `decidedById: actor.id` in `approveEvp`): delete it, re-run, confirm the matching test fails, restore it, re-run, confirm green. A test that passes with the line removed is testing nothing.

- [ ] **Step 11: Run the full API suite**

```bash
pnpm --filter @mms/api test
```

Expected: everything green. `job_orders.date_approved` becoming a timestamp must not break any existing job-order assertion; if one compares to a date-only string, widen that assertion rather than narrowing the column back.

- [ ] **Step 12: Commit**

```bash
git add apps/api/prisma apps/api/src/modules/trip-tickets/transitions.ts apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts
git commit -m "feat(api): record who decided a fuel allocation and when"
```

---

## Task 2: The approvals history endpoint

**Files:**
- Create: `packages/shared/src/contracts/approvals.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/modules/approvals/{repository,service,controller,router}.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/approvals/approvals.test.ts`

**Interfaces:**
- Consumes: `fuel_allocations.decided_by`, `decided_at`, `disapproved_reason`; `job_orders.approved_by`, `date_approved` (Task 1).
- Produces: `GET /api/approvals/history` returning `{ data: DecisionRecord[]; count: number }`, and the exported types `DecisionRecord`, `ApprovalHistoryQuery`. Task 3 consumes both.

- [ ] **Step 1: Write the shared contract**

Create `packages/shared/src/contracts/approvals.ts`:

```ts
import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export const APPROVAL_KINDS = ['fuel', 'repair'] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const approvalHistoryQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(APPROVAL_KINDS).optional()
});
export type ApprovalHistoryQuery = z.infer<typeof approvalHistoryQuerySchema>;

/**
 * One decision, from either source, in one shape.
 *
 * A discriminated record rather than two lists: the History tab is a single
 * chronological column, and merging in the client would make the client own
 * pagination across two sources.
 */
export interface DecisionRecord {
  kind: ApprovalKind;
  id: string;
  ref: string; // 'TT-2044' | 'JO-118' — matches the web's formatRef
  linkTo: string; // '/trip-tickets/<uuid>' | '/job-order/<uuid>'
  outcome: 'approved' | 'declined';
  decidedAt: string | null;
  decidedByName: string | null;
  decidedByRole: string | null;
  reason: string | null; // declines only
  title: string;
  subtitle: string | null;
  liters: number | null; // fuel only
  fuelType: string | null; // fuel only
}
```

- [ ] **Step 2: Export it**

Add to `packages/shared/src/index.ts`, after the organization line:

```ts
export * from './contracts/approvals.js';
```

- [ ] **Step 3: Build the shared package**

```bash
pnpm --filter @mms/shared build
```

- [ ] **Step 4: Write the failing tests**

Create `apps/api/src/modules/approvals/approvals.test.ts`:

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

// TZ is pinned to UTC in vitest.config.ts, so these fixed instants mean the
// same thing on every machine and in every month.
const SAME_DAY_MORNING = new Date('2026-08-20T09:00:00.000Z');
const SAME_DAY_AFTERNOON = new Date('2026-08-20T15:00:00.000Z');
const EARLIER_DAY = new Date('2026-08-18T12:00:00.000Z');

async function evpHeader() {
  const { user } = await createTestUser({
    email: 'evp@test.local',
    role: 'evp_operations'
  });
  return { header: authHeader(user.id, user.email, 'evp_operations'), user };
}

// Driver.email and User.email are UNIQUE. Several tests below scaffold twice —
// once for a fuel decision, once for a repair — so every generated identity
// needs its own address. A counter, not Math.random(): the same test run twice
// must produce the same fixtures.
let seq = 0;
const nextId = () => `${++seq}`;

async function scaffold() {
  const n = nextId();
  const branch = await createTestBranch(`Branch ${n}`);
  // vin and licensePlate are NOT unique on Vehicle, so the factory defaults are
  // safe to repeat. The driver's email is not.
  const vehicle = await createTestVehicle(branch.id);
  const driver = await createTestDriver(
    branch.id,
    'active',
    `driver-${n}@test.local`
  );
  return { branch, vehicle, driver, n };
}

async function seedAllocation(opts: {
  status: 'approved' | 'disapproved' | 'cancelled';
  decidedById?: string | null;
  decidedAt?: Date | null;
  disapprovedReason?: string | null;
  destination?: string;
}) {
  const { branch, vehicle, driver, n } = await scaffold();
  const { user: requester } = await createTestUser({
    email: `req-${n}@test.local`,
    role: 'requester'
  });
  const ticket = await prisma.tripTicket.create({
    data: {
      branchId: branch.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      destination: opts.destination ?? 'Iloilo depot',
      purpose: 'Parts run',
      dateRequested: new Date('2026-08-15'),
      preparedBy: '',
      requestedById: requester.id,
      status: opts.status === 'approved' ? 'approved' : 'disapproved'
    }
  });
  const allocation = await prisma.fuelAllocation.create({
    data: {
      tripTicketId: ticket.id,
      vehicleId: vehicle.id,
      branchId: branch.id,
      requestedById: requester.id,
      liters: 80,
      fuelType: 'diesel',
      date: new Date('2026-08-15'),
      purpose: 'Parts run',
      tripTo: 'Iloilo depot',
      status: opts.status,
      decidedById: opts.decidedById ?? null,
      decidedAt: opts.decidedAt ?? null,
      disapprovedReason: opts.disapprovedReason ?? null
    }
  });
  return { ticket, allocation };
}

async function seedJobOrder(opts: {
  approvedById: string;
  dateApproved: Date;
  incidentDetails?: string;
}) {
  const { branch, vehicle } = await scaffold();
  return prisma.jobOrder.create({
    data: {
      vehicleId: vehicle.id,
      branchId: branch.id,
      status: 'ongoing_repair',
      incidentDetails: opts.incidentDetails ?? 'Brake overhaul',
      approvedById: opts.approvedById,
      dateApproved: opts.dateApproved
    }
  });
}

describe('approvals history', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('returns an approved allocation with its decider, litres and reference', async () => {
    const { header, user } = await evpHeader();
    const { ticket } = await seedAllocation({
      status: 'approved',
      decidedById: user.id,
      decidedAt: SAME_DAY_MORNING
    });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      kind: 'fuel',
      outcome: 'approved',
      liters: 80,
      fuelType: 'diesel',
      title: 'Iloilo depot',
      decidedByRole: 'evp_operations',
      linkTo: `/trip-tickets/${ticket.id}`
    });
    expect(res.body.data[0].ref).toBe(`TT-${ticket.ticketNo}`);
  });

  it('returns a declined allocation WITH its reason', async () => {
    const { header, user } = await evpHeader();
    await seedAllocation({
      status: 'disapproved',
      decidedById: user.id,
      decidedAt: SAME_DAY_MORNING,
      disapprovedReason: 'Budget exhausted this quarter'
    });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.body.data[0]).toMatchObject({
      outcome: 'declined',
      reason: 'Budget exhausted this quarter'
    });
  });

  it('labels an admin override by role', async () => {
    const { header } = await evpHeader();
    const { user: admin } = await createTestUser({
      email: 'override@test.local',
      role: 'admin'
    });
    await seedAllocation({
      status: 'approved',
      decidedById: admin.id,
      decidedAt: SAME_DAY_MORNING
    });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.body.data[0].decidedByRole).toBe('admin');
  });

  it('orders a same-day repair and fuel decision by time of day', async () => {
    const { header, user } = await evpHeader();
    // The repair is LATER in the day, so it must come first. Under the old
    // @db.Date column it truncated to midnight and always sorted last — this
    // test is the one that fails if the widening in Task 1 is reverted.
    await seedAllocation({
      status: 'approved',
      decidedById: user.id,
      decidedAt: SAME_DAY_MORNING
    });
    await seedJobOrder({
      approvedById: user.id,
      dateApproved: SAME_DAY_AFTERNOON
    });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.body.data.map((d: { kind: string }) => d.kind)).toEqual([
      'repair',
      'fuel'
    ]);
  });

  it('sorts a record with no decision time last', async () => {
    const { header, user } = await evpHeader();
    await seedAllocation({
      status: 'approved',
      decidedById: null,
      decidedAt: null,
      destination: 'Pre-migration trip'
    });
    await seedAllocation({
      status: 'approved',
      decidedById: user.id,
      decidedAt: EARLIER_DAY,
      destination: 'Recorded trip'
    });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.body.data.map((d: { title: string }) => d.title)).toEqual([
      'Recorded trip',
      'Pre-migration trip'
    ]);
  });

  it('excludes a cancelled allocation', async () => {
    const { header } = await evpHeader();
    await seedAllocation({ status: 'cancelled' });

    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', header);

    expect(res.body.count).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  it('filters by kind', async () => {
    const { header, user } = await evpHeader();
    await seedAllocation({
      status: 'approved',
      decidedById: user.id,
      decidedAt: SAME_DAY_MORNING
    });
    await seedJobOrder({
      approvedById: user.id,
      dateApproved: SAME_DAY_AFTERNOON
    });

    const fuelOnly = await request(app)
      .get('/api/approvals/history?kind=fuel')
      .set('Authorization', header);
    expect(fuelOnly.body.count).toBe(1);
    expect(fuelOnly.body.data[0].kind).toBe('fuel');

    const repairOnly = await request(app)
      .get('/api/approvals/history?kind=repair')
      .set('Authorization', header);
    expect(repairOnly.body.count).toBe(1);
    expect(repairOnly.body.data[0].kind).toBe('repair');
  });

  it('paginates across both sources', async () => {
    const { header, user } = await evpHeader();
    await seedAllocation({
      status: 'approved',
      decidedById: user.id,
      decidedAt: SAME_DAY_MORNING
    });
    await seedJobOrder({
      approvedById: user.id,
      dateApproved: SAME_DAY_AFTERNOON
    });

    const res = await request(app)
      .get('/api/approvals/history?page=2&limit=1')
      .set('Authorization', header);

    expect(res.body.count).toBe(2);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].kind).toBe('fuel');
  });

  it.each([
    ['requester', 'r@test.local'],
    ['driver', 'd@test.local'],
    ['security_guard', 'g@test.local']
  ])('refuses a %s', async (role, email) => {
    const { user } = await createTestUser({ email, role });
    const res = await request(app)
      .get('/api/approvals/history')
      .set('Authorization', authHeader(user.id, user.email, role));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 5: Run them and watch them fail**

```bash
pnpm --filter @mms/api test -- approvals
```

Expected: every test FAILS with 404 — the route does not exist yet.

- [ ] **Step 6: Write the repository**

Create `apps/api/src/modules/approvals/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

// Only settled decisions. A `pending` allocation has not been decided and a
// `cancelled` one was withdrawn by the requester, not decided by anybody —
// showing either as a decision would misattribute it (spec §3.2).
const DECIDED = ['approved', 'disapproved'] as const;

export function decidedAllocations(take: number | undefined) {
  return prisma.fuelAllocation.findMany({
    where: { status: { in: [...DECIDED] } },
    include: {
      tripTicket: { select: { id: true, ticketNo: true, destination: true } },
      vehicle: { select: { make: true, model: true, licensePlate: true } },
      decidedBy: {
        select: { fullName: true, userRole: { select: { role: true } } }
      }
    },
    // Nulls last so pre-migration rows do not open the list (spec §3.3).
    orderBy: { decidedAt: { sort: 'desc', nulls: 'last' } },
    ...(take === undefined ? {} : { take })
  });
}

export function approvedJobOrders(take: number | undefined) {
  return prisma.jobOrder.findMany({
    where: { approvedById: { not: null } },
    include: {
      vehicle: { select: { make: true, model: true, licensePlate: true } },
      approvedBy: {
        select: { fullName: true, userRole: { select: { role: true } } }
      }
    },
    orderBy: { dateApproved: { sort: 'desc', nulls: 'last' } },
    ...(take === undefined ? {} : { take })
  });
}

export function countDecidedAllocations() {
  return prisma.fuelAllocation.count({
    where: { status: { in: [...DECIDED] } }
  });
}

export function countApprovedJobOrders() {
  return prisma.jobOrder.count({ where: { approvedById: { not: null } } });
}
```

- [ ] **Step 7: Write the service**

Create `apps/api/src/modules/approvals/service.ts`:

```ts
import type { ApprovalHistoryQuery, DecisionRecord } from '@mms/shared';
import * as repo from './repository.js';

// Matches the web's formatRef so a screen and this list name the same row the
// same way.
const ref = (prefix: string, n: number | null | undefined) =>
  n == null ? prefix : `${prefix}-${n}`;

const plate = (v: {
  make: string;
  model: string;
  licensePlate: string;
} | null) => (v ? `${v.make} ${v.model} · ${v.licensePlate}` : null);

/**
 * Merged in memory, which is honest at this fleet's volumes (hundreds of rows)
 * and wrong at tens of thousands. At that point this becomes a single SQL
 * `UNION ALL` with one ORDER BY and one LIMIT — the shape below is deliberately
 * the same so the swap is local to this function.
 */
export async function history(
  query: ApprovalHistoryQuery
): Promise<{ data: DecisionRecord[]; count: number }> {
  const wantsFuel = query.kind !== 'repair';
  const wantsRepair = query.kind !== 'fuel';

  const limit = query.limit ?? (query.page === undefined ? undefined : 10);
  const page = query.page ?? 1;
  // Read enough from EACH source that the merged slice is complete: the whole
  // requested window could come from one side.
  const take = limit === undefined ? undefined : (page - 1) * limit + limit;

  const [allocations, jobOrders, fuelCount, repairCount] = await Promise.all([
    wantsFuel ? repo.decidedAllocations(take) : Promise.resolve([]),
    wantsRepair ? repo.approvedJobOrders(take) : Promise.resolve([]),
    wantsFuel ? repo.countDecidedAllocations() : Promise.resolve(0),
    wantsRepair ? repo.countApprovedJobOrders() : Promise.resolve(0)
  ]);

  const fuel: DecisionRecord[] = allocations.map((a) => ({
    kind: 'fuel',
    id: a.id,
    ref: ref('TT', a.tripTicket.ticketNo),
    linkTo: `/trip-tickets/${a.tripTicket.id}`,
    outcome: a.status === 'approved' ? 'approved' : 'declined',
    decidedAt: a.decidedAt?.toISOString() ?? null,
    decidedByName: a.decidedBy?.fullName ?? null,
    decidedByRole: a.decidedBy?.userRole?.role.name ?? null,
    reason: a.disapprovedReason,
    title: a.tripTicket.destination,
    subtitle: plate(a.vehicle),
    liters: a.liters,
    fuelType: a.fuelType
  }));

  const repair: DecisionRecord[] = jobOrders.map((o) => ({
    kind: 'repair',
    id: o.id,
    ref: ref('JO', o.orderNo),
    linkTo: `/job-order/${o.id}`,
    // Job orders have no decline path — the EVP screen offers approve only.
    outcome: 'approved',
    decidedAt: o.dateApproved?.toISOString() ?? null,
    decidedByName: o.approvedBy?.fullName ?? null,
    decidedByRole: o.approvedBy?.userRole?.role.name ?? null,
    reason: null,
    title: o.incidentDetails ?? 'Repair',
    subtitle: plate(o.vehicle),
    liters: null,
    fuelType: null
  }));

  const merged = [...fuel, ...repair].sort((a, b) => {
    // Nulls last in BOTH directions — Array.sort has no nulls option, so the
    // repository's `nulls: 'last'` has to be re-applied across the merge.
    if (a.decidedAt === null && b.decidedAt === null) return 0;
    if (a.decidedAt === null) return 1;
    if (b.decidedAt === null) return -1;
    return b.decidedAt.localeCompare(a.decidedAt);
  });

  const count = fuelCount + repairCount;
  if (limit === undefined) return { data: merged, count };
  return { data: merged.slice((page - 1) * limit, page * limit), count };
}
```

- [ ] **Step 8: Write the controller**

Create `apps/api/src/modules/approvals/controller.ts`:

```ts
import type { Request, Response } from 'express';
import { approvalHistoryQuerySchema } from '@mms/shared';
import * as service from './service.js';

export async function history(req: Request, res: Response): Promise<void> {
  res.json(await service.history(approvalHistoryQuerySchema.parse(req.query)));
}
```

- [ ] **Step 9: Write the router**

Create `apps/api/src/modules/approvals/router.ts`:

```ts
import { Router } from 'express';
import { USER_ROLES } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import * as controller from './controller.js';

// Whoever may decide may read the record of decisions.
const APPROVAL_ROLES = [
  USER_ROLES.admin,
  USER_ROLES.evp_operations
] as const;

export const approvalsRouter = Router();

approvalsRouter.use(requireAuth, requireRole(...APPROVAL_ROLES));
approvalsRouter.get('/history', controller.history);
```

Router-level `.use` is safe here because this router is mounted at `/api/approvals`, not at a bare `/api`. Do **not** copy this shape onto a router mounted at `/api`.

- [ ] **Step 10: Mount it**

In `apps/api/src/app.ts`, add the import beside the others:

```ts
import { approvalsRouter } from './modules/approvals/router.js';
```

and the mount beside `analyticsRouter`:

```ts
  app.use('/api/approvals', approvalsRouter);
```

- [ ] **Step 11: Run the tests**

```bash
pnpm --filter @mms/api test -- approvals
```

Expected: PASS.

- [ ] **Step 12: Prove the ordering test can fail**

Temporarily change `SAME_DAY_AFTERNOON` to `new Date('2026-08-20T00:00:00.000Z')` — the same midnight the old `@db.Date` column would have produced. The ordering test must FAIL. Restore it and confirm green. If it passes at midnight, the test is not proving the widening.

- [ ] **Step 13: Typecheck and run the full suite**

```bash
pnpm --filter @mms/api typecheck && pnpm --filter @mms/api test
```

- [ ] **Step 14: Commit**

```bash
git add packages/shared apps/api/src/modules/approvals apps/api/src/app.ts
git commit -m "feat(api): serve a merged history of fuel and repair decisions"
```

---

## Task 3: The EVP History tab

**Files:**
- Create: `apps/web/src/lib/api/approvals.ts`
- Create: `apps/web/src/lib/query/approvals.ts`
- Create: `apps/web/src/components/pages/job-order/evp-approval/queue.tsx`
- Create: `apps/web/src/components/pages/job-order/evp-approval/history.tsx`
- Modify: `apps/web/src/components/pages/job-order/evp-approval/index.tsx`

**Interfaces:**
- Consumes: `GET /api/approvals/history` and the `DecisionRecord` type (Task 2).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the API function**

Create `apps/web/src/lib/api/approvals.ts`:

```ts
import { api } from './client.js';
import type { DecisionRecord } from '@mms/shared';

export async function getApprovalHistory(
  page = 1,
  limit = 10,
  kind?: 'fuel' | 'repair'
): Promise<{ data: DecisionRecord[]; count: number }> {
  return api.get<{ data: DecisionRecord[]; count: number }>(
    '/approvals/history',
    { page, limit, ...(kind ? { kind } : {}) }
  );
}
```

- [ ] **Step 2: Write the query hook**

Create `apps/web/src/lib/query/approvals.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { getApprovalHistory } from '@/lib/api/approvals';

// `enabled` gates the fetch until the History tab is actually opened — the
// queue is what the EVP lands on, and most visits never leave it.
export const useApprovalHistory = (
  page: number,
  limit = 10,
  enabled = true
) =>
  useQuery({
    queryKey: ['approvals', 'history', page, limit],
    queryFn: () => getApprovalHistory(page, limit),
    enabled
  });
```

- [ ] **Step 3: Move the queue into its own file**

Create `apps/web/src/components/pages/job-order/evp-approval/queue.tsx`. Move everything from the current `index.tsx` **except** the outer `<div className="mx-auto w-full max-w-[880px] md:py-6">`, the `SectionLabel` heading block, the `<h1>` and its `<p>`. Export the moved component as:

```tsx
export default function ApprovalQueue({
  onCountChange
}: {
  onCountChange: (count: number) => void;
}) {
```

Keep every hook, handler, dialog and `<article>` verbatim — this step must not change behaviour. Report the pending total upward so the shell can render the headline and the tab badge:

```tsx
  const total = pendingTickets.length + pendingJobOrders.length;
  useEffect(() => {
    onCountChange(loading ? 0 : total);
  }, [loading, total, onCountChange]);
```

Add `useEffect` to the existing `react` import. Return the two `<section>` blocks and the dialogs, wrapped in a fragment, plus the existing "nothing pending" branch.

- [ ] **Step 4: Write the history list**

Create `apps/web/src/components/pages/job-order/evp-approval/history.tsx`:

```tsx
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import type { DecisionRecord } from '@mms/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/shared/empty-state';
import TablePagination from '@/components/shared/table-pagination';
import { useApprovalHistory } from '@/lib/query/approvals';
import { roleLabel } from '@/lib/role-label';

const LIMIT = 10;

const formatWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—';

export default function ApprovalHistory() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useApprovalHistory(page, LIMIT);

  const records = data?.data ?? [];
  const totalPages = Math.ceil((data?.count ?? 0) / LIMIT);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-[20px]" />
        <Skeleton className="h-24 w-full rounded-[20px]" />
      </div>
    );
  }

  if (records.length === 0) {
    return <EmptyState message="No decisions recorded yet." />;
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {records.map((record: DecisionRecord) => (
          <article
            key={`${record.kind}-${record.id}`}
            className="bg-card border-border flex flex-wrap items-center gap-5 rounded-[20px] border p-6"
          >
            <div className="min-w-[230px] flex-1">
              <div className="text-muted-foreground font-mono text-xs">
                {record.ref}
              </div>
              <h3 className="mt-1 text-lg font-semibold tracking-tight">
                {record.title}
              </h3>
              <p className="text-slate mt-1.5 text-sm leading-relaxed">
                {record.subtitle}
                <br />
                {record.outcome === 'approved' ? 'Approved' : 'Declined'} by{' '}
                <strong className="text-foreground font-semibold">
                  {record.decidedByName ?? '—'}
                </strong>
                {/* An EVP must be able to tell a sign-off they never made from
                    one they did — /approve-evp admits an admin as an override. */}
                {record.decidedByRole && record.decidedByRole !== 'evp_operations' && (
                  <> ({roleLabel(record.decidedByRole)} override)</>
                )}{' '}
                · {formatWhen(record.decidedAt)}
              </p>
              {record.reason && (
                <p className="text-slate mt-2 text-sm italic">
                  “{record.reason}”
                </p>
              )}
            </div>

            {record.liters !== null && (
              <div className="flex-none text-right">
                <div className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                  Fuel budget
                </div>
                <div className="text-2xl font-medium tracking-tight">
                  {record.liters} L
                </div>
                {record.fuelType && (
                  <div className="text-slate mt-0.5 text-xs capitalize">
                    {record.fuelType}
                  </div>
                )}
              </div>
            )}

            <Button variant="ghost" size="icon" asChild>
              <Link to={record.linkTo}>
                <Eye />
                <span className="sr-only">View {record.ref}</span>
              </Link>
            </Button>
          </article>
        ))}
      </div>

      <TablePagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </>
  );
}
```

If `roleLabel` is not an exported function in `apps/web/src/lib/role-label.ts`, read that file and use whatever it exports; do not invent a second label map.

- [ ] **Step 5: Rewrite the shell**

Replace `apps/web/src/components/pages/job-order/evp-approval/index.tsx` with:

```tsx
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApprovalQueue from './queue';
import ApprovalHistory from './history';

// shadcn paints the ACTIVE tab with --background, which on a light card sits
// lighter than the --muted track behind the inactive one — the control reads
// inverted. Same fix the trip-tickets page uses.
const ACTIVE_TAB =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground dark:data-[state=active]:border-primary';

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-3 flex items-center gap-2">
    <span className="bg-signal size-2 rounded-full" />
    <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
      {children}
    </span>
  </div>
);

/**
 * The EVP's entire job is one question: what needs my sign-off? So the landing
 * tab is a queue, not a dashboard. History sits beside it rather than beneath
 * it — acting on work and looking something up are different jobs, and the
 * headline still counts PENDING only, so "Nothing needs you" keeps meaning
 * what it says while a full History tab sits next to it.
 */
export default function EvpApprovalPage() {
  const [pending, setPending] = useState(0);

  return (
    <div className="mx-auto w-full max-w-[880px] md:py-6">
      <SectionLabel>Awaiting your sign-off</SectionLabel>

      <h1 className="text-3xl font-medium tracking-tight md:text-[44px] md:leading-[1.05]">
        {pending === 0
          ? 'Nothing needs you'
          : `${pending} thing${pending === 1 ? '' : 's'} need${pending === 1 ? 's' : ''} you`}
      </h1>
      <p className="text-slate mt-2 text-base">
        Fuel budgets and repair sign-offs. Declining always asks for a reason.
      </p>

      <Tabs defaultValue="queue" className="mt-8">
        <TabsList>
          <TabsTrigger value="queue" className={ACTIVE_TAB}>
            Needs you{pending > 0 ? ` (${pending})` : ''}
          </TabsTrigger>
          <TabsTrigger value="history" className={ACTIVE_TAB}>
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-6">
          <ApprovalQueue onCountChange={setPending} />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <ApprovalHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and lint**

```bash
pnpm --filter @mms/web exec tsc -b && pnpm --filter @mms/web lint
```

Expected: both clean.

- [ ] **Step 7: Check it in a browser**

Start the API and the web dev server, sign in as an EVP, and confirm: the queue tab still approves and declines exactly as before; the History tab lists decisions; a decline shows its reason; an admin-decided row says "override".

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/api/approvals.ts apps/web/src/lib/query/approvals.ts apps/web/src/components/pages/job-order/evp-approval
git commit -m "feat(web): give the EVP a history tab beside their approval queue"
```

---

## Task 4: The tool_borrows table

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_tool_borrows/migration.sql`
- Modify: `apps/api/src/test/db.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `ToolBorrow` Prisma model with fields `id`, `toolId`, `borrowerId`, `borrowedAt`, `dueAt`, `returnedAt`, `createdAt`, `updatedAt`; the partial unique index `tool_borrows_open_unique`. Tasks 5 and 6 read and write it.

- [ ] **Step 1: Add the model**

Append to `apps/api/prisma/schema.prisma`, after `model BorrowRequest`:

```prisma
// One borrow. `returned_at IS NULL` means the tool is still out — a nullable
// timestamp rather than a boolean, the same way Notification.readAt works:
// "when" answers "whether" as well.
//
// Deliberately NOT borrow_requests. That table models a request-and-approval
// cycle that does not exist in this app, so every column but three would stay
// null forever (spec §6).
model ToolBorrow {
  id         String    @id @default(uuid()) @db.Uuid
  toolId     String    @map("tool_id") @db.Uuid
  borrowerId String    @map("borrower_id") @db.Uuid
  borrowedAt DateTime  @map("borrowed_at")
  dueAt      DateTime? @map("due_at") @db.Date
  returnedAt DateTime? @map("returned_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")

  // Cascade: deleting a tool deletes its history. Restrict would refuse to
  // delete any tool ever borrowed, newly breaking a working button — and a
  // deleted tool has no place on a leaderboard anyway.
  tool     Tool   @relation(fields: [toolId], references: [id], onDelete: Cascade)
  // Restrict (the default): a driver with borrow history is not silently deletable.
  borrower Driver @relation(fields: [borrowerId], references: [id])

  @@index([toolId, borrowedAt])
  @@index([returnedAt])
  @@map("tool_borrows")
}
```

In `model Tool`, beside `borrowRequests`:

```prisma
  borrows        ToolBorrow[]
```

In `model Driver`, beside its other relations:

```prisma
  toolBorrows    ToolBorrow[]
```

- [ ] **Step 2: Generate the migration without applying it**

```bash
pnpm --filter @mms/api exec prisma migrate dev --create-only --name add_tool_borrows
```

- [ ] **Step 3: Append the backfill and the partial index**

Open the generated `migration.sql` and add these two blocks **at the end**, after the `CREATE TABLE` and its foreign keys:

```sql
-- Backfill: every tool currently signed out gets an OPEN borrow row.
--
-- Without this, a tool that is out right now has no opening row, so its
-- eventual return closes nothing and "tools out" derived from history disagrees
-- with the tools table permanently — with nothing on screen to indicate it.
INSERT INTO "tool_borrows" ("id", "tool_id", "borrower_id", "borrowed_at", "due_at", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "borrowed_by",
       COALESCE("borrowed_date"::timestamp, now()),
       "estimated_return_date",
       now(), now()
FROM "tools"
WHERE "borrowed_by" IS NOT NULL;

-- At most one open borrow per tool. Prisma cannot express a partial unique
-- index, so it lives here — same as tracker_devices_active_vehicle_unique.
--
-- This is the invariant the whole feature rests on: without it, a bug in the
-- write path double-counts a tool as out and every metric on the page is wrong.
--
-- Created AFTER the backfill on purpose, so a pre-existing duplicate fails the
-- migration loudly rather than slipping past.
CREATE UNIQUE INDEX "tool_borrows_open_unique"
  ON "tool_borrows" ("tool_id") WHERE "returned_at" IS NULL;
```

- [ ] **Step 4: Apply the migration**

```bash
pnpm --filter @mms/api exec prisma migrate dev
```

- [ ] **Step 5: Verify the backfill and the index by hand**

```bash
pnpm --filter @mms/api exec prisma db execute --stdin <<'SQL'
SELECT (SELECT count(*) FROM tools WHERE borrowed_by IS NOT NULL) AS tools_out,
       (SELECT count(*) FROM tool_borrows WHERE returned_at IS NULL) AS open_borrows;
SQL
```

Expected: the two numbers are equal. If `open_borrows` is 0 while `tools_out` is not, the backfill did not run — check it landed in the migration that was actually applied.

- [ ] **Step 6: Add the table to the test truncation list**

In `apps/api/src/test/db.ts`, add `'tool_borrows'` to `TABLES` immediately **before** `'tools'`:

```ts
  'borrow_requests',
  'tool_borrows',
  'tools',
```

`CASCADE` would reach it anyway, but every other table is listed explicitly and `RESTART IDENTITY` only applies to what is named.

- [ ] **Step 7: Confirm the suite still passes**

```bash
pnpm --filter @mms/api test
```

Expected: green. Nothing reads the new table yet — this step proves the migration and the truncation change broke nothing.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma apps/api/src/test/db.ts
git commit -m "feat(api): add a tool_borrows table with an open-borrow backfill"
```

---

## Task 5: Record a borrow whenever a tool changes hands

**Files:**
- Create: `apps/api/src/modules/tools/borrows.ts`
- Modify: `apps/api/src/modules/tools/service.ts` (`create`, `update`)
- Test: `apps/api/src/modules/tools/tool-borrows.test.ts`

**Interfaces:**
- Consumes: the `ToolBorrow` model (Task 4).
- Produces: `syncBorrow(tx, toolId, prev, next, opts)` in `borrows.ts`. Task 6 reads the rows it writes.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/tools/tool-borrows.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({
    email: 'boss@test.local',
    role: 'admin'
  });
  return authHeader(user.id, user.email, 'admin');
}

async function createDriver(email = 'wheel@test.local') {
  return prisma.driver.create({
    data: { email, fullName: 'Wheel Man', status: 'active' }
  });
}

async function createTool(header: string, name = 'Jack') {
  const res = await request(app)
    .post('/api/tools')
    .set('Authorization', header)
    .field('name', name);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const borrowsFor = (toolId: string) =>
  prisma.toolBorrow.findMany({
    where: { toolId },
    orderBy: { borrowedAt: 'asc' }
  });

describe('tool borrow history', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('opens a borrow when a borrower is set', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('status', 'borrowed')
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-10')
      .field('estimatedReturnDate', '2026-08-20');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.borrowerId).toBe(driver.id);
    expect(borrows[0]!.returnedAt).toBeNull();
    // The admin's entered date is the truth about when the tool left the shelf.
    expect(borrows[0]!.borrowedAt.toISOString()).toBe(
      '2026-08-10T00:00:00.000Z'
    );
  });

  it('closes the borrow when the borrower is cleared', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-10');

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('status', 'available')
      .field('borrowedById', '')
      .field('borrowedDate', '')
      .field('estimatedReturnDate', '');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.returnedAt).not.toBeNull();
  });

  it('closes one and opens another on a handoff, keeping the first borrowedAt', async () => {
    const header = await adminHeader();
    const a = await createDriver('a@test.local');
    const b = await createDriver('b@test.local');
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', a.id)
      .field('borrowedDate', '2026-08-10');

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', b.id)
      .field('borrowedDate', '2026-08-14');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(2);
    expect(borrows[0]!.borrowerId).toBe(a.id);
    expect(borrows[0]!.returnedAt).not.toBeNull();
    // The first borrow keeps its ORIGINAL start — a handoff must not rewrite
    // when the tool actually left.
    expect(borrows[0]!.borrowedAt.toISOString()).toBe(
      '2026-08-10T00:00:00.000Z'
    );
    expect(borrows[1]!.borrowerId).toBe(b.id);
    expect(borrows[1]!.returnedAt).toBeNull();
  });

  it('leaves the open borrow alone when the PATCH omits borrowedById', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-10');

    // Renaming the tool must not read as a return. `undefined` means "leave",
    // '' means "clear" — this is the assertion that fails if they are conflated.
    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('name', 'Renamed Jack');

    const borrows = await borrowsFor(id);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.returnedAt).toBeNull();
  });

  it('opens a borrow when a tool is CREATED already borrowed', async () => {
    const header = await adminHeader();
    const driver = await createDriver();

    const res = await request(app)
      .post('/api/tools')
      .set('Authorization', header)
      .field('name', 'Pre-lent Drill')
      .field('status', 'borrowed')
      .field('borrowedById', driver.id)
      .field('borrowedDate', '2026-08-11');
    expect(res.status).toBe(201);

    const borrows = await borrowsFor(res.body.id as string);
    expect(borrows).toHaveLength(1);
    expect(borrows[0]!.returnedAt).toBeNull();
  });

  it('clearing a borrower with no open row succeeds and creates nothing', async () => {
    const header = await adminHeader();
    const id = await createTool(header);

    // Tools edited before this shipped have no open row. Refusing their return
    // would break a working screen over a record that was never taken.
    const res = await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', '');
    expect(res.status).toBe(200);
    expect(await borrowsFor(id)).toHaveLength(0);
  });

  it('refuses a second open borrow for one tool', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id);

    await expect(
      prisma.toolBorrow.create({
        data: { toolId: id, borrowerId: driver.id, borrowedAt: new Date() }
      })
    ).rejects.toThrow();
  });

  it('deletes borrows with the tool rather than refusing the delete', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    const id = await createTool(header);

    await request(app)
      .patch(`/api/tools/${id}`)
      .set('Authorization', header)
      .field('borrowedById', driver.id);

    const removed = await request(app)
      .delete(`/api/tools/${id}`)
      .set('Authorization', header);
    expect(removed.status).toBe(204);
    expect(await borrowsFor(id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm --filter @mms/api test -- tool-borrows
```

Expected: FAIL — no borrow rows are written.

- [ ] **Step 3: Write the borrow sync**

Create `apps/api/src/modules/tools/borrows.ts`:

```ts
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Reconcile borrow history with a change of borrower.
 *
 * Borrowing in this app is an admin editing fields on the tool — there is no
 * borrow/return action to hook (spec §4.3). So the transition is DETECTED by
 * comparing the borrower before and after the save.
 *
 * Known cost of detecting rather than declaring: an admin who picks the wrong
 * driver and corrects it produces a close plus a fresh open — one phantom
 * borrow on the count. That is noise on a leaderboard, not a broken number.
 * Note a zero-day borrow is NOT evidence of it: a tool taken and returned the
 * same day is ordinary, and discarding those would drop real data.
 *
 * Always call inside the same transaction as the tool write, or a tool can show
 * a borrower with no matching open row — the one inconsistency the partial
 * unique index cannot catch.
 */
export async function syncBorrow(
  tx: Tx,
  toolId: string,
  prev: string | null,
  next: string | null,
  opts: { borrowedAt?: Date | null; dueAt?: Date | null } = {}
): Promise<void> {
  if (prev === next) return;

  if (prev !== null) {
    // updateMany, not update: closing when nothing is open is a no-op, not an
    // error. Tools borrowed before this shipped have no row to close.
    await tx.toolBorrow.updateMany({
      where: { toolId, returnedAt: null },
      data: { returnedAt: new Date() }
    });
  }

  if (next !== null) {
    await tx.toolBorrow.create({
      data: {
        toolId,
        borrowerId: next,
        borrowedAt: opts.borrowedAt ?? new Date(),
        dueAt: opts.dueAt ?? null
      }
    });
  }
}
```

- [ ] **Step 4: Call it from `create`**

In `apps/api/src/modules/tools/service.ts`, replace `create`:

```ts
export async function create(body: CreateToolBody, imagePath: string | null) {
  return prisma.$transaction(async (tx) => {
    const tool = await tx.tool.create({ data: { ...body, image: imagePath } });
    // The contract allows a tool to be born already borrowed, so create needs
    // the same treatment as update.
    await syncBorrow(tx, tool.id, null, tool.borrowedById, {
      borrowedAt: tool.borrowedDate,
      dueAt: tool.estimatedReturnDate
    });
    return tool;
  });
}
```

- [ ] **Step 5: Call it from `update`**

Replace `update` in the same file:

```ts
export async function update(
  id: string,
  body: UpdateToolBody,
  newImagePath: string | null
) {
  const existing = await findToolById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  const { removeImage, ...rest } = body;
  const image = newImagePath ? newImagePath : removeImage ? null : undefined;

  // Three-valued multipart convention: absent = leave, null = clear, value =
  // set. Reading `undefined` as "clear" would close an open borrow every time
  // somebody renamed a tool.
  const prev = existing.borrowedById;
  const next = body.borrowedById === undefined ? prev : body.borrowedById;

  return prisma.$transaction(async (tx) => {
    const tool = await tx.tool.update({
      where: { id },
      data: { ...rest, ...(image !== undefined ? { image } : {}) }
    });
    await syncBorrow(tx, id, prev, next, {
      borrowedAt: tool.borrowedDate,
      dueAt: tool.estimatedReturnDate
    });
    return tool;
  });
}
```

Add the import at the top of the file:

```ts
import { syncBorrow } from './borrows.js';
```

- [ ] **Step 6: Run the tests**

```bash
pnpm --filter @mms/api test -- tool-borrows
```

Expected: PASS.

- [ ] **Step 7: Prove the three-valued test can fail**

Change `const next = body.borrowedById === undefined ? prev : body.borrowedById;` to `const next = body.borrowedById ?? null;`. The "leaves the open borrow alone" test must FAIL. Restore, confirm green. This is the single most likely bug in the task and the assertion exists only to catch it.

- [ ] **Step 8: Run the full suite and typecheck**

```bash
pnpm --filter @mms/api typecheck && pnpm --filter @mms/api test
```

Expected: green, including the existing `tools.test.ts` borrow/return test.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/tools/borrows.ts apps/api/src/modules/tools/service.ts apps/api/src/modules/tools/tool-borrows.test.ts
git commit -m "feat(api): record a borrow row whenever a tool changes hands"
```

---

## Task 6: The tool borrow stats endpoint

**Files:**
- Modify: `packages/shared/src/contracts/tools.ts`
- Modify: `apps/api/src/modules/tools/repository.ts`
- Modify: `apps/api/src/modules/tools/service.ts`
- Modify: `apps/api/src/modules/tools/controller.ts`
- Modify: `apps/api/src/modules/tools/router.ts`
- Test: `apps/api/src/modules/tools/tool-borrows.test.ts`

**Interfaces:**
- Consumes: the `ToolBorrow` rows written in Task 5.
- Produces: `GET /api/tools/stats` returning `ToolBorrowStats`, and the exported `ToolBorrowStats` type plus `BORROW_WINDOW_DAYS`. Task 7 consumes both.

- [ ] **Step 1: Add the contract**

Append to `packages/shared/src/contracts/tools.ts`:

```ts
// "Frequently" means lately: a tool retired in March should not outrank one in
// daily use. One constant, never a literal inside a query.
export const BORROW_WINDOW_DAYS = 90;

export interface TopBorrowedTool {
  toolId: string;
  name: string;
  borrows: number;
  isOut: boolean;
  isOverdue: boolean;
}

export interface ToolBorrowStats {
  toolsOut: number;
  overdue: number;
  borrowsInWindow: number;
  // Over RETURNED borrows only. An open borrow has no duration yet, and
  // counting it as zero would drag the average down exactly when the most tools
  // are out. null when nothing has been returned — the UI shows an em dash.
  avgDaysOut: number | null;
  topBorrowed: TopBorrowedTool[];
}
```

- [ ] **Step 2: Build the shared package**

```bash
pnpm --filter @mms/shared build
```

- [ ] **Step 3: Write the failing tests**

Append inside the existing `describe` in `apps/api/src/modules/tools/tool-borrows.test.ts`:

```ts
  // Fixed instants, never Date.now() offsets — TZ is pinned to UTC and a suite
  // that passes in August must pass in December.
  const NOW = new Date('2026-08-28T12:00:00.000Z');
  const DAYS_AGO = (n: number) =>
    new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

  // Tools have no unique constraint on `name`, so this is find-or-create rather
  // than an upsert — three borrows of "Popular" must land on ONE tool row or
  // the ranking test measures nothing.
  async function toolByName(name: string) {
    const existing = await prisma.tool.findFirst({ where: { name } });
    return existing ?? (await prisma.tool.create({ data: { name } }));
  }

  async function seedBorrow(opts: {
    toolName: string;
    borrowerId: string;
    borrowedAt: Date;
    returnedAt?: Date | null;
    dueAt?: Date | null;
  }) {
    const tool = await toolByName(opts.toolName);
    await prisma.toolBorrow.create({
      data: {
        toolId: tool.id,
        borrowerId: opts.borrowerId,
        borrowedAt: opts.borrowedAt,
        returnedAt: opts.returnedAt ?? null,
        dueAt: opts.dueAt ?? null
      }
    });
    return tool;
  }

  it('counts only OPEN borrows as tools out', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    await seedBorrow({
      toolName: 'Open Tool',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(2)
    });
    await seedBorrow({
      toolName: 'Returned Tool',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(10),
      returnedAt: DAYS_AGO(8)
    });

    const res = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);

    expect(res.status).toBe(200);
    expect(res.body.toolsOut).toBe(1);
  });

  it('counts overdue only among OPEN borrows', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    await seedBorrow({
      toolName: 'Late And Still Out',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(10),
      dueAt: DAYS_AGO(3)
    });
    // Returned late. It is NOT overdue — it is back. Without this row the
    // assertion passes even if the query forgets `returnedAt IS NULL`.
    await seedBorrow({
      toolName: 'Late But Returned',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(20),
      dueAt: DAYS_AGO(15),
      returnedAt: DAYS_AGO(2)
    });

    const res = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);

    expect(res.body.overdue).toBe(1);
  });

  it('counts borrows inside the 90-day window and excludes older ones', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    await seedBorrow({
      toolName: 'Recent',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(80),
      returnedAt: DAYS_AGO(79)
    });
    await seedBorrow({
      toolName: 'Ancient',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(100),
      returnedAt: DAYS_AGO(99)
    });

    const res = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);

    expect(res.body.borrowsInWindow).toBe(1);
    expect(
      res.body.topBorrowed.map((t: { name: string }) => t.name)
    ).toEqual(['Recent']);
  });

  it('ranks by borrow count and breaks ties by name', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    for (let i = 0; i < 3; i++) {
      await seedBorrow({
        toolName: 'Popular',
        borrowerId: driver.id,
        borrowedAt: DAYS_AGO(10 + i),
        returnedAt: DAYS_AGO(9 + i)
      });
    }
    await seedBorrow({
      toolName: 'Beta',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(5),
      returnedAt: DAYS_AGO(4)
    });
    await seedBorrow({
      toolName: 'Alpha',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(6),
      returnedAt: DAYS_AGO(5)
    });

    const res = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);

    expect(
      res.body.topBorrowed.map((t: { name: string }) => t.name)
    ).toEqual(['Popular', 'Alpha', 'Beta']);
  });

  it('reports avgDaysOut as null with nothing returned, then ignores open borrows', async () => {
    const header = await adminHeader();
    const driver = await createDriver();
    await seedBorrow({
      toolName: 'Still Out',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(30)
    });

    const empty = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);
    expect(empty.body.avgDaysOut).toBeNull();

    await seedBorrow({
      toolName: 'Two Day Loan',
      borrowerId: driver.id,
      borrowedAt: DAYS_AGO(10),
      returnedAt: DAYS_AGO(8)
    });

    const res = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);
    // The 30-day open borrow must not be averaged in.
    expect(res.body.avgDaysOut).toBeCloseTo(2, 1);
  });

  it('admits a driver and refuses a security guard', async () => {
    const { user: driverUser } = await createTestUser({
      email: 'du@test.local',
      role: 'driver'
    });
    const ok = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', authHeader(driverUser.id, driverUser.email, 'driver'));
    expect(ok.status).toBe(200);

    const { user: guard } = await createTestUser({
      email: 'gu@test.local',
      role: 'security_guard'
    });
    const refused = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', authHeader(guard.id, guard.email, 'security_guard'));
    expect(refused.status).toBe(403);
  });

  it('resolves /stats as its own route, not as a tool id', async () => {
    const header = await adminHeader();
    const res = await request(app)
      .get('/api/tools/stats')
      .set('Authorization', header);
    // A /stats declared AFTER /:id is swallowed by it and handed to Prisma as a
    // uuid, which throws P2023 and surfaces as a 500 that looks like a DB fault.
    expect(res.status).not.toBe(500);
    expect(res.status).toBe(200);
  });
```

- [ ] **Step 4: Run them and watch them fail**

```bash
pnpm --filter @mms/api test -- tool-borrows
```

Expected: the new tests FAIL with 500 or 404 — `/stats` does not exist.

- [ ] **Step 5: Write the repository queries**

Append to `apps/api/src/modules/tools/repository.ts`:

```ts
export function countOpenBorrows() {
  return prisma.toolBorrow.count({ where: { returnedAt: null } });
}

// Overdue means still out AND past due. `returnedAt: null` is not optional:
// without it a tool that came back late counts forever.
export function countOverdueBorrows(today: Date) {
  return prisma.toolBorrow.count({
    where: { returnedAt: null, dueAt: { lt: today } }
  });
}

export function borrowsSince(since: Date) {
  return prisma.toolBorrow.findMany({
    where: { borrowedAt: { gte: since } },
    select: {
      toolId: true,
      borrowedAt: true,
      returnedAt: true,
      dueAt: true,
      tool: { select: { name: true } }
    }
  });
}
```

- [ ] **Step 6: Write the service**

Append to `apps/api/src/modules/tools/service.ts`:

```ts
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TOP_N = 5;

export async function stats(now: Date): Promise<ToolBorrowStats> {
  const since = new Date(now.getTime() - BORROW_WINDOW_DAYS * MS_PER_DAY);
  const [toolsOut, overdue, borrows] = await Promise.all([
    countOpenBorrows(),
    countOverdueBorrows(now),
    borrowsSince(since)
  ]);

  const returned = borrows.filter((b) => b.returnedAt !== null);
  const avgDaysOut =
    returned.length === 0
      ? null
      : returned.reduce(
          (sum, b) =>
            sum + (b.returnedAt!.getTime() - b.borrowedAt.getTime()) / MS_PER_DAY,
          0
        ) / returned.length;

  const byTool = new Map<
    string,
    { name: string; borrows: number; isOut: boolean; isOverdue: boolean }
  >();
  for (const b of borrows) {
    const entry = byTool.get(b.toolId) ?? {
      name: b.tool.name,
      borrows: 0,
      isOut: false,
      isOverdue: false
    };
    entry.borrows += 1;
    if (b.returnedAt === null) {
      entry.isOut = true;
      if (b.dueAt !== null && b.dueAt < now) entry.isOverdue = true;
    }
    byTool.set(b.toolId, entry);
  }

  const topBorrowed = [...byTool.entries()]
    .map(([toolId, e]) => ({ toolId, ...e }))
    // Ties break by name so the ranking does not reshuffle between two reads.
    .sort((a, b) => b.borrows - a.borrows || a.name.localeCompare(b.name))
    .slice(0, TOP_N);

  return {
    toolsOut,
    overdue,
    borrowsInWindow: borrows.length,
    avgDaysOut,
    topBorrowed
  };
}
```

Extend the existing imports in that file:

```ts
import { BORROW_WINDOW_DAYS } from '@mms/shared';
import type { ToolBorrowStats /* ...existing type imports... */ } from '@mms/shared';
import {
  borrowsSince,
  countOpenBorrows,
  countOverdueBorrows,
  findToolById,
  listTools
} from './repository.js';
```

- [ ] **Step 7: Write the controller handler**

Append to `apps/api/src/modules/tools/controller.ts`, matching the shape of the handlers already there:

```ts
export async function stats(_req: Request, res: Response): Promise<void> {
  res.json(await service.stats(new Date()));
}
```

- [ ] **Step 8: Add the route — before `/:id`**

In `apps/api/src/modules/tools/router.ts`, insert immediately after the `toolsRouter.get('/', ...)` line and **before** `toolsRouter.get('/:id', ...)`:

```ts
// MUST stay above '/:id'. Express matches in order, so below it this path is
// swallowed and "stats" is handed to Prisma as a uuid — a P2023 that surfaces
// as a 500 looking like a database fault.
toolsRouter.get(
  '/stats',
  requireRole(...INVENTORY_READ_ROLES),
  controller.stats
);
```

- [ ] **Step 9: Run the tests**

```bash
pnpm --filter @mms/api test -- tool-borrows
```

Expected: PASS.

- [ ] **Step 10: Prove the route-order test can fail**

Move the `/stats` route below `/:id`. The "resolves /stats as its own route" test must FAIL. Move it back and confirm green.

- [ ] **Step 11: Prove the overdue test can fail**

Delete `returnedAt: null` from `countOverdueBorrows`. The overdue test must FAIL with 2. Restore and confirm green.

- [ ] **Step 12: Typecheck and run the full suite**

```bash
pnpm --filter @mms/api typecheck && pnpm --filter @mms/api test
```

- [ ] **Step 13: Commit**

```bash
git add packages/shared/src/contracts/tools.ts apps/api/src/modules/tools
git commit -m "feat(api): serve tool borrow stats and a most-borrowed ranking"
```

---

## Task 7: The tools page strip and leaderboard

**Files:**
- Modify: `apps/web/src/lib/api/tools.ts`
- Modify: `apps/web/src/lib/query/tools.ts`
- Create: `apps/web/src/components/pages/tools/borrow-leaderboard.tsx`
- Modify: `apps/web/src/components/pages/tools/index.tsx`
- Test: `apps/web/e2e/tools.spec.ts`

**Interfaces:**
- Consumes: `GET /api/tools/stats` and the `ToolBorrowStats` type (Task 6).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the API function**

Append to `apps/web/src/lib/api/tools.ts`:

```ts
export async function getToolBorrowStats(): Promise<ToolBorrowStats> {
  return api.get<ToolBorrowStats>('/tools/stats');
}
```

and extend the type import at the top of the file:

```ts
import type { ToolBorrowStats } from '@mms/shared';
```

- [ ] **Step 2: Add the query hook**

Append to `apps/web/src/lib/query/tools.ts`:

```ts
// Keyed under ['tools'] on purpose: invalidateQueries is prefix-matching, so
// the existing create/update/delete mutations already refresh these numbers.
// Adding a second invalidation would be dead code.
export const useToolBorrowStats = () =>
  useQuery({
    queryKey: ['tools', 'stats'],
    queryFn: getToolBorrowStats
  });
```

and extend the import:

```ts
import { getTools, getToolById, getToolBorrowStats } from '@/lib/api/tools';
```

- [ ] **Step 3: Write the leaderboard panel**

Create `apps/web/src/components/pages/tools/borrow-leaderboard.tsx`:

```tsx
import type { TopBorrowedTool } from '@mms/shared';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BORROW_WINDOW_DAYS } from '@/lib/enums';

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-3 flex items-center gap-2">
    <span className="bg-signal size-2 rounded-full" />
    <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
      {children}
    </span>
  </div>
);

/**
 * Borrow history starts empty and fills as tools move, so for the first weeks
 * this panel has nothing in it. An empty panel reads as broken software — it
 * says what is actually true instead, so nobody files a bug against a feature
 * that is working correctly.
 */
const BorrowLeaderboard = ({
  tools,
  isLoading
}: {
  tools: TopBorrowedTool[] | undefined;
  isLoading: boolean;
}) => (
  <section>
    <SectionLabel>Most borrowed · last {BORROW_WINDOW_DAYS} days</SectionLabel>
    <Card>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : !tools || tools.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No borrows recorded yet. This fills in as tools are signed out.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {tools.map((tool, index) => (
              <li
                key={tool.toolId}
                className="flex items-center gap-4 text-sm"
              >
                <span className="text-muted-foreground w-4 shrink-0 text-right font-mono text-xs tabular-nums">
                  {index + 1}
                </span>
                <Link
                  to="/tools/$toolsId"
                  params={{ toolsId: tool.toolId }}
                  className="flex-1 truncate font-medium hover:underline"
                >
                  {tool.name}
                </Link>
                {tool.isOverdue ? (
                  <Badge variant="destructive">Overdue</Badge>
                ) : tool.isOut ? (
                  <Badge variant="secondary">Out now</Badge>
                ) : null}
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {tool.borrows} borrow{tool.borrows === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  </section>
);

export default BorrowLeaderboard;
```

- [ ] **Step 4: Wire the strip and the panel into the page**

In `apps/web/src/components/pages/tools/index.tsx`, add the imports:

```tsx
import { MetricStrip } from '@/components/shared/metric-card';
import BorrowLeaderboard from './borrow-leaderboard';
import { useToolBorrowStats } from '@/lib/query/tools';
```

Add the hook beside the existing `useTools` call:

```tsx
  const { data: stats, isLoading: statsLoading } = useToolBorrowStats();
```

Build the metrics just above the `return`:

```tsx
  // An em dash, never 0: a fleet with nothing returned yet has no average, and
  // a zero would read as "tools come back the same day".
  const metrics = [
    { label: 'Tools out', value: stats?.toolsOut ?? 0 },
    { label: 'Overdue', value: stats?.overdue ?? 0 },
    { label: 'Borrows (90d)', value: stats?.borrowsInWindow ?? 0 },
    {
      label: 'Avg days out',
      value:
        stats?.avgDaysOut === null || stats?.avgDaysOut === undefined
          ? '—'
          : stats.avgDaysOut.toFixed(1)
    }
  ];
```

Insert both between `<PageHeader ... />` and the `totalCount === 0` conditional:

```tsx
      <MetricStrip metrics={metrics} className="mb-5" />
      <div className="mb-6">
        <BorrowLeaderboard
          tools={stats?.topBorrowed}
          isLoading={statsLoading}
        />
      </div>
```

The strip and the panel render **outside** the `totalCount === 0` branch, so a fleet with no tools still shows an honest set of zeroes rather than a bare "No tools yet."

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm --filter @mms/web exec tsc -b && pnpm --filter @mms/web lint
```

- [ ] **Step 6: Write the e2e test**

Create `apps/web/e2e/tools.spec.ts`. The helper is `login(page, role)` with roles keyed as in `CREDENTIALS` (`'admin'`, `'driver'`, …) — there is no `loginAsAdmin`:

```ts
import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('tools borrow metrics', () => {
  test('the tools page shows the borrow strip and an honest empty leaderboard', async ({
    page
  }) => {
    await login(page, 'admin');
    await page.goto('/tools');

    await expect(page.getByText('Tools out')).toBeVisible();
    await expect(page.getByText('Avg days out')).toBeVisible();
    // A /stats route shadowed by /:id fails as an EMPTY PANEL, not an error —
    // this is the only assertion that catches it from outside the API.
    await expect(page.getByText(/Most borrowed/i)).toBeVisible();
  });

  test('a driver sees the same metrics', async ({ page }) => {
    await login(page, 'driver');
    await page.goto('/tools');
    // Both admin and driver reach this route; a 403 from INVENTORY_READ_ROLES
    // being set wrong would render the strip with no numbers behind it.
    await expect(page.getByText('Tools out')).toBeVisible();
  });
});
```

The seed leaves one tool borrowed, so **"Tools out" will read 1, not 0** — the migration backfilled an open row for it. If it reads 0, the backfill in Task 4 did not run against this database.

- [ ] **Step 7: Confirm the API is pointed at a test database**

```bash
grep DATABASE_URL apps/api/.env
```

`test:e2e` creates **and deletes** rows. If this points at Neon (`neon.tech`), stop and switch to local Docker Postgres before running anything.

- [ ] **Step 8: Run the e2e suite**

```bash
pnpm --filter @mms/web test:e2e
```

Expected: all green, including the pre-existing specs.

- [ ] **Step 9: Check it in a browser**

Sign in as an admin, open `/tools`, and confirm: four metrics render; the leaderboard shows its empty message on a clean database; borrowing a tool then reloading moves "Tools out" to 1 and puts the tool in the list.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/api/tools.ts apps/web/src/lib/query/tools.ts apps/web/src/components/pages/tools apps/web/e2e
git commit -m "feat(web): show borrow metrics and a most-borrowed panel on tools"
```

---

## Verification at handoff

Run all of these and report the actual numbers, not "should pass":

```bash
pnpm --filter @mms/shared build
pnpm --filter @mms/api typecheck
pnpm --filter @mms/api test
pnpm --filter @mms/web exec tsc -b
pnpm --filter @mms/web lint
pnpm --filter @mms/web test:e2e
```

Baseline before this work: API **341 tests across 45 files**, Playwright **14**.

Then write `docs/approval-history-and-tool-borrow-rollout.md` covering:

- The two pre-deploy checks from spec §4.2 (open-borrow duplicates) and a
  confirmation that `job_orders.date_approved` widened rather than being dropped
  and re-added.
- That `GET /api/branches`-style consumers are unaffected, but any consumer
  reading `date_approved` now receives a full timestamp rather than a date.
- The follow-ups listed in spec §6, plus anything found during implementation.
