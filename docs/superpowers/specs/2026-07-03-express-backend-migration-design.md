# MMS Migration: Express + TypeScript Backend with PostgreSQL

**Date:** 2026-07-03
**Status:** Approved design, pending implementation plan
**Author:** Jess (with Claude)

## 1. Context & Goals

The Motorpool Management System is currently a React 19 + Vite SPA that talks
directly to Supabase (PostgREST, Auth, Storage, Realtime, one edge function).
All business logic — including every trip-ticket and job-order status
transition — runs client-side with the anon key.

**Goal:** move all business logic into a new Express.js + TypeScript API that
owns a new PostgreSQL database. The React frontend becomes a pure UI client.
Supabase is removed entirely.

Non-goals (out of scope for this migration):
- WebSocket/SSE push (polling stays; Socket.IO is a possible later upgrade)
- Migrating data from the hosted Supabase project (fresh DB + seed)
- Geofence UI/endpoints (tables are kept in the schema; no v1 API surface)
- Borrow-request workflow endpoints (table kept; the tools UI keeps writing
  borrow state onto the tool — see §6 tools)
- Email-based password reset (no email service in v1; admin resets passwords)
- Production deployment configuration (documented as guidance only)

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Repo structure | Monorepo, pnpm workspaces (restructure existing repo in place) |
| Backend | Express + TypeScript, feature-module architecture |
| Database | New PostgreSQL (Docker locally), Prisma ORM |
| Auth | Express-owned JWT: access token + rotating opaque refresh token, bcrypt |
| Live tracking | 5-second polling (`GET /gps/latest`) |
| File uploads | `multer` → API server disk, served at `/uploads/*` |
| ML | TS inference in Express; Flask retired; Python = offline training only |
| Data | Fresh DB, `prisma/seed.ts` demo data |
| Migration strategy | Contract-first, single FE cutover after API is complete |

## 3. Monorepo Layout

```
motorpool-management-system-web/     ← repo root becomes workspace root
├─ pnpm-workspace.yaml
├─ package.json                      root scripts (dev, build, lint, format)
├─ docker-compose.yml                postgres:16 (+ separate test database)
├─ apps/
│  ├─ web/                           existing FE moved here (git mv, history kept)
│  └─ api/                           new Express + TS app
├─ packages/
│  └─ shared/                        Zod contracts, inferred types, enums, roles
└─ tools/
   ├─ ml/                            Python training scripts + .pkl (moved out of public/ml)
   └─ firmware/                      ESP32/Arduino sketches (moved out of public/ml)
```

- Root `package.json` scripts: `pnpm dev` runs api + web concurrently;
  `pnpm --filter` for per-app commands.
- `apps/web` keeps its own `vite.config.ts`, `tsconfig`, and scripts; imports
  `@mms/shared` via workspace protocol.
- `apps/api` runs with `tsx watch` in dev, `tsc` build for prod.
- Prettier/ESLint configs hoisted to the root; per-app overrides where needed.

**Pre-step (before restructuring):** commit the uncommitted ML work currently
sitting on `production` (modified `src/lib/query/analytics.ts`,
`src/lib/utils/predictive-maintenance.ts`, untracked `src/lib/services/` and
`public/ml/*`). The `feat/standard-maintenance` branch is NOT merged as part
of this migration; the new DB schema already includes the maintenance-standards
tables, and the branch's UI can be reconciled later.

## 4. Database Schema (Prisma)

PostgreSQL 16, one Prisma schema in `apps/api/prisma/schema.prisma`,
migrations via `prisma migrate dev`. The Supabase schema ports with these
deliberate changes:

### 4.1 Auth tables (replaces Supabase Auth)

- **`users`** — `id (uuid pk)`, `email (unique)`, `password_hash`,
  `full_name`, `avatar_url?`, `status (active|inactive)`, `branch_id → branches`,
  timestamps. Absorbs Supabase `auth.users` + `user_profiles`.
  `users.branch_id` is the single authoritative branch assignment.
- **`user_roles`** — `user_id → users` (**unique** — exactly one role per
  user, matching the app's single-role model), `role_id → roles`,
  `assigned_at`. The denormalized `role` name column and the duplicate
  `branch_id` are dropped.
- **`roles`** — `id`, `name (unique)`, `description`. Seeded with:
  `admin`, `security_guard`, `evp_operations`, `driver`, `requester`.
- **`refresh_tokens`** — `id`, `user_id → users`, `token_hash`, `expires_at`,
  `revoked_at?`, `created_at`. Refresh tokens are **opaque random 256-bit
  values** (not JWTs); only a SHA-256 hash is stored. Rotation on every
  refresh; presenting an already-rotated/revoked token revokes **all** of that
  user's refresh tokens (reuse = possible theft) and returns 401.

### 4.2 Domain tables (ported, with FK fixes)

| Table | Changes from Supabase schema |
|---|---|
| `branches` | as-is (`id`, `name`, `location`) |
| `department_offices`, `office_heads` | as-is (mutual FKs kept, one side nullable to break the cycle) |
| `vehicles` | free-text `branch` column → `branch_id → branches` FK; `images text[]` → string array of upload paths; keeps `maintenance_standard_id`; keeps `latitude`, `longitude`, `last_location_update` (written by GPS ingest, §10) |
| `drivers` | `id` no longer doubles as auth uid → add `user_id → users` FK (nullable; a driver may not have a login); `assigned_vehicle_id` gets a real FK → vehicles |
| `trip_tickets` | drop ALL denormalized `allocation_*` columns and `fuel_allocation_id` (fuel data lives only in `fuel_allocations`; read endpoints flatten it back — see §6.1); drop `qr_path`/`pdf_path`/`attachment_path` (QR rendered client-side from ticket id); guard-gate fields kept as **user FKs**: `pre_trip_guard`, `pre_trip_checked_by`, `post_trip_guard`, `post_trip_checked_by → users` + `pre/post_trip_checked_at`; approval trail kept (`approved_by_admin → users`, `disapproved_reason`, `cancellation_reason`); `requested_by → users` |
| `fuel_allocations` | single source of truth; `trip_ticket_id` unique FK (1:1); `vehicle_id → vehicles` (populated by copying the ticket's vehicle at admin approval); `requested_by → users`; **one** EVP column: `approved_by_evp → users` (replaces the currently-written `approved_by_evp_operations`; the legacy never-written `approved_by_evp` FK-to-admins is superseded); `status` mirrors the ticket outcome (`pending`, `approved`, `disapproved`, `cancelled`) |
| `job_orders` | `spare_parts_used text[]` → join table `job_order_spare_parts(job_order_id, spare_part_id, quantity)` (rows written at the **note** transition, §6.2); `assigned_mechanic → drivers`, `noted_by`/`approved_by`/`requested_by → users` |
| `maintenance` | as-is, `vehicle_id → vehicles` |
| `maintenance_standards`, `maintenance_schedule_items`, `vehicle_maintenance_tracking`, `maintenance_completion_logs` | ported as-is (feat-branch feature's tables; `completed_by → users`) |
| `spare_parts` | as-is (`image` = upload path) |
| `tools` | as-is; `borrowed_by → drivers` |
| `borrow_requests` | ported (schema only, no v1 API — tools UI keeps direct borrow-field updates) |
| `gps_data` | as-is; `vehicle_id → vehicles`, `trip_id? → trip_tickets`; index on `(vehicle_id, created_at desc)` |
| `geofence_area`, `geofence_violation` | ported (schema only, no v1 API) |
| `vehicle_status_audit` | ported; written by a single shared `changeVehicleStatus` function in the vehicles service — ALL status flips (manual edit, trip check-out/in, job-order transitions) route through it so the audit never misses a change |

Dropped entirely: `admins` (folded into `users` + role; the FE's
`getAllAdmins` is served by `GET /users?role=admin`, §6), `user_profiles`,
Supabase views (`user_profiles_with_roles*` — replaced by API joins), and all
Supabase RPCs (`is_admin` family → role middleware; `calculate_next_due_date`
→ maintenance service logic; `safe_uuid`, `get_custom_jwt_claims` → obsolete).

Status/enum vocabularies become Postgres enums in Prisma, mirrored as Zod
enums in `packages/shared` (single source): vehicle status
(`available | unavailable | on_trip | out_of_service | under_maintenance`),
fuel type, driver status (`Active | Inactive | On Trip` — normalized to
lowercase snake_case in the new schema, with a FE display map; the driver
pages that render these values change accordingly, §8), tool status,
trip ticket status (`pending_admin_approval | pending_fuel_allocation_approval
| approved | in_progress | completed | cancelled | disapproved`), job order
status (`pending | assigned_mechanic | ongoing_repair | repaired`), repair
type, maintenance type.

## 5. Authentication & Authorization

- `POST /api/auth/login` — email + password → access JWT (15 min, returned in
  body) + refresh token (7 days, httpOnly cookie, hash stored in
  `refresh_tokens`). Cookie policy: `Secure; SameSite=None` when FE and API
  are on different origins (the documented deployment: Vercel + Railway);
  `SameSite=Lax` acceptable only for same-site setups. Driven by a
  `COOKIE_SAMESITE` env var, defaulting to `None` in production.
- `POST /api/auth/refresh` — rotates the refresh token (reuse detection per
  §4.1), returns new access JWT.
- `POST /api/auth/logout` — revokes the refresh token, clears cookie.
- `GET /api/auth/me` — current user + role + branch (replaces session +
  `user_metadata` + `useUserRole`; returns the same role-name strings the FE
  enums expect).
- Passwords: bcrypt, cost 12. Access JWT payload: `{ sub, email, role, branchId }`
  (single role per user, per §4.1).
- Password lifecycle: `POST /users` requires an admin-chosen initial password;
  `PATCH /users/:id/password` lets a user change their own (requires current
  password) and lets an admin set a new one for any user. Email-based reset is
  out of scope (§1). The dead FE exports `resetPassword` and `signUp` in
  `lib/supabase/auth.ts` (no live UI consumers) are removed, not ported.
- Middleware: `requireAuth` (verifies JWT, attaches `req.user`),
  `requireRole(...roles)` (403 on mismatch). Every domain router mounts
  `requireAuth` **except**: `/auth/login`, `/auth/refresh`, `/auth/logout`
  (cookie-only — a user with an expired access token must still be able to
  log out), `POST /gps/ingest` (device-key auth, §10), and the `/uploads`
  static route (public read, non-sensitive images).
- **Role guards are derived from actual data consumers, not from the FE's
  route `staticData.allowedRoles`** — the guard/EVP/driver dashboards all
  render inside `/dashboard` but read trip tickets, vehicles, drivers, and job
  orders. Read access matrix (writes stay admin-gated unless a transition in
  §6.1/§6.2 says otherwise):

| Read endpoint | admin | requester | evp_operations | security_guard | driver |
|---|---|---|---|---|---|
| trip-tickets | ✔ | ✔ (own) | ✔ | ✔ | ✔ (own trips) |
| vehicles | ✔ | ✔ | ✔ | ✔ | ✔ |
| drivers | ✔ | ✔ | ✔ | ✔ | ✔ (self) |
| job-orders | ✔ | ✔ (own) | ✔ | — | ✔ (own/assigned) |
| users, roles, branches, offices | ✔ | ✔ | ✔ | ✔ | ✔ (name lookups) |
| maintenance, spare-parts, tools | ✔ | ✔ | ✔ | — | ✔ |
| gps, analytics | ✔ | — | ✔ | — | — |

- User creation stays admin-only (`POST /users`); no self-registration
  endpoint.

## 6. API Surface

Base path `/api`. Feature modules under `apps/api/src/modules/<domain>/`,
each: `router.ts` → `controller.ts` (HTTP mapping) → `service.ts` (business
logic) → `repository.ts` (Prisma).

**Response conventions:**
- Collection endpoints always return `{ data, count }` (`count` = total rows
  matching the filter). `?page=` (1-indexed) and `?limit=` are optional;
  **when both are omitted the full result set is returned** (this serves the
  FE's `getAllTripTickets` / `getAllJobOrders` / `getAllMaintenances` callers,
  preserving their sort orders: trip tickets by `start_ts desc`, job orders by
  `target_date asc`, maintenance by `date desc`).
- Single resources return the bare object. Errors return
  `{ error: { code, message, details? } }` (§12).
- Detail/list responses embed the relations the FE currently renders (e.g.
  job orders embed a vehicle summary; trip tickets embed driver, vehicle,
  office, office head — mirroring today's `select` joins).

| Module | Endpoints |
|---|---|
| auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| users | `GET /users` (filter: `?role=` — serves the FE's `getAllAdmins` via `?role=admin`; responses include role name), `POST /users` (admin; **when role = driver, creates the linked `drivers` row with `user_id` set** — preserves the current signUp side effect, which is the app's only live driver-creation path), `PATCH /users/:id` (admin), `PATCH /users/:id/password` (self or admin), `DELETE /users/:id` (admin); avatar via multipart |
| roles | `GET /roles` |
| branches | `GET /branches` |
| offices | `GET /offices`, `GET /office-heads` |
| vehicles | `GET /vehicles`, `GET /vehicles/:id`, `POST /vehicles` (admin), `PATCH /vehicles/:id` (admin), `DELETE /vehicles/:id` (admin) (multipart for images) |
| drivers | `GET /drivers`, `GET /drivers/:id`, `POST /drivers` (admin), `PATCH /drivers/:id` (admin), `DELETE /drivers/:id` (admin) |
| trip-tickets | `GET /trip-tickets` (filters: `requestedBy`, `branchId`, `driverId`, `status`), `GET /trip-tickets/:id`, `POST /trip-tickets` (any authenticated role), `PATCH /trip-tickets/:id` (owner or admin; only while `pending_admin_approval`), `DELETE /trip-tickets/:id` (admin; not while `in_progress`); transitions in §6.1 |
| job-orders | `GET /job-orders` (**server-scoped**: admin and evp_operations see all; other roles see rows where `requested_by = caller` OR `assigned_mechanic` is the caller's driver row — resolved via `drivers.user_id`, since driver ids no longer equal user ids), `GET /job-orders/:id`, `POST /job-orders` (any authenticated role), `PATCH /job-orders/:id` (admin; only while `pending`; cannot change `status`), `DELETE /job-orders/:id` (admin); transitions in §6.2 |
| maintenance | CRUD `/maintenance` (admin writes); CRUD `/maintenance-standards` (+ nested schedule items, admin); `GET/POST /vehicles/:id/maintenance-tracking`, `POST /maintenance-tracking/:id/complete` (admin) |
| spare-parts | CRUD `/spare-parts` (admin writes; multipart image) |
| tools | CRUD `/tools` (admin writes; multipart image). `PATCH /tools/:id` **continues to accept borrow fields** (`status`, `borrowed_by`, `borrowed_date`, `estimated_return_date`) so the existing tools-inner borrow/return UI keeps working; no borrow-request endpoints in v1 |
| gps | `POST /gps/ingest` (device auth: `x-device-api-key` header, **fail-closed**: 500 if `GPS_DEVICE_API_KEY` unconfigured, 401 on mismatch), `GET /gps/latest` (newest point per vehicle via `DISTINCT ON`, joined with vehicle info), `GET /gps/history?vehicleId=` (required) `&tripId=&from=&to=&limit=` (limit default 500, max 5000 — no unbounded reads) |
| analytics | `GET /analytics/dashboard` (metric-card counts), `GET /analytics/predictive-maintenance`, `GET /analytics/association-rules` (full deduplicated ruleset — this is what the dashboard consumes; optional `?vehicleType=` filter) |

### 6.1 Trip-ticket status machine (server-enforced)

```
pending_admin_approval ──approve(admin)──▶ pending_fuel_allocation_approval
   │        │                                  │           │
   │        │                     approve-evp(evp_operations)
   │        │                                  │           │
   │        │                                  ▼           │
   │        │                              approved        │
   │        │                                  │ check-out(security_guard)
   │        │                                  ▼           │
   │        │                             in_progress      │
   │        │                                  │ check-in(security_guard)
   │        │                                  ▼           │
   │        │                              completed       │
   │        └────────disapprove(admin, reason)─┼───────────┘◀─disapprove(admin|evp, reason)
   │                                           ▼
   └──cancel(owner|admin, reason)──▶  disapproved / cancelled   [terminal]
```

Legal (transition, role, from-status) tuples:

| Transition | Role | Allowed from |
|---|---|---|
| `POST /trip-tickets/:id/approve` | admin | `pending_admin_approval` |
| `POST /trip-tickets/:id/approve-evp` | evp_operations | `pending_fuel_allocation_approval` |
| `POST /trip-tickets/:id/disapprove` | admin | both pending states |
| | evp_operations | `pending_fuel_allocation_approval` |
| `POST /trip-tickets/:id/cancel` | owning requester or admin | both pending states only (matches the FE; NOT from `approved`) |
| `POST /trip-tickets/:id/check-out` | security_guard | `approved` |
| `POST /trip-tickets/:id/check-in` | security_guard | `in_progress` |

- **approve (admin):** body carries the fuel-allocation payload (liters, fuel
  type, date, purpose, destination); creates the `fuel_allocations` row —
  copying the ticket's `vehicle_id` into it — and stamps `approved_by_admin`.
- **approve-evp:** stamps `approved_by_evp` on the allocation, allocation
  status → `approved`, ticket status → `approved`.
- **disapprove / cancel:** require `reason`; if an allocation row exists its
  status is set to `disapproved`/`cancelled` (the row is kept for history).
- **check-out / check-in:** driven by QR scan (QR value = ticket id); records
  the **guard's user id** (`pre/post_trip_guard` + `pre/post_trip_checked_by`,
  taken from the authenticated caller — the FE resolves display names from
  the users list, as today) and `pre/post_trip_checked_at` timestamps; flips
  the vehicle to `on_trip` / back to `available` via the shared
  `changeVehicleStatus` function (§4.2) inside the same transaction — if the
  vehicle is not in the expected prior status, the flip is skipped and logged
  (the ticket transition still succeeds).
- Every transition validates: current status is in the allowed-from set (else
  **409**), caller has the required role (else **403**). `cancelled`,
  `disapproved`, and `completed` are terminal.
- **Read contract:** `GET /trip-tickets` and `GET /trip-tickets/:id` embed the
  1:1 `fuel_allocations` row, and `lib/api/trip-tickets.ts` flattens it into
  the legacy `allocation_*` field names — so the EVP approval table
  (`ticket.allocation_purpose`) and the detail page's fuel-allocation section
  keep working unchanged.

### 6.2 Job-order status machine (server-enforced)

Matches the implemented flow — **admin notes first, then EVP approves**:

```
pending ──note(admin)──▶ assigned_mechanic ──approve(evp_operations)──▶ ongoing_repair ──complete-repair(admin)──▶ repaired
```

| Transition | Role | Allowed from | Writes |
|---|---|---|---|
| `POST /job-orders/:id/note` | admin | `pending` | `noted_by`, `date_of_request`, `target_date`, `assigned_mechanic`, spare parts used (rows into `job_order_spare_parts`) |
| `POST /job-orders/:id/approve` | evp_operations | `assigned_mechanic` | `approved_by`, `date_approved` |
| `POST /job-orders/:id/complete-repair` | admin | `ongoing_repair` | `repair_done` type, `remarks`, `actual_date_of_release` |

- **note** also flips the vehicle to `under_maintenance` (via
  `changeVehicleStatus`, skip-and-log on unexpected prior status).
- **complete-repair** decrements `spare_parts.quantity` per the
  `job_order_spare_parts` rows recorded at note — **this is new behavior**
  (today no inventory decrement exists anywhere); it runs in the same
  transaction, writes a `maintenance` history row, and flips the vehicle back
  to `available`.
- `PATCH /job-orders/:id` never changes `status`; all transitions go through
  the endpoints above (the FE's Note/Approve/CompleteRepair modals switch to
  these — §8).

## 7. Shared Contracts (`packages/shared`)

- One file per domain: Zod schemas for request bodies, query params, and
  response payloads; TS types inferred via `z.infer`. The API validates with
  these exact schemas (validation middleware); the FE imports the same types
  for its API client and forms (existing RHF+Zod forms migrate to the shared
  schemas where they match).
- Enums/roles/status constants move here from `apps/web/src/lib/enums.ts`
  (single source for FE, API, and Prisma enum mirrors), including the driver
  status display map (§4.2).
- No runtime coupling beyond Zod: the package is plain TS, built with `tsc`,
  consumed via workspace alias `@mms/shared`.

## 8. Frontend Migration (the cutover)

- New `apps/web/src/lib/api/client.ts`: thin `fetch` wrapper — base URL from
  `VITE_API_URL`, attaches `Authorization: Bearer <access token>` from memory,
  `credentials: 'include'` for the refresh cookie, **single-flight
  auto-refresh** (one shared in-flight refresh promise; concurrent 401s — e.g.
  the 5-second GPS poll plus page queries — wait on it rather than racing the
  rotating refresh token; retry once after refresh; on refresh failure clear
  auth state and route to `/login`), `{ data, count }` /bare-object envelope
  handling, typed by shared contracts.
- Each `lib/supabase/<domain>.ts` is replaced by `lib/api/<domain>.ts`
  exporting **the same function names, with payload types updated from
  `@mms/shared`** (signatures stay call-compatible; the `apps/web` TS build is
  the gate). `lib/query/*`, `lib/mutation/*`, and components stay untouched,
  **with these exceptions**:
  - `AuthProvider` — access-token-in-memory + `GET /auth/me` on boot + silent
    refresh; same context shape (`user`, `loading`) so consumers don't change.
    `routes/index.tsx`'s `beforeLoad` switches from
    `supabase.auth.getSession()` to the new auth state.
  - `lib/api/auth.ts` drops the dead `resetPassword`/`signUp` exports (§5).
  - `lib/query/offices.ts` — embeds Supabase queries directly today (no
    layer-1 file); rewired to `GET /offices` / `GET /office-heads`.
  - `lib/query/gps.ts` — the live `subscribeToGpsUpdates` realtime effect is
    removed; polling only.
  - `lib/query/analytics.ts` — client-side inference + the Flask `ml-api.ts`
    client are deleted; hooks become thin calls to the `/analytics` endpoints.
  - `lib/mutation/user-management.ts` — avatar upload switches from
    `supabase.storage` to multipart `POST /users`; the empty `onSuccess` bug
    is fixed to invalidate `['allUsers']`.
  - Trip-ticket transition callers — role views switch from generic
    `useUpdateTripTicket` writes to the dedicated transition mutations; the
    requester cancel-button visibility drops the `disapproved` case (terminal
    per §6.1).
  - **Job-order transition callers** — the Note/Approve/CompleteRepair modals
    switch to `POST /job-orders/:id/note|approve|complete-repair`; the
    spare-parts selection in the Note modal submits `{ sparePartId, quantity }`
    pairs (join table, §4.2) instead of name strings.
  - Vehicle forms/display — `branch` free-text becomes a `branch_id` select;
    driver status rendering uses the display map (§4.2).
  - QR display — rendered client-side with `react-qr-code` from the ticket id
    (no stored SVG).
  - Dashboard GPS demo — posts simulated points to `POST /gps/ingest` with a
    dev device key instead of inserting rows via Supabase.
- Final cleanup: remove `@supabase/*` packages, `src/lib/supabase/`,
  `src/lib/services/ml-api.ts`, `supabase/` directory (edge function +
  config), `public/ml/`, the `gen-types` script, and the AuthProvider's
  debug `console.log`s.

## 9. File Uploads

- `multer` disk storage → `apps/api/uploads/<domain>/<timestamped-name>`;
  path stored in DB (relative), served by `express.static` at `/uploads`
  (public read; images are non-sensitive) with
  `Cross-Origin-Resource-Policy: cross-origin` so the cross-origin FE can
  embed the images despite helmet's same-origin default.
- Applies to: vehicle images (multi), spare-part image, tool image, user
  avatar. Size limit 5 MB, mimetype allowlist (jpeg/png/webp).
- `uploads/` is gitignored; a Docker volume/persistent disk in deployment.

## 10. GPS & Tracking

- `POST /api/gps/ingest` replaces the Supabase edge function. Auth via
  `x-device-api-key` checked against `GPS_DEVICE_API_KEY` env var —
  **fail-closed** (the current edge function silently accepts everything when
  the secret is unset). Inserts `gps_data` and updates the vehicle's
  `latitude/longitude/last_location_update` (columns kept in §4.2).
- `GET /api/gps/latest` returns the newest point per vehicle
  (`SELECT DISTINCT ON (vehicle_id) ... ORDER BY vehicle_id, created_at DESC`),
  joined with vehicle info — fixes the current unbounded
  fetch-all-rows-and-reduce-in-JS pattern. Requires a user JWT (as does
  `/gps/history`); only `/gps/ingest` uses device-key auth.
- FE polls `GET /gps/latest` every 5 s (same UX as today). The ESP32 sketch
  (moved to `tools/firmware/`) gets its URL updated to the API host.
- The dead `vehicle-tracking` realtime code and unused `VehicleSimulator`
  class are deleted during cutover, not ported.

## 11. Analytics & ML

- Port to `apps/api/src/modules/analytics/`:
  - Feature extraction (`KM_SINCE_LAST_MAINT`, `AVG_DAILY_KM`,
    `MAINT_FREQ_12M`) — currently duplicated in two FE files; single service
    implementation.
  - Random Forest inference from `rf_maintenance_model.json` (already TS
    logic; model JSON becomes a private API asset in `apps/api/src/assets/`).
  - Rule-based fallback scoring (used only if the model file is
    missing/invalid) with ONE set of risk thresholds (resolves the current
    0.65/0.40 vs 0.70/0.45 FE/Flask mismatch — adopt the Flask values
    0.70/0.45 as canonical).
  - Apriori association-rule mining: transactions are built from
    `job_order_spare_parts` rows mapped to spare-part names (replacing the
    free-text `spare_parts_used` strings). `GET /analytics/association-rules`
    returns the full deduplicated ruleset the dashboard table renders
    (today's `useSparePartsAssociations` aggregates all rules — there is
    deliberately no per-type-only endpoint).
- Flask API, `.pkl` loading, and the health-check/fallback ladder are retired.
  `tools/ml/` keeps the Python training scripts; retraining regenerates
  `rf_maintenance_model.json` (the `mms_randomfiorest.py` filename typo gets
  fixed in the move).

## 12. Error Handling & Logging

- Central error middleware; consistent envelope
  `{ error: { code, message, details? } }`.
- Mapping: Zod validation → 400; missing/invalid JWT → 401; role mismatch →
  403; not found → 404; status-machine violation / stale state → 409;
  unexpected → 500 (logged, generic message).
- `AppError` class with `statusCode` + `code`; services throw it, controllers
  never try/catch except at the middleware boundary.
- Logging: `pino` + `pino-http` (request logs in dev, JSON in prod).

## 13. Testing

- **API:** Vitest + Supertest. Integration tests per module against a
  dedicated test database (second DB in docker-compose; `prisma migrate
  deploy` + truncate between suites). Priority coverage: auth (login/refresh/
  rotation/reuse-revocation/logout), role guards per §5 matrix, trip-ticket
  status machine (every legal transition + every illegal (status, role) pair →
  409/403), job-order note→approve→complete flow + spare-part decrement
  transaction, GPS ingest auth (fail-closed), `GET /gps/latest` correctness.
- **Shared:** unit tests for the ML scoring (golden-value tests against known
  feature inputs) and Apriori mining.
- **FE:** no new test infrastructure in this migration (unchanged surface);
  manual smoke checklist per page during cutover.

## 14. Seed Data (`prisma/seed.ts`)

- 5 roles; 2 branches; 3 offices + office heads.
- One user per role with known credentials (e.g. `admin@mms.local` /
  `Password123!` pattern), plus 2 extra drivers.
- 6 vehicles across statuses; 5 drivers (3 linked to user accounts).
- Spare parts (10), tools (6, one borrowed), maintenance standards (1 set with
  schedule items), maintenance history rows.
- Trip tickets in every status (one per stage of the machine); fuel
  allocations only for tickets at/after `pending_fuel_allocation_approval`
  (earlier states have none by construction, §6.1); 3 job orders across
  statuses with `job_order_spare_parts` rows; ~50 GPS points along a plausible
  route for 2 vehicles.
- Idempotent: `upsert` by natural keys so re-seeding is safe.

## 15. Build Order

1. **Repo prep:** commit WIP on `production`; restructure to monorepo
   (`git mv` FE into `apps/web`, sketches/scripts into `tools/`, workspace
   config, root tooling); verify FE still runs against Supabase unchanged.
2. **Scaffold:** `apps/api` skeleton (Express, tsx, pino, error middleware),
   `packages/shared` (enums moved), docker-compose Postgres, Prisma schema +
   initial migration + seed.
3. **Auth module** + middleware + **uploads infrastructure** (multer +
   static serving — needed by the users module's avatar upload) + tests.
4. **Domain modules** in dependency order: branches/roles/offices/users →
   vehicles → drivers → spare-parts/tools → maintenance (+standards) →
   job-orders → trip-tickets/fuel-allocations → GPS → analytics/ML.
5. **FE cutover:** api client + AuthProvider swap + per-domain `lib/api/*`
   swap + the §8 exception list.
6. **Cleanup:** remove Supabase deps/dirs/`public/ml`; update README; smoke
   test every page per the manual checklist.

Each phase compiles, passes tests, and is committed before the next begins.

## 16. Deployment Guidance (non-binding)

- FE: Vercel, root directory `apps/web` (existing `vercel.json` SPA rewrite
  moves with it).
- API + Postgres: Railway (or Render) with a persistent volume mounted at the
  uploads path. Env: `DATABASE_URL`, `JWT_SECRET`, `GPS_DEVICE_API_KEY`,
  `CORS_ORIGIN`, `COOKIE_SAMESITE`, `UPLOADS_DIR`, `PORT`. (No refresh-token
  secret — refresh tokens are opaque, §4.1.)
- CORS: allowlist the Vercel origin, `credentials: true`; refresh cookie
  `SameSite=None; Secure` in this cross-site topology (§5).

## 17. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Working tree WIP conflicts with `feat/standard-maintenance` (both touch `predictive-maintenance.ts`) | Commit WIP first; feat branch reconciled after migration, not during |
| FE hook signatures drift during swap | Contract: `lib/api/<domain>.ts` keeps names call-compatible with types from `@mms/shared`; TS compile of `apps/web` is the gate |
| Auth swap breaks role-gated routing | `/auth/me` returns the same role names the FE enums expect; `useUserRole` reimplemented on top of it with the same return shape |
| Status-machine endpoints reject flows the UI actually performs | Transition tables in §6.1/§6.2 were adversarially verified against the implemented FE behavior (job-order order corrected: note→approve; disapprove/cancel predecessor sets pinned) |
| Access-token expiry under the 5s GPS poll causes refresh races | Single-flight refresh in `client.ts` (§8) |
| Seed drift vs schema | Seed lives next to schema; CI-less project, so `pnpm --filter api verify` script runs migrate + seed + tests locally |
