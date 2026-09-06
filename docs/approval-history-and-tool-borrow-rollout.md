# Approval History and Tool Borrow Tracking — Rollout and Follow-Ups

**Feature:** two independent pieces sharing one design doc.

- **EVP decision history** — every fuel-allocation and job-order decision an EVP
  (or an admin override) makes is now recorded with who decided and when, and
  surfaced as a merged, paginated History tab beside the EVP's approval queue.
- **Tool borrow tracking** — every time a tool changes hands, a `tool_borrows`
  row is written. The Tools page now shows a borrow-metrics strip (tools out,
  overdue, borrows in the last 90 days, average days out) and a most-borrowed
  leaderboard, both fed by `GET /api/tools/stats`.

**Design:** `docs/superpowers/specs/2026-08-28-approval-history-and-tool-borrow-tracking-design.md`
**Plan:** `docs/superpowers/plans/2026-08-28-approval-history-and-tool-borrow-tracking.md`

Everything below survived seven task-level reviews (three fix rounds inside
Task 5 alone) plus the final task's own verification. None of it blocks the
feature working; §1 is what to check before you deploy it.

---

## 1. Do this before deploying (spec §4.2)

### 1.1 Open-borrow duplicates

The `tool_borrows` migration creates a **partial unique index** —
`tool_borrows_open_unique` on `(tool_id) WHERE returned_at IS NULL` — so a
tool can never have two open borrows at once. The backfill that ships with the
migration cannot violate it (one row per tool, by construction), but a
database that has been hand-edited between the migration running and this
check could. Confirm zero rows on every target database:

```sql
SELECT tool_id, count(*) FROM tool_borrows
WHERE returned_at IS NULL GROUP BY 1 HAVING count(*) > 1;
```

**Verified now, both databases, 0 rows:**

```
mms:      tool_id | count   (0 rows)
mms_test: tool_id | count   (0 rows)
```

### 1.2 `job_orders.date_approved` widened, not dropped and re-added

The migration is `ALTER TABLE "job_orders" ALTER COLUMN "date_approved" TYPE
timestamp(3);` — a type widen in place, not a drop-and-recreate. This matters
because a drop-and-recreate would silently discard every existing approval
date; a widen preserves them as midnight-of-that-day, which is the truth as
originally recorded.

**Verified independently** (not inferred from the migration file) by
inspecting the live schema in both databases:

```
 date_approved | timestamp(3) without time zone |
```

— and confirming `date_approved` still sits in its **original ordinal
position** in the table (between `date_of_request` and `target_date`, not
appended at the end), which is the tell for an in-place `ALTER` versus a
column that was dropped and re-added.

### 1.3 Rollback

- Decision-history columns (`fuel_allocations.decided_by` / `decided_at`):
  plain column drop, no data loss beyond the two columns themselves.
- `job_orders.date_approved`: narrowing back to `date` loses only the
  time-of-day component added by this work.
- `tool_borrows`: drop the table. Nothing else reads it except the new
  `/api/tools/stats` route and the borrow write path, both removed with it.

---

## 2. Behaviour changes for API consumers

- **`GET /api/branches`-style consumers are unaffected.** Nothing in this plan
  touches the `reference`/`organization` modules, their response shapes, or
  their pagination. This plan is additive: one new `approvals` module, one new
  `tools/stats` route, and two widened/added columns on existing tables.
- **Any consumer reading `job_orders.date_approved` now receives a full
  timestamp, not a date.** The web app already treats this field as an
  unsliced ISO string — `apps/web/src/lib/api/job-orders.ts` has carried this
  comment since before this work:

  > `incidentDate/dateOfRequest/dateApproved/targetDate/actualDateOfRelease`
  > are `@db.Date` but every FE consumer binds them to
  > `<input type="datetime-local">` (not `type="date"`), so they're passed
  > through as full ISO strings, unsliced.

  In other words, the FE was already prepared for more precision than the
  column used to carry; widening the column changes nothing it renders. Any
  **other** consumer (a report, a script, an external integration) that reads
  this field and assumes a bare `YYYY-MM-DD` string should be checked before
  deploy — it will now see a full `...T00:00:00.000Z`-shaped timestamp for
  historical rows and a real time-of-day for anything approved after this
  ships.
- `GET /api/tools/stats` is additive and requires no client changes beyond the
  new UI that consumes it.

---

## 3. Known gaps and follow-ups

From spec §6, plus items found and deliberately deferred during
implementation (all reviewed and judged non-blocking).

| Item | Where | Note |
| --- | --- | --- |
| The per-user activity log is still a separate future feature | spec §6 | When it lands, the tool-borrow write should emit its entry from the same function that writes the borrow row — one call site fanning out, the way `notifications/events.ts` already does. |
| `approved_by_evp` and `decided_by` overlap on fuel allocations | `job_orders`/`fuel_allocations`, spec §6 | Both are written from `actor.id` inside one statement, so they cannot drift, but collapsing them into one column is worth doing later. |
| EVP approval UI lives under `job-order/` | `components/pages/job-order/evp-approval/` | It is the EVP's entire interface and is mostly about fuel. Moving it is a one-line import change in `dashboard/index.tsx`; left in place to keep this diff about the feature. |
| `borrow_requests` is a dead table | schema, spec §6 | `tool_borrows` deliberately does not reuse it — that table models a request/approval cycle that does not exist. Dropping it belongs with whatever eventually builds that workflow. |
| EVP queue reads 100 tickets and filters client-side | `job-order/evp-approval/queue.tsx` | Pre-existing. With more than 100 tickets in the system a pending one on page 2 is invisible to the EVP. The list endpoint already accepts `?status=`; worth fixing. |
| Repair-side history field mapping is unasserted | `approvals/service.ts:57-71` | `ref`, `linkTo`, `title`, `subtitle`, `decidedByName`, `decidedByRole` on the job-order side of the merge are never checked by a test — only `kind`/ordering are. A regression there ships silently. Flagged by review as the most substantive Task 2 gap. |
| `SectionLabel` duplicated | `job-order/evp-approval/index.tsx` and `queue.tsx` | Identical component defined twice because the brief gave it no shared home. Behaviourally inert; hoist in a cleanup pass. |
| `B1` (round-2 borrow date test) compares by calendar day, not exact instant | `tools/tool-borrows.test.ts` | The tool row is `@db.Date` and the borrow row is `DateTime`, so day-granularity is what the two sides can actually agree on. Documented residual, not a defect. |
| One test still pins mechanism by source text | `tools/tool-borrows.test.ts` (the `FOR UPDATE` pin) | Mutation-verified against the two mutations that broke earlier drafts, but it is a text pin, not a concurrency test — it does not prove correctness under real concurrent load. |
| Driver-delete conflict handling is scoped to one FK name | `drivers/service.ts` `remove()` | Catches `P2003` scoped to `tool_borrows_borrower_id_fkey`. A future `RESTRICT` foreign key added elsewhere on `Driver` needs its own branch or it will fall through to a generic error. |
| Migration folder timestamp is a day behind | `prisma/migrations/20260827190518_add_tool_borrows` | Local clock skew during authoring. Still the newest migration and applies in the right order; cosmetic only. |

**Resolved during Task 7, not a residual:** Task 3's review left one open
coverage gap on record — `evp-approval/history.tsx` had never executed in any
Playwright run, so a runtime error in that tab was invisible from outside the
API. Task 7 (already the e2e task) closed it: `e2e/smoke.spec.ts`'s EVP test
now opens the History tab and asserts it renders (either a decision record or
its empty state) before finishing. It passed on the first run — no defect
found, gap closed.

**Found during Task 7's own implementation:** the brief's leaderboard
component used shadcn's default `Badge` variant names (`"destructive"`,
`"secondary"`), which don't exist in this codebase's `Badge` — this app's five
semantic tones are `wait | move | done | stop | neutral` (plus
`default | outline | signal`), per `components/ui/badge.tsx`. Fixed by using
`variant="stop"` for Overdue and `variant="neutral"` for Out now, matching the
existing `overdue: { tone: 'stop' }` mapping in `lib/status.ts` and the
`borrowed: { tone: 'neutral' }` mapping already used elsewhere for the same
tool state. Caught by `tsc -b`, not by review — worth noting in case a future
brief author copies shadcn boilerplate again.

---

## 4. Operational note: local environment

Not caused by any commit in this plan (verified: no commit here touches
`package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`), but it will bite
the next person too:

- **Corepack drifted to pnpm 11.22.0** while `node_modules` was built by
  10.27.0. Every plain `pnpm ...` command now aborts wanting to purge and
  reinstall `node_modules`. Workaround in use throughout this plan: prefix
  every command with `corepack pnpm@10.27.0` (e.g.
  `corepack pnpm@10.27.0 --filter @mms/api test`). **Real fix, recommended:**
  add `"packageManager": "pnpm@10.27.0"` to the root `package.json` so
  Corepack stops guessing.
- Docker's Postgres container went down mid-session twice (once from Docker
  Desktop stopping, once from a machine restart). Both times the databases
  themselves were intact after restarting the container — no data was lost,
  but `prisma migrate deploy` and the test suite fail with `P1001` while it is
  down.
- Playwright does not start its own servers — both `:5173` (web) and `:3001`
  (api) must already be running (`pnpm dev` from the repo root) before
  `test:e2e`.

---

## 5. Verification at handoff

Run fresh at the end of Task 7, actual output (not "should pass"):

- `corepack pnpm@10.27.0 --filter @mms/shared build` — clean
- `corepack pnpm@10.27.0 --filter @mms/api typecheck` — clean
- `corepack pnpm@10.27.0 --filter @mms/api test` — **382 tests passed across
  47 files** (baseline at plan start: 341/45)
- `corepack pnpm@10.27.0 --filter @mms/web exec tsc -b` — clean
- `corepack pnpm@10.27.0 --filter @mms/web lint` — clean
- `corepack pnpm@10.27.0 --filter @mms/web test:e2e` — **16 passed** (baseline
  at plan start: 14), including both new `tools.spec.ts` specs and the
  EVP-history clause added to `smoke.spec.ts`
- 11 commits, `a8b2123..a860bdc`, all unpushed (standing user rule: pushing is
  manual)

Both dev servers and the two open-borrow/date checks above were run against
local Docker Postgres (`localhost:5432`, databases `mms` and `mms_test`) —
`apps/api/.env` was confirmed pointed there, not at Neon, before anything that
writes or deletes rows was run.
