# Multi-Date Trip Tickets — Design

**Date:** 2026-08-20
**Status:** Draft for review
**Scope:** Let one trip ticket cover several non-consecutive dates (an event on April 17 **and** 21), with one approval and one fuel allocation, while each date remains its own outing at the gate.

---

## 1. Summary & goals

A trip ticket today has exactly one `startTs`/`endTs` pair. An event that runs on April 17 and April 21 has nowhere to live: the requester must either raise two separate tickets — two approvals, two fuel allocations, two rows to track — or book 17→21 as one window, which holds the vehicle and the driver for five days and blocks everyone else on the 18th, 19th and 20th when the van is in fact sitting in the yard.

We introduce a `TripDate` child table. The ticket keeps everything about **approval**; each date row carries everything about **one outing**.

**Goals**

- One ticket may carry many dates, each with its own depart/return time.
- One admin approval and one EVP fuel allocation cover the whole event.
- Each date is its own gate cycle: its own check-out, check-in and odometer pair.
- The vehicle and driver are free on the days between dates, and bookable by others.
- A single date can be cancelled without voiding the rest.
- Existing single-day tickets keep behaving exactly as they do now.
- The driver's existing QR keeps working unchanged.

**Non-goals (v1)**

- Recurrence rules ("every Tuesday for six weeks"). Dates are an explicit list.
- Rescheduling a date to a different day after approval. Cancel and add is the path; see §11.
- Per-date fuel allocation. One allocation covers the event.
- Per-date approval. Approval is all-or-nothing across the event.
- Splitting an existing multi-day ticket into dates retroactively beyond the one-row backfill in §9.

---

## 2. Background: how trips work today

- **Booking:** `POST /api/trip-tickets` writes one row with `startTs`/`endTs`. `assertBookable()` (`apps/api/src/modules/trip-tickets/service.ts`) validates the window, vehicle status, capacity against participant headcount, driver status, and then does a half-open overlap check — `startTs < other.endTs AND endTs > other.startTs` — against live tickets on the same **vehicle or driver**.
- **Approval:** `pending_admin_approval` → admin approves and creates the `FuelAllocation` → `pending_fuel_allocation_approval` → EVP signs off → `approved`.
- **Gate:** the guard scans a QR containing the **ticket id**. `checkOut` claims the vehicle `available → on_trip`, records `startMileage` and the pre-trip guard, and sets the ticket `in_progress`. `checkIn` records `endMileage`, releases the vehicle to `available`, and sets the ticket `completed`.
- **Odometer:** `advanceOdometer` moves the vehicle's mileage on both gate actions. The maintenance risk model reads that mileage, so it must stay truthful.

The per-outing facts — window, mileages, guard ids and timestamps — all live as columns on `TripTicket`. That is the constraint this design removes.

---

## 3. Decisions taken

These were settled during brainstorming and are load-bearing:

1. **The vehicle returns to the yard between dates.** Each date is a separate outing with its own gate cycle and odometer pair, and the van is bookable in between.
2. **Approval is once for the whole event.** One admin decision, one fuel allocation, covering every date. An approver cannot accept the 17th and refuse the 21st.
3. **Each date has its own times.** Not a shared window applied to every date — the "When" step becomes a repeater of *date · depart · return*.
4. **A single date can be cancelled** without killing the booking. If every date ends up cancelled, the ticket is cancelled.

---

## 4. Data model

### 4.1 New: `TripDate`

One row per outing.

| Column | Notes |
| --- | --- |
| `id` | uuid, pk |
| `tripTicketId` | uuid, fk → `trip_tickets.id`, cascade delete |
| `startTs`, `endTs` | required — a date row without a window is not bookable |
| `status` | `TripDateStatus`: `scheduled` \| `in_progress` \| `completed` \| `cancelled` |
| `startMileage`, `endMileage` | int, nullable — this outing's odometer pair |
| `preTripGuardId`, `postTripGuardId` | uuid, nullable → `users.id` |
| `preTripCheckedById`, `postTripCheckedById` | uuid, nullable → `users.id` — mirrors the pair the ticket carries today |
| `preTripCheckedAt`, `postTripCheckedAt` | nullable |
| `cancellationReason` | text, nullable — set when this date alone is cancelled |
| `createdAt`, `updatedAt` | standard timestamps |

Indexes: `(tripTicketId)` for loading a ticket's dates, and `(startTs, endTs)` for the overlap query in §5.

### 4.2 Changes to `TripTicket`

`startTs` / `endTs` **stay**, redefined as a **derived span** — earliest date start, latest date end — recomputed in the same transaction as any date change. They exist so the existing sorts and filters (driver dashboard, requester dashboard, list ordering) keep working untouched.

They are **display and sort only**. Booking never reads them; §5 reads `TripDate`. This must be stated in a comment on the model, because a future reader reaching for `ticket.startTs` to check availability would reintroduce exactly the bug this design removes.

The per-outing columns — `startMileage`, `endMileage`, `preTripGuardId`, `postTripGuardId`, `preTripCheckedById`, `postTripCheckedById`, `preTripCheckedAt`, `postTripCheckedAt` — become **deprecated** once readers move to `TripDate`. They are left in place and unwritten after the backfill, and dropped in a follow-up migration only when nothing reads them (§9).

`FuelAllocation` is unchanged: still one per ticket, still unique on `tripTicketId`.

---

## 5. Booking and validation

`assertBookable()` takes a **list of proposed date rows** instead of one window. Per-ticket checks (vehicle out of service, capacity vs headcount, driver inactive) are unchanged and run once. The window checks run per row:

- End after start.
- Not entirely in the past.
- **Intra-submission overlap:** the proposed rows must not overlap each other, so a requester cannot book the 17th 08:00–17:00 and the 17th 14:00–20:00 in one submission.
- **Cross-ticket overlap:** each row is checked against `TripDate` rows belonging to live tickets on the same vehicle or driver, excluding rows whose own status is `cancelled`.

The cross-ticket query keeps the existing half-open semantics, moved down a level:

```
TripDate.status != 'cancelled'
  AND tripTicket.status IN (LIVE_STATUSES)
  AND tripTicket.id != :excludeTicketId
  AND TripDate.startTs < :proposedEnd
  AND TripDate.endTs   > :proposedStart
  AND (tripTicket.vehicleId = :vehicleId OR tripTicket.driverId = :driverId)
```

The error codes are unchanged (`VEHICLE_DOUBLE_BOOKED`, `DRIVER_DOUBLE_BOOKED`) but the message names the offending date as well as the ticket, since "already booked" is far less useful when a ticket has five of them.

Every **newly created or edited** ticket must have at least one date row; an empty list is a validation error. The one exception is historical: legacy tickets with a null window, which the backfill cannot give a row to and instead reports (§9).

---

## 6. State machine

### 6.1 Approval is unchanged

`pending_admin_approval` → `pending_fuel_allocation_approval` → `approved`, exactly as today. One decision, one fuel allocation. Disapproval and whole-ticket cancellation behave as they do now.

### 6.2 After approval, ticket status is derived

Once a ticket is `approved`, its status is a **function of its dates**, recomputed inside the same transaction as any gate action or per-date cancellation. A date is **settled** when it is `completed` or `cancelled`; the rules are evaluated top-down and the first match wins:

| Dates | Ticket status |
| --- | --- |
| any `in_progress` | `in_progress` |
| all settled, ≥1 `completed` | `completed` |
| all settled, none `completed` (so all `cancelled`) | `cancelled` |
| otherwise (≥1 still `scheduled`) | `approved` |

This is the crux of the change. `checkIn` today sets the ticket `completed` unconditionally; it must stop doing so until every date is settled.

### 6.3 Gate actions act on a date

`checkOut` and `checkIn` operate on a `TripDate`, not the ticket. The vehicle claim (`available → on_trip`) and release, and `advanceOdometer`, are unchanged in logic — they simply key off the date row.

**The QR does not change.** It carries the ticket id, and drivers may already be holding printed ones. The server resolves *which* outing: the date row for that ticket whose window covers now, preferring `scheduled` for check-out and `in_progress` for check-in. If there is none, the action is refused with a clear message — `TT-20 has no outing scheduled today` — rather than releasing the vehicle against the wrong date.

The API keeps its current paths (`POST /trip-tickets/:id/check-out`, `/check-in`), with the date resolved server-side. This keeps the guard screen untouched.

### 6.4 Cancelling one date

`POST /trip-tickets/:id/dates/:dateId/cancel` with a required reason. Legal from `scheduled` only — an outing already in progress must be checked back in, not cancelled, or the vehicle never returns to `available`. Permitted for an admin or the owning requester, matching whole-ticket cancel. It sets the date `cancelled`, frees that window for other bookings, and recomputes the ticket status per §6.2.

---

## 7. UI

**Form — "When" step.** Becomes a repeater of *date · depart · return* rows, with add and remove, at least one required. Client-side validation mirrors §5 so overlap is caught before submit. The Review step lists every row.

**Calendar** (Trip Tickets page). One event per `TripDate` rather than per ticket. This is the visible payoff: April 17 and 21 render as two blocks with the 18th–20th plainly free.

**Trip detail.** A Dates table — date, window, status, odometer out/in, guard — with a per-date Cancel for an admin or the owning requester.

**Requester dashboard.** The card lists the event's dates beneath the destination, so "waiting on approval" shows what is actually being asked for.

**Driver — "My Trips".** Leads by *next outing* rather than by ticket, sorting on date rows. A driver cares about the next time they actually drive, which for a multi-date event is not the ticket's earliest date once the first has been completed.

**Guard screen.** Untouched.

---

## 8. Notifications

Small deltas to the existing events (`apps/api/src/modules/notifications/events.ts`):

- `trip_assigned` to the driver names how many outings the event carries.
- `trip_checked_out` / `trip_checked_in` name the date, not just the ticket.
- A per-date cancellation raises `trip_cancelled` to the **driver**, requester and admins — the driver path matters as much here as it does for whole-ticket cancellation, since a driver told "you are driving TT-20" would otherwise turn up on a date that has been called off.

---

## 9. Migration and rollout

1. **Additive migration:** create `TripDateStatus` and the `trip_dates` table. Nothing existing is altered.
2. **Backfill:** one `TripDate` row per existing ticket, carrying its `startTs`, `endTs`, mileages and guard stamps, with a status derived from the ticket's own (`in_progress` → `in_progress`, `completed` → `completed`, `cancelled`/`disapproved` → `cancelled`, otherwise `scheduled`). Idempotent: skip tickets that already have rows. Tickets with a null window get no row and are reported, not silently skipped.
3. **Cut readers over** to `TripDate`, leaving the deprecated ticket columns unwritten.
4. **Follow-up migration**, separately, drops the deprecated columns once nothing reads them.

A single-day trip is a ticket with one date row and behaves identically throughout.

---

## 10. Testing strategy

**Unit**

- Overlap: cross-ticket on vehicle and on driver; intra-submission; cancelled rows correctly ignored.
- Ticket status derivation — the §6.2 table, every row.
- Resolving today's outing: none scheduled, one scheduled, one already in progress.
- Backfill idempotence and status mapping.

**E2E**

- Book a two-date event, approve once, run the gate cycle on date 1 and assert the ticket is **not** `completed`; run date 2 and assert it is.
- Cancel one date of an approved event and confirm the vehicle becomes bookable in that window while the other date stands.
- Confirm a second booking on the gap days succeeds where a 17→21 single window would have refused it.

---

## 11. Risks and open questions

- **`checkIn` completing the ticket early** is the single highest-risk change. Every existing path that assumes check-in means "trip over" must be found — including the notification copy and any analytics counting completed trips.
- **Completed-trip metrics.** `useCompletedTripsCount` counts tickets. With multi-date events, is a two-date event one completed trip or two? Recommend keeping it at ticket level for continuity and revisiting if it misleads.
- **Deprecated columns lingering.** If step 3 of §9 is incomplete, a reader left on `ticket.startMileage` silently reads a stale value. The follow-up drop is what forces the issue, and should not be deferred indefinitely.
- **Rescheduling** is deliberately out of scope. If it is wanted later, the new day must re-pass §5 on its own, and an approved event quietly drifting to different dates needs a policy decision first.
