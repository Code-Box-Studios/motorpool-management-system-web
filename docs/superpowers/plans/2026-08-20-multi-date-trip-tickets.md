# Multi-Date Trip Tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one trip ticket cover several non-consecutive dates (an event on April 17 **and** 21) with one approval and one fuel allocation, while each date remains its own outing at the gate.

**Architecture:** A `TripDate` child table hangs off `TripTicket`. The ticket keeps the approval chain and the fuel allocation; each date row carries one outing — its own window, status, odometer pair and guard stamps. After approval the ticket's status becomes a pure function of its dates. Booking overlap moves from the ticket's single window down to the date rows.

**Tech Stack:** TypeScript, Express 5, Prisma 6 (PostgreSQL/Neon), Zod, Vitest + Supertest, React 19, TanStack Router/Query, react-hook-form, FullCalendar.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-20-multi-date-trip-tickets-design.md`. Every task implements a part of it; re-read the relevant section before starting a task.
- **Approval is per-event, never per-date.** One admin decision, one `FuelAllocation` (still unique on `tripTicketId`).
- **The QR is not changed.** It carries the ticket id; the server resolves which outing.
- **`TripTicket.startTs` / `endTs` become derived** (earliest start, latest end) and are **display/sort only**. No booking or availability logic may read them after Task 3.
- **Backwards compatibility:** a request body with `startTs`/`endTs` and no `dates` is normalised to a single date row (Task 2). This keeps the e2e suite and the existing web form working until Task 8 replaces them. Do not remove it inside this plan.
- **Migrations run against Neon.** `DIRECT_URL` in `apps/api/.env` is the non-pooled endpoint. Every migration in this plan is additive.
- **API tests need the local test database.** `TEST_DATABASE_URL` points at `postgresql://mms:mms@localhost:5432/mms_test`, which comes from `docker compose up -d`. Start Docker Desktop and the `db` service before running `pnpm --filter @mms/api test`.
- **Never write `Co-Authored-By` trailers.** Never run `git push`.
- **Formatting:** run `npx prettier --write` on every file you touch before committing.

---

### Task 1: `TripDate` schema, migration and backfill

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_trip_dates/migration.sql` (generated, then hand-edited to append the backfill)
- Test: `apps/api/src/modules/trip-tickets/trip-date-backfill.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: Prisma model `TripDate` and enum `TripDateStatus` (`scheduled` | `in_progress` | `completed` | `cancelled`); relation `TripTicket.dates: TripDate[]`.

- [ ] **Step 1: Add the enum and model to the schema**

Append to `apps/api/prisma/schema.prisma`:

```prisma
// One outing. An event may run on April 17 and 21 without holding the vehicle
// through the days between, so the per-trip facts that used to sit on the ticket
// — window, odometer pair, guard stamps — live here, one row per date.
enum TripDateStatus {
  scheduled
  in_progress
  completed
  cancelled
}

model TripDate {
  id                  String         @id @default(uuid()) @db.Uuid
  tripTicketId        String         @map("trip_ticket_id") @db.Uuid
  startTs             DateTime       @map("start_ts")
  endTs               DateTime       @map("end_ts")
  status              TripDateStatus @default(scheduled)
  startMileage        Int?           @map("start_mileage")
  endMileage          Int?           @map("end_mileage")
  preTripGuardId      String?        @map("pre_trip_guard") @db.Uuid
  preTripCheckedById  String?        @map("pre_trip_checked_by") @db.Uuid
  preTripCheckedAt    DateTime?      @map("pre_trip_checked_at")
  postTripGuardId     String?        @map("post_trip_guard") @db.Uuid
  postTripCheckedById String?        @map("post_trip_checked_by") @db.Uuid
  postTripCheckedAt   DateTime?      @map("post_trip_checked_at")
  // Set when THIS date alone is called off; the ticket keeps its own reason for
  // a whole-event cancellation.
  cancellationReason String?  @map("cancellation_reason")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @default(now()) @updatedAt @map("updated_at")

  tripTicket TripTicket @relation(fields: [tripTicketId], references: [id], onDelete: Cascade)

  @@index([tripTicketId])
  // The booking overlap query in service.assertBookable scans on the window.
  @@index([startTs, endTs])
  @@map("trip_dates")
}
```

In the `TripTicket` model, add the back-relation next to the other relations:

```prisma
  dates              TripDate[]
```

And replace the comment above `startTs`/`endTs` on `TripTicket` with:

```prisma
  // DERIVED, display and sort only: earliest date start and latest date end,
  // recomputed by recomputeTicketSpan() whenever the date rows change. Booking
  // and availability read trip_dates, NEVER these — a trip on the 17th and the
  // 21st spans five days here while the van is free for three of them.
```

- [ ] **Step 2: Generate the migration without applying it**

Run:

```bash
cd apps/api && npx prisma migrate dev --name add_trip_dates --create-only
```

Expected: a new folder under `apps/api/prisma/migrations/` containing `CREATE TYPE "TripDateStatus"` and `CREATE TABLE "trip_dates"`.

- [ ] **Step 3: Append the backfill to that migration.sql**

Add at the end of the generated file:

```sql
-- Backfill: one date row per existing ticket, carrying its window, odometer and
-- guard stamps. Idempotent (NOT EXISTS), so a re-run is a no-op. Tickets with no
-- window get no row; Task 3 only requires dates on NEW and EDITED tickets.
INSERT INTO "trip_dates" (
  "id", "trip_ticket_id", "start_ts", "end_ts", "status",
  "start_mileage", "end_mileage",
  "pre_trip_guard", "pre_trip_checked_by", "pre_trip_checked_at",
  "post_trip_guard", "post_trip_checked_by", "post_trip_checked_at",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), t."id", t."start_ts", t."end_ts",
  CASE t."status"
    WHEN 'in_progress'  THEN 'in_progress'::"TripDateStatus"
    WHEN 'completed'    THEN 'completed'::"TripDateStatus"
    WHEN 'cancelled'    THEN 'cancelled'::"TripDateStatus"
    WHEN 'disapproved'  THEN 'cancelled'::"TripDateStatus"
    ELSE 'scheduled'::"TripDateStatus"
  END,
  t."start_mileage", t."end_mileage",
  t."pre_trip_guard", t."pre_trip_checked_by", t."pre_trip_checked_at",
  t."post_trip_guard", t."post_trip_checked_by", t."post_trip_checked_at",
  NOW(), NOW()
FROM "trip_tickets" t
WHERE t."start_ts" IS NOT NULL
  AND t."end_ts" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "trip_dates" d WHERE d."trip_ticket_id" = t."id"
  );
```

- [ ] **Step 4: Write the failing backfill test**

Create `apps/api/src/modules/trip-tickets/trip-date-backfill.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { createTestBranch } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

// The backfill lives in the migration, so this asserts the SHAPE it produces:
// every windowed ticket ends up with exactly one date row carrying its facts.
describe('trip date backfill shape', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('gives a completed ticket one completed date row carrying its odometer', async () => {
    const branch = await createTestBranch();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'BF1',
        licensePlate: 'BF1',
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
        email: 'bf@test.local',
        fullName: 'BF',
        status: 'active',
        branchId: branch.id
      }
    });
    const start = new Date(Date.now() + 86_400_000);
    const end = new Date(start.getTime() + 3_600_000);
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: new Date(),
        status: 'completed',
        startTs: start,
        endTs: end,
        startMileage: 1000,
        endMileage: 1120
      }
    });

    await prisma.$executeRawUnsafe(BACKFILL_SQL);

    const dates = await prisma.tripDate.findMany({
      where: { tripTicketId: ticket.id }
    });
    expect(dates).toHaveLength(1);
    expect(dates[0].status).toBe('completed');
    expect(dates[0].startMileage).toBe(1000);
    expect(dates[0].endMileage).toBe(1120);
    expect(dates[0].startTs.toISOString()).toBe(start.toISOString());
  });

  it('is idempotent — a second run adds nothing', async () => {
    const branch = await createTestBranch();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'BF2',
        licensePlate: 'BF2',
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
        email: 'bf2@test.local',
        fullName: 'BF2',
        status: 'active',
        branchId: branch.id
      }
    });
    const start = new Date(Date.now() + 86_400_000);
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: new Date(),
        status: 'approved',
        startTs: start,
        endTs: new Date(start.getTime() + 3_600_000)
      }
    });

    await prisma.$executeRawUnsafe(BACKFILL_SQL);
    await prisma.$executeRawUnsafe(BACKFILL_SQL);

    expect(
      await prisma.tripDate.count({ where: { tripTicketId: ticket.id } })
    ).toBe(1);
  });
});
```

At the top of that file, define `BACKFILL_SQL` as the exact `INSERT ... SELECT` from Step 3 (copy it verbatim as a template literal). Keeping one copy in the test and one in the migration is deliberate: the test is asserting that _this_ statement is idempotent and maps statuses correctly.

- [ ] **Step 5: Run the test to verify it fails**

Ensure the test database is up first:

```bash
docker compose up -d
cd apps/api && npx prisma migrate deploy
```

Run: `pnpm --filter @mms/api test -- trip-date-backfill`
Expected: FAIL — `prisma.tripDate` is undefined (client not yet generated with the new model).

- [ ] **Step 6: Apply the migration and regenerate the client**

The dev server holds the Prisma query-engine DLL open on Windows. Stop it first, or `prisma generate` fails with `EPERM ... query_engine-windows.dll.node`.

```bash
# stop `pnpm dev` first
cd apps/api && npx prisma migrate dev
```

Expected: `Applying migration ...add_trip_dates`, then `Generated Prisma Client`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @mms/api test -- trip-date-backfill`
Expected: PASS, 2 tests.

- [ ] **Step 8: Commit**

```bash
npx prettier --write apps/api/src/modules/trip-tickets/trip-date-backfill.test.ts
git add apps/api/prisma apps/api/src/modules/trip-tickets/trip-date-backfill.test.ts
git commit -m "feat(api): add trip_dates, one outing per row, with backfill"
```

---

### Task 2: Date rows in the request contract

**Files:**

- Modify: `packages/shared/src/contracts/trip-tickets.ts`
- Test: `packages/shared/src/contracts/trip-tickets.test.ts` (create if absent)

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces:
  - `tripDateInputSchema` → `{ startTs: Date; endTs: Date }`
  - `TripDateInput` type
  - `createTripTicketBodySchema` gains `dates: TripDateInput[]` (defaults to `[]`)
  - `normaliseTripDates(body: { dates?: TripDateInput[]; startTs?: Date | null; endTs?: Date | null }): TripDateInput[]`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/contracts/trip-tickets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normaliseTripDates, tripDateInputSchema } from './trip-tickets.js';

describe('normaliseTripDates', () => {
  it('returns the dates array when one is given', () => {
    const a = {
      startTs: new Date('2026-04-17T08:00Z'),
      endTs: new Date('2026-04-17T17:00Z')
    };
    const b = {
      startTs: new Date('2026-04-21T08:00Z'),
      endTs: new Date('2026-04-21T17:00Z')
    };
    expect(normaliseTripDates({ dates: [a, b] })).toEqual([a, b]);
  });

  it('falls back to a single row built from legacy startTs/endTs', () => {
    const startTs = new Date('2026-04-17T08:00Z');
    const endTs = new Date('2026-04-17T17:00Z');
    expect(normaliseTripDates({ startTs, endTs })).toEqual([
      { startTs, endTs }
    ]);
  });

  it('prefers dates over the legacy pair when both are present', () => {
    const row = {
      startTs: new Date('2026-04-21T08:00Z'),
      endTs: new Date('2026-04-21T17:00Z')
    };
    const out = normaliseTripDates({
      dates: [row],
      startTs: new Date('2026-01-01T00:00Z'),
      endTs: new Date('2026-01-02T00:00Z')
    });
    expect(out).toEqual([row]);
  });

  it('returns an empty list when neither is given', () => {
    expect(normaliseTripDates({})).toEqual([]);
  });

  it('rejects a row whose end is not after its start', () => {
    const r = tripDateInputSchema.safeParse({
      startTs: '2026-04-17T17:00Z',
      endTs: '2026-04-17T08:00Z'
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mms/shared exec vitest run contracts/trip-tickets`
Expected: FAIL — `normaliseTripDates` is not exported.

If `@mms/shared` has no `test` script or vitest dependency, add vitest as a devDependency and a `"test": "vitest run"` script to `packages/shared/package.json` as part of this step.

- [ ] **Step 3: Implement the schema and helper**

In `packages/shared/src/contracts/trip-tickets.ts`, above `createTripTicketBodySchema`:

```ts
// One outing: a date with its own departure and return. An event may run on the
// 17th and the 21st, so a ticket carries a list of these rather than one window.
export const tripDateInputSchema = z
  .object({
    startTs: z.coerce.date(),
    endTs: z.coerce.date()
  })
  .refine((d) => d.endTs > d.startTs, {
    message: 'A date must end after it starts',
    path: ['endTs']
  });
export type TripDateInput = z.infer<typeof tripDateInputSchema>;
```

Add to `createTripTicketBodySchema` (keep `startTs`/`endTs` exactly as they are):

```ts
  dates: z.array(tripDateInputSchema).default([]),
```

Then, after the schema:

```ts
/**
 * The date rows a request is really asking for.
 *
 * `dates` is the truth. The legacy `startTs`/`endTs` pair is still accepted and
 * folded into a single row, so existing callers — the e2e suite and the web form
 * until it is rebuilt — keep working unchanged.
 */
export function normaliseTripDates(body: {
  dates?: TripDateInput[];
  startTs?: Date | null;
  endTs?: Date | null;
}): TripDateInput[] {
  if (body.dates && body.dates.length > 0) return body.dates;
  if (body.startTs && body.endTs) {
    return [{ startTs: body.startTs, endTs: body.endTs }];
  }
  return [];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mms/shared exec vitest run contracts/trip-tickets`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
pnpm --filter @mms/shared build
npx prettier --write packages/shared/src/contracts/trip-tickets.ts packages/shared/src/contracts/trip-tickets.test.ts
git add packages/shared
git commit -m "feat(shared): accept a list of dates on a trip ticket"
```

---

### Task 3: Booking validation per date

**Files:**

- Modify: `apps/api/src/modules/trip-tickets/service.ts:94-199` (`assertBookable`)
- Test: `apps/api/src/modules/trip-tickets/trip-ticket-booking.test.ts`

**Interfaces:**

- Consumes: `normaliseTripDates`, `TripDateInput` (Task 2); `prisma.tripDate` (Task 1).
- Produces: `assertBookable(body, excludeTicketId?)` where `body` additionally carries `dates`. Error codes unchanged: `INVALID_TRIP_WINDOW`, `TRIP_IN_THE_PAST`, `VEHICLE_DOUBLE_BOOKED`, `DRIVER_DOUBLE_BOOKED`, plus new `NO_TRIP_DATES` and `OVERLAPPING_TRIP_DATES`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/modules/trip-tickets/trip-ticket-booking.test.ts`, inside the existing top-level `describe`:

```ts
it('books an event on two non-consecutive dates', async () => {
  const s = await scaffold();
  const res = await post(s, {
    startTs: undefined,
    endTs: undefined,
    dates: [
      { startTs: inDays(14, 8), endTs: inDays(14, 17) },
      { startTs: inDays(18, 8), endTs: inDays(18, 17) }
    ]
  });
  expect(res.status).toBe(201);
  const dates = await prisma.tripDate.findMany({
    where: { tripTicketId: res.body.id },
    orderBy: { startTs: 'asc' }
  });
  expect(dates).toHaveLength(2);
  expect(dates.every((d) => d.status === 'scheduled')).toBe(true);
});

it('leaves the days BETWEEN two dates bookable by someone else', async () => {
  const s = await scaffold();
  expect(
    (
      await post(s, {
        startTs: undefined,
        endTs: undefined,
        dates: [
          { startTs: inDays(14, 8), endTs: inDays(14, 17) },
          { startTs: inDays(18, 8), endTs: inDays(18, 17) }
        ]
      })
    ).status
  ).toBe(201);

  // The 16th sits in the gap: same van, same driver, must be free.
  const gap = await post(s, {
    startTs: inDays(16, 8),
    endTs: inDays(16, 17)
  });
  expect(gap.status).toBe(201);
});

it('refuses a date that clashes with another ticket date on the same vehicle', async () => {
  const s = await scaffold();
  expect(
    (
      await post(s, {
        startTs: undefined,
        endTs: undefined,
        dates: [{ startTs: inDays(14, 8), endTs: inDays(14, 17) }]
      })
    ).status
  ).toBe(201);

  const clash = await post(s, {
    driverId: s.otherDriver.id,
    startTs: undefined,
    endTs: undefined,
    dates: [
      { startTs: inDays(20, 8), endTs: inDays(20, 17) },
      { startTs: inDays(14, 12), endTs: inDays(14, 20) }
    ]
  });
  expect(clash.status).toBe(409);
  expect(clash.body.error.code).toBe('VEHICLE_DOUBLE_BOOKED');
});

it('refuses two rows in the SAME submission that overlap each other', async () => {
  const s = await scaffold();
  const res = await post(s, {
    startTs: undefined,
    endTs: undefined,
    dates: [
      { startTs: inDays(14, 8), endTs: inDays(14, 17) },
      { startTs: inDays(14, 14), endTs: inDays(14, 20) }
    ]
  });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('OVERLAPPING_TRIP_DATES');
});

it('refuses a ticket with no dates at all', async () => {
  const s = await scaffold();
  const res = await post(s, {
    startTs: undefined,
    endTs: undefined,
    dates: []
  });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('NO_TRIP_DATES');
});

it('ignores a CANCELLED date when checking for clashes', async () => {
  const s = await scaffold();
  const first = await post(s, {
    startTs: undefined,
    endTs: undefined,
    dates: [{ startTs: inDays(14, 8), endTs: inDays(14, 17) }]
  });
  expect(first.status).toBe(201);
  await prisma.tripDate.updateMany({
    where: { tripTicketId: first.body.id },
    data: { status: 'cancelled' }
  });

  const reuse = await post(s, {
    startTs: inDays(14, 9),
    endTs: inDays(14, 16)
  });
  expect(reuse.status).toBe(201);
});
```

Check the existing `post(s, overrides)` helper in that file: if it spreads overrides over a default body containing `startTs`/`endTs`, passing `startTs: undefined` must actually delete those keys. If it does not, adjust the helper to strip `undefined` values before sending.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mms/api test -- trip-ticket-booking`
Expected: FAIL — the multi-date cases 500 or 400, and `OVERLAPPING_TRIP_DATES` / `NO_TRIP_DATES` do not exist.

- [ ] **Step 3: Rewrite the window half of `assertBookable`**

In `apps/api/src/modules/trip-tickets/service.ts`, change the signature to accept `dates`, and replace the window checks and the single overlap query. Keep the vehicle/capacity/driver checks exactly as they are.

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
  const { vehicleId, driverId } = body;
  const dates = normaliseTripDates(body);

  if (dates.length === 0) {
    throw new AppError(
      400,
      'NO_TRIP_DATES',
      'A trip ticket needs at least one date'
    );
  }

  for (const d of dates) {
    if (d.startTs >= d.endTs) {
      throw new AppError(
        400,
        'INVALID_TRIP_WINDOW',
        'A trip cannot end before it starts'
      );
    }
    // A window that has already closed is not a booking, it is a typo. (The
    // start is deliberately not checked: a trip leaving "now" is normal.)
    if (d.endTs.getTime() < Date.now()) {
      throw new AppError(
        400,
        'TRIP_IN_THE_PAST',
        'A trip cannot be booked entirely in the past'
      );
    }
  }

  // Rows in ONE submission must not overlap each other, or a requester books the
  // same van against itself and no cross-ticket check would ever catch it.
  const sorted = [...dates].sort(
    (a, b) => a.startTs.getTime() - b.startTs.getTime()
  );
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTs < sorted[i - 1].endTs) {
      throw new AppError(
        409,
        'OVERLAPPING_TRIP_DATES',
        'Two of the dates on this request overlap each other'
      );
    }
  }

  // ... vehicle / capacity / driver checks unchanged ...

  // Half-open overlap, now per date row: [a.start, a.end) intersects [b.start, b.end).
  // Cancelled rows are free windows and must not block a rebooking.
  for (const d of dates) {
    const clash = await prisma.tripDate.findFirst({
      where: {
        status: { not: 'cancelled' },
        startTs: { lt: d.endTs },
        endTs: { gt: d.startTs },
        tripTicket: {
          ...(excludeTicketId ? { id: { not: excludeTicketId } } : {}),
          status: { in: [...LIVE_STATUSES] },
          OR: [{ vehicleId }, { driverId }]
        }
      },
      select: {
        startTs: true,
        tripTicket: { select: { ticketNo: true, vehicleId: true } }
      }
    });
    if (!clash) continue;

    const isVehicle = clash.tripTicket.vehicleId === vehicleId;
    const day = clash.startTs.toISOString().slice(0, 10);
    throw new AppError(
      409,
      isVehicle ? 'VEHICLE_DOUBLE_BOOKED' : 'DRIVER_DOUBLE_BOOKED',
      `${isVehicle ? 'This vehicle' : 'This driver'} is already booked on ${day} (TT-${clash.tripTicket.ticketNo})`
    );
  }
}
```

Add the imports `normaliseTripDates` and `type TripDateInput` from `@mms/shared`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mms/api test -- trip-ticket-booking`
Expected: PASS — the six new tests plus every pre-existing one in the file. The pre-existing single-window tests must still pass; they exercise the `normaliseTripDates` legacy path.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/modules/trip-tickets/service.ts apps/api/src/modules/trip-tickets/trip-ticket-booking.test.ts
git add apps/api/src/modules/trip-tickets
git commit -m "feat(api): check trip availability per date, not per ticket"
```

---

### Task 4: Write date rows on create and update

**Files:**

- Modify: `apps/api/src/modules/trip-tickets/service.ts` (`create`, `update`)
- Create: `apps/api/src/modules/trip-tickets/dates.ts`
- Modify: `apps/api/src/modules/trip-tickets/repository.ts` (add `dates` to `tripTicketInclude`)
- Test: `apps/api/src/modules/trip-tickets/trip-ticket-booking.test.ts`

**Interfaces:**

- Consumes: `normaliseTripDates` (Task 2), `assertBookable` (Task 3).
- Produces, from `dates.ts`:
  - `recomputeTicketSpan(tx: Prisma.TransactionClient, tripTicketId: string): Promise<void>`
  - `replaceTripDates(tx: Prisma.TransactionClient, tripTicketId: string, dates: TripDateInput[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe` in `trip-ticket-booking.test.ts`:

```ts
it('sets the ticket span to the earliest start and the latest end', async () => {
  const s = await scaffold();
  const res = await post(s, {
    startTs: undefined,
    endTs: undefined,
    dates: [
      { startTs: inDays(18, 8), endTs: inDays(18, 17) },
      { startTs: inDays(14, 8), endTs: inDays(14, 17) }
    ]
  });
  expect(res.status).toBe(201);
  const ticket = await prisma.tripTicket.findUniqueOrThrow({
    where: { id: res.body.id }
  });
  expect(ticket.startTs!.toISOString()).toBe(inDays(14, 8));
  expect(ticket.endTs!.toISOString()).toBe(inDays(18, 17));
});
```

`inDays(d, h)` in that file returns an ISO string; if it returns a `Date`, compare with `.toISOString()` on both sides.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mms/api test -- trip-ticket-booking`
Expected: FAIL — the ticket's `startTs` is whatever was posted (here, `undefined`/null), not the earliest date.

- [ ] **Step 3: Create `dates.ts`**

```ts
import type { Prisma } from '@prisma/client';
import type { TripDateInput } from '@mms/shared';

/**
 * Recompute the ticket's derived span from its date rows.
 *
 * The span is display and sort only — the list orders on it and the dashboards
 * read it — so it must never drift from the rows underneath. Cancelled rows are
 * excluded: a cancelled 21st should not keep stretching the event to the 21st.
 * A ticket whose rows are all cancelled keeps its last span rather than going
 * null, because a null span sorts unpredictably in every list that reads it.
 */
export async function recomputeTicketSpan(
  tx: Prisma.TransactionClient,
  tripTicketId: string
): Promise<void> {
  const live = await tx.tripDate.findMany({
    where: { tripTicketId, status: { not: 'cancelled' } },
    select: { startTs: true, endTs: true },
    orderBy: { startTs: 'asc' }
  });
  if (live.length === 0) return;

  const startTs = live[0].startTs;
  const endTs = live.reduce(
    (latest, d) => (d.endTs > latest ? d.endTs : latest),
    live[0].endTs
  );
  await tx.tripTicket.update({
    where: { id: tripTicketId },
    data: { startTs, endTs }
  });
}

/**
 * Replace a ticket's date rows wholesale.
 *
 * Only legal while the ticket is still pending — `update` enforces that — so
 * deleting the old rows cannot discard an odometer reading or a guard stamp.
 */
export async function replaceTripDates(
  tx: Prisma.TransactionClient,
  tripTicketId: string,
  dates: TripDateInput[]
): Promise<void> {
  await tx.tripDate.deleteMany({ where: { tripTicketId } });
  await tx.tripDate.createMany({
    data: dates.map((d) => ({
      tripTicketId,
      startTs: d.startTs,
      endTs: d.endTs
    }))
  });
  await recomputeTicketSpan(tx, tripTicketId);
}
```

- [ ] **Step 4: Use it in `create` and `update`**

In `service.create`, replace the single `prisma.tripTicket.create(...)` with a transaction:

```ts
const dates = normaliseTripDates(body);
const ticket = await prisma.$transaction(async (tx) => {
  const created = await tx.tripTicket.create({
    // The legacy pair is still written, but only as the seed of the derived
    // span — replaceTripDates recomputes it from the rows immediately after.
    data: {
      ...body,
      dates: undefined,
      requestedById,
      status: 'pending_admin_approval'
    },
    select: { id: true }
  });
  await replaceTripDates(tx, created.id, dates);
  return created;
});
const full = await findTripTicketById(ticket.id);
await events.tripSubmitted(full!, actor);
return full;
```

`data: { ...body, dates: undefined }` is required — `dates` is not a scalar column and Prisma rejects it in `data`.

In `service.update`, after the existing `assertBookable(...)` call and the pending-status guard, wrap the update in a transaction and call `replaceTripDates(tx, id, normaliseTripDates(body))` when `body.dates` or a legacy pair is present. Leave the rows untouched when the caller sends neither.

In `repository.ts`, add to `tripTicketInclude`:

```ts
  dates: { orderBy: { startTs: 'asc' as const } },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @mms/api test -- trip-ticket`
Expected: PASS across all four trip-ticket test files.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/modules/trip-tickets
git add apps/api/src/modules/trip-tickets
git commit -m "feat(api): persist trip date rows and derive the ticket span"
```

---

### Task 5: Gate actions act on a date

**Files:**

- Modify: `apps/api/src/modules/trip-tickets/transitions.ts` (`checkOut`, `checkIn`)
- Modify: `apps/api/src/modules/trip-tickets/dates.ts`
- Test: `apps/api/src/modules/trip-tickets/trip-ticket-guard.test.ts`

**Interfaces:**

- Consumes: `recomputeTicketSpan` (Task 4).
- Produces, from `dates.ts`:
  - `deriveTicketStatus(current: TripTicketStatus, dates: { status: TripDateStatus }[]): TripTicketStatus`
  - `syncTicketStatus(tx, tripTicketId): Promise<void>`
  - `resolveOutingForCheckOut(tx, tripTicketId, now?): Promise<TripDate>`
  - `resolveOutingForCheckIn(tx, tripTicketId): Promise<TripDate>`

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/modules/trip-tickets/trip-ticket-guard.test.ts` (match the file's existing scaffold/helpers):

```ts
it('does NOT complete the ticket while a later date is still scheduled', async () => {
  const s = await approvedTwoDateTicket(); // helper below
  await checkOut(s, 1000);
  await checkIn(s, 1100);

  const ticket = await prisma.tripTicket.findUniqueOrThrow({
    where: { id: s.ticketId }
  });
  expect(ticket.status).toBe('approved');

  const dates = await prisma.tripDate.findMany({
    where: { tripTicketId: s.ticketId },
    orderBy: { startTs: 'asc' }
  });
  expect(dates[0].status).toBe('completed');
  expect(dates[0].startMileage).toBe(1000);
  expect(dates[0].endMileage).toBe(1100);
  expect(dates[1].status).toBe('scheduled');
});

it('refuses a check-out when no outing is scheduled today', async () => {
  const s = await approvedTicketStartingInDays(9);
  const res = await checkOutRaw(s, 1000);
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('NO_OUTING_TODAY');
});
```

Add a helper to that file that builds an approved ticket whose **first** date is today and whose second is a week out:

```ts
async function approvedTwoDateTicket() {
  const s = await scaffold();
  const now = new Date();
  const ticket = await prisma.tripTicket.create({
    data: {
      branchId: s.branch.id,
      driverId: s.driver.id,
      vehicleId: s.vehicle.id,
      destination: 'D',
      purpose: 'P',
      dateRequested: now,
      status: 'approved'
    }
  });
  await prisma.tripDate.createMany({
    data: [
      {
        tripTicketId: ticket.id,
        startTs: new Date(now.getTime() - 3_600_000),
        endTs: new Date(now.getTime() + 6 * 3_600_000)
      },
      {
        tripTicketId: ticket.id,
        startTs: new Date(now.getTime() + 7 * 86_400_000),
        endTs: new Date(now.getTime() + 7 * 86_400_000 + 6 * 3_600_000)
      }
    ]
  });
  return { ...s, ticketId: ticket.id };
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mms/api test -- trip-ticket-guard`
Expected: FAIL — the ticket goes straight to `completed`, and `NO_OUTING_TODAY` does not exist.

- [ ] **Step 3: Add status derivation and outing resolution to `dates.ts`**

```ts
import { AppError } from '../../lib/errors.js';
import type { TripDateStatus, TripTicketStatus } from '@prisma/client';

/**
 * The ticket's status after approval is a function of its dates.
 *
 * Before approval the approval chain owns the status outright and the dates say
 * nothing about it — which is why anything other than approved/in_progress is
 * returned untouched. Rules are first-match-wins; a date is SETTLED when it is
 * completed or cancelled.
 */
export function deriveTicketStatus(
  current: TripTicketStatus,
  dates: { status: TripDateStatus }[]
): TripTicketStatus {
  if (current !== 'approved' && current !== 'in_progress') return current;
  if (dates.length === 0) return current;
  if (dates.some((d) => d.status === 'in_progress')) return 'in_progress';
  const settled = dates.every(
    (d) => d.status === 'completed' || d.status === 'cancelled'
  );
  if (!settled) return 'approved';
  return dates.some((d) => d.status === 'completed')
    ? 'completed'
    : 'cancelled';
}

export async function syncTicketStatus(
  tx: Prisma.TransactionClient,
  tripTicketId: string
): Promise<void> {
  const ticket = await tx.tripTicket.findUniqueOrThrow({
    where: { id: tripTicketId },
    select: { status: true, dates: { select: { status: true } } }
  });
  const next = deriveTicketStatus(ticket.status, ticket.dates);
  if (next !== ticket.status) {
    await tx.tripTicket.update({
      where: { id: tripTicketId },
      data: { status: next }
    });
  }
}

const endOfDay = (d: Date) => {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
};

/**
 * Which outing is the guard releasing?
 *
 * The QR carries the TICKET id — drivers may be holding printed ones — so the
 * server picks the row: the earliest scheduled outing that has not already
 * finished and does not start after today. A trip next week is refused rather
 * than released early.
 */
export async function resolveOutingForCheckOut(
  tx: Prisma.TransactionClient,
  tripTicketId: string,
  now: Date = new Date()
) {
  const outing = await tx.tripDate.findFirst({
    where: {
      tripTicketId,
      status: 'scheduled',
      endTs: { gt: now },
      startTs: { lte: endOfDay(now) }
    },
    orderBy: { startTs: 'asc' }
  });
  if (!outing) {
    throw new AppError(
      409,
      'NO_OUTING_TODAY',
      'This trip ticket has no outing scheduled today'
    );
  }
  return outing;
}

/** Check-in closes whichever outing is currently out. Only one can be. */
export async function resolveOutingForCheckIn(
  tx: Prisma.TransactionClient,
  tripTicketId: string
) {
  const outing = await tx.tripDate.findFirst({
    where: { tripTicketId, status: 'in_progress' },
    orderBy: { startTs: 'asc' }
  });
  if (!outing) {
    throw new AppError(
      409,
      'NO_OUTING_IN_PROGRESS',
      'No outing on this trip ticket is currently out'
    );
  }
  return outing;
}
```

- [ ] **Step 4: Rewrite `checkOut` and `checkIn`**

In `transitions.ts`, `checkOut` keeps `loadInState(id, ['approved', 'in_progress'])` — a two-date ticket is `approved` again between outings — then inside the existing transaction:

```ts
const outing = await resolveOutingForCheckOut(tx, id);
// Claim the van FIRST; the conditional flip is what makes two simultaneous
// check-outs impossible. Unchanged.
const { mileage } = await claimVehicleStatus(/* ...as today... */);
await advanceOdometer(tx, ticket.vehicleId, body.startMileage, mileage);
await tx.tripDate.update({
  where: { id: outing.id },
  data: {
    status: 'in_progress',
    startMileage: body.startMileage,
    preTripGuardId: actor.id,
    preTripCheckedById: actor.id,
    preTripCheckedAt: new Date()
  }
});
await syncTicketStatus(tx, id);
```

`checkIn` keeps `loadInState(id, ['in_progress'])`, then:

```ts
const outing = await resolveOutingForCheckIn(tx, id);
const vehicle = await tx.vehicle.findUniqueOrThrow({
  where: { id: ticket.vehicleId },
  select: { mileage: true }
});
const floor = Math.max(vehicle.mileage, outing.startMileage ?? 0);
await advanceOdometer(tx, ticket.vehicleId, body.endMileage, floor);
await tx.tripDate.update({
  where: { id: outing.id },
  data: {
    status: 'completed',
    endMileage: body.endMileage,
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
await syncTicketStatus(tx, id);
```

Remove the `data: { status: 'in_progress' | 'completed', ...guard/mileage }` writes to `tripTicket` from both — the ticket's status now comes only from `syncTicketStatus`, and the per-outing columns are deprecated.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @mms/api test -- trip-ticket`
Expected: PASS. Existing single-date guard tests still pass — a one-date ticket settles to `completed` on check-in exactly as before.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/modules/trip-tickets
git add apps/api/src/modules/trip-tickets
git commit -m "feat(api): check out and in per outing, derive ticket status from dates"
```

---

### Task 6: Cancel a single date

**Files:**

- Modify: `apps/api/src/modules/trip-tickets/transitions.ts`
- Modify: `apps/api/src/modules/trip-tickets/transitions.controller.ts`
- Modify: `apps/api/src/modules/trip-tickets/router.ts`
- Test: `apps/api/src/modules/trip-tickets/trip-ticket-transitions.test.ts`

**Interfaces:**

- Consumes: `syncTicketStatus`, `recomputeTicketSpan` (Tasks 4–5).
- Produces: `transitions.cancelDate(ticketId, dateId, actor, reason)` and `POST /api/trip-tickets/:id/dates/:dateId/cancel`.

- [ ] **Step 1: Write the failing tests**

```ts
it('cancels one date and leaves the rest of the event standing', async () => {
  const s = await approvedTwoDateTicket();
  const dates = await prisma.tripDate.findMany({
    where: { tripTicketId: s.ticketId },
    orderBy: { startTs: 'asc' }
  });
  const res = await request(app)
    .post(`/api/trip-tickets/${s.ticketId}/dates/${dates[1].id}/cancel`)
    .set(authHeader(s.admin))
    .send({ reason: 'venue moved' });
  expect(res.status).toBe(200);

  const after = await prisma.tripDate.findMany({
    where: { tripTicketId: s.ticketId },
    orderBy: { startTs: 'asc' }
  });
  expect(after[0].status).toBe('scheduled');
  expect(after[1].status).toBe('cancelled');
  expect(after[1].cancellationReason).toBe('venue moved');

  const ticket = await prisma.tripTicket.findUniqueOrThrow({
    where: { id: s.ticketId }
  });
  expect(ticket.status).toBe('approved');
});

it('cancels the whole ticket once every date is cancelled', async () => {
  const s = await approvedTwoDateTicket();
  const dates = await prisma.tripDate.findMany({
    where: { tripTicketId: s.ticketId }
  });
  for (const d of dates) {
    await request(app)
      .post(`/api/trip-tickets/${s.ticketId}/dates/${d.id}/cancel`)
      .set(authHeader(s.admin))
      .send({ reason: 'event called off' });
  }
  const ticket = await prisma.tripTicket.findUniqueOrThrow({
    where: { id: s.ticketId }
  });
  expect(ticket.status).toBe('cancelled');
});

it('refuses to cancel an outing that is already out', async () => {
  const s = await approvedTwoDateTicket();
  await checkOut(s, 1000);
  const out = await prisma.tripDate.findFirstOrThrow({
    where: { tripTicketId: s.ticketId, status: 'in_progress' }
  });
  const res = await request(app)
    .post(`/api/trip-tickets/${s.ticketId}/dates/${out.id}/cancel`)
    .set(authHeader(s.admin))
    .send({ reason: 'too late' });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('INVALID_TRANSITION');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mms/api test -- trip-ticket-transitions`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Implement `cancelDate`**

In `transitions.ts`:

```ts
/**
 * Cancel ONE outing. Legal from `scheduled` only: an outing already out must be
 * checked back in, or the van never returns to `available`. Freeing this window
 * makes it bookable again — assertBookable ignores cancelled rows.
 */
export async function cancelDate(
  ticketId: string,
  dateId: string,
  actor: AuthenticatedUser,
  reason: string
) {
  const ticket = await prisma.tripTicket.findUnique({
    where: { id: ticketId }
  });
  if (!ticket) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  if (actor.role !== 'admin' && ticket.requestedById !== actor.id) {
    throw new AppError(
      403,
      'NOT_TICKET_OWNER',
      'You may only cancel your own trip ticket'
    );
  }

  const outing = await prisma.tripDate.findFirst({
    where: { id: dateId, tripTicketId: ticketId }
  });
  if (!outing) throw new AppError(404, 'NOT_FOUND', 'Trip date not found');
  if (outing.status !== 'scheduled') {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `Not allowed from status ${outing.status}`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.tripDate.update({
      where: { id: dateId },
      data: { status: 'cancelled', cancellationReason: reason }
    });
    await syncTicketStatus(tx, ticketId);
    await recomputeTicketSpan(tx, ticketId);
  });

  const full = await findTripTicketById(ticketId);
  await events.tripDateCancelled(full!, outing, actor, reason);
  return full;
}
```

`events.tripDateCancelled` arrives in Task 7. Until then, comment out that one line and restore it in Task 7 — note this explicitly in the commit message.

In `transitions.controller.ts`:

```ts
export async function cancelDate(req: Request, res: Response): Promise<void> {
  res.json(
    await transitions.cancelDate(
      requireIdParam(req),
      requireParam(req, 'dateId'),
      requireUser(req),
      (req.body as ReasonBody).reason
    )
  );
}
```

In `router.ts`, beside the existing cancel route:

```ts
tripTicketsRouter.post(
  '/:id/dates/:dateId/cancel',
  requireRole(USER_ROLES.admin, USER_ROLES.requester),
  validateBody(reasonBodySchema),
  transitionsController.cancelDate
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mms/api test -- trip-ticket-transitions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/modules/trip-tickets
git add apps/api/src/modules/trip-tickets
git commit -m "feat(api): cancel a single date without voiding the event"
```

---

### Task 7: Notification deltas

**Files:**

- Modify: `apps/api/src/modules/notifications/events.ts`
- Modify: `apps/api/src/modules/trip-tickets/transitions.ts` (restore the `tripDateCancelled` call)
- Test: `apps/api/src/modules/notifications/trip-date-notifications.test.ts`

**Interfaces:**

- Consumes: `notify`, `adminIds`, `userIdForDriver` (existing).
- Produces: `events.tripDateCancelled(ticket, outing, actor, reason)`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';
import * as events from './events.js';

describe('per-outing notifications', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('tells the driver when one outing of their event is cancelled', async () => {
    const branch = await createTestBranch();
    // createTestUser returns { user: { id, email }, password } — not the row.
    const { user: adminUser } = await createTestUser({
      role: 'admin',
      email: 'a@test.local'
    });
    const { user: driverUser } = await createTestUser({
      role: 'driver',
      email: 'dv@test.local'
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'N1',
        licensePlate: 'N1',
        capacity: 5,
        fuelType: 'diesel',
        mileage: 1000,
        status: 'available',
        branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    // The mechanic/driver link is what makes a Driver row reachable as a person.
    const driver = await prisma.driver.create({
      data: {
        email: 'dv@test.local',
        fullName: 'DV',
        status: 'active',
        branchId: branch.id,
        userId: driverUser.id
      }
    });
    const start = new Date(Date.now() + 30 * 86_400_000);
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: new Date(),
        status: 'approved',
        startTs: start,
        endTs: new Date(start.getTime() + 3_600_000)
      }
    });

    await events.tripDateCancelled(
      ticket,
      { startTs: start },
      {
        id: adminUser.id,
        email: adminUser.email,
        role: 'admin',
        branchId: branch.id
      },
      'venue moved'
    );

    const rows = await prisma.notification.findMany({
      where: { userId: driverUser.id }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('trip_cancelled');
    expect(rows[0].title).toContain('is cancelled');
    expect(rows[0].body).toContain('venue moved');
  });
});
```

`createTestUser({ role })` upserts the `Role` and creates the `UserRole` row for you, so `adminIds()` and the driver lookup inside `tripDateCancelled` resolve without extra setup. `Driver.userId` is the link that makes a driver row reachable as a person — a driver row without it receives nothing, by design.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mms/api test -- trip-date-notifications`
Expected: FAIL — `events.tripDateCancelled` is not exported.

- [ ] **Step 3: Add the event raiser**

In `events.ts`:

```ts
/**
 * One outing called off. The driver matters most here for the same reason as a
 * whole-ticket cancellation: they have been told "You are driving TT-20", and
 * without this they turn up on a date that is no longer happening.
 */
export async function tripDateCancelled(
  ticket: TripTicket,
  outing: { startTs: Date },
  actor: AuthenticatedUser,
  reason: string
) {
  const day = outing.startTs.toISOString().slice(0, 10);
  const driverUserId = await userIdForDriver(ticket.driverId);
  const others = [ticket.requestedById, ...(await adminIds())].filter(
    (id) => id !== driverUserId
  );

  await notify({
    userIds: others,
    exceptUserId: actor.id,
    type: 'trip_cancelled',
    title: `${ref('TT', ticket.ticketNo)} on ${day} was cancelled`,
    body: reason,
    linkTo: tripLink(ticket.id)
  });
  await notify({
    userIds: [driverUserId],
    exceptUserId: actor.id,
    type: 'trip_cancelled',
    title: `${ref('TT', ticket.ticketNo)} on ${day} is cancelled — you are not driving that day`,
    body: reason,
    linkTo: tripLink(ticket.id)
  });
}
```

- [ ] **Step 4: Name the outing in the gate messages and the assignment**

In `tripCheckedOut` and `tripCheckedIn`, accept the outing and put the day in the body:

```ts
body: `On the road to ${ticket.destination} (${day}).`;
```

In `tripApprovedByEvp`, count the dates so the driver knows what they are taking on:

```ts
const dateCount = await prisma.tripDate.count({
  where: { tripTicketId: ticket.id, status: { not: 'cancelled' } }
});
// ... driver notify ...
body: dateCount > 1
  ? `${ticket.destination} — ${dateCount} outings. Show your QR at the gate each time.`
  : `${ticket.destination} — show your QR at the gate.`;
```

Update the two call sites in `transitions.ts` to pass the resolved `outing`, and restore the `events.tripDateCancelled(...)` line commented out in Task 6.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @mms/api test`
Expected: PASS across the API suite.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src
git add apps/api/src
git commit -m "feat(api): notify per outing, including a single cancelled date"
```

---

### Task 8: Web — types, API client, and the "When" repeater

**Files:**

- Modify: `apps/web/src/lib/api/trip-tickets.ts`
- Modify: `apps/web/src/lib/types.ts` (or wherever `TicketRow` is declared — grep for `ticket_no` to find it)
- Modify: `apps/web/src/components/pages/trip-tickets/add-trip-ticket/form.tsx`

**Interfaces:**

- Consumes: `POST /api/trip-tickets` accepting `dates` (Tasks 2–4).
- Produces: FE type `TripDateRow { id, start_ts, end_ts, status, start_mileage, end_mileage }`, exposed as `dates` on the ticket row type; form field array `dates`.

- [ ] **Step 1: Add the FE type and send `dates`**

In `apps/web/src/lib/api/trip-tickets.ts`, add:

```ts
// One outing of an event. Mirrors the API's trip_dates row in the FE's
// snake_case shape, like every other adapter in this file.
export interface TripDateRow {
  id: string;
  start_ts: string;
  end_ts: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  start_mileage: number | null;
  end_mileage: number | null;
}
```

Add `dates: TripDateRow[]` to the ticket row interface, map it in whatever adapter reshapes the API row, and include `dates` in the create/update request bodies.

- [ ] **Step 2: Turn the "When" step into a repeater**

In `form.tsx`, the schema currently has `start_ts` and `end_ts`. Replace them with:

```ts
dates: z.array(
  z.object({
    date: z.string().min(1, 'Pick a date'),
    start: z.string().min(1, 'Departure time'),
    end: z.string().min(1, 'Return time')
  })
).min(1, 'A trip needs at least one date');
```

Use `useFieldArray({ control: form.control, name: 'dates' })`. Render one row per entry — a `type="date"` input plus two `type="time"` inputs — with a remove button on each (hidden when only one row remains) and an "Add another date" button beneath. Default to a single row seeded from `initialDate` when present.

On submit, map rows to the API shape:

```ts
dates: values.dates.map((d) => ({
  startTs: new Date(`${d.date}T${d.start}`).toISOString(),
  endTs: new Date(`${d.date}T${d.end}`).toISOString()
}));
```

Update `STEPS` so the "When" step validates `['dates']`, and update the Review step to list every row.

Mirror the server's checks client-side so the requester is not bounced by a 409 they could have been warned about: each row's end after its start, and no two rows overlapping. Put the overlap check in the step's validation so "Next" is blocked.

- [ ] **Step 3: Verify by hand against the running app**

```bash
pnpm dev
```

Sign in as `requester@mms.local` / `Password123!`, open "Request a trip", add two non-consecutive dates, and submit. Then confirm two rows exist:

```bash
# in a second terminal
psql "$DIRECT_URL" -c 'select start_ts, end_ts, status from trip_dates order by created_at desc limit 5;'
```

Expected: two `scheduled` rows on the dates you picked.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
pnpm --filter @mms/web exec tsc -b --force
pnpm --filter @mms/web lint
npx prettier --write apps/web/src
git add apps/web/src
git commit -m "feat(web): book a trip across several dates"
```

---

### Task 9: Web — calendar, detail, and the dashboards

**Files:**

- Modify: `apps/web/src/components/pages/trip-tickets/index.tsx` (calendar events)
- Modify: `apps/web/src/components/pages/trip-tickets/trip-tickets-inner/index.tsx` (dates table)
- Modify: `apps/web/src/components/pages/trip-tickets/requester-dashboard/index.tsx`
- Modify: `apps/web/src/components/pages/trip-tickets/driver-dashboard/index.tsx`

**Interfaces:**

- Consumes: `TripDateRow[]` on the ticket row type (Task 8); `POST /:id/dates/:dateId/cancel` (Task 6).

- [ ] **Step 1: One calendar event per date**

In `index.tsx`, `calendarEvents` currently maps one event per ticket from `start_ts`/`end_ts`. Replace it with a `flatMap` over the date rows:

```ts
const calendarEvents = useMemo(() => {
  if (!calendarData) return [];
  // One block per OUTING, not per ticket. A ticket spanning the 17th and the
  // 21st used to paint one bar straight through the 18th-20th, which is
  // exactly the availability lie this feature removes.
  return calendarData.flatMap((ticket) =>
    (ticket.dates ?? [])
      .filter((d) => d.status !== 'cancelled')
      .map((d) => {
        const startDateTime = new Date(d.start_ts);
        const endDateTime = new Date(d.end_ts);
        return {
          id: `${ticket.id}:${d.id}`,
          title: `${ticket.destination} — ${resolveStatus(ticket.status ?? '').label}`,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          backgroundColor: statusEventColor(ticket.status || 'pending'),
          borderColor: statusEventColor(ticket.status || 'pending'),
          extendedProps: { purpose: ticket.purpose, status: ticket.status }
        };
      })
  );
}, [calendarData]);
```

The event `id` is now composite, so whatever `EventClickArg` handler opens the ticket must split on `:` and take the first segment — otherwise clicking a block navigates to a route with a malformed id.

This is the visible payoff: April 17 and 21 render as two blocks with the 18th–20th free.

- [ ] **Step 2: A dates table on the trip detail**

Add a section listing each date: day, window, `StatusBadge` for the date's own status, odometer out/in, and guard. Give each `scheduled` row a Cancel button, shown only to an admin or the owning requester, opening the existing `ReasonDialog` and posting to `/:id/dates/:dateId/cancel`.

Add the mutation to `apps/web/src/lib/mutation/trip-tickets.ts` following `useCancelTripTicket`, invalidating the same keys.

- [ ] **Step 3: Requester dashboard lists the dates**

In the "Waiting on approval" card, under the purpose, render the date list so the requester can see what they actually asked for. In the compact "Other requests" rows, show the first date plus a `+N more` when there are several.

- [ ] **Step 4: Driver dashboard leads by next outing**

The driver's screen currently sorts tickets by `start_ts`. Change it to flatten to `{ ticket, date }` pairs over non-cancelled, non-completed dates, sort by `date.start_ts`, and show the next one as "Next trip". A driver cares about the next time they drive, which after the first outing of an event is not the ticket's earliest date.

- [ ] **Step 5: Verify by hand**

With `pnpm dev` running, as an admin open Trip Tickets → Calendar and confirm the two-date event from Task 8 shows as two separate blocks with the gap days free. Open the ticket and cancel the second date; confirm the calendar drops that block and the first remains.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
pnpm --filter @mms/web exec tsc -b --force
pnpm --filter @mms/web lint
npx prettier --write apps/web/src
git add apps/web/src
git commit -m "feat(web): show trip dates on the calendar, detail and dashboards"
```

---

### Task 10: End-to-end coverage

**Files:**

- Create: `apps/web/e2e/multi-date-trip.spec.ts`

**Interfaces:**

- Consumes: everything above; `apps/web/e2e/helpers.ts` (`apiLogin`, `apiPost`, `apiGet`, `listData`, `tripStatus`, `CREDENTIALS`).

- [ ] **Step 1: Write the spec**

Model it on `apps/web/e2e/trip-lifecycle.spec.ts`. Stage via the API, assert through it, and use **far-future, distinct** windows — the seeded demo data and other specs share this database, and an overlapping window produces a `VEHICLE_DOUBLE_BOOKED` 409 that looks like a product bug but is a fixture collision.

```ts
test('an event on two non-consecutive dates: one approval, two gate cycles', async ({
  request
}) => {
  const admin = await apiLogin(request, CREDENTIALS.admin);
  const requester = await apiLogin(request, CREDENTIALS.requester);
  const evp = await apiLogin(request, CREDENTIALS.evp);

  // ... resolve branch, office, head, an available vehicle, a driver ...

  const DAY = 86_400_000;
  const day1 = new Date(Date.now() + 60 * DAY);
  const day2 = new Date(Date.now() + 64 * DAY);
  const created = await apiPost(request, '/api/trip-tickets', requester.token, {
    /* ...the usual fields, minus startTs/endTs... */
    dates: [
      {
        startTs: day1.toISOString(),
        endTs: new Date(day1.getTime() + 6 * 3_600_000).toISOString()
      },
      {
        startTs: day2.toISOString(),
        endTs: new Date(day2.getTime() + 6 * 3_600_000).toISOString()
      }
    ]
  });
  expect(created.ok, 'requester books a two-date event').toBeTruthy();
  const tripId = (created.body as { id: string }).id;

  // ONE approval covers both dates.
  expect(
    (
      await apiPost(
        request,
        `/api/trip-tickets/${tripId}/approve`,
        admin.token,
        {
          liters: 20,
          fuelType: 'diesel',
          date: day1.toISOString().slice(0, 10),
          purpose: 'E2E',
          tripTo: 'E2E'
        }
      )
    ).ok
  ).toBeTruthy();
  expect(
    (
      await apiPost(
        request,
        `/api/trip-tickets/${tripId}/approve-evp`,
        evp.token
      )
    ).ok
  ).toBeTruthy();
  expect(await tripStatus(request, tripId, admin.token)).toBe('approved');

  // The gap day is free for somebody else on the same van.
  const gapDay = new Date(Date.now() + 62 * DAY);
  const gap = await apiPost(request, '/api/trip-tickets', requester.token, {
    /* same vehicle and driver */
    dates: [
      {
        startTs: gapDay.toISOString(),
        endTs: new Date(gapDay.getTime() + 3_600_000).toISOString()
      }
    ]
  });
  expect(gap.ok, 'the days between two dates stay bookable').toBeTruthy();

  // Cancel the second date; the event survives.
  const dates = listData(
    await apiGet(request, `/api/trip-tickets/${tripId}`, admin.token)
  );
  // (read `dates` off the ticket body rather than listData if the shape differs)
  expect(await tripStatus(request, tripId, admin.token)).toBe('approved');
});
```

Fill in the resolution of branch/office/head/vehicle/driver exactly as `trip-lifecycle.spec.ts` does, and read the ticket's `dates` array off the detail response to get the id for the per-date cancel.

- [ ] **Step 2: Run it**

The suite drives the **already running** app; it does not start servers.

```bash
pnpm dev            # in another terminal
pnpm --filter @mms/web test:e2e -- multi-date-trip
```

Expected: PASS.

- [ ] **Step 3: Clean up after the run**

The spec creates real rows on the Neon dev database. Delete the tickets it created at the end of the test with `apiDelete(request, '/api/trip-tickets/<id>', admin.token)`, as `trip-lifecycle.spec.ts` does.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/web/e2e
git add apps/web/e2e
git commit -m "test(e2e): an event across non-consecutive dates"
```

---

## Deferred: dropping the deprecated columns

Not part of this plan. Once nothing reads `TripTicket.startMileage`, `endMileage`, `preTripGuardId`, `preTripCheckedById`, `preTripCheckedAt`, `postTripGuardId`, `postTripCheckedById` or `postTripCheckedAt`, a follow-up migration drops them. Grep for each name across `apps/` before writing it. `startTs`/`endTs` **stay** — they remain the derived span.

## Open question carried from the spec

`useCompletedTripsCount` counts completed **tickets**. A two-date event is therefore one completed trip, not two. This plan keeps that behaviour deliberately, for continuity with the existing dashboard figure. If the motorpool wants to count outings, that is a separate change to `apps/api/src/modules/analytics/` and should be decided on its own.
