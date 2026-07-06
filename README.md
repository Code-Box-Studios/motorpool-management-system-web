# Motorpool Management System

A pnpm-workspace monorepo for managing a motorpool: vehicles, drivers, trip tickets, fuel allocation, maintenance, and GPS tracking.

## Monorepo layout

| Path              | Description                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `apps/web`         | React (Vite) frontend, port `5173`. Currently talks directly to Supabase — the Express API migration below is in progress. |
| `apps/api`         | Express + Prisma backend skeleton, port `3000`.                      |
| `packages/shared`  | Shared domain enums/types consumed by both apps.                     |
| `tools/`           | Standalone tooling (firmware, ML) outside the pnpm workspace apps.   |

## Prerequisites

- Node.js `>=20`
- [pnpm](https://pnpm.io/)
- Docker (for the local Postgres database)

## Quickstart

```bash
docker compose up -d           # start Postgres
pnpm install                   # install workspace dependencies
cp apps/api/.env.example apps/api/.env  # copy env config (defaults match the local Docker setup)
pnpm db:migrate && pnpm db:seed  # apply migrations and seed demo data
pnpm dev                       # run api + web together
```

- API: http://localhost:3000 (health check at `/api/health`)
- Web: http://localhost:5173 (falls back to the next free port, e.g. `5174`, if taken)

## Seeded accounts

The seed script (`pnpm db:seed`) creates one user per role, all with the password `Password123!`:

| Email                          | Role            |
| ------------------------------- | --------------- |
| `admin@mms.local`               | Admin           |
| `security_guard@mms.local`      | Security Guard  |
| `evp_operations@mms.local`      | EVP Operations  |
| `driver@mms.local`              | Driver          |
| `requester@mms.local`           | Requester       |

## API

### Auth endpoints

| Endpoint                | Description                                                              |
| ------------------------ | -------------------------------------------------------------------------- |
| `POST /api/auth/login`   | Authenticate with `email` + `password`; returns an access token + user.  |
| `POST /api/auth/refresh` | Exchange the refresh cookie for a new access token (rotates the cookie). |
| `POST /api/auth/logout`  | Revoke the current refresh token and clear the cookie.                   |
| `GET /api/auth/me`       | Return the authenticated user (requires `Authorization: Bearer <token>`).|

Login and refresh set an httpOnly `mms_refresh` cookie (7-day expiry) and return a short-lived (15-minute) access token in the response body — send it as `Authorization: Bearer <accessToken>` on subsequent requests.

### Reference endpoints

Read-only lookups, any authenticated role, name-ascending.

| Endpoint               | Description                                          |
| ----------------------- | ------------------------------------------------------ |
| `GET /api/roles`        | List roles.                                           |
| `GET /api/branches`     | List branches.                                        |
| `GET /api/offices`      | List department offices; embeds `head`.               |
| `GET /api/office-heads` | List office heads.                                    |

### User endpoints

| Endpoint                         | Description                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/users`                 | List users (any authenticated role); optional `?role=` filter (e.g. `?role=admin`).            |
| `POST /api/users`                 | Create a user (admin). Multipart form; optional `avatar` file field. Creating a `driver`-role user also creates (or links, if a matching personnel record already exists) a row in `/api/drivers`. |
| `PATCH /api/users/:id`            | Update a user (admin). Multipart form; optional `avatar` file field.                          |
| `PATCH /api/users/:id/password`   | Change a password: the user themselves (requires `currentPassword`) or an admin acting on another user (no `currentPassword` needed). Revokes all of that user's refresh tokens. |
| `DELETE /api/users/:id`           | Delete a user (admin). 400 `CANNOT_DELETE_SELF` if targeting your own account.                 |

### Driver endpoints

CRUD over driver personnel records. `userId` is `null` unless the driver was created via `POST /api/users` with `roleId` set to the driver role.

| Endpoint                  | Description                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/drivers`         | List drivers (any authenticated role). A caller with the `driver` role only sees their own record. |
| `GET /api/drivers/:id`     | Fetch a driver by id (same per-role scoping; a foreign id 404s rather than 403s).             |
| `POST /api/drivers`        | Create a driver (admin).                                                                     |
| `PATCH /api/drivers/:id`   | Update a driver (admin).                                                                      |
| `DELETE /api/drivers/:id`  | Delete a driver (admin).                                                                      |

### Vehicle endpoints

| Endpoint                  | Description                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/vehicles`        | List vehicles (any authenticated role, spec §5).                                             |
| `GET /api/vehicles/:id`    | Fetch a vehicle by id (any authenticated role).                                               |
| `POST /api/vehicles`       | Create a vehicle (admin). Multipart form; optional `images` file field (multiple, up to 10). |
| `PATCH /api/vehicles/:id`  | Update a vehicle (admin). Multipart form; optional `images` file field — new uploads are added to the existing set minus any `removedImages`. Writes a `vehicle_status_audit` row when `status` changes. |
| `DELETE /api/vehicles/:id` | Delete a vehicle (admin). 409 `VEHICLE_IN_USE` if referenced by a maintenance/tracking row.   |

### Trip-ticket endpoints

| Endpoint                              | Description                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/trip-tickets`               | List trip tickets, most recent start time first (`startTs` desc; any authenticated role). Optional `?requestedBy=`, `?branchId=`, `?driverId=`, `?status=` filters. A `requester` caller only sees tickets they submitted; a `driver` caller only sees tickets assigned to their linked driver record (via `drivers.userId`) — filters narrow within that scope, they can't widen it. |
| `GET /api/trip-tickets/:id`           | Fetch a trip ticket by id (same per-role scoping as list; an out-of-scope id 404s rather than 403s). |
| `POST /api/trip-tickets`              | Create a trip ticket (any authenticated role); always born `pending_admin_approval` — status is never client-chosen. |
| `PATCH /api/trip-tickets/:id`         | Update a trip ticket (its own requester, or admin); only while still `pending_admin_approval`. |
| `DELETE /api/trip-tickets/:id`        | Delete a trip ticket (admin). Its fuel allocation cascades.                                   |
| `POST /api/trip-tickets/:id/approve`  | Admin approve: `pending_admin_approval` → `pending_fuel_allocation_approval`. Body carries the fuel-allocation fields (`liters`, `fuelType`, `date`, `purpose`, `tripTo`) — this is where the fuel allocation is created, embedded on the ticket (`status: pending`). |
| `POST /api/trip-tickets/:id/approve-evp` | EVP Operations approve: `pending_fuel_allocation_approval` → `approved`; stamps the fuel allocation `approved` + `approvedByEvpId`. |
| `POST /api/trip-tickets/:id/disapprove` | Admin (from either pending state) or EVP Operations (from `pending_fuel_allocation_approval` only); body requires `reason`. Mirrors `disapproved` onto the fuel allocation if one exists. |
| `POST /api/trip-tickets/:id/cancel`   | Owning requester or admin, from either pending state; body requires `reason`. Mirrors `cancelled` onto the fuel allocation if one exists. |
| `POST /api/trip-tickets/:id/check-out` | Security guard: `approved` → `in_progress`; records the pre-trip guard + timestamp and flips the vehicle `available` → `on_trip`. |
| `POST /api/trip-tickets/:id/check-in` | Security guard: `in_progress` → `completed`; records the post-trip guard + timestamp and flips the vehicle `on_trip` → `available`. |

### Spare-parts endpoints

| Endpoint                     | Description                                                              |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `GET /api/spare-parts`        | List spare parts, newest-first (any role except `security_guard`).      |
| `GET /api/spare-parts/:id`    | Fetch a spare part by id (same role gate).                              |
| `POST /api/spare-parts`       | Create a spare part (admin). Multipart form; optional `image` file field. |
| `PATCH /api/spare-parts/:id`  | Update a spare part (admin). Multipart form; optional `image` file field. |
| `DELETE /api/spare-parts/:id` | Delete a spare part (admin).                                             |

### Tool endpoints

| Endpoint                | Description                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/tools`         | List tools, newest-first (any role except `security_guard`).                                 |
| `GET /api/tools/:id`     | Fetch a tool by id (same role gate).                                                          |
| `POST /api/tools`        | Create a tool (admin). Multipart form; optional `image` file field.                          |
| `PATCH /api/tools/:id`   | Update a tool (admin). Multipart form; optional `image` file field. Also used to borrow/return: set `status`, `borrowedById`, `borrowedDate`, `estimatedReturnDate` to record a borrow, or clear them (empty string coerces to `null`) to record a return. |
| `DELETE /api/tools/:id`  | Delete a tool (admin).                                                                        |

### Job-order endpoints

Repair workflow for a vehicle: request → note (assign mechanic + spare parts) → EVP approve → complete repair.

| Endpoint                                | Description                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `GET /api/job-orders`                   | List job orders, target-date ascending (`targetDate` asc); admin, requester, evp_operations, and driver roles — **not** security_guard, which gets a 403 on the whole router. Optional `?status=` filter. Admin/EVP see all; other roles see only orders they requested or that are assigned to their linked driver record (via `drivers.userId`). |
| `GET /api/job-orders/:id`               | Fetch a job order by id (same role gate + scoping; an out-of-scope id 404s rather than 403s). |
| `POST /api/job-orders`                  | Create a job order (admin/requester/evp_operations/driver); always born `pending`.            |
| `PATCH /api/job-orders/:id`             | Update a job order (admin); only while still `pending`.                                       |
| `DELETE /api/job-orders/:id`            | Delete a job order (admin). Its spare-parts join rows cascade.                                 |
| `POST /api/job-orders/:id/note`         | Admin note: `pending` → `assigned_mechanic`. Assigns a mechanic and replaces the job order's spare-parts join rows (`sparePartId` + `quantity`) with the noted set; flips the vehicle `available` → `under_maintenance`. |
| `POST /api/job-orders/:id/approve`      | EVP Operations approve: `assigned_mechanic` → `ongoing_repair`.                               |
| `POST /api/job-orders/:id/complete-repair` | Admin complete-repair: `ongoing_repair` → `repaired`. Decrements each noted spare part's inventory `quantity` by the noted amount (no stock floor — intentionally allowed to go negative as a reconciliation signal), writes a `repair`-type maintenance history row, and flips the vehicle `under_maintenance` → `available`. |

Transition note (applies to both trip-tickets and job-orders above): every transition verb is server-enforced — calling it from a status outside its allowed-from set 409s `INVALID_TRANSITION`, and calling it as the wrong role 403s. Trip-ticket `check-out`/`check-in` and job-order `note`/`complete-repair` are the points that also flip the vehicle's `status`.

### Maintenance endpoints (service history)

| Endpoint                       | Description                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/maintenance`           | List maintenance records, date-desc (any role except `security_guard`); optional `?vehicleId=` filter. |
| `GET /api/maintenance/:id`       | Fetch a maintenance record by id (same role gate).                                            |
| `POST /api/maintenance`          | Create a maintenance record (admin). `nextDue` is manually entered, not computed.              |
| `PATCH /api/maintenance/:id`     | Update a maintenance record (admin).                                                           |
| `DELETE /api/maintenance/:id`    | Delete a maintenance record (admin).                                                           |

### Maintenance-standards endpoints

| Endpoint                                             | Description                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/maintenance-standards`                       | List maintenance standards, each embedding its `scheduleItems` (any role except `security_guard`). |
| `GET /api/maintenance-standards/:id`                   | Fetch a standard by id, with its schedule items (same role gate).             |
| `POST /api/maintenance-standards`                      | Create a standard (admin), optionally with a nested `scheduleItems` array.     |
| `PATCH /api/maintenance-standards/:id`                 | Update a standard's `name`/`description` (admin).                             |
| `DELETE /api/maintenance-standards/:id`                | Delete a standard, cascading its schedule items (admin).                      |
| `POST /api/maintenance-standards/:id/schedule-items`   | Add a schedule item to a standard (admin): `taskName`, `intervalType` (`mileage`/`time`), and the matching `intervalMileage`/`intervalMonths`. |
| `DELETE /api/maintenance-standards/schedule-items/:itemId` | Remove a single schedule item (admin).                                     |

### Maintenance-tracking endpoints

Per-vehicle rows tracking each schedule item's next-due mileage/date, derived from a standard assigned to that vehicle.

| Endpoint                                            | Description                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/vehicles/:id/maintenance-tracking`            | List tracking rows for a vehicle, each with a derived `displayStatus` (`pending`/`due_soon`/`overdue`/`completed`, from the 30-day / 500 km thresholds), sorted overdue-first (any role except `security_guard`). |
| `POST /api/vehicles/:id/maintenance-tracking`           | Assign a `maintenanceStandardId` to a vehicle (admin); seeds one tracking row per schedule item. |
| `POST /api/maintenance-tracking/:id/complete`           | Complete a tracking row (admin): pass `completedMileage` (+ optional `notes`); logs the completion and recomputes `next_due` (`anchor + interval` — months via calendar `setMonth`, mileage additive). |

Read-access note: maintenance, spare-parts, and tools list/detail endpoints are readable by every role **except** `security_guard` (that role's dashboard doesn't surface them); vehicles remain readable by any authenticated role. All writes across these modules stay admin-only.

### GPS endpoints

| Endpoint                | Description                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST /api/gps/ingest`    | Ingest a GPS point (device auth — see below, **not** a user JWT). Body: `vehicleId`, optional `tripId`, `latitude`, `longitude`, optional `speed`/`heading`/`engineStatus`. Inserts the `gps_data` row and updates the vehicle's denormalized `latitude`/`longitude`/`lastLocationUpdate`, atomically. |
| `GET /api/gps/latest`     | Newest GPS point per vehicle, joined with a flattened vehicle summary (`make`/`model`/`licensePlate`/`status`). Admin/EVP Operations only. |
| `GET /api/gps/history`    | GPS history for one vehicle: `?vehicleId=` (required), optional `?tripId=`, `?from=`, `?to=`, `?limit=` (default 500, max 5000). Admin/EVP Operations only. |

`POST /api/gps/ingest` is device-authenticated, not user-authenticated: it requires an `x-device-api-key` header matching `GPS_DEVICE_API_KEY` and is **fail-closed** — if that env var is unset, every request fails with `500 GPS_NOT_CONFIGURED`; a missing or mismatched header when the key IS set returns `401 INVALID_DEVICE_KEY`. There's no way to accidentally leave ingest open.

### Analytics endpoints

| Endpoint                                    | Description                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/analytics/dashboard`                | Fleet status counts (`available`, `underMaintenance`, `onTrip`, `outOfService`, `total`) plus `completedTrips`. Returns a bare object, not `{ data, count }`. |
| `GET /api/analytics/predictive-maintenance`   | Per-vehicle risk assessment (`riskScore`, `priority`, `usedFallback`, plus the mileage/maintenance features used), highest-risk first. Falls back to a rule-based score if the ML model can't produce one. |
| `GET /api/analytics/association-rules`        | Spare-parts association rules mined from job-order history (Apriori); optional `?vehicleType=` filters job orders to a vehicle make first. |

GPS reads (`/gps/latest`, `/gps/history`) and all analytics endpoints are restricted to the `admin` and `evp_operations` roles.

### Pagination convention

Every list endpoint above returns `{ data, count }`, where `count` is the total matching row count (not the page size). Pass `?page` (1-indexed) and `?limit` to paginate; omit both query params to get the full result set in one response.

### Static uploads

Files under `UPLOADS_DIR` are served at `/uploads/*`.

### Environment variables

In addition to `DATABASE_URL`, `PORT`, and `CORS_ORIGIN`, `apps/api/.env` needs:

| Variable          | Description                                                                 |
| ------------------ | ----------------------------------------------------------------------------- |
| `JWT_SECRET`       | Secret used to sign access tokens (min 32 chars).                           |
| `COOKIE_SAMESITE`  | `lax` for local/same-site dev; set to `none` for cross-site deploys (e.g. Vercel FE ↔ Railway API) — this also forces `Secure` on the cookie. |
| `UPLOADS_DIR`      | Directory uploaded files are written to and served from (`/uploads/*`).     |
| `GPS_DEVICE_API_KEY` | Shared secret GPS devices send as `x-device-api-key` on `POST /api/gps/ingest`. Unset means ingest is closed (every request `500 GPS_NOT_CONFIGURED`), not open. |

## Backend migration

The frontend is being migrated from talking to Supabase directly to talking to the `apps/api` Express backend. See the design spec at [`docs/superpowers/specs/2026-07-03-express-backend-migration-design.md`](docs/superpowers/specs/2026-07-03-express-backend-migration-design.md) for scope and rollout plan.

## Other scripts

```bash
pnpm build   # build shared, api, and web
pnpm test    # run tests where present (currently apps/api)
pnpm lint    # lint where present
```
