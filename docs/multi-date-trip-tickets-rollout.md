# Multi-Date Trip Tickets — Rollout and Follow-Ups

**Feature:** one trip ticket may cover several non-consecutive dates (an event on
April 17 **and** 21) under one approval and one fuel allocation, with each date its
own outing at the gate.

**Design:** `docs/superpowers/specs/2026-08-20-multi-date-trip-tickets-design.md`
**Plan:** `docs/superpowers/plans/2026-08-20-multi-date-trip-tickets.md`

Everything below survived a per-task review and a final whole-branch review. None of
it blocks the feature working; the first section blocks a clean _deploy_.

---

## 1. Do these before deploying

### 1.1 Check for an orphaned migration row

A migration named `20260820100000_notification_type_trip_date_cancelled` existed
briefly and was removed. It added a `NotificationType` enum value that the design
did not call for — a per-date cancellation reuses `trip_cancelled`.

Any database where it ran now has a `_prisma_migrations` row with no matching
directory. `prisma migrate deploy` tolerates this, so **production is safe**, but
`prisma migrate dev` (`pnpm db:migrate:new`) will report drift and offer to **reset**
— which against the shared Neon dev database is data loss for the whole team.

On every non-production database:

```sql
SELECT migration_name FROM _prisma_migrations
WHERE migration_name = '20260820100000_notification_type_trip_date_cancelled';
```

Where present, delete the row. The orphaned enum value cannot be dropped in Postgres
and is harmless — nothing writes it.

### 1.2 Report and repair NULL-window trip tickets

The backfill deliberately skips tickets with no window
(`migration.sql`: `WHERE t.start_ts IS NOT NULL AND t.end_ts IS NOT NULL`). §9.2 of
the design asked for those to be _reported_; they currently are not.

This matters because such tickets were creatable before this work, and an `approved`
one now has no `TripDate` row — so check-out returns `NO_OUTING_TODAY` **permanently**,
it never appears on the driver dashboard, and it cannot be repaired through the UI
(editing is legal only from `pending_admin_approval`).

```sql
SELECT id, ticket_no, status FROM trip_tickets
WHERE start_ts IS NULL OR end_ts IS NULL;
```

If the result is empty, this is closed. Otherwise: insert a `trip_dates` row per
affected approved ticket, or cancel them.

### 1.3 Note on backfilled cancelled rows

The backfill does not copy `cancellation_reason` onto date rows, so an _upgraded_
database's cancelled rows carry no reason while a freshly seeded one does. Cosmetic,
but it means the two paths disagree.

---

## 2. Seed data needs one coordinated decision

`apps/api/prisma/seed.ts` now creates `TripDate` rows (previously it created none,
which left a fresh install with an empty calendar and empty dashboards). One
pre-existing incoherence remains, and it predates this work:

`vehicles[i % length]` and `drivers[i % length]` pair the **`on_trip`** van
(`MMS-0003`) and the `on_trip` driver with the **`approved`** ticket, while the
`in_progress` ticket gets the `under_maintenance` van. So the seeded `approved`
ticket can never be checked out — `VEHICLE_NOT_AVAILABLE` — and check-in refuses it
too. Recoverable in the demo by flipping the van to `available` through the vehicle
edit UI, but the gate demo dead-ends until someone does.

Three independent seed facts (van status, driver status, ticket status) line up as
though index 2 were meant to be the in-progress ticket. **One decision fixes all
three**: either swap `statuses[2]`/`statuses[3]`, or swap indices 2 and 3 in
`vehicleSpecs` and `driverSpecs`. Swapping only one relocates the dead end.

Also worth deciding: `driver@mms.local` is `drivers[0]`, paired with the pending and
cancelled tickets, so the driver login demos no live outing.

Separately, `seed.ts` has never been Prettier-formatted. Running
`npx prettier --write apps/api/prisma/seed.ts` rewrites all ~800 lines, so it was
deliberately left out of a functional commit. Take it as its own commit if wanted.

---

## 3. Known gaps and follow-ups

Ordered roughly by value.

| Item                                             | Where                           | Note                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booking check-then-write TOCTOU                  | `service.ts` `assertBookable`   | **Pre-existing.** The check runs on the global Prisma client _outside_ the booking transaction, so two simultaneous creates on one window can both pass. This work made the _write_ transactional, which now makes the check look protected when it isn't. Worth a comment at minimum. |
| No test asserts the seed's shape                 | `prisma/seed.ts`                | Nothing imports or executes it, which is exactly why it broke silently. The next seed regression will again be found by a human doing a fresh install.                                                                                                                                 |
| `replaceTripDates` empty-array guard is untested | `dates.ts`                      | The guard is correct but unreachable from both current callers, so the suite never exercises it.                                                                                                                                                                                       |
| Whole-ticket cancel leaves the span stretched    | `transitions.ts`                | `cancelDate` recomputes the derived span; `cancel`/`disapprove` do not. Display and sort only, on a terminal ticket — but an unacknowledged asymmetry.                                                                                                                                 |
| A missed outing pins its ticket at `approved`    | `dates.ts` `deriveTicketStatus` | A `scheduled` row nobody checks out never settles, so the ticket can never derive to `completed`. Recoverable via per-date cancel, but nothing surfaces it. A "past scheduled outings" view or nightly sweep would close it.                                                           |
| Trip-ticket detail page has no Edit trigger      | `trip-tickets-inner/index.tsx`  | **Pre-existing.** `setIsEditing(true)` is never called — unlike every other detail page in the app — and the `viewOnly` search param the three link sites pass is never read. The edit form is unreachable through the UI.                                                             |
| List table shows the derived span                | `trip-tickets/index.tsx`        | A 17th-and-21st event reads "17 Apr – 21 Apr" in the admin's primary view — the same availability lie the calendar was fixed to stop telling. A "· 2 dates" suffix would close it.                                                                                                     |
| `dates` has two wire shapes                      | `lib/api/trip-tickets.ts`       | `mapCreateBody` forwards camelCase; `mapUpdateBody` expects snake_case and maps it. Normalise both to `TripDateRow`.                                                                                                                                                                   |
| Non-UUID `:id` returns 500                       | repo-wide                       | Prisma's `P2023` isn't mapped in the error handler. Fix once with a param validator, not per route.                                                                                                                                                                                    |
| e2e leaves two cancelled tickets per run         | `e2e/multi-date-trip.spec.ts`   | Harmless to correctness (`LIVE_STATUSES` excludes `cancelled`), and better than `trip-lifecycle.spec.ts`, which cleans up nothing at all. Suite-wide hygiene decision.                                                                                                                 |

### Test-timing note

`apps/api/vitest.config.ts` pins `TZ: 'UTC'` while the application displays in
`Asia/Manila`. This is deliberate: without it, a Manila-timezone dev box renders the
same string under both, so timezone regression tests pass against the exact bug they
exist to catch. Keep it.

The two-outing gate fixture carves its windows from what remains of the Manila day
rather than a fixed offset. It cannot be made literally hour-independent — outing 1
must end in the future and non-overlap forces outing 2 to start after it — so a
residual failure band of roughly the last two seconds of a Manila day remains,
measured across 240 simulated instants. Freezing the clock was rejected as riskier
around supertest, Prisma and JWT than the residual.

### Bisect note

Commit `6b574d4` is knowingly red: two pre-existing tests fail there because the
overlap query moved to `trip_dates` before anything wrote to it. Correct at `HEAD`.
