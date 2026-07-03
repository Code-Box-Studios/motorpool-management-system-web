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

## Backend migration

The frontend is being migrated from talking to Supabase directly to talking to the `apps/api` Express backend. See the design spec at [`docs/superpowers/specs/2026-07-03-express-backend-migration-design.md`](docs/superpowers/specs/2026-07-03-express-backend-migration-design.md) for scope and rollout plan.

## Other scripts

```bash
pnpm build   # build shared, api, and web
pnpm test    # run tests where present (currently apps/api)
pnpm lint    # lint where present
```
