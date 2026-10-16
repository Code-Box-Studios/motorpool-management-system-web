---
name: run-mms-locally
description: Use when starting, restarting, or checking the local Motorpool Management System, including requests to run the whole system, its web app and API, or its GPS gateway.
---

# Run MMS locally

Run commands from the repository root. Use checked-out configuration as the source of truth; the developer guide still contains earlier Supabase migration claims.

## Runtime services

| Service | Default address | Startup |
| --- | --- | --- |
| PostgreSQL 16 | localhost:5432, database `mms` | `docker compose up -d db` |
| Shared TypeScript watcher | no port | included in `pnpm dev` |
| Express/Prisma API | http://localhost:3001 | included in `pnpm dev` |
| Vite web | http://localhost:5173 | included in `pnpm dev` |
| ST-901/H02 GPS gateway | TCP 5013 | `pnpm --filter @mms/gps-gateway dev` |

For **whole-system** requests, include the gateway. It is optional for web/API work. `pnpm dev` builds shared first, then watches shared/API/web; it **excludes the gateway**. ML inference and association rules run inside the API using TypeScript and committed assets. `tools/ml/motorpool_ml_api.py` is a legacy prototype; Python is unnecessary for startup.

## Startup

1. Inspect `git status`, `docker compose ps`, and listening ports with `ss -lntp` or a platform equivalent. Reuse healthy processes belonging to this checkout. Resolve unrelated port occupants without stopping them. Keep servers in persistent terminal sessions and record IDs or log paths.
2. Use pnpm **10.27.0**, pinned in `package.json`, and Node **20.19–20.x or ≥22.12** for Vite 7. Run `pnpm install --frozen-lockfile` when dependencies are missing or stale. Run `pnpm --filter @mms/api exec prisma generate` when the generated client is missing or the schema changed.
3. Create missing API/web `.env` files from each app's `.env.example`; create gateway `.env` only when starting it. Preserve existing files. Check inherited shell overrides too: dotenv does not replace them. Confirm **both** effective API `DATABASE_URL` and `DIRECT_URL` target the intended local database before migrations, seeding, or startup. Compose defaults: `postgresql://mms:mms@localhost:5432/mms`. API `JWT_SECRET` requires 32+ characters. Web `VITE_API_URL` points at the API. Development CORS accepts localhost origins, including Vite's fallback ports.
4. For the gateway or a requested GPS demo, set gateway `MMS_API_URL` to the API. Reuse API `GPS_DEVICE_API_KEY` in gateway `GPS_DEVICE_API_KEY` and web `VITE_GPS_DEVICE_KEY`. If absent, generate one development key and set all three locally. Empty API keys close ingest; empty gateway keys prevent boot. Handle keys without printing them; restart services after environment changes.
5. Start the Compose DB if absent; check `docker compose exec -T db pg_isready -U mms -d mms`. Run `pnpm --filter @mms/api exec prisma migrate status`. Apply pending checked-in migrations with `pnpm db:migrate`; skip when current. Investigate failed/divergent history. Startup does not need `db:migrate:new`, resets, or volume deletion.
6. After migration, check existing data:

   ```sh
   docker compose exec -T db psql -U mms -d mms -c \
     'SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM vehicles) AS vehicles, (SELECT count(*) FROM tracker_devices) AS trackers;'
   ```

   Seed a fresh empty demo DB with `pnpm db:seed`. Reuse populated data; a missing login or empty tracker registry alone does not justify reseeding.
7. Run `pnpm dev` in one persistent session and the gateway command in another for the whole stack. Read Vite's actual URL: it may choose 5174 if 5173 is occupied; keep dependent URLs/origins consistent.

## Verify and hand off

Check API `/api/health` for `{"status":"ok"}`, web HTTP 200, and gateway TCP 5013 plus its startup log. Health does not query Postgres: also sign in using a real browser and inspect vehicles, trip tickets, analytics, and GPS Map. Fresh demo admin: `admin@mms.local` / `Password123!`; existing credentials may differ.

The gateway can listen with no trackers. `pnpm --filter @mms/gps-gateway simulate <imei>` writes GPS data and needs an active registered IMEI assigned to a vehicle; reserve it for an intended GPS demonstration.

If the sandbox denies Docker, networking, watcher sockets, or pnpm's version cache, request outside-sandbox execution for the affected command. For browser checks, isolate the session; if the default launcher fails, attach to an installed browser using a temporary profile and explicit debugging endpoint.

Leave requested services running. Report actual URLs, gateway status, usable credentials, and failed checks. Stop only this task's processes when asked; retain the DB volume. Details: `apps/gps-gateway/README.md` and `tools/ml/README.md`.
