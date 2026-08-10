# Maintenance Logic Audit — Predictive & Preventive

Audited 2026-08-10. Every claim here was measured, not inferred: the model figures come from walking the committed 200-tree artifact with a port of the production tree-walker (`apps/api/src/lib/ml/random-forest.ts:40-49`), and the fleet figures come from a read-only pass over the live Neon database through the real `extractFeatures` → `computeVehicleRisk` path.

Method: seven parallel analysis passes over the ML pipeline, interval math, data-quality inputs, methodology, performance, and integration surfaces; each finding then adversarially verified by an independent pass instructed to refute it. 42 findings raised, 12 survived.

---

## The two verdicts

**Preventive — the math is right, but nothing reads it.**
`computeNextDue` (`apps/api/src/modules/maintenance/next-due.ts:12-23`) correctly anchors the next service to the last completion odometer, and `deriveTrackingStatus` (`next-due.ts:35-60`) derives overdue / due-soon sensibly. This is the strongest code in the audit — and it has zero clients. Grepping `apps/web/src` for `maintenance-tracking`, `nextDueMileage`, or `displayStatus` returns only a field pass-through on the vehicle form; there is no query module for it. Production holds **1 standard, 0 vehicles assigned, 0 tracking rows**.

**Predictive — no accuracy claim is defensible.**
The committed forest was not produced by the committed trainer (JSON max tree depth is **17**; `tools/ml/train_predictive_maintenance.py:90` sets `max_depth=6`). It was trained on differently-scaled features, and on this fleet it is flat to inverted on the one axis that matters.

The defensible framing is: *"a risk-scoring pipeline with a trained-model path and a deterministic fallback, currently serving the fallback pending retraining on fleet data."* Not "an X%-accurate RandomForest."

---

## Evidence — the live fleet, scored

| Plate | Odometer | Km since service | Avg daily km | Services/12mo | Model | Rule | Shown as |
|---|---:|---:|---:|---:|---:|---:|---|
| MMS-0001 | 150,000 | **0** | 738.64 | 2 | 0.756 | 0.467 | **high · 76** |
| MMS-0004 | 49,000 | 14,000 | 159.90 | 1 | 0.682 | 0.958 | medium · 68 |
| MMS-0002 | 33,000 | 8,000 | 53.85 | 1 | 0.355 | 0.730 | low · 36 |
| MMS-0003 | 41,000 | 11,000 | 93.57 | 1 | 0.310 | 0.939 | low · 31 |
| MMS-0005 | 57,000 | 57,000 | 0.00 | 0 | 0.295 | 0.700 | low · 30 |
| MMS-0006 | 65,000 | **65,000** | 0.00 | 0 | 0.290 | 0.700 | low · 29 |
| MMS-0008 | 24,000 | 24,000 | 0.00 | 0 | 0.265 | 0.700 | low · 27 |
| MMS-0007 | 18,000 | 18,000 | 0.00 | 0 | 0.160 | 0.700 | low · 16 |

MMS-0001 was serviced *today* — 0 km since service — and is the only vehicle the dashboard calls high risk. It earns that purely from an `avgDailyKm` of 738.64, which is not a real usage rate. MMS-0006 has never been serviced in 65,000 km and renders as "low · 29 / 100".

Both dashboard cards filter on `priority === 'high'` (`dashboard/predictive-maintenance.tsx:88`, `dashboard/preventive-maintenance.tsx:76`), so MMS-0001 is the **only** vehicle either card shows. The four never-serviced vans are invisible on both.

---

## Confirmed defects

### A — The served forest is flat to inverted on distance since last service
**CRITICAL** · `apps/api/src/assets/rf_maintenance_model.json`

Walking all 200 trees: **784 of 3,830** `KM_SINCE_LAST_MAINT` splits (20.5%) are *negative*, down to −91,875 — but `features.ts:31` clamps the served feature to `>= 0`. Those branches are dead by construction.

Every `AVG_DAILY_KM` split sits in **[43.3, 223.2]**. Below 43.3 km/day the feature is provably inert: sweeping it 0 → 43 changes the output by exactly zero at every km/frequency combination tested. That is 30.6% of the model's importance contributing nothing.

```
Model output, km since service → P(fail), at 33 km/day, 1 service:
      0 km → 0.295     1,000 → 0.265     5,000 → 0.315    10,000 → 0.335
 30,000 km → 0.350    60,000 → 0.315   100,000 → 0.425  (still "low")
```

`tools/ml/feature_spec.py:9-19` already documents this distribution mismatch. The fix was written into the trainer and never applied to the committed artifact.

### B — The model and the rule disagree on the *sign* of service frequency
**HIGH** · `apps/api/src/lib/ml/features.ts:61`

`maintFreq12m` is a bare row count. `MaintenanceRow` (`features.ts:4-7`) has no `type` field and `analytics/service.ts:38` discards it, so a preventive oil change and a breakdown repair increment the same integer. Carrying no semantic, it is read in opposite directions by its two consumers.

```
At 3,000 km since service, 30 km/day:
services/yr    model     rule
     0    →    0.010    0.475
     3    →    0.385    0.350
     6    →    0.610    0.225
```

The model says *more servicing = more risk*; the rule says the opposite. Across a realistic grid the two agree on priority only **30.4%** of the time (4,022 of 13,237 sampled points), and in 4,213 cases the rule says `high` where the forest says `low`. `predictive.test.ts` pins goldens for each path separately and never compares directions, so the suite cements the contradiction.

### C — Every preventive surface invents a 5,000 km grid from the odometer alone
**HIGH** · `apps/web/src/lib/utils/predictive-maintenance.ts:117-122`

`getNextMaintenanceDueMileage` is `ceil(mileage / 5000) * 5000` — a pure function of the odometer that ignores service history, the assigned standard, and the tracking row entirely. Two live call sites: `dashboard/preventive-maintenance.tsx:49` and `vehicle-maintenance-insights.tsx:76`.

Two structural consequences fall out of the arithmetic:

- `kmRemaining` is zero only when the odometer is an exact multiple of 5,000, so the "Overdue" badge is effectively unreachable — while *misfiring at 0 km*, labelling a brand-new vehicle overdue.
- `progress = mileage / maintenanceDue` (`preventive-maintenance-card.tsx:140`) is pinned high forever above ~20,000 km: 50,001 km → 90.9%, 54,999 km → 99.998%. A truck serviced yesterday at 120,100 km shows a permanently amber 96% bar.

The correct number is **already on the wire**: the payload carries `kmSinceLastMaint`, and the component maps over the very objects that hold it. `mileage - kmSinceLastMaint + 5000` is the real next-service odometer.

### D — `avgDailyKm` does not measure average daily kilometres
**HIGH** · `apps/api/src/lib/ml/features.ts:42-57`

With two or more services it divides the odometer gap between the *newest and the oldest-ever* service by the days between them. Neither `vehicle.mileage` nor `now` appears — so every kilometre driven since the last service and every day since it are excluded.

Worse, the column means three different things depending on how much history a vehicle has:

| History | Definition used | Meaning |
|---|---|---|
| 0 services | never set | stays `0` — reads as "never driven" |
| 1 service | `kmSinceLastMaint / daysSinceLast` | a real recent rate |
| 2+ services | `kmBetween / daysBetween` | a lifetime rate excluding everything since the last service |

Vehicles are ranked against each other on it regardless.

```
Where MMS-0001's 738.64 km/day comes from:
  services at 2026-02-15 @ 20,000 km and 2026-08-10 @ 150,000 km
  → 130,000 km ÷ 176 days = 738.64 km/day
```

That single number is the sole reason it is the fleet's only "high risk" vehicle, on the same day it was serviced. Meanwhile `TripTicket.startMileage / endMileage / startTs / endTs` — captured at both gates — is never read by `analytics/repository.ts`.

### E — Any job-order repair resets the service clock
**MEDIUM** · `apps/api/src/lib/ml/features.ts:26`

The baseline is the newest row with a non-null mileage, *regardless of type*. `job-orders/transitions.ts:187-195` writes a `type: 'repair'` row stamped with `completedMileage`, and `contracts/job-orders.ts:40` makes that field required — so a blown headlight becomes the "last service" the oil-change clock is measured from.

This is the cause the earlier fix missed. Requiring `completedMileage` fixed the symptom (null read as a service at 0 km) but *activated* this path: before it, the repair row was inert because the baseline filter skipped null-mileage rows.

### F — Preventive completions are invisible to the predictive model
**MEDIUM** · `apps/api/src/modules/maintenance/tracking.service.ts:108-127`

The completion transaction contains exactly two statements — `maintenanceCompletionLog.create` and `vehicleMaintenanceTracking.update`. No `Maintenance` row. The only writers of that table are `job-orders/transitions.ts:187` and the manual CRUD at `maintenance/service.ts:43`.

A van whose every scheduled item was completed on time through the tracker still hits the never-serviced branch at `features.ts:38` and reads as never serviced. Completing twenty more tasks changes nothing; the number only grows with the odometer.

### G — Two scorers on different scales share one set of thresholds
**MEDIUM** · `apps/api/src/lib/ml/risk.ts:5, 48-54`

`rawScore = model ? predictRandomForest(...) : fallbackScore(f)`, then both go through the same `priorityFor` cutoffs (`risk.ts:33-37`) and the same 0-100 meter (`risk.ts:58`). The project's own goldens prove they are incomparable: `predictive.test.ts:17` pins the model at **0.30 (low)** for `{15000, 80, 2}`, and `predictive.test.ts:55` pins the fallback at **0.857 (high)** for the identical features.

`loadModel()` (`random-forest.ts:24-38`) swallows every error and caches `null` for the process lifetime, so a missing `dist/assets` copy silently swaps in a differently-signed ranking function. The UI honestly discloses the *source* ("rule-based estimate", `predictive-maintenance.tsx:117-119`) but never that the red/amber/green buckets changed meaning.

### H — Completion mileage is never validated against the odometer
**MEDIUM** · `apps/api/src/modules/maintenance/tracking.service.ts:92-127`

`complete()` takes `body.completedMileage` and writes `nextDueMileage = completedMileage + interval` without comparing it to `vehicle.mileage` and without advancing the odometer. Trip check-in guards this properly via `advanceOdometer` (`vehicles/status.ts:106-124`), which rejects a backwards reading — the maintenance paths do not. One dropped digit (5,000 for 50,000) sets a next-due already tens of thousands of kilometres in the past, and the row is permanently overdue.

The same gap exists on `maintenance.create` (`maintenance/service.ts:43`), which writes whatever mileage the form supplies. `contracts/maintenance.ts:27` makes mileage nullable and optional, so an all-null history pins the feature vector at `{0, 0, n}` regardless of odometer.

### I — `pending` rows never warn before they go overdue
**MEDIUM** · `apps/api/src/modules/maintenance/next-due.ts:44-59`

`deriveTrackingStatus` computes `due_soon` only inside the `status === 'completed'` branch. Every tracking row is created as `pending` (`tracking.service.ts:53`), so a vehicle's first service cycle goes straight from *pending* to *overdue* with no advance warning — the opposite of what preventive maintenance is for.

---

## The root issue

**There is no single, typed, authoritative record of "a preventive service happened on vehicle V at odometer M."**

The `Maintenance` table is written by two paths — a job-order repair, or a hand-typed row with an optional odometer — and read with the `type` column deliberately thrown away at `analytics/service.ts:38`. The preventive tracker writes to an entirely different set of tables that nothing reads back.

- `kmSinceLastMaint` does not mean "km since last service." It means "km since the last job-order repair or hand-typed row." → **E, F**
- `maintFreq12m` does not mean "how well cared for." It is an untyped event count with no agreed direction. → **B, E**
- The preventive UI has no service-anchored number to display, so it invents one from the odometer. → **C**

The two subsystems share a `Vehicle` and nothing else. One computes the right answer and stores it where the other cannot see it; the other computes a plausible-looking number from a table that does not contain the event it claims to measure.

A secondary, independent cause: the committed model artifact is not the output of the committed trainer. `tools/ml/README.md` already documents the distribution mismatch, and the app loads and trusts the artifact anyway.

---

## What to fix, in order

| # | Fix | Effort |
|---|---|---|
| 1 | Stop serving the forest | ~1 hour |
| 2 | Fix the preventive due number | 30 min interim / 1-2 days proper |
| 3 | Write a `Maintenance` row on preventive completion | ~1 hour + backfill |
| 4 | Type the features | ~half a day + retrain |
| 5 | Compute `avgDailyKm` from trip tickets | ~half a day |
| 6 | Give `pending` rows a due-soon warning | ~1 hour |
| 7 | Retrain, and ship only if it beats the rule | days — needs data |
| 8 | Add a direction-agreement regression test | ~1 hour |

**1. Stop serving the forest.** Pass `null` for the model at `analytics/service.ts:33`. The fallback is not calibrated either, but its direction on service frequency is the physically defensible one, and it responds to neglect. This also makes the "rule-based estimate" badge the honest steady state rather than a degraded mode.

**2. Fix the preventive due number.** *Interim, no API change:* in `preventive-maintenance.tsx:48` and `vehicle-maintenance-insights.tsx:76`, compute `maintenanceDue = mileage - kmSinceLastMaint + 5000` and `progress = kmSinceLastMaint / 5000`. Both fields are already in the payload. *Proper:* add a web query module for `GET /api/vehicles/:id/maintenance-tracking`, drive "Next Service At" from `min(nextDueMileage)` and the badge from the worst `displayStatus`, add a fleet-wide tracking endpoint for the dashboard, and delete `getNextMaintenanceDueMileage`. Render "No maintenance standard assigned" rather than a fabricated milestone.

**3. Write a `Maintenance` row on preventive completion.** In the same transaction at `tracking.service.ts:117`: `{ vehicleId, type: 'preventive', date: now, mileage: body.completedMileage, description: scheduleItem.taskName }`. Backfill from existing `MaintenanceCompletionLog` rows. Validate `completedMileage` against `vehicle.mileage` and advance the odometer while you are there — closes **H**.

**4. Type the features.** Pass `type` through `analytics/repository.ts` and `analytics/service.ts:38`. In `features.ts`, derive the `kmSinceLastMaint` baseline only from preventive/scheduled rows, and split the count into `preventiveCount12m` and `correctiveCount12m` so each can learn its own direction. Fixes **B** and **E** at the cause.

**5. Compute `avgDailyKm` from trip tickets.** Sum `endMileage - startMileage` over completed `TripTicket`s with `endTs` in the last 90 days, divide by 90. Real utilisation, responsive to recent behaviour, and it lands inside the `[43, 223]` band where the model's splits actually live. Delete the three-way definition in `features.ts:42-57`; goldens in `predictive.test.ts` change with it.

**6. Give `pending` rows a due-soon warning.** Hoist the 30-day / 500 km check out of the `completed` branch in `deriveTrackingStatus`.

**7. Retrain, and ship only if it beats the rule.** Redefine the label as forward-looking — "an unscheduled breakdown occurred in the N days *after* this snapshot", computed strictly from rows dated later than the feature snapshot — and re-export through `train_predictive_maintenance.py` so `align_to_serve_contract` kills the negative splits. The trainer already prints the honest verdict at `train_predictive_maintenance.py:177-185`; it was evidently never run against the committed artifact. Then give each scorer its own thresholds derived from its own score distribution, instead of sharing `RISK_THRESHOLDS` — closes **G**.

**8. Add a direction-agreement regression test.** Feed both `fallbackScore` and `predictRandomForest` a monotone sweep on each feature and assert the sign of the correlation matches.
