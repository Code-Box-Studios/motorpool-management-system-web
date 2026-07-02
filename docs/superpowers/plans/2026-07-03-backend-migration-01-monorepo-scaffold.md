# Backend Migration Plan 1/7: Monorepo Restructure + Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into a pnpm-workspace monorepo and scaffold the new backend: shared package, Docker Postgres, complete Prisma schema + seed, and a booting Express API skeleton with tests — while the existing FE keeps running against Supabase unchanged.

**Architecture:** The existing repo root becomes the workspace root. The FE moves to `apps/web` (git mv, history preserved), a new Express+TS API lives in `apps/api`, shared enums/contracts in `packages/shared`. Postgres runs in Docker; Prisma owns the schema (ported from the Supabase generated types per spec §4).

**Tech Stack:** pnpm workspaces, Express 5, TypeScript (strict), Prisma 6 + PostgreSQL 16 (Docker), Zod, pino, Vitest + Supertest, bcryptjs, tsx.

**Spec:** `docs/superpowers/specs/2026-07-03-express-backend-migration-design.md` (sections §3, §4, §12 skeleton, §14, §15 phases 1–2). Plans 2–7 (auth+uploads, reference/users modules, fleet/inventory modules, job-orders + trip-tickets, GPS+analytics, FE cutover+cleanup) build on this one.

## Global Constraints

- TypeScript strict mode everywhere; no `any` (use `unknown` + narrowing).
- Package names: `@mms/web`, `@mms/api`, `@mms/shared`. Workspace protocol for internal deps.
- Node 20+. Dev environment is Windows — commands below are Git Bash/cross-platform compatible.
- Conventional commits (`feat:`, `chore:`, `docs:`…). Do NOT add `Co-Authored-By` lines.
- Error envelope (spec §12): `{ error: { code, message, details? } }`.
- Postgres enums for all status vocabularies (spec §4.2); values exactly as listed in the schema task.
- bcrypt cost 12 via `bcryptjs` (pure JS — no native build pain on Windows).
- The FE must still build and run against Supabase at the end of every task in this plan.
- All work happens on the `production` branch (this repo's de-facto trunk).

---

### Task 1: Commit the ML WIP sitting on `production`

The working tree has uncommitted ML-integration work that must be committed before any restructuring (spec §3 pre-step).

**Files:**
- Modify (already modified, just commit): `src/lib/query/analytics.ts`, `src/lib/utils/predictive-maintenance.ts`
- Add (currently untracked): `src/lib/services/ml-api.ts`, `public/ml/association_rules.pkl`, `public/ml/motorpool_ml_api.py`, `public/ml/motorpool_rf_model.pkl`, `public/ml/rf_maintenance_model.json`

**Interfaces:**
- Produces: a clean working tree on `production`; `public/ml/rf_maintenance_model.json` tracked (later moved to `apps/api` assets in Plan 6).

- [ ] **Step 1: Verify the expected dirty state**

Run: `git status --short`
Expected: exactly ` M src/lib/query/analytics.ts`, ` M src/lib/utils/predictive-maintenance.ts`, `?? public/ml/` (4 files), `?? src/lib/services/`. If anything else appears, STOP and ask the user.

- [ ] **Step 2: Commit everything**

```bash
git add src/lib/query/analytics.ts src/lib/utils/predictive-maintenance.ts src/lib/services/ public/ml/
git commit -m "feat: add ML API integration with RF model fallback (WIP from March)"
```

- [ ] **Step 3: Verify clean tree**

Run: `git status --short`
Expected: empty output.

---

### Task 2: Restructure into a pnpm-workspace monorepo

Move the FE into `apps/web`, ML/firmware artifacts into `tools/`, and create the workspace root. History is preserved via `git mv`.

**Files:**
- Create: `pnpm-workspace.yaml`, root `package.json`, root `.gitignore` (replaces moved one)
- Move (git mv): `src`, `public`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `components.json`, `eslint.config.js`, `vercel.json`, `package.json`, `supabase/` → `apps/web/`; `.gitignore` → `apps/web/.gitignore`; `TRIP_TICKET_FLOW_UPDATE.md` → `docs/`; `public/ml/*.py`, `*.pkl` → `tools/ml/`; ESP32 `.ino` sketches in `public/ml/` → `tools/firmware/`
- Move (plain mv, untracked): `.env.local` → `apps/web/.env.local`
- Modify: `apps/web/package.json` (rename to `@mms/web`)
- Keep at root: `README.md`, `prettier.config.ts`, `.gitattributes`, `docs/`, `database.types.ts` (deleted in Plan 7 cleanup)

**Interfaces:**
- Produces: workspace layout per spec §3; `pnpm --filter @mms/web build` green; `rf_maintenance_model.json` stays in `apps/web/public/ml/` for now (FE fallback still reads it until Plan 6).

- [ ] **Step 1: Move the FE into apps/web** (MUST happen before creating the new root package.json — `git mv` moves the tracked original)

```bash
mkdir -p apps/web tools/ml tools/firmware
git mv src public index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json components.json eslint.config.js vercel.json supabase apps/web/
git mv package.json apps/web/package.json
git mv .gitignore apps/web/.gitignore
mkdir -p docs && git mv TRIP_TICKET_FLOW_UPDATE.md docs/
mv .env.local apps/web/.env.local
rm -rf node_modules dist .tanstack
```

Then move the Python/firmware artifacts out of the web public dir (keep `rf_maintenance_model.json` where the FE fetches it):

```bash
git mv apps/web/public/ml/motorpool_ml_api.py tools/ml/
git mv apps/web/public/ml/motorpool_rf_model.pkl tools/ml/
git mv apps/web/public/ml/association_rules.pkl tools/ml/
# list any .py/.ino stragglers and move likewise (mms_randomfiorest.py -> tools/ml/mms_randomforest.py fixes the typo)
git ls-files apps/web/public/ml
```

- [ ] **Step 2: Create workspace files at root**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Root `package.json` (new file — the old one now lives in `apps/web/`):

```json
{
  "name": "mms",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "echo \"use: pnpm --filter @mms/web dev / pnpm --filter @mms/api dev (root pnpm dev wired in Task 7)\"",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "prettier": "^3.6.2",
    "prettier-plugin-tailwindcss": "^0.7.1"
  }
}
```

- [ ] **Step 3: Create root .gitignore**

```gitignore
node_modules/
dist/
*.local
.env
.env.*
!.env.example
apps/api/uploads/
.tanstack/
```

- [ ] **Step 4: Rename the web package**

In `apps/web/package.json` change `"name": "motorpool-management-system-web"` → `"name": "@mms/web"`. Delete the root-level `pnpm-lock.yaml` reference worry — the lockfile regenerates at the workspace root on install (`git add pnpm-lock.yaml` after install).

- [ ] **Step 5: Install and verify the FE still builds**

Run: `pnpm install` then `pnpm --filter @mms/web build`
Expected: Vite build succeeds (same output as before the move). If the build complains about the `@` alias or missing files, a `git mv` was missed — fix before continuing.

- [ ] **Step 6: Smoke-run the FE**

Run: `pnpm --filter @mms/web dev` — open http://localhost:5173, confirm the login page renders (Supabase still wired). Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: restructure repo into pnpm-workspace monorepo (apps/web, tools/)"
```

---

### Task 3: Create `packages/shared` with the domain enums

Single source for status vocabularies and roles (spec §7). The FE re-exports from it so its 36 `@/lib/enums` imports keep working untouched.

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/enums.ts`
- Modify: `apps/web/src/lib/enums.ts` (becomes a re-export), `apps/web/package.json` (add dep)

**Interfaces:**
- Produces: `@mms/shared` exporting `USER_ROLES`, `VEHICLE_STATUS`, `FUEL_TYPE`, `DRIVER_STATUS`, `DRIVER_STATUS_DISPLAY`, `TOOL_STATUS`, `TRIP_TICKET_STATUS`, `JOB_ORDER_STATUS`, `REPAIR_DONE_TYPE`, `MAINTENANCE_TYPE` — exact values below. Plans 2–6 import these in the API; Zod contracts are added to this package per-domain in later plans.

- [ ] **Step 1: Package scaffold**

`packages/shared/package.json`:

```json
{
  "name": "@mms/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch"
  },
  "dependencies": { "zod": "^3.25.76" },
  "devDependencies": { "typescript": "~5.9.3" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the enums**

`packages/shared/src/enums.ts` — copy the current `apps/web/src/lib/enums.ts` content verbatim, then append the new driver-status display map (spec §4.2 normalizes driver status to snake_case; display map preserves the current UI strings):

```ts
// Canonical driver status values for the new DB (snake_case), with the
// display strings the current UI renders.
export const DRIVER_STATUS_DB = ['active', 'inactive', 'on_trip'] as const;

export const DRIVER_STATUS_DISPLAY: Record<
  (typeof DRIVER_STATUS_DB)[number],
  string
> = {
  active: 'Active',
  inactive: 'Inactive',
  on_trip: 'On Trip'
};
```

`packages/shared/src/index.ts`:

```ts
export * from './enums';
```

- [ ] **Step 3: Re-export in the FE**

Replace the entire contents of `apps/web/src/lib/enums.ts` with:

```ts
export * from '@mms/shared';
```

Add to `apps/web/package.json` dependencies: `"@mms/shared": "workspace:*"`.

- [ ] **Step 4: Build and verify**

Run: `pnpm install && pnpm --filter @mms/shared build && pnpm --filter @mms/web build`
Expected: both build green — proving every FE enum consumer resolves through the shared package.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add @mms/shared package as single source for domain enums"
```

---

### Task 4: Docker Postgres + complete Prisma schema + initial migration

The full spec-§4 schema in one migration. `apps/api` is born here as a package (source code comes in Task 6).

**Files:**
- Create: `docker-compose.yml`, `docker/init-test-db.sql`, `apps/api/package.json`, `apps/api/.env`, `apps/api/.env.example`, `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: running Postgres (`mms` + `mms_test` databases, user/pass `mms`/`mms`); Prisma client generated from the schema below — every model/enum name here is the contract for all later plans (e.g. `prisma.tripTicket`, `TripTicketStatus.pending_admin_approval`).

- [ ] **Step 1: docker-compose + test-db init**

`docker-compose.yml` (root):

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: mms
      POSTGRES_PASSWORD: mms
      POSTGRES_DB: mms
    ports:
      - '5432:5432'
    volumes:
      - mms_pgdata:/var/lib/postgresql/data
      - ./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql
volumes:
  mms_pgdata:
```

`docker/init-test-db.sql`:

```sql
CREATE DATABASE mms_test OWNER mms;
```

Run: `docker compose up -d` then `docker compose ps`
Expected: `db` service healthy/running.

- [ ] **Step 2: apps/api package + env**

`apps/api/package.json`:

```json
{
  "name": "@mms/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "dependencies": {
    "@mms/shared": "workspace:*",
    "@prisma/client": "^6.3.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "express": "^5.1.0",
    "helmet": "^8.0.0",
    "pino": "^9.5.0",
    "pino-http": "^10.3.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^24.9.2",
    "@types/supertest": "^6.0.2",
    "pino-pretty": "^13.0.0",
    "prisma": "^6.3.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "~5.9.3",
    "vitest": "^3.0.0"
  }
}
```

`apps/api/.env` and `.env.example` (identical for now):

```env
DATABASE_URL=postgresql://mms:mms@localhost:5432/mms
TEST_DATABASE_URL=postgresql://mms:mms@localhost:5432/mms_test
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

- [ ] **Step 3: Write the complete Prisma schema**

`apps/api/prisma/schema.prisma` — this is the spec-§4 port, verbatim contract for all later plans:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------- Enums (spec §4.2) ----------

enum UserStatus {
  active
  inactive
}

enum VehicleStatus {
  available
  unavailable
  on_trip
  out_of_service
  under_maintenance
}

enum FuelType {
  gasoline
  diesel
  electric
  hybrid
  other
}

enum DriverStatus {
  active
  inactive
  on_trip
}

enum ToolStatus {
  available
  borrowed
  under_maintenance
  out_of_service
}

enum TripTicketStatus {
  pending_admin_approval
  pending_fuel_allocation_approval
  approved
  in_progress
  completed
  cancelled
  disapproved
}

enum JobOrderStatus {
  pending
  assigned_mechanic
  ongoing_repair
  repaired
}

enum RepairType {
  simple
  complex
  compound
}

enum MaintenanceType {
  preventive
  corrective
  inspection
  repair
  service
}

enum AllocationStatus {
  pending
  approved
  disapproved
  cancelled
}

enum BorrowRequestStatus {
  pending
  approved
  returned
}

// ---------- Auth (spec §4.1) ----------

model User {
  id           String     @id @default(uuid()) @db.Uuid
  email        String     @unique
  passwordHash String     @map("password_hash")
  fullName     String     @map("full_name")
  avatarUrl    String?    @map("avatar_url")
  phone        String?
  address      String?
  dateOfBirth  DateTime?  @map("date_of_birth") @db.Date
  status       UserStatus @default(active)
  branchId     String?    @map("branch_id") @db.Uuid
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt @map("updated_at")

  branch        Branch?        @relation(fields: [branchId], references: [id])
  userRole      UserRole?
  refreshTokens RefreshToken[]
  driver        Driver?

  requestedTripTickets TripTicket[] @relation("TicketRequestedBy")
  adminApprovedTickets TripTicket[] @relation("TicketApprovedByAdmin")
  preTripGuardTickets  TripTicket[] @relation("TicketPreTripGuard")
  postTripGuardTickets TripTicket[] @relation("TicketPostTripGuard")
  preTripCheckedTickets  TripTicket[] @relation("TicketPreTripCheckedBy")
  postTripCheckedTickets TripTicket[] @relation("TicketPostTripCheckedBy")
  requestedAllocations FuelAllocation[] @relation("AllocationRequestedBy")
  evpApprovedAllocations FuelAllocation[] @relation("AllocationApprovedByEvp")
  notedJobOrders       JobOrder[]   @relation("JobOrderNotedBy")
  approvedJobOrders    JobOrder[]   @relation("JobOrderApprovedBy")
  requestedJobOrders   JobOrder[]   @relation("JobOrderRequestedBy")
  approvedBorrowRequests BorrowRequest[] @relation("BorrowApprovedBy")
  completedMaintenanceLogs MaintenanceCompletionLog[]

  @@map("users")
}

model Role {
  id          String     @id @default(uuid()) @db.Uuid
  name        String     @unique
  description String?
  createdAt   DateTime   @default(now()) @map("created_at")
  userRoles   UserRole[]

  @@map("roles")
}

model UserRole {
  userId     String   @unique @map("user_id") @db.Uuid
  roleId     String   @map("role_id") @db.Uuid
  assignedAt DateTime @default(now()) @map("assigned_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id])

  @@id([userId, roleId])
  @@map("user_roles")
}

model RefreshToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  tokenHash String    @unique @map("token_hash")
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_tokens")
}

// ---------- Org reference (spec §4.2) ----------

model Branch {
  id       String  @id @default(uuid()) @db.Uuid
  name     String
  location String?

  users             User[]
  drivers           Driver[]
  vehicles          Vehicle[]
  departmentOffices DepartmentOffice[]
  officeHeads       OfficeHead[]
  tripTickets       TripTicket[]
  jobOrders         JobOrder[]
  fuelAllocations   FuelAllocation[]

  @@map("branches")
}

model DepartmentOffice {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  branchId  String?  @map("branch_id") @db.Uuid
  headId    String?  @map("head_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")

  branch      Branch?      @relation(fields: [branchId], references: [id])
  head        OfficeHead?  @relation("OfficeHeadOf", fields: [headId], references: [id])
  officeHeads OfficeHead[] @relation("HeadBelongsToOffice")
  tripTickets TripTicket[]

  @@map("department_offices")
}

model OfficeHead {
  id       String  @id @default(uuid()) @db.Uuid
  name     String
  branchId String? @map("branch_id") @db.Uuid
  officeId String? @map("office_id") @db.Uuid

  branch      Branch?           @relation(fields: [branchId], references: [id])
  office      DepartmentOffice? @relation("HeadBelongsToOffice", fields: [officeId], references: [id])
  headsOffice DepartmentOffice[] @relation("OfficeHeadOf")
  tripTickets TripTicket[]

  @@map("office_heads")
}

// ---------- Fleet (spec §4.2) ----------

model Vehicle {
  id                    String        @id @default(uuid()) @db.Uuid
  make                  String
  model                 String
  year                  Int
  vin                   String
  licensePlate          String        @map("license_plate")
  capacity              Int
  fuelType              FuelType      @map("fuel_type")
  mileage               Int
  status                VehicleStatus @default(available)
  images                String[]      @default([])
  insuranceExpiry       DateTime      @map("insurance_expiry") @db.Date
  registrationExpiry    DateTime      @map("registration_expiry") @db.Date
  branchId              String?       @map("branch_id") @db.Uuid
  maintenanceStandardId String?       @map("maintenance_standard_id") @db.Uuid
  latitude              Float?
  longitude             Float?
  lastLocationUpdate    DateTime?     @map("last_location_update")
  createdAt             DateTime      @default(now()) @map("created_at")
  updatedAt             DateTime      @updatedAt @map("updated_at")

  branch              Branch?              @relation(fields: [branchId], references: [id])
  maintenanceStandard MaintenanceStandard? @relation(fields: [maintenanceStandardId], references: [id])
  assignedDrivers     Driver[]
  tripTickets         TripTicket[]
  fuelAllocations     FuelAllocation[]
  jobOrders           JobOrder[]
  maintenances        Maintenance[]
  maintenanceTracking VehicleMaintenanceTracking[]
  gpsData             GpsData[]
  statusAudits        VehicleStatusAudit[]

  @@map("vehicles")
}

model Driver {
  id                    String       @id @default(uuid()) @db.Uuid
  userId                String?      @unique @map("user_id") @db.Uuid
  email                 String       @unique
  fullName              String       @map("full_name")
  phone                 String?
  address               String?
  dateOfBirth           DateTime?    @map("date_of_birth") @db.Date
  licenseNumber         String?      @map("license_number")
  licenseType           String?      @map("license_type")
  licenseExpiry         DateTime?    @map("license_expiry") @db.Date
  status                DriverStatus @default(active)
  assignedVehicleId     String?      @map("assigned_vehicle_id") @db.Uuid
  branchId              String?      @map("branch_id") @db.Uuid
  sssNumber             String?      @map("sss_number")
  tin                   String?
  hireDate              DateTime?    @map("hire_date") @db.Date
  emergencyContactName  String?      @map("emergency_contact_name")
  emergencyContactPhone String?      @map("emergency_contact_phone")
  notes                 String?
  createdAt             DateTime     @default(now()) @map("created_at")
  updatedAt             DateTime     @updatedAt @map("updated_at")

  user            User?      @relation(fields: [userId], references: [id])
  assignedVehicle Vehicle?   @relation(fields: [assignedVehicleId], references: [id])
  branch          Branch?    @relation(fields: [branchId], references: [id])
  tripTickets     TripTicket[]
  mechanicJobOrders JobOrder[] @relation("JobOrderMechanic")
  borrowedTools   Tool[]
  borrowRequests  BorrowRequest[]

  @@map("drivers")
}

// ---------- Trip tickets + fuel (spec §4.2, §6.1) ----------

model TripTicket {
  id                 String           @id @default(uuid()) @db.Uuid
  branchId           String           @map("branch_id") @db.Uuid
  driverId           String           @map("driver_id") @db.Uuid
  vehicleId          String           @map("vehicle_id") @db.Uuid
  officeId           String?          @map("office_id") @db.Uuid
  officeHeadId       String?          @map("office_head_id") @db.Uuid
  destination        String
  purpose            String
  dateRequested      DateTime         @map("date_requested") @db.Date
  participants       String[]         @default([])
  participantsCount  Int?             @map("participants_count")
  preparedBy         String           @map("prepared_by")
  requestedById      String?          @map("requested_by") @db.Uuid
  remarks            String?
  qrId               String?          @map("qr_id")
  status             TripTicketStatus @default(pending_admin_approval)
  approvedByAdminId  String?          @map("approved_by_admin") @db.Uuid
  disapprovedReason  String?          @map("disapproved_reason")
  cancellationReason String?          @map("cancellation_reason")
  preTripGuardId     String?          @map("pre_trip_guard") @db.Uuid
  preTripCheckedById String?          @map("pre_trip_checked_by") @db.Uuid
  preTripCheckedAt   DateTime?        @map("pre_trip_checked_at")
  postTripGuardId    String?          @map("post_trip_guard") @db.Uuid
  postTripCheckedById String?         @map("post_trip_checked_by") @db.Uuid
  postTripCheckedAt  DateTime?        @map("post_trip_checked_at")
  startTs            DateTime?        @map("start_ts")
  endTs              DateTime?        @map("end_ts")
  createdAt          DateTime         @default(now()) @map("created_at")
  updatedAt          DateTime         @updatedAt @map("updated_at")

  branch          Branch            @relation(fields: [branchId], references: [id])
  driver          Driver            @relation(fields: [driverId], references: [id])
  vehicle         Vehicle           @relation(fields: [vehicleId], references: [id])
  office          DepartmentOffice? @relation(fields: [officeId], references: [id])
  officeHead      OfficeHead?       @relation(fields: [officeHeadId], references: [id])
  requestedBy     User?             @relation("TicketRequestedBy", fields: [requestedById], references: [id])
  approvedByAdmin User?             @relation("TicketApprovedByAdmin", fields: [approvedByAdminId], references: [id])
  preTripGuard    User?             @relation("TicketPreTripGuard", fields: [preTripGuardId], references: [id])
  postTripGuard   User?             @relation("TicketPostTripGuard", fields: [postTripGuardId], references: [id])
  preTripCheckedBy  User?           @relation("TicketPreTripCheckedBy", fields: [preTripCheckedById], references: [id])
  postTripCheckedBy User?           @relation("TicketPostTripCheckedBy", fields: [postTripCheckedById], references: [id])
  fuelAllocation  FuelAllocation?
  gpsData         GpsData[]
  geofenceViolations GeofenceViolation[]

  @@index([status])
  @@index([branchId])
  @@index([driverId])
  @@map("trip_tickets")
}

model FuelAllocation {
  id              String           @id @default(uuid()) @db.Uuid
  tripTicketId    String           @unique @map("trip_ticket_id") @db.Uuid
  vehicleId       String           @map("vehicle_id") @db.Uuid
  branchId        String?          @map("branch_id") @db.Uuid
  requestedById   String           @map("requested_by") @db.Uuid
  approvedByEvpId String?          @map("approved_by_evp") @db.Uuid
  liters          Float
  fuelType        FuelType         @map("fuel_type")
  date            DateTime         @db.Date
  purpose         String
  tripTo          String           @map("trip_to")
  status          AllocationStatus @default(pending)
  disapprovedReason String?        @map("disapproved_reason")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")

  tripTicket    TripTicket @relation(fields: [tripTicketId], references: [id], onDelete: Cascade)
  vehicle       Vehicle    @relation(fields: [vehicleId], references: [id])
  branch        Branch?    @relation(fields: [branchId], references: [id])
  requestedBy   User       @relation("AllocationRequestedBy", fields: [requestedById], references: [id])
  approvedByEvp User?      @relation("AllocationApprovedByEvp", fields: [approvedByEvpId], references: [id])

  @@map("fuel_allocations")
}

// ---------- Job orders (spec §4.2, §6.2) ----------

model JobOrder {
  id                  String         @id @default(uuid()) @db.Uuid
  vehicleId           String         @map("vehicle_id") @db.Uuid
  branchId            String         @map("branch_id") @db.Uuid
  status              JobOrderStatus @default(pending)
  incidentDate        DateTime?      @map("incident_date") @db.Date
  incidentDetails     String?        @map("incident_details")
  requestedById       String?        @map("requested_by") @db.Uuid
  notedById           String?        @map("noted_by") @db.Uuid
  approvedById        String?        @map("approved_by") @db.Uuid
  assignedMechanicId  String?        @map("assigned_mechanic") @db.Uuid
  dateOfRequest       DateTime?      @map("date_of_request") @db.Date
  dateApproved        DateTime?      @map("date_approved") @db.Date
  targetDate          DateTime?      @map("target_date") @db.Date
  actualDateOfRelease DateTime?      @map("actual_date_of_release") @db.Date
  repairDone          RepairType?    @map("repair_done")
  remarks             String?
  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")

  vehicle          Vehicle  @relation(fields: [vehicleId], references: [id])
  branch           Branch   @relation(fields: [branchId], references: [id])
  requestedBy      User?    @relation("JobOrderRequestedBy", fields: [requestedById], references: [id])
  notedBy          User?    @relation("JobOrderNotedBy", fields: [notedById], references: [id])
  approvedBy       User?    @relation("JobOrderApprovedBy", fields: [approvedById], references: [id])
  assignedMechanic Driver?  @relation("JobOrderMechanic", fields: [assignedMechanicId], references: [id])
  spareParts       JobOrderSparePart[]

  @@index([status])
  @@map("job_orders")
}

model JobOrderSparePart {
  jobOrderId  String @map("job_order_id") @db.Uuid
  sparePartId String @map("spare_part_id") @db.Uuid
  quantity    Int    @default(1)

  jobOrder  JobOrder  @relation(fields: [jobOrderId], references: [id], onDelete: Cascade)
  sparePart SparePart @relation(fields: [sparePartId], references: [id])

  @@id([jobOrderId, sparePartId])
  @@map("job_order_spare_parts")
}

// ---------- Maintenance (spec §4.2) ----------

model Maintenance {
  id          String          @id @default(uuid()) @db.Uuid
  vehicleId   String          @map("vehicle_id") @db.Uuid
  type        MaintenanceType
  date        DateTime        @db.Date
  cost        Float?
  mileage     Int?
  nextDue     DateTime?       @map("next_due") @db.Date
  description String?
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")

  vehicle Vehicle @relation(fields: [vehicleId], references: [id])

  @@map("maintenance")
}

model MaintenanceStandard {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  description String?
  createdAt   DateTime @default(now()) @map("created_at")

  scheduleItems MaintenanceScheduleItem[]
  vehicles      Vehicle[]

  @@map("maintenance_standards")
}

model MaintenanceScheduleItem {
  id                    String  @id @default(uuid()) @db.Uuid
  maintenanceStandardId String  @map("maintenance_standard_id") @db.Uuid
  taskName              String  @map("task_name")
  taskDescription       String? @map("task_description")
  intervalType          String  @map("interval_type")
  intervalMileage       Int?    @map("interval_mileage")
  intervalMonths        Int?    @map("interval_months")

  standard MaintenanceStandard          @relation(fields: [maintenanceStandardId], references: [id], onDelete: Cascade)
  tracking VehicleMaintenanceTracking[]

  @@map("maintenance_schedule_items")
}

model VehicleMaintenanceTracking {
  id                        String    @id @default(uuid()) @db.Uuid
  vehicleId                 String    @map("vehicle_id") @db.Uuid
  maintenanceScheduleItemId String    @map("maintenance_schedule_item_id") @db.Uuid
  lastCompletedDate         DateTime? @map("last_completed_date") @db.Date
  lastCompletedMileage      Int?      @map("last_completed_mileage")
  nextDueDate               DateTime? @map("next_due_date") @db.Date
  nextDueMileage            Int?      @map("next_due_mileage")
  status                    String?

  vehicle      Vehicle                    @relation(fields: [vehicleId], references: [id])
  scheduleItem MaintenanceScheduleItem    @relation(fields: [maintenanceScheduleItemId], references: [id])
  completionLogs MaintenanceCompletionLog[]

  @@map("vehicle_maintenance_tracking")
}

model MaintenanceCompletionLog {
  id                           String   @id @default(uuid()) @db.Uuid
  vehicleMaintenanceTrackingId String   @map("vehicle_maintenance_tracking_id") @db.Uuid
  completedById                String   @map("completed_by") @db.Uuid
  completedDate                DateTime @default(now()) @map("completed_date")
  completedMileage             Int
  notes                        String?

  tracking    VehicleMaintenanceTracking @relation(fields: [vehicleMaintenanceTrackingId], references: [id], onDelete: Cascade)
  completedBy User                       @relation(fields: [completedById], references: [id])

  @@map("maintenance_completion_logs")
}

// ---------- Inventory (spec §4.2) ----------

model SparePart {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  brand       String?
  quantity    Int      @default(0)
  image       String?
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  jobOrders JobOrderSparePart[]

  @@map("spare_parts")
}

model Tool {
  id                  String     @id @default(uuid()) @db.Uuid
  name                String
  description         String?
  status              ToolStatus @default(available)
  image               String?
  borrowedById        String?    @map("borrowed_by") @db.Uuid
  borrowedDate        DateTime?  @map("borrowed_date") @db.Date
  estimatedReturnDate DateTime?  @map("estimated_return_date") @db.Date
  createdAt           DateTime   @default(now()) @map("created_at")
  updatedAt           DateTime   @updatedAt @map("updated_at")

  borrowedBy     Driver?         @relation(fields: [borrowedById], references: [id])
  borrowRequests BorrowRequest[]

  @@map("tools")
}

model BorrowRequest {
  id                  String              @id @default(uuid()) @db.Uuid
  toolId              String              @map("tool_id") @db.Uuid
  requestedById       String              @map("requested_by") @db.Uuid
  approvedById        String?             @map("approved_by") @db.Uuid
  status              BorrowRequestStatus @default(pending)
  requestDate         DateTime            @default(now()) @map("request_date")
  approvedAt          DateTime?           @map("approved_at")
  estimatedReturnDate DateTime            @map("estimated_return_date") @db.Date

  tool        Tool    @relation(fields: [toolId], references: [id])
  requestedBy Driver  @relation(fields: [requestedById], references: [id])
  approvedBy  User?   @relation("BorrowApprovedBy", fields: [approvedById], references: [id])

  @@map("borrow_requests")
}

// ---------- GPS + geofence + audit (spec §4.2, §10) ----------

model GpsData {
  id           String   @id @default(uuid()) @map("gps_id") @db.Uuid
  vehicleId    String?  @map("vehicle_id") @db.Uuid
  tripId       String?  @map("trip_id") @db.Uuid
  latitude     Float?
  longitude    Float?
  speed        Float?
  heading      Float?
  engineStatus String?  @map("engine_status")
  createdAt    DateTime @default(now()) @map("created_at")

  vehicle Vehicle?    @relation(fields: [vehicleId], references: [id])
  trip    TripTicket? @relation(fields: [tripId], references: [id])

  @@index([vehicleId, createdAt(sort: Desc)])
  @@map("gps_data")
}

model GeofenceArea {
  id             String  @id @default(uuid()) @map("geofence_id") @db.Uuid
  name           String? @map("geofence_name")
  latitudeCenter Float?  @map("latitude_center")
  longitudeCenter Float? @map("longitude_center")
  radiusMeters   Float?  @map("radius_meters")

  violations GeofenceViolation[]

  @@map("geofence_area")
}

model GeofenceViolation {
  id         String   @id @default(uuid()) @map("violation_id") @db.Uuid
  geofenceId String?  @map("geofence_id") @db.Uuid
  tripId     String?  @map("trip_id") @db.Uuid
  eventType  String?  @map("event_type")
  latitude   Float?   @map("gfv_latitude")
  longitude  Float?   @map("gfv_longitude")
  remarks    String?
  createdAt  DateTime @default(now()) @map("created_at")

  geofence GeofenceArea? @relation(fields: [geofenceId], references: [id])
  trip     TripTicket?   @relation(fields: [tripId], references: [id])

  @@map("geofence_violation")
}

model VehicleStatusAudit {
  id           String   @id @default(uuid()) @db.Uuid
  vehicleId    String   @map("vehicle_id") @db.Uuid
  oldStatus    String?  @map("old_status")
  newStatus    String?  @map("new_status")
  changedBy    String?  @map("changed_by") @db.Uuid
  changeSource String?  @map("change_source")
  reason       String?
  createdAt    DateTime @default(now()) @map("created_at")

  vehicle Vehicle @relation(fields: [vehicleId], references: [id])

  @@map("vehicle_status_audit")
}
```

- [ ] **Step 4: Run the initial migration**

Run: `pnpm install && pnpm --filter @mms/api exec prisma migrate dev --name init`
Expected: migration created under `apps/api/prisma/migrations/`, `Prisma Client generated` message, exit 0. `prisma migrate dev` fails loudly on schema errors — fix until green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Docker Postgres and complete Prisma schema with initial migration"
```

---

### Task 5: Seed script

Idempotent demo data per spec §14. Uses `bcryptjs` (cost 12) for the known-password users.

**Files:**
- Create: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: Prisma models from Task 4.
- Produces: seeded dev DB. Credentials pattern: `<role>@mms.local` / `Password123!` for roles `admin`, `security_guard`, `evp_operations`, `driver`, `requester`. Later plans' tests reuse `seedCore()`-style helpers by importing nothing from here (test fixtures live with tests); this seed is for the dev database.

- [ ] **Step 1: Write the seed**

`apps/api/prisma/seed.ts`:

```ts
import { PrismaClient, TripTicketStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Deterministic demo data — idempotent via upsert/deleteMany-then-create.
async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // Roles
  const roleNames = ['admin', 'security_guard', 'evp_operations', 'driver', 'requester'];
  const roles: Record<string, { id: string }> = {};
  for (const name of roleNames) {
    roles[name] = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} role` }
    });
  }

  // Branches
  const mainBranch = await prisma.branch.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: { id: '00000000-0000-4000-8000-000000000001', name: 'Main Branch', location: 'Head Office' }
  });
  await prisma.branch.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {},
    create: { id: '00000000-0000-4000-8000-000000000002', name: 'North Branch', location: 'North Depot' }
  });

  // Offices + heads
  const office = await prisma.departmentOffice.upsert({
    where: { id: '00000000-0000-4000-8000-000000000011' },
    update: {},
    create: { id: '00000000-0000-4000-8000-000000000011', name: 'Operations Office', branchId: mainBranch.id }
  });
  const head = await prisma.officeHead.upsert({
    where: { id: '00000000-0000-4000-8000-000000000021' },
    update: {},
    create: { id: '00000000-0000-4000-8000-000000000021', name: 'Maria Santos', branchId: mainBranch.id, officeId: office.id }
  });
  await prisma.departmentOffice.update({ where: { id: office.id }, data: { headId: head.id } });

  // One user per role (+ linked driver row for the driver-role user)
  const users: Record<string, { id: string }> = {};
  for (const name of roleNames) {
    const user = await prisma.user.upsert({
      where: { email: `${name}@mms.local` },
      update: {},
      create: {
        email: `${name}@mms.local`,
        passwordHash,
        fullName: name.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        status: 'active',
        branchId: mainBranch.id,
        userRole: { create: { roleId: roles[name].id } }
      }
    });
    users[name] = user;
  }

  // Vehicles (6, across statuses)
  const vehicleSpecs = [
    { make: 'Toyota', model: 'Hiace', plate: 'MMS-0001', status: 'available' },
    { make: 'Toyota', model: 'Fortuner', plate: 'MMS-0002', status: 'available' },
    { make: 'Mitsubishi', model: 'L300', plate: 'MMS-0003', status: 'on_trip' },
    { make: 'Isuzu', model: 'Traviz', plate: 'MMS-0004', status: 'under_maintenance' },
    { make: 'Ford', model: 'Ranger', plate: 'MMS-0005', status: 'out_of_service' },
    { make: 'Nissan', model: 'Urvan', plate: 'MMS-0006', status: 'unavailable' }
  ] as const;
  const vehicles = [];
  for (const [i, v] of vehicleSpecs.entries()) {
    const existing = await prisma.vehicle.findFirst({ where: { licensePlate: v.plate } });
    vehicles.push(
      existing ??
        (await prisma.vehicle.create({
          data: {
            make: v.make, model: v.model, year: 2020 + (i % 5),
            vin: `VIN${String(i + 1).padStart(8, '0')}`,
            licensePlate: v.plate, capacity: 4 + i, fuelType: 'diesel',
            mileage: 25000 + i * 8000, status: v.status,
            insuranceExpiry: new Date('2026-12-31'), registrationExpiry: new Date('2026-12-31'),
            branchId: mainBranch.id
          }
        }))
    );
  }

  // Drivers (5; first one linked to the driver-role user)
  const driverSpecs = ['Juan Dela Cruz', 'Pedro Reyes', 'Jose Ramos', 'Carlo Aquino', 'Rico Bautista'];
  const drivers = [];
  for (const [i, fullName] of driverSpecs.entries()) {
    const email = i === 0 ? 'driver@mms.local' : `driver${i + 1}@mms.local`;
    drivers.push(
      await prisma.driver.upsert({
        where: { email },
        update: {},
        create: {
          email, fullName, status: i === 2 ? 'on_trip' : 'active',
          userId: i === 0 ? users.driver.id : undefined,
          licenseNumber: `N01-${10 + i}-00${i}231`, licenseType: 'Professional',
          licenseExpiry: new Date('2027-06-30'), branchId: mainBranch.id,
          hireDate: new Date('2024-01-15')
        }
      })
    );
  }

  // Spare parts (10)
  const partNames = ['Oil Filter', 'Air Filter', 'Brake Pads', 'Brake Fluid', 'Engine Oil', 'Fan Belt', 'Spark Plugs', 'Battery', 'Wiper Blades', 'Coolant'];
  const parts = [];
  for (const name of partNames) {
    const existing = await prisma.sparePart.findFirst({ where: { name } });
    parts.push(existing ?? (await prisma.sparePart.create({ data: { name, brand: 'OEM', quantity: 20 } })));
  }

  // Tools (6, one borrowed)
  const toolNames = ['Hydraulic Jack', 'Torque Wrench', 'Socket Set', 'Multimeter', 'Impact Driver', 'Tire Inflator'];
  for (const [i, name] of toolNames.entries()) {
    const existing = await prisma.tool.findFirst({ where: { name } });
    if (!existing) {
      await prisma.tool.create({
        data: {
          name,
          status: i === 0 ? 'borrowed' : 'available',
          borrowedById: i === 0 ? drivers[1].id : undefined,
          borrowedDate: i === 0 ? new Date('2026-06-20') : undefined,
          estimatedReturnDate: i === 0 ? new Date('2026-07-20') : undefined
        }
      });
    }
  }

  // Maintenance standard + schedule items
  let standard = await prisma.maintenanceStandard.findFirst({ where: { name: 'Standard PMS' } });
  standard ??= await prisma.maintenanceStandard.create({
    data: {
      name: 'Standard PMS',
      description: 'Preventive maintenance schedule',
      scheduleItems: {
        create: [
          { taskName: 'Change Oil', intervalType: 'mileage', intervalMileage: 5000 },
          { taskName: 'Rotate Tires', intervalType: 'mileage', intervalMileage: 10000 },
          { taskName: 'Replace Coolant', intervalType: 'time', intervalMonths: 12 }
        ]
      }
    }
  });

  // Maintenance history
  if ((await prisma.maintenance.count()) === 0) {
    await prisma.maintenance.createMany({
      data: vehicles.slice(0, 4).map((v, i) => ({
        vehicleId: v.id, type: 'preventive' as const,
        date: new Date(`2026-0${i + 2}-15`), cost: 3500 + i * 500, mileage: 20000 + i * 5000,
        description: 'Scheduled PMS'
      }))
    });
  }

  // Trip tickets — one per status; allocations only at/after pending_fuel_allocation_approval (spec §6.1/§14)
  const statuses: TripTicketStatus[] = [
    'pending_admin_approval', 'pending_fuel_allocation_approval', 'approved',
    'in_progress', 'completed', 'cancelled', 'disapproved'
  ];
  const hasAllocation = new Set<TripTicketStatus>(['pending_fuel_allocation_approval', 'approved', 'in_progress', 'completed']);
  if ((await prisma.tripTicket.count()) === 0) {
    for (const [i, status] of statuses.entries()) {
      const vehicle = vehicles[i % vehicles.length];
      const guarded = status === 'in_progress' || status === 'completed';
      await prisma.tripTicket.create({
        data: {
          branchId: mainBranch.id, driverId: drivers[i % drivers.length].id, vehicleId: vehicle.id,
          officeId: office.id, officeHeadId: head.id,
          destination: `Destination ${i + 1}`, purpose: `Official business ${i + 1}`,
          dateRequested: new Date('2026-06-01'), participants: ['Staff A', 'Staff B'],
          participantsCount: 2, preparedBy: 'Requester User', requestedById: users.requester.id,
          status,
          approvedByAdminId: status === 'pending_admin_approval' ? undefined : users.admin.id,
          disapprovedReason: status === 'disapproved' ? 'Vehicle not available' : undefined,
          cancellationReason: status === 'cancelled' ? 'Trip no longer needed' : undefined,
          preTripGuardId: guarded ? users.security_guard.id : undefined,
          preTripCheckedById: guarded ? users.security_guard.id : undefined,
          preTripCheckedAt: guarded ? new Date('2026-06-02T08:00:00Z') : undefined,
          postTripGuardId: status === 'completed' ? users.security_guard.id : undefined,
          postTripCheckedById: status === 'completed' ? users.security_guard.id : undefined,
          postTripCheckedAt: status === 'completed' ? new Date('2026-06-02T17:00:00Z') : undefined,
          startTs: new Date('2026-06-02T08:00:00Z'), endTs: new Date('2026-06-02T17:00:00Z'),
          fuelAllocation: hasAllocation.has(status)
            ? {
                create: {
                  vehicleId: vehicle.id, branchId: mainBranch.id, requestedById: users.admin.id,
                  approvedByEvpId: status === 'pending_fuel_allocation_approval' ? undefined : users.evp_operations.id,
                  liters: 20, fuelType: 'diesel', date: new Date('2026-06-02'),
                  purpose: `Official business ${i + 1}`, tripTo: `Destination ${i + 1}`,
                  status: status === 'pending_fuel_allocation_approval' ? 'pending' : 'approved'
                }
              }
            : undefined
        }
      });
    }
  }

  // Job orders — one per active stage, with spare parts on the noted+ ones
  if ((await prisma.jobOrder.count()) === 0) {
    const joStatuses = ['pending', 'assigned_mechanic', 'ongoing_repair'] as const;
    for (const [i, status] of joStatuses.entries()) {
      await prisma.jobOrder.create({
        data: {
          vehicleId: vehicles[3].id, branchId: mainBranch.id, status,
          incidentDate: new Date('2026-06-10'), incidentDetails: `Brake issue ${i + 1}`,
          requestedById: users.requester.id,
          notedById: status === 'pending' ? undefined : users.admin.id,
          assignedMechanicId: status === 'pending' ? undefined : drivers[4].id,
          dateOfRequest: status === 'pending' ? undefined : new Date('2026-06-11'),
          targetDate: status === 'pending' ? undefined : new Date('2026-06-25'),
          approvedById: status === 'ongoing_repair' ? users.evp_operations.id : undefined,
          dateApproved: status === 'ongoing_repair' ? new Date('2026-06-12') : undefined,
          spareParts: status === 'pending' ? undefined : { create: [{ sparePartId: parts[2].id, quantity: 2 }] }
        }
      });
    }
  }

  // GPS points — ~50 along a line for 2 vehicles
  if ((await prisma.gpsData.count()) === 0) {
    const base = { lat: 14.5995, lng: 120.9842 };
    const rows = [];
    for (const [v, vehicle] of [vehicles[2], vehicles[0]].entries()) {
      for (let i = 0; i < 25; i++) {
        rows.push({
          vehicleId: vehicle.id,
          latitude: base.lat + v * 0.01 + i * 0.0005,
          longitude: base.lng + i * 0.0007,
          speed: 30 + (i % 20), heading: 90, engineStatus: 'on',
          createdAt: new Date(Date.parse('2026-07-01T08:00:00Z') + i * 60_000)
        });
      }
    }
    await prisma.gpsData.createMany({ data: rows });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the seed**

Run: `pnpm --filter @mms/api db:seed`
Expected: `Seed complete.` exit 0.

- [ ] **Step 3: Verify idempotency + row counts**

Run the seed a second time: `pnpm --filter @mms/api db:seed` — must succeed without duplicate-key errors. Then:

```bash
docker compose exec db psql -U mms -d mms -c "select (select count(*) from users) users, (select count(*) from roles) roles, (select count(*) from vehicles) vehicles, (select count(*) from trip_tickets) tickets, (select count(*) from fuel_allocations) allocations;"
```

Expected: `users=5, roles=5, vehicles=6, tickets=7, allocations=4`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat: add idempotent demo seed for the new database"
```

---

### Task 6: Express API skeleton with error handling and tests

Boots, serves `/api/health`, returns the spec-§12 error envelope for 404s and thrown `AppError`s. TDD.

**Files:**
- Create: `apps/api/tsconfig.json`, `apps/api/src/config.ts`, `apps/api/src/lib/prisma.ts`, `apps/api/src/lib/errors.ts`, `apps/api/src/middleware/error-handler.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/vitest.config.ts`
- Test: `apps/api/src/app.test.ts`

**Interfaces:**
- Produces (contracts for Plans 2–6):
  - `createApp(): express.Express` from `src/app.ts` — tests mount it with Supertest.
  - `AppError` from `src/lib/errors.ts`: `new AppError(statusCode: number, code: string, message: string, details?: unknown)`.
  - `prisma` singleton from `src/lib/prisma.ts`.
  - `config` from `src/config.ts`: `{ port: number, corsOrigin: string, databaseUrl: string }` (auth/GPS keys added in later plans).
  - Error envelope: `{ error: { code, message, details? } }`; 404 code `NOT_FOUND`.

- [ ] **Step 1: TS + Vitest config**

`apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

describe('app skeleton', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('unknown routes return the error envelope', async () => {
    const res = await request(createApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found' }
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @mms/api test`
Expected: FAIL — cannot resolve `./app`.

- [ ] **Step 4: Implement config, errors, prisma, app, server**

`apps/api/src/config.ts`:

```ts
import { z } from 'zod';

// Validated process env — fail fast on boot if anything required is missing.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173')
});

const env = envSchema.parse(process.env);

export const config = {
  databaseUrl: env.DATABASE_URL,
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN
};
```

`apps/api/src/lib/prisma.ts`:

```ts
import { PrismaClient } from '@prisma/client';

// Single shared Prisma client for the whole process.
export const prisma = new PrismaClient();
```

`apps/api/src/lib/errors.ts`:

```ts
// Typed operational error thrown by services; mapped to the response
// envelope by the error-handler middleware (spec §12).
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

`apps/api/src/middleware/error-handler.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

// Central error mapper: AppError -> its status, ZodError -> 400,
// anything else -> 500 with a generic message (spec §12).
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.details !== undefined && { details: err.details }) }
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.flatten() }
    });
    return;
  }
  req.log?.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
```

`apps/api/src/app.ts`:

```ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config';
import { errorHandler } from './middleware/error-handler';

// App factory so tests can mount a fresh instance without listening.
export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  if (process.env.NODE_ENV !== 'test') {
    app.use(pinoHttp());
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Domain routers mount here in later plans.

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);

  return app;
}
```

`apps/api/src/server.ts`:

```ts
import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';

createApp().listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
```

Note: `dotenv` must be added — `pnpm --filter @mms/api add dotenv`. Vitest loads env from the shell; add to the test script if needed: change `"test"` to `"vitest run"` with a `.env` loaded via `import 'dotenv/config'` in a `vitest.setup.ts` only when tests need the DB (Plan 2+). For this plan the two tests don't touch the DB, but `config.ts` requires `DATABASE_URL` — so create `apps/api/vitest.config.ts` with `env` loading: replace its contents with:

```ts
import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @mms/api test`
Expected: 2 passed.

- [ ] **Step 6: Boot the server manually**

Run: `pnpm --filter @mms/api dev` then `curl http://localhost:3000/api/health`
Expected: `{"status":"ok"}`. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Express API skeleton with error envelope and health check"
```

---

### Task 7: Root dev workflow + docs + verification sweep

**Files:**
- Modify: root `package.json` (real `dev` script), `README.md`

**Interfaces:**
- Produces: `pnpm dev` runs API + web together; README documents the new workflow.

- [ ] **Step 1: Wire root scripts**

Add `concurrently` at root: `pnpm add -w -D concurrently`. Update root `package.json` scripts:

```json
{
  "scripts": {
    "dev": "concurrently -n api,web -c blue,green \"pnpm --filter @mms/api dev\" \"pnpm --filter @mms/web dev\"",
    "build": "pnpm -r build",
    "test": "pnpm -r --if-present test",
    "lint": "pnpm -r --if-present lint",
    "db:up": "docker compose up -d",
    "db:migrate": "pnpm --filter @mms/api db:migrate",
    "db:seed": "pnpm --filter @mms/api db:seed"
  }
}
```

- [ ] **Step 2: Replace README content**

Rewrite `README.md` (currently the stock Vite template) with: project title, monorepo layout table (`apps/web`, `apps/api`, `packages/shared`, `tools/`), quickstart (`docker compose up -d` → `pnpm install` → `pnpm db:migrate && pnpm db:seed` → `pnpm dev`), seeded credentials table (`admin@mms.local` … / `Password123!`), and a pointer to `docs/superpowers/specs/2026-07-03-express-backend-migration-design.md`.

- [ ] **Step 3: Full verification sweep**

```bash
pnpm build          # shared + api + web all green
pnpm test           # api: 2 passing
pnpm dev            # both servers boot; web login page renders; curl /api/health -> ok
```

Expected: all green; FE unchanged (still Supabase-backed).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: wire root dev workflow and rewrite README for the monorepo"
```

---

## Self-Review Notes

- Spec coverage (this plan = §15 phases 1–2): §3 layout ✔ (Tasks 2–3), §4 schema ✔ (Task 4, all 24+ tables incl. auth tables), §12 envelope ✔ (Task 6), §14 seed ✔ (Task 5, allocation rule respected), pre-step WIP commit ✔ (Task 1). Auth endpoints/uploads/domains are Plans 2+, deliberately absent here.
- Type consistency: `AppError(statusCode, code, message, details?)` used identically in Tasks 6; Prisma model names in Task 5 seed match Task 4 schema (`tripTicket`, `fuelAllocation`, `jobOrder`, `gpsData`…).
- The FE builds at every task boundary (Tasks 2, 3 verify explicitly; later tasks don't touch `apps/web`).
