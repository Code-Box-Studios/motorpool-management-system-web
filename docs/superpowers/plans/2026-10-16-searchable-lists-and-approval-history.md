# Searchable Lists and Approval History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` after the user selects an execution method. Follow the selected workflow task by task.

**Goal:** Add consistent, full-result search to every record list, improve approval history navigation with a table, and remove the Spare Parts table thumbnail.

**Architecture:** Add a validated `search` query value to the paginated list contracts and pass it through the existing list-control, API-client, query-hook, and page layers. Apply search in Prisma before pagination for paginated APIs, and filter already-loaded full lists in the browser. Reuse the existing approval data and actions while presenting history as a table.

**Tech Stack:** TypeScript, React, TanStack Router, TanStack Query, Express, Prisma, PostgreSQL, Zod.

**Spec:** `docs/superpowers/specs/2026-10-16-list-search-and-approval-history-design.md`

## Global Constraints

- Search every record list named in the spec, including Organization resources and approval/request histories.
- Apply search before server pagination and calculate counts from filtered results.
- Preserve each list's authorization scope, existing filters, sort order, and approval actions.
- Match partial text without case sensitivity against visible human-readable fields.
- Share search state between Table and Grid; reset to page 1 when the term changes.
- Keep Spare Parts images in Grid and detail views; remove the thumbnail from the table only.
- Add no dependencies or unrelated refactors.

## Review Focus

- A partial, differently cased match on a record beyond page 1 appears, and the result count and pagination reflect the filtered set. Verify in Task 4.
- A restricted user sees only records already allowed by their role after search. Verify in Tasks 2–3.
- Search combines with existing filters and sorting without widening results or changing order. Verify in Tasks 2–4.
- Clearing search restores the full list, resets to page 1, and preserves the term when switching Table/Grid. Verify in Tasks 1 and 4.
- Approval rows retain decision details and links; pending actions still work; Spare Parts table has no thumbnail. Verify in Tasks 5–6.

---

### Task 1: Shared search contract and controls

**Files:**

- Modify: `packages/shared/src/contracts/common.ts`
- Modify: `packages/shared/src/contracts/drivers.ts`
- Modify: `packages/shared/src/contracts/job-orders.ts`
- Modify: `packages/shared/src/contracts/maintenance.ts`
- Modify: `packages/shared/src/contracts/spare-parts.ts`
- Modify: `packages/shared/src/contracts/tools.ts`
- Modify: `packages/shared/src/contracts/tracker-devices.ts`
- Modify: `packages/shared/src/contracts/trip-tickets.ts`
- Modify: `packages/shared/src/contracts/users.ts`
- Modify: `packages/shared/src/contracts/vehicles.ts`
- Modify: `apps/web/src/hooks/use-list-controls.ts`
- Create: `apps/web/src/components/shared/list-search-input.tsx`

**Interfaces:**

- Produces a validated optional `search` value for the paginated list contracts.
- `useListControls()` exposes `search` and `setSearch(value: string)`; `setSearch` resets the current page to 1.
- `ListSearchInput` accepts a current string and change callback, trims input, and debounces updates.

- [x] Add a shared Zod search-value schema with trimming; merge it only into the record-list schemas named above.
- [x] Extend `useListControls` with search state and page reset behavior while preserving current sort and filter state.
- [x] Create the accessible, reusable search input with a label, clear action, and debounced updates.
- [x] Run `pnpm --filter @mms/shared typecheck` and `pnpm --filter @mms/web build`.

### Search field decisions

- Drivers: name, email, license number/type, phone, displayed status.
- Vehicles: make/model, plate, branch, displayed status, fuel type.
- Spare parts: name, brand, description, stock label.
- Tools: name, description, borrower name, displayed status.
- Trackers: IMEI, label, SIM number, assigned vehicle label, lifecycle status.
- Maintenance: description, maintenance type, vehicle label.
- Job orders: displayed reference, incident details, vehicle label, mechanic, displayed status, repair type.
- Trip tickets: displayed reference, destination, purpose, vehicle label, driver, branch, displayed status.
- Users: name, email, branch, role, displayed status.
- Organization and full-data histories: the displayed identifying text, with no numeric metrics or dates.
- Reference substring matching projects scoped integer references on numeric searches before pagination.
- Approval history searches the complete merged result on the server before pagination.

### Task 2: Fleet and inventory API search

**Files:**

- Modify controllers, services, and repositories under:
  - `apps/api/src/modules/drivers/`
  - `apps/api/src/modules/spare-parts/`
  - `apps/api/src/modules/tools/`
  - `apps/api/src/modules/tracker-devices/`
  - `apps/api/src/modules/vehicles/`

**Interfaces:**

- Each existing list service accepts its typed query, including `search`.
- Each repository composes search conditions with existing filters and permissions, then uses the combined `where` for both `findMany` and `count`.

- [x] Apply the field decisions above for drivers, spare parts, tools, trackers, and vehicles.
- [x] Add case-insensitive partial Prisma conditions without removing existing where clauses or order-by behavior.
- [x] Verify with local API queries that a partial match returns records and counts reflect the filtered result set.
- [x] Run `pnpm --filter @mms/api typecheck`.

### Task 3: Operations and user API search

**Files:**

- Modify controllers, services, and repositories under:
  - `apps/api/src/modules/job-orders/`
  - `apps/api/src/modules/maintenance/`
  - `apps/api/src/modules/trip-tickets/`
  - `apps/api/src/modules/users/`

**Interfaces:**

- Each existing list service accepts its typed query, including `search`.
- Repository search is combined with current filters and role-scoped conditions before pagination and counting.

- [x] Apply the field decisions above for job orders, maintenance, trip tickets, and users.
- [x] Preserve list-specific permission filters and apply `search` to the same query used for page data and count.
- [x] Verify a match on a later page, an empty result, and a role-restricted result through the local API.
- [x] Run `pnpm --filter @mms/api typecheck`.

### Task 4: Wire search through web list clients and pages

**Files:**

- Modify API clients and query hooks:
  - `apps/web/src/lib/api/drivers.ts`, `apps/web/src/lib/query/drivers.ts`
  - `apps/web/src/lib/api/job-orders.ts`, `apps/web/src/lib/query/job-orders.ts`
  - `apps/web/src/lib/api/maintenance.ts`, `apps/web/src/lib/query/maintenance.ts`
  - `apps/web/src/lib/api/spare-parts.ts`, `apps/web/src/lib/query/spare-parts.ts`
  - `apps/web/src/lib/api/tools.ts`, `apps/web/src/lib/query/tools.ts`
  - `apps/web/src/lib/api/tracker-devices.ts`, `apps/web/src/lib/query/tracker-devices.ts`
  - `apps/web/src/lib/api/trip-tickets.ts`, `apps/web/src/lib/query/trip-tickets.ts`
  - `apps/web/src/lib/api/user-management.ts`, `apps/web/src/lib/query/user-management.ts`
  - `apps/web/src/lib/api/vehicles.ts`, `apps/web/src/lib/query/vehicles.ts`
- Modify list pages:
  - `apps/web/src/components/pages/drivers/index.tsx`
  - `apps/web/src/components/pages/job-order/index.tsx`
  - `apps/web/src/components/pages/maintenance/index.tsx`
  - `apps/web/src/components/pages/spare-parts/index.tsx`
  - `apps/web/src/components/pages/tools/index.tsx`
  - `apps/web/src/components/pages/tracker-devices/index.tsx`
  - `apps/web/src/components/pages/trip-tickets/index.tsx`
  - `apps/web/src/components/pages/user-management/index.tsx`
  - `apps/web/src/components/pages/vehicles/index.tsx`

**Interfaces:**

- Every list API client and query key carries the same `search` value as the list page.
- Every list page renders `ListSearchInput` above its view switch or table and passes filtered data to both views.

- [x] Forward `search` through each API client and include it in each query key so different terms cannot share cached results.
- [x] Add the shared input to all nine paginated list pages and bind it to `useListControls`.
- [x] Confirm Table and Grid show the same filtered rows and switching views retains the current search.
- [x] Verify later-page matches, page reset, clear behavior, empty state, and a combination with an existing filter/sort at `http://localhost:5174`.
- [x] Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

### Task 5: Organization lists and approval histories

**Files:**

- Modify `apps/web/src/components/pages/organization/resource-tab.tsx`
- Modify `apps/web/src/components/pages/job-order/evp-approval/queue.tsx`
- Modify `apps/web/src/components/pages/job-order/evp-approval/history.tsx`
- Modify `apps/web/src/components/pages/trip-tickets/requester-dashboard/index.tsx`
- Modify `packages/shared/src/contracts/approvals.ts`
- Modify `apps/api/src/modules/approvals/controller.ts`
- Modify `apps/api/src/modules/approvals/service.ts`
- Modify `apps/api/src/modules/approvals/repository.ts`
- Modify `apps/web/src/lib/api/approvals.ts`
- Modify `apps/web/src/lib/query/approvals.ts`

**Interfaces:**

- Organization, pending approval, and requester history searches filter the full data set already loaded by each page.
- Approval-history search is added to its query contract. On search, read the complete sources and filter their merged records on the server before pagination and count calculation.

- [x] Add the shared search input and full-set filtering to Organization resource tables, pending approval groups, and requester trip history.
- [x] Add approval-history search to the contract, client, query key, service, and repository; preserve role scoping and newest-first ordering.
- [x] Replace approval-history cards with a table for type/reference, request, vehicle, outcome, approver/date, reason or fuel details, and the existing view link.
- [x] Verify both approval tabs, search behavior, table details, links, pending approve/decline actions, and requester history at `http://localhost:5174`.
- [x] Run `pnpm --filter @mms/api typecheck`, `pnpm --filter @mms/web build`, and `pnpm lint`.

### Task 6: Remove the Spare Parts table thumbnail

**Files:**

- Modify `apps/web/src/components/pages/spare-parts/index.tsx`

**Interfaces:**

- The Part table cell renders the part name without an image. Grid cards and detail views continue to render the image.

- [x] Remove the thumbnail from the table row while keeping all current text columns.
- [x] Verify the table has no row images and Grid/detail views still show part images at `http://localhost:5174`.
- [x] Run `pnpm --filter @mms/web build`.

### Final verification

- [x] Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- [x] In the browser, verify all named list screens, cross-page search, table/grid consistency, no-match and clear states, approval history table, approval actions, and Spare Parts image behavior.

## Completion evidence

- `pnpm test`: 525 passing tests (487 API, 28 GPS gateway, 10 shared).
- `pnpm build`, `pnpm lint`, and `pnpm typecheck`: passed.
- `E2E_WEB_URL=http://localhost:5174 pnpm --filter @mms/web exec playwright test e2e/list-search.spec.ts --reporter=line`: 7 passed.
- `E2E_WEB_URL=http://localhost:5174 pnpm --filter @mms/web exec playwright test e2e/smoke.spec.ts --reporter=line`: 6 passed.
- Browser inspection found 10 Spare Parts table rows and zero row images.
- Independent review identified partial-reference matching, omitted driver license-type search, and Grid selection resetting during search. All three were fixed and covered by failing-then-passing regression checks.

## Execution decisions

- Kept the running checkout on a feature branch so local review uses the same app and unrelated untracked files remain separate.
- Used integration tests for pagination, result counts, literal input, and authorization; used browser checks for presentation and navigation.
- Treating the license-type omission and Grid reset as important ensured the requested fields remain searchable and changing search does not change the selected view.
- Numeric searches project only scoped reference numbers and match rendered reference substrings on the server before pagination. This keeps exact substring behavior without schema changes; very large fleets would benefit from moving that projection to SQL.
- Approval history retains its existing fleet-scale in-memory merge. Searches load the complete source records and filter the merged result before pagination.
