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

## Backend migration

The frontend is being migrated from talking to Supabase directly to talking to the `apps/api` Express backend. See the design spec at [`docs/superpowers/specs/2026-07-03-express-backend-migration-design.md`](docs/superpowers/specs/2026-07-03-express-backend-migration-design.md) for scope and rollout plan.

## Other scripts

```bash
pnpm build   # build shared, api, and web
pnpm test    # run tests where present (currently apps/api)
pnpm lint    # lint where present
```
