# Admin-Managed Organization Reference — Rollout and Follow-Ups

**Feature:** an admin can create, rename, archive and restore **branches**,
**department offices** and **office heads** from inside the app. Previously those
three tables were writable only by `prisma/seed.ts`.

**Design:** `docs/superpowers/specs/2026-08-26-admin-managed-organization-reference-design.md`
**Plan:** `docs/superpowers/plans/2026-08-26-admin-managed-organization-reference.md`

Everything below survived eight per-task reviews and a final whole-branch review.
None of it blocks the feature working; §1 blocks a clean _deploy_.

---

## 0. Read this first — a production near-miss

`apps/api/.env` was found pointing at **production Neon**
(`ep-steep-meadow-…neon.tech/neondb`) while the e2e suite was being written. That
file's own header warns that `test:e2e` creates **and deletes** rows in whatever
it targets.

It was caught before anything ran. The file is gitignored, so nothing was
committed, and **production was never touched** — but it is currently left
pointing at **local Docker Postgres**, with the Neon pair commented out. Decide
what you want it set to before you next run anything.

The API test suite already refuses to run against a database whose URL does not
contain `mms_test` (`apps/api/src/test/db.ts`). The Playwright suite has no such
guard. Adding one is the cheapest way to make this impossible to hit again.

---

## 1. Do this before deploying

### 1.1 Check for case-insensitive duplicate names

The migration adds two functional unique indexes:

- `branches_name_lower_unique` on `lower(name)`
- `department_offices_branch_name_lower_unique` on `(branch_id, lower(name))`

`CREATE UNIQUE INDEX` **will fail** on a database that already holds a
case-insensitive duplicate. That is correct behaviour — the migration must not
silently pick a winner. Run both on every target database first:

```sql
SELECT lower(name), count(*) FROM branches
GROUP BY 1 HAVING count(*) > 1;

SELECT branch_id, lower(name), count(*) FROM department_offices
GROUP BY 1, 2 HAVING count(*) > 1;
```

Both must return zero rows. Resolve any duplicates by renaming — **do not weaken
the index**. The seeded data is clean, so a fresh install is safe; a long-lived
dev database may not be.

### 1.2 Lock note

The indexes are created without `CONCURRENTLY`, so each takes a brief ACCESS
EXCLUSIVE lock on its table. Trivial at these table sizes, but worth knowing if
you deploy against a busy database.

### 1.3 Re-seeding can now fail

`prisma db seed` upserts by fixed uuid, but the new indexes are on _name_. A
branch or office created through the app with a colliding name at a different id
will trip them and the seed will fail with `P2002`. Check before re-seeding a
long-lived database.

### 1.4 Rollback is clean

There is no backfill and no data migration — every existing row is active because
`archived_at` is NULL. Rolling the migration back is a plain column-and-index
drop with no data loss.

---

## 2. Behaviour changes for API consumers

`GET /api/branches`, `/api/offices` and `/api/office-heads`:

- **now exclude archived rows by default.** Pass `?includeArchived=true` to get
  everything. This is what removes archived records from every dropdown in the app
  without editing those call sites.
- **`count` is now the filtered count**, not the whole table. The handlers being
  replaced counted the whole table while returning a filtered page, so a paginated
  response disagreed with itself.

All three moved from the `reference` module to a new `organization` module. The
URLs did not change. `reference` now serves roles only.

---

## 3. Operator note: archiving order

The guard enforces this and it is not obvious from the UI:

- **Archive children before parents** — office heads, then offices, then the
  branch. A branch cannot be archived while it still has an active office or
  head; an office cannot be archived while an active head is assigned to it.
- **A complete office↔head reference cycle must be broken first.** If office O
  names head H _and_ head H belongs to office O, `PATCH` one side to null before
  archiving either.
- **Vehicles always block; inactive drivers and users do not.** A van is a
  physical object at the depot. An inactive person is history.
- **Completed, cancelled and disapproved trip tickets never block.** A branch with
  four hundred finished trips is still closable.

A blocked archive tells you exactly what is in the way, with counts.

---

## 4. Known gaps and follow-ups

Ordered roughly by value.

| Item | Where | Note |
| --- | --- | --- |
| Historical names are resolved client-side | `trip-tickets/repository.ts`, `job-orders` | **The important one.** The API never sends a branch with a ticket — `tripTicketInclude` has no `branch` — so the FE looks names up against a list. This work shipped archived-inclusive *display twins* (`['branches','all']`, `['departmentOffices','all']`) to keep historical records rendering. The durable fix is to add `branch: { select: { id, name } }` to `tripTicketInclude` and `jobOrderInclude`, carry it through the reshapers, and **delete both twins**. It would also let the FE stop discarding the `office`/`officeHead` the API already embeds. |
| `restoreOffice` deliberately checks only `branchId` | `organization/service.ts` | Its three siblings check both refs. Adding `officeHeadId` would **deadlock** a mutually-referencing archived pair — restoring either needs the other active. The asymmetry is load-bearing and now commented. Impact of leaving it is display-only. |
| Office Heads tab has no e2e coverage | `e2e/organization.spec.ts` | The only tab with two selects on its create form, and the only one never executed by a browser. |
| Orphaned `<label>` on selects, app-wide | repo-wide | Fixed in `record-dialog.tsx`; `add-trip-ticket/form.tsx` and others still lack a matching `id` on `SelectTrigger`, which is why the e2e needs a `role="group"` workaround. |
| `?includeArchived=true` untested on `/office-heads` | `organization/offices.test.ts` | If the repository ignored its argument for heads, every assertion still passes. |
| `'office head'` label pinned only by type | `lib/org-refs.test.ts` | The `branch` and `department office` labels are pinned by exact string; a mislabelled office-head branch would pass. Two lines. |
| Sibling-branch scoping test is partial | `organization/guard.test.ts` | It plants a vehicle, driver, office and head on the sibling branch — but not a user, live ticket or open job order, so a `branchId` scoping regression in those three checks stays green. |
| Three untested office-side behaviours | `organization/offices.test.ts` | Uniqueness spanning archived rows, `NOT_FOUND` on unknown id, `ALREADY_ARCHIVED` on double-archive. All have branch-side twins. |
| `reference.test.ts` tests organization routes | `reference/reference.test.ts` | Three of its four tests now exercise routes owned by `organization/router.ts`, including the only coverage of the office `head` embed. Delete `reference/` later and that coverage vanishes silently. |
| Error precedence is inconsistent | four services vs `organization/service.ts` | The four enforcement modules run `assertOrgRefsActive` *before* their NOT_FOUND check, so 409 shadows 404. `organization/service.ts` loads first. Both follow their own briefs; the branch is internally inconsistent. |
| `mode: 'insensitive'` compiles to `ILIKE` | `organization/service.ts` | So `%` and `_` in a name act as wildcards. False *positives* only (`Ops_HQ` would collide with `Ops HQ`); the DB index remains the true backstop, so no false negatives. |
| Non-UUID `:id` returns 500 | repo-wide | Prisma's `P2023` is unmapped and no module validates `:id`. Pre-existing, fix once with a param validator. |
| `IN_USE` breaks the repo's naming convention | `organization/guard.ts` | Everything else uses `USER_IN_USE`, `VEHICLE_IN_USE`, `STANDARD_IN_USE`. The generic code is what the FE matches on; "aligning" it later would silently degrade the blocker dialog with no compile error. |
| Resource labels live in three places | `record-dialog.tsx`, `resource-tab.tsx`, `mutation/organization.ts` | Three copies, three casings. |
| Shared `isPending` on Restore | `resource-tab.tsx` | One restore greys out every Restore button on the tab. |
| `<form>` wraps `DialogBody` | `record-dialog.tsx` | Breaks `flex-1`, so tall content clips instead of scrolling on a short viewport. |

---

## 5. Verification at handoff

- API: **341 tests across 45 files**, all passing (was 277/40 before this work)
- `pnpm --filter @mms/api typecheck`: clean
- `pnpm --filter @mms/web exec tsc -b`: clean
- `pnpm --filter @mms/web lint`: clean
- Playwright: **14/14** (was 10)
- 22 commits, `42f6c19..7ca9f93`, all unpushed

Nothing is running on the machine except Docker's `db` container — both the API
dev server and its watcher were stopped during this work.
