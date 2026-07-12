# Tracker Admin UI Implementation Plan

> **Agentic workers:** execute this with **subagent-driven-development** — dispatch one subagent per `### Task N`, in order. Each task ends with its own typecheck / lint / build (and e2e where relevant) + a scoped commit, so the next task starts from a green tree. Do not batch tasks into one commit.

This is **Plan 2 of 3** for the GPS tracker feature. Plan 1 (`2026-07-11-gps-tracker-registry-backend.md`, already built + committed) shipped the admin-only `/api/tracker-devices` CRUD API and the shared zod contracts. Plan 2 builds the **web admin UI**: a Trackers management page (register / assign / replace / decommission), an online/offline indicator derived from `lastSeenAt`, surfacing the assigned tracker on the Vehicle detail page, an e2e spec, and a root-README functional-doc update. Plan 2 is **front-end-only** — it touches no backend or shared package.

## Goal

Give admins a **Trackers** area (`/tracker-devices`) to register GPS devices, assign/replace them on vehicles, flip lifecycle status, and decommission/delete them — plus a read-only tracker panel on each vehicle's detail page. Every mutation confirms via a modal, toasts on success/failure, and surfaces the backend's business-rule 409s (`IMEI_TAKEN`, `VEHICLE_HAS_ACTIVE_DEVICE`) verbatim so the admin can act on them.

## Architecture

Mirror the existing web feature slices (tools / user-management / vehicles) exactly:

- **Data access** (`lib/api/tracker-devices.ts`): raw `api.*` calls, one FE type. TrackerDevice is a brand-new resource with **no legacy snake_case table**, so — like the `users` API — the FE consumes the API's camelCase row directly with **no reshape** (a local `TrackerDevice` interface, not added to `lib/types.ts`).
- **Domain util** (`lib/utils/tracker-devices.ts`): pure `isDeviceOnline(lastSeenAt)` — liveness is derived FE-side from `lastSeenAt` recency, a separate axis from the `status` lifecycle enum.
- **Query hooks** (`lib/query/tracker-devices.ts`) + **mutation hooks** (`lib/mutation/tracker-devices.ts`): thin TanStack Query wrappers; mutations toast + invalidate `['tracker-devices']`.
- **Pages** (`components/pages/tracker-devices/`): a table list (mirrors user-management), a register form on a separate route (mirrors tools.add-tools), and a detail/edit page with inline-edit toggle + destructive delete (mirrors tools-inner). Shared zod schema/form/mappers live once in `components/pages/tracker-devices/action.ts` and are imported by both the register and edit forms (single source of truth).
- **Routes** (`routes/_authenticated/tracker-devices.*.tsx`): thin file-routes. The **index** route carries `staticData.allowedRoles: [USER_ROLES.admin]` — that one field drives BOTH the auth guard and sidebar visibility (data-driven; the guard file and sidebar need zero changes).
- **Vehicle surfacing**: a new self-contained `VehicleTrackerSummary` widget rendered as a sibling after `VehicleMaintenanceInsights` in `vehicle-inner/page.tsx` — not woven into the vehicle edit form.

### Path reality (READ THIS FIRST)

The pnpm monorepo is **NOT** the process cwd. The real workspace root is one level down at `motorpool-management-system-web/`. Every path in this plan is relative to that inner root: the web app is `apps/web/`, the shared package is `packages/shared/`. **All `pnpm`/`git` commands below run from `motorpool-management-system-web/`** (the executing agent must `cd motorpool-management-system-web` first from the outer `mms/` cwd).

## Tech Stack

React 19 + Vite + TanStack Router (file-based, `autoCodeSplitting`) + TanStack Query + shadcn/ui + Tailwind + react-hook-form + zod + sonner. Types/enums from `@mms/shared` (re-exported via `@/lib/enums`). API base client at `@/lib/api/client` (`api.get/post/patch/del`, throws `ApiError(status, code, message)`).

## Global Constraints

Verbatim binding rules for every task:

- **TypeScript ESM only.** No `any` (use `unknown` + narrowing if ever needed). Match the existing web patterns exactly — copy the referenced files' shape, imports, and idioms; do not invent new abstractions.
- **Admin-only.** The whole feature is admin-gated. The `/api/tracker-devices` endpoints require `requireRole(admin)` server-side; the index route sets `allowedRoles: [USER_ROLES.admin]`; the vehicle-detail tracker panel renders only for admins.
- **Exact TrackerDevice shape** (camelCase, from the API/Prisma row): `{ id: string; imei: string; vehicleId: string | null; label: string | null; simNumber: string | null; status: 'active' | 'inactive' | 'decommissioned'; lastSeenAt: string | null; notes: string | null; createdAt: string; updatedAt: string }`. `lastSeenAt` is stamped server-side only (by the device-key `/resolve` gateway); the UI never sets it — it is read-only and the basis for online/offline.
- **409 business rules must surface verbatim.** `409 IMEI_TAKEN` ("A device with this IMEI already exists"), `409 VEHICLE_HAS_ACTIVE_DEVICE` ("Vehicle already has an active tracker" — a vehicle may have at most one *active* device), `404 NOT_FOUND`. There is no atomic "replace" endpoint: replacing a unit = deactivating/decommissioning the old device (a status change) then assigning the new one; the UI catches these 409s as `error.message` toasts.
- **TanStack Query invalidation.** Every mutation `invalidateQueries({ queryKey: ['tracker-devices'] })` on success.
- **sonner toasts** live in the mutation hooks (not components): `toast.success(...)` on success, `toast.error(\`... ${error.message}\`)` on error (surface the server message).
- **Web testing reality: there is NO unit-test framework** in `apps/web` (no vitest/jest). Verification = `tsc -b` typecheck (via `build`) + `eslint` + `vite build` + Playwright e2e. The route tree (`routeTree.gen.ts`) is auto-generated by the vite plugin during `build`/`dev` — never hand-edit it; run `build` after adding route files to regenerate + typecheck the typed `<Link>`s.
- **Git:** branch is `production`. Do **not** create branches, push, or merge. Commit with a **scoped `git add <paths>`** (never `git add -A`), conventional-commit subject, **no `Co-Authored-By` line** (per repo owner's global rule).

## File Structure

**Create:**

| File | Responsibility |
| --- | --- |
| `apps/web/src/lib/api/tracker-devices.ts` | Data access: `TrackerDevice` FE type + `getTrackerDevices` / `getTrackerDeviceById` / `createTrackerDevice` / `updateTrackerDevice` / `deleteTrackerDevice`. |
| `apps/web/src/lib/utils/tracker-devices.ts` | Pure `isDeviceOnline(lastSeenAt)` + the online threshold constant. |
| `apps/web/src/lib/query/tracker-devices.ts` | Query hooks: `useTrackerDevices` (list, filters), `useTrackerDevice` (one), `useVehicleTrackerDevice` (by vehicleId). |
| `apps/web/src/lib/mutation/tracker-devices.ts` | Mutation hooks: `useCreateTrackerDevice` / `useUpdateTrackerDevice` / `useDeleteTrackerDevice` (toast + invalidate). |
| `apps/web/src/components/shared/device-online-indicator.tsx` | Reusable green/gray dot + "Online"/"Offline" label. |
| `apps/web/src/components/pages/tracker-devices/index.tsx` | Trackers list page (table). |
| `apps/web/src/components/pages/tracker-devices/action.ts` | Shared zod schema, `useTrackerDeviceForm`, and form↔API mappers (single source of truth for register + edit). |
| `apps/web/src/components/pages/tracker-devices/add-device/index.tsx` | Register-device form. |
| `apps/web/src/components/pages/tracker-devices/device-details/index.tsx` | Detail/edit page (inline edit, assign/replace/decommission, delete). |
| `apps/web/src/components/pages/vehicles/vehicle-inner/vehicle-tracker-summary.tsx` | Read-only tracker panel for the vehicle detail page (admin-only). |
| `apps/web/src/routes/_authenticated/tracker-devices.index.tsx` | List route + `staticData` (admin-only, Settings group, RadioTower icon). |
| `apps/web/src/routes/_authenticated/tracker-devices.add-device.tsx` | Register route (thin). |
| `apps/web/src/routes/_authenticated/tracker-devices.$deviceId.tsx` | Detail route (thin, reads `deviceId` param). |
| `apps/web/e2e/trackers.spec.ts` | Playwright: admin registers a device + non-admin gating. |

**Modify:**

| File | Change |
| --- | --- |
| `apps/web/src/components/shared/status-badge.tsx` | Add `active`/`inactive`/`decommissioned` → badge-variant cases. |
| `apps/web/src/components/pages/vehicles/vehicle-inner/page.tsx` | Import + render `<VehicleTrackerSummary />` after `<VehicleMaintenanceInsights />`. |
| `README.md` | Add tracker-registry subsection to §12 + a permissions-table row. |

**Never touch:** `routes/_authenticated.tsx` (guard is data-driven), `components/app-sidebar/index.tsx` (menu is data-driven), `routeTree.gen.ts` (auto-generated).

---

### Task 1 — Data layer (api + util + query + mutation)

**Files:**
- Create `apps/web/src/lib/api/tracker-devices.ts`
- Create `apps/web/src/lib/utils/tracker-devices.ts`
- Create `apps/web/src/lib/query/tracker-devices.ts`
- Create `apps/web/src/lib/mutation/tracker-devices.ts`

**Interfaces:**
- Consumes: `api` (`@/lib/api/client`), `ApiError` type, `CreateTrackerDeviceBody` / `UpdateTrackerDeviceBody` (`@mms/shared`), `useQuery`/`useMutation`/`useQueryClient` (`@tanstack/react-query`), `toast` (`sonner`).
- Produces: `TrackerDevice` interface, `TrackerDeviceListParams`, `getTrackerDevices`, `getTrackerDeviceById`, `createTrackerDevice`, `updateTrackerDevice`, `deleteTrackerDevice`; `isDeviceOnline`, `DEVICE_ONLINE_THRESHOLD_MS`; `useTrackerDevices`, `useTrackerDevice`, `useVehicleTrackerDevice`; `useCreateTrackerDevice`, `useUpdateTrackerDevice`, `useDeleteTrackerDevice`.

- [ ] **Step 1: Write `apps/web/src/lib/api/tracker-devices.ts`.**
  ```ts
  import { api } from './client.js';
  import type {
    CreateTrackerDeviceBody,
    UpdateTrackerDeviceBody
  } from '@mms/shared';

  // FE-facing tracker device row. TrackerDevice is a brand-new resource with no
  // legacy snake_case table, so — like the `users` API — we consume the API's
  // camelCase Prisma row 1:1 with no reshape. `lastSeenAt` is stamped server-side
  // only (GPS gateway /resolve ping); the UI treats it as read-only.
  export interface TrackerDevice {
    id: string;
    imei: string;
    vehicleId: string | null;
    label: string | null;
    simNumber: string | null;
    status: 'active' | 'inactive' | 'decommissioned';
    lastSeenAt: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  }

  export interface TrackerDeviceListParams {
    page?: number;
    limit?: number;
    vehicleId?: string;
    status?: string;
  }

  // Fetch tracker devices (API sorts updatedAt desc). Filters + pagination are
  // forwarded as query params per trackerDevicesListQuerySchema. Passed as an
  // object literal so it satisfies the client's Record index signature.
  export async function getTrackerDevices(
    params: TrackerDeviceListParams = {}
  ): Promise<{ data: TrackerDevice[]; count: number }> {
    const { page, limit, vehicleId, status } = params;
    const res = await api.get<{ data: TrackerDevice[]; count: number }>(
      '/tracker-devices',
      { page, limit, vehicleId, status }
    );
    return { data: res.data, count: res.count };
  }

  export async function getTrackerDeviceById(id: string): Promise<TrackerDevice> {
    return api.get<TrackerDevice>(`/tracker-devices/${id}`);
  }

  export async function createTrackerDevice(
    body: CreateTrackerDeviceBody
  ): Promise<TrackerDevice> {
    return api.post<TrackerDevice>('/tracker-devices', body);
  }

  export async function updateTrackerDevice(
    id: string,
    body: UpdateTrackerDeviceBody
  ): Promise<TrackerDevice> {
    return api.patch<TrackerDevice>(`/tracker-devices/${id}`, body);
  }

  // DELETE returns 204; nothing to unwrap.
  export async function deleteTrackerDevice(id: string): Promise<void> {
    await api.del(`/tracker-devices/${id}`);
  }
  ```

- [ ] **Step 2: Write `apps/web/src/lib/utils/tracker-devices.ts`.**
  ```ts
  // A device is "online" if it reported (lastSeenAt) within this window.
  // lastSeenAt is stamped server-side only by the GPS gateway /resolve ping, so
  // it is the FE's liveness signal — independent of the `status` lifecycle enum.
  // This is an independent front-end display heuristic only; it is NOT linked to
  // the gateway's OFFLINE_AFTER_MS — the two can be reconciled later if needed.
  export const DEVICE_ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  // True when the device reported within DEVICE_ONLINE_THRESHOLD_MS.
  export function isDeviceOnline(lastSeenAt: string | null): boolean {
    if (!lastSeenAt) return false;
    const seen = new Date(lastSeenAt).getTime();
    if (Number.isNaN(seen)) return false;
    return Date.now() - seen < DEVICE_ONLINE_THRESHOLD_MS;
  }
  ```

- [ ] **Step 3: Write `apps/web/src/lib/query/tracker-devices.ts`.**
  ```ts
  import { useQuery } from '@tanstack/react-query';
  import {
    getTrackerDevices,
    getTrackerDeviceById,
    type TrackerDeviceListParams
  } from '@/lib/api/tracker-devices';

  export const useTrackerDevices = (params: TrackerDeviceListParams = {}) => {
    return useQuery({
      queryKey: ['tracker-devices', params],
      queryFn: () => getTrackerDevices(params)
    });
  };

  export const useTrackerDevice = (id: string) => {
    return useQuery({
      // Shares the plural ['tracker-devices'] root so mutation invalidations
      // (which invalidate ['tracker-devices']) prefix-match and refresh this
      // detail query — TanStack Query invalidation is prefix-based on the key array.
      queryKey: ['tracker-devices', id],
      queryFn: () => getTrackerDeviceById(id),
      enabled: !!id
    });
  };

  // The tracker(s) registered to a vehicle (expect 0 or 1 active). Used by the
  // Vehicle detail surfacing. `enabled` lets the caller gate the admin-only fetch.
  export const useVehicleTrackerDevice = (vehicleId: string, enabled = true) => {
    return useQuery({
      queryKey: ['tracker-devices', { vehicleId }],
      queryFn: () => getTrackerDevices({ vehicleId }),
      enabled: enabled && !!vehicleId
    });
  };
  ```

- [ ] **Step 4: Write `apps/web/src/lib/mutation/tracker-devices.ts`.** `onError` surfaces `error.message` verbatim so `IMEI_TAKEN` / `VEHICLE_HAS_ACTIVE_DEVICE` reach the admin.
  ```ts
  import { useMutation, useQueryClient } from '@tanstack/react-query';
  import { toast } from 'sonner';
  import {
    createTrackerDevice,
    updateTrackerDevice,
    deleteTrackerDevice
  } from '@/lib/api/tracker-devices';
  import type { ApiError } from '@/lib/api/client';
  import type {
    CreateTrackerDeviceBody,
    UpdateTrackerDeviceBody
  } from '@mms/shared';

  export const useCreateTrackerDevice = () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: CreateTrackerDeviceBody) => createTrackerDevice(body),
      onSuccess: () => {
        toast.success('Tracker device registered successfully!');
        queryClient.invalidateQueries({ queryKey: ['tracker-devices'] });
      },
      onError: (error: ApiError) => {
        toast.error(`Registration failed: ${error?.message ?? String(error)}`);
      }
    });
  };

  export const useUpdateTrackerDevice = () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        id,
        updates
      }: {
        id: string;
        updates: UpdateTrackerDeviceBody;
      }) => updateTrackerDevice(id, updates),
      onSuccess: () => {
        toast.success('Tracker device updated successfully!');
        queryClient.invalidateQueries({ queryKey: ['tracker-devices'] });
      },
      onError: (error: ApiError) => {
        toast.error(`Update failed: ${error?.message ?? String(error)}`);
      }
    });
  };

  export const useDeleteTrackerDevice = () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => deleteTrackerDevice(id),
      onSuccess: () => {
        toast.success('Tracker device deleted successfully!');
        queryClient.invalidateQueries({ queryKey: ['tracker-devices'] });
      },
      onError: (error: ApiError) => {
        toast.error(`Deletion failed: ${error?.message ?? String(error)}`);
      }
    });
  };
  ```

- [ ] **Step 5: Typecheck + lint.** From `motorpool-management-system-web/`:
  ```
  pnpm --filter @mms/web exec tsc -b
  pnpm --filter @mms/web lint
  ```
  (Pages don't exist yet, but these four modules must compile clean on their own. `build` is deferred to the tasks that add typed routes.)

- [ ] **Step 6: Commit.**
  ```
  git add apps/web/src/lib/api/tracker-devices.ts apps/web/src/lib/utils/tracker-devices.ts apps/web/src/lib/query/tracker-devices.ts apps/web/src/lib/mutation/tracker-devices.ts
  git commit -m "feat(web): add tracker-devices data layer (api, query, mutation, online util)"
  ```

---

### Task 2 — Trackers list page, route, and status/online UI

**Files:**
- Modify `apps/web/src/components/shared/status-badge.tsx`
- Create `apps/web/src/components/shared/device-online-indicator.tsx`
- Create `apps/web/src/components/pages/tracker-devices/index.tsx`
- Create `apps/web/src/routes/_authenticated/tracker-devices.index.tsx`
- Create `apps/web/src/routes/_authenticated/tracker-devices.add-device.tsx` (stub — fleshed out in Task 3)
- Create `apps/web/src/routes/_authenticated/tracker-devices.$deviceId.tsx` (stub — fleshed out in Task 4)

**Interfaces:**
- Consumes: `useTrackerDevices` (Task 1), `isDeviceOnline` (Task 1), `TableSkeleton`, `Card*`, `Table*`, `buttonVariants`, `Link`, `StatusBadge`, `USER_ROLES`, `RadioTower` (lucide — verified present in installed `lucide-react@0.548.0`).
- Produces: default-exported `TrackerDevices` page component; `DeviceOnlineIndicator`; the `/_authenticated/tracker-devices/` route (auto-registered in the sidebar Settings group for admins).

- [ ] **Step 1: Extend `apps/web/src/components/shared/status-badge.tsx`.** Add three cases to `getBadgeVariant`'s `switch` (green = active, slate = inactive, rose = decommissioned) — right before `default:`:
  ```ts
      case 'active':
        return 'available';
      case 'inactive':
        return 'not_available';
      case 'decommissioned':
        return 'to_be_repaired';
  ```
  (These variants already exist in `badge.tsx`. `StatusBadge` titleizes the passed string, so it renders "Active"/"Inactive"/"Decommissioned".)

- [ ] **Step 2: Write `apps/web/src/components/shared/device-online-indicator.tsx`.**
  ```tsx
  import { cn } from '@/lib/utils';
  import { isDeviceOnline } from '@/lib/utils/tracker-devices';

  // Small green/gray dot + label showing device liveness derived from lastSeenAt
  // recency (NOT the status enum). See isDeviceOnline for the threshold.
  export function DeviceOnlineIndicator({
    lastSeenAt
  }: {
    lastSeenAt: string | null;
  }) {
    const online = isDeviceOnline(lastSeenAt);
    return (
      <span className="inline-flex items-center gap-2">
        <span
          className={cn(
            'size-2 rounded-full',
            online ? 'bg-emerald-500' : 'bg-slate-400'
          )}
        />
        <span className="text-sm">{online ? 'Online' : 'Offline'}</span>
      </span>
    );
  }
  ```

- [ ] **Step 3: Write `apps/web/src/components/pages/tracker-devices/index.tsx`.** Table pattern (mirrors user-management), `TableSkeleton` for loading, IMEI cell links to the detail route.
  ```tsx
  import { Link } from '@tanstack/react-router';
  import { buttonVariants } from '@/components/ui/button';
  import { cn } from '@/lib/utils';
  import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from '@/components/ui/card';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
  } from '@/components/ui/table';
  import StatusBadge from '@/components/shared/status-badge';
  import { DeviceOnlineIndicator } from '@/components/shared/device-online-indicator';
  import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
  import { useTrackerDevices } from '@/lib/query/tracker-devices';

  const COLUMNS = [
    { label: 'IMEI', width: 'w-40' },
    { label: 'Label', width: 'w-32' },
    { label: 'SIM Number', width: 'w-32' },
    { label: 'Status', width: 'w-24' },
    { label: 'Connectivity', width: 'w-24' },
    { label: 'Last Seen', width: 'w-32' }
  ];

  const TrackerDevices = () => {
    const { data, isLoading, error } = useTrackerDevices();
    const devices = data?.data;

    return (
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Tracker Devices</CardTitle>
            <CardDescription>
              Register, assign, and decommission GPS tracker devices.
            </CardDescription>
            <CardAction>
              <Link
                to="/tracker-devices/add-device"
                className={cn(buttonVariants())}
              >
                Register Device
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TableSkeleton rows={5} columns={COLUMNS} />
            ) : error ? (
              <div className="text-destructive p-8 text-center">
                Error loading devices: {error.message}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((c) => (
                      <TableHead key={c.label}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices && devices.length > 0 ? (
                    devices.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>
                          <Link
                            to="/tracker-devices/$deviceId"
                            params={{ deviceId: device.id }}
                            className="font-medium hover:underline"
                          >
                            {device.imei}
                          </Link>
                        </TableCell>
                        <TableCell>{device.label || '—'}</TableCell>
                        <TableCell>{device.simNumber || '—'}</TableCell>
                        <TableCell>
                          <StatusBadge status={device.status} />
                        </TableCell>
                        <TableCell>
                          <DeviceOnlineIndicator lastSeenAt={device.lastSeenAt} />
                        </TableCell>
                        <TableCell>
                          {device.lastSeenAt
                            ? new Date(device.lastSeenAt).toLocaleString()
                            : 'Never'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={COLUMNS.length}
                        className="text-muted-foreground py-8 text-center"
                      >
                        No tracker devices found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  export default TrackerDevices;
  ```

- [ ] **Step 4: Write `apps/web/src/routes/_authenticated/tracker-devices.index.tsx`.** The `allowedRoles` field drives BOTH the guard and the sidebar (Settings group, matching the admin-only User Management page).
  ```tsx
  import TrackerDevices from '@/components/pages/tracker-devices';
  import { USER_ROLES } from '@/lib/enums';
  import { createFileRoute } from '@tanstack/react-router';
  import { RadioTower } from 'lucide-react';

  export const Route = createFileRoute('/_authenticated/tracker-devices/')({
    component: TrackerDevices,
    staticData: {
      title: 'Trackers',
      icon: RadioTower,
      group: 'Settings',
      allowedRoles: [USER_ROLES.admin]
    }
  });
  ```

- [ ] **Step 5: Create the two stub route files so the list page's typed `<Link>`s resolve.** The list page (Step 3) links to `/tracker-devices/add-device` and `/tracker-devices/$deviceId`; those typed `<Link>`s only compile once the routes exist in `routeTree.gen.ts`. Create both as minimal valid stubs now (Task 3 fleshes out `add-device`, Task 4 fleshes out `$deviceId`).

  Write `apps/web/src/routes/_authenticated/tracker-devices.add-device.tsx`:
  ```tsx
  import { createFileRoute } from '@tanstack/react-router';

  export const Route = createFileRoute('/_authenticated/tracker-devices/add-device')({
    component: () => <div />
  });
  ```
  Write `apps/web/src/routes/_authenticated/tracker-devices.$deviceId.tsx`:
  ```tsx
  import { createFileRoute } from '@tanstack/react-router';

  export const Route = createFileRoute('/_authenticated/tracker-devices/$deviceId')({
    component: () => <div />
  });
  ```

- [ ] **Step 6: Build (regenerates the route tree + typechecks the typed `<Link>`s) + lint.** With the two stub routes from Step 5 in place, the TanStack Router vite plugin regenerates `routeTree.gen.ts` during `build`, so the list page's `<Link to="/tracker-devices/add-device">` and `<Link to="/tracker-devices/$deviceId" ...>` now resolve and typecheck. From `motorpool-management-system-web/`:
  ```
  pnpm --filter @mms/web build
  pnpm --filter @mms/web lint
  ```
  Both must pass clean; the stub routes make this task green standalone.

- [ ] **Step 7: Commit.**
  ```
  git add apps/web/src/components/shared/status-badge.tsx apps/web/src/components/shared/device-online-indicator.tsx apps/web/src/components/pages/tracker-devices/index.tsx apps/web/src/routes/_authenticated/tracker-devices.index.tsx apps/web/src/routes/_authenticated/tracker-devices.add-device.tsx apps/web/src/routes/_authenticated/tracker-devices.$deviceId.tsx
  git commit -m "feat(web): add admin Trackers list page with status/online badges and route stubs"
  ```

---

### Task 3 — Shared form + register-device page and route

**Files:**
- Create `apps/web/src/components/pages/tracker-devices/action.ts`
- Create `apps/web/src/components/pages/tracker-devices/add-device/index.tsx`
- Modify `apps/web/src/routes/_authenticated/tracker-devices.add-device.tsx` (flesh out the stub created in Task 2)

**Interfaces:**
- Consumes: `useCreateTrackerDevice` (Task 1), `useVehicles` (`@/lib/query/vehicles` → `{ data: VehicleWithBranch[] }`, rows carry `make`/`model`/`license_plate`), `TRACKER_DEVICE_STATUS` + `CreateTrackerDeviceBody`/`UpdateTrackerDeviceBody` (`@mms/shared`), `ConfirmationModal`, `Field*`, `Select*`, `Input`, `Textarea`, `Button`, `Controller`.
- Produces: `trackerDeviceSchema`, `TrackerDeviceFormData`, `useTrackerDeviceForm`, `UNASSIGNED_VEHICLE`, `toCreateBody`, `toUpdateBody`, `toFormValues` (all in `action.ts`, reused by Task 4); `AddTrackerDevice` component; the `/tracker-devices/add-device` route.

- [ ] **Step 1: Write `apps/web/src/components/pages/tracker-devices/action.ts`** — the single source of truth for the register + edit forms.
  ```ts
  // src/components/pages/tracker-devices/action.ts
  import { z } from 'zod';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { useForm } from 'react-hook-form';
  import { TRACKER_DEVICE_STATUS } from '@mms/shared';
  import type {
    CreateTrackerDeviceBody,
    UpdateTrackerDeviceBody
  } from '@mms/shared';
  import type { TrackerDevice } from '@/lib/api/tracker-devices';

  // Radix Select forbids empty-string item values, so an unassigned device uses
  // this sentinel in the vehicle picker; it is normalised to null before submit.
  export const UNASSIGNED_VEHICLE = 'unassigned';

  export const trackerDeviceSchema = z.object({
    imei: z.string().min(1, 'IMEI is required'),
    label: z.string().optional(),
    simNumber: z.string().optional(),
    status: z.nativeEnum(TRACKER_DEVICE_STATUS),
    vehicleId: z.string().optional(),
    notes: z.string().optional()
  });

  export type TrackerDeviceFormData = z.infer<typeof trackerDeviceSchema>;

  export const useTrackerDeviceForm = () => {
    return useForm<TrackerDeviceFormData>({
      resolver: zodResolver(trackerDeviceSchema),
      defaultValues: {
        imei: '',
        label: '',
        simNumber: '',
        status: TRACKER_DEVICE_STATUS.ACTIVE,
        vehicleId: UNASSIGNED_VEHICLE,
        notes: ''
      }
    });
  };

  // Trimmed non-empty string, else null (the API models optional text as nullable).
  const orNull = (v: string | undefined): string | null => {
    const t = v?.trim();
    return t ? t : null;
  };

  // Vehicle Select value -> uuid or null (sentinel/empty -> unassigned).
  const vehicleOrNull = (v: string | undefined): string | null =>
    v && v !== UNASSIGNED_VEHICLE ? v : null;

  // Form -> API create body.
  export function toCreateBody(
    data: TrackerDeviceFormData
  ): CreateTrackerDeviceBody {
    return {
      imei: data.imei.trim(),
      label: orNull(data.label),
      simNumber: orNull(data.simNumber),
      status: data.status,
      vehicleId: vehicleOrNull(data.vehicleId),
      notes: orNull(data.notes)
    };
  }

  // Form -> API update body (PATCH accepts the same full object; server diffs it).
  export function toUpdateBody(
    data: TrackerDeviceFormData
  ): UpdateTrackerDeviceBody {
    return toCreateBody(data);
  }

  // API row -> form values (hydrate the edit form via form.reset).
  export function toFormValues(device: TrackerDevice): TrackerDeviceFormData {
    return {
      imei: device.imei,
      label: device.label ?? '',
      simNumber: device.simNumber ?? '',
      status: device.status,
      vehicleId: device.vehicleId ?? UNASSIGNED_VEHICLE,
      notes: device.notes ?? ''
    };
  }
  ```

- [ ] **Step 2: Write `apps/web/src/components/pages/tracker-devices/add-device/index.tsx`.** Two-step confirm (store pending → modal → mutate). On success navigate back to the list; on 409 the mutation's toast fires and the admin stays to fix the IMEI/vehicle.
  ```tsx
  // src/components/pages/tracker-devices/add-device/index.tsx
  import { useState } from 'react';
  import { Controller } from 'react-hook-form';
  import { useNavigate } from '@tanstack/react-router';
  import { Button } from '@/components/ui/button';
  import {
    FieldGroup,
    Field,
    FieldError,
    FieldLabel
  } from '@/components/ui/field';
  import { Input } from '@/components/ui/input';
  import { Textarea } from '@/components/ui/textarea';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
  } from '@/components/ui/select';
  import { TRACKER_DEVICE_STATUS } from '@mms/shared';
  import { ConfirmationModal } from '@/components/shared/confirmation-modal';
  import { useCreateTrackerDevice } from '@/lib/mutation/tracker-devices';
  import { useVehicles } from '@/lib/query/vehicles';
  import {
    useTrackerDeviceForm,
    toCreateBody,
    UNASSIGNED_VEHICLE,
    type TrackerDeviceFormData
  } from '../action';

  // Titleize a status enum value ('active' -> 'Active').
  const titleize = (s: string) => s.replace(/\b\w/g, (l) => l.toUpperCase());

  export function AddTrackerDevice() {
    const navigate = useNavigate();
    const createDevice = useCreateTrackerDevice();
    const form = useTrackerDeviceForm();
    const { data: vehicles } = useVehicles(1, 200);
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingData, setPendingData] = useState<TrackerDeviceFormData | null>(
      null
    );

    const onSubmit = (data: TrackerDeviceFormData) => {
      setPendingData(data);
      setShowConfirm(true);
    };

    const handleConfirmAdd = () => {
      if (!pendingData) return;
      createDevice.mutate(toCreateBody(pendingData), {
        onSuccess: () => navigate({ to: '/tracker-devices' }),
        onSettled: () => {
          setShowConfirm(false);
          setPendingData(null);
        }
      });
    };

    return (
      <div>
        <form
          className="flex flex-col justify-center p-11 md:p-13"
          id="add-device-form"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold">Register Tracker Device</h1>
              <p className="text-muted-foreground text-balance">
                Register a GPS tracker and optionally assign it to a vehicle.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-11">
              <Controller
                name="imei"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="imei">IMEI *</FieldLabel>
                    <Input
                      {...field}
                      id="imei"
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter device IMEI"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="label"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="label">Label</FieldLabel>
                    <Input
                      {...field}
                      id="label"
                      aria-invalid={fieldState.invalid}
                      placeholder="e.g. Fleet unit 12"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="simNumber"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="simNumber">SIM Number</FieldLabel>
                    <Input
                      {...field}
                      id="simNumber"
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter SIM number"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="status"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="status">Status *</FieldLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(TRACKER_DEVICE_STATUS).map((status) => (
                          <SelectItem key={status} value={status}>
                            {titleize(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="vehicleId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="vehicleId">Assigned Vehicle</FieldLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED_VEHICLE}>
                          Unassigned
                        </SelectItem>
                        {vehicles?.data?.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.make} {v.model} — {v.license_plate}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>
            <Controller
              name="notes"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="notes">Notes</FieldLabel>
                  <Textarea
                    {...field}
                    id="notes"
                    rows={4}
                    aria-invalid={fieldState.invalid}
                    placeholder="Optional notes"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>

          <Field className="mt-10 w-fit">
            <Button
              type="submit"
              className="w-fit px-11"
              form="add-device-form"
              disabled={createDevice.isPending}
            >
              {createDevice.isPending ? 'Registering...' : 'Register Device'}
            </Button>
          </Field>
        </form>

        <ConfirmationModal
          open={showConfirm}
          onOpenChange={setShowConfirm}
          title="Register Tracker Device"
          description="Are you sure you want to register this tracker device?"
          confirmLabel="Register Device"
          loading={createDevice.isPending}
          onConfirm={handleConfirmAdd}
          onCancel={() => setPendingData(null)}
        />
      </div>
    );
  }
  ```

- [ ] **Step 3: Flesh out the stub `apps/web/src/routes/_authenticated/tracker-devices.add-device.tsx`** (created in Task 2) — replace its placeholder `component: () => <div />` with the real component below (thin, no `staticData` — mirrors `tools.add-tools.tsx`; the admin-only API + the guarded list entry point protect it, and omitting `staticData` keeps it out of the sidebar).
  ```tsx
  import { AddTrackerDevice } from '@/components/pages/tracker-devices/add-device';
  import { createFileRoute } from '@tanstack/react-router';

  export const Route = createFileRoute('/_authenticated/tracker-devices/add-device')({
    component: AddTrackerDevice
  });
  ```

- [ ] **Step 4: Build + lint** (from `motorpool-management-system-web/`): `pnpm --filter @mms/web build` and `pnpm --filter @mms/web lint`. Both pass standalone — all routes already exist (the `$deviceId` stub was created in Task 2), so the fleshed-out `add-device` route and its typed `<Link>`s resolve.

- [ ] **Step 5: Commit.**
  ```
  git add apps/web/src/components/pages/tracker-devices/action.ts apps/web/src/components/pages/tracker-devices/add-device/index.tsx apps/web/src/routes/_authenticated/tracker-devices.add-device.tsx
  git commit -m "feat(web): add tracker device registration form with vehicle picker"
  ```

---

### Task 4 — Detail/edit page (assign, replace, decommission, delete) + route

**Files:**
- Create `apps/web/src/components/pages/tracker-devices/device-details/index.tsx`
- Modify `apps/web/src/routes/_authenticated/tracker-devices.$deviceId.tsx` (flesh out the stub created in Task 2)

**Interfaces:**
- Consumes: `useTrackerDevice` (Task 1), `useUpdateTrackerDevice` + `useDeleteTrackerDevice` (Task 1), `useVehicles`, the shared `action.ts` helpers (`useTrackerDeviceForm`, `toUpdateBody`, `toFormValues`, `UNASSIGNED_VEHICLE`), `StatusBadge`, `DeviceOnlineIndicator`, `ConfirmationModal` (with `variant="destructive"`), `Loading`.
- Produces: default-exported `TrackerDeviceInner({ deviceId })`; the `/tracker-devices/$deviceId` route.

- [ ] **Step 1: Write `apps/web/src/components/pages/tracker-devices/device-details/index.tsx`.** Inline-edit toggle disables inputs when not editing; Status + Assigned-Vehicle render as disabled read-only inputs off-edit (mirrors tools-inner / vehicle-inner). "Replace" = change vehicle + flip old device status; "Decommission" = set status → decommissioned via the same Save. Delete is a separate destructive confirm.

  **Two distinct admin actions — do not conflate them (matches the Plan 1 backend):** _Decommission_ (status → `decommissioned` via PATCH/Save) **retires** the device but keeps its record and history; _Delete_ (`DELETE /api/tracker-devices/:id`, a **hard** delete) **permanently removes the device record** from the system. Both map to real endpoints and both stay in the UI; the copy below labels them accordingly.
  ```tsx
  // src/components/pages/tracker-devices/device-details/index.tsx
  import { useEffect, useState } from 'react';
  import { Controller } from 'react-hook-form';
  import { useNavigate } from '@tanstack/react-router';
  import { Button } from '@/components/ui/button';
  import {
    FieldGroup,
    Field,
    FieldError,
    FieldLabel
  } from '@/components/ui/field';
  import { Input } from '@/components/ui/input';
  import { Textarea } from '@/components/ui/textarea';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
  } from '@/components/ui/select';
  import { Loading } from '@/components/ui/loader';
  import StatusBadge from '@/components/shared/status-badge';
  import { DeviceOnlineIndicator } from '@/components/shared/device-online-indicator';
  import { ConfirmationModal } from '@/components/shared/confirmation-modal';
  import { TRACKER_DEVICE_STATUS } from '@mms/shared';
  import { useTrackerDevice } from '@/lib/query/tracker-devices';
  import {
    useUpdateTrackerDevice,
    useDeleteTrackerDevice
  } from '@/lib/mutation/tracker-devices';
  import { useVehicles } from '@/lib/query/vehicles';
  import {
    useTrackerDeviceForm,
    toUpdateBody,
    toFormValues,
    UNASSIGNED_VEHICLE,
    type TrackerDeviceFormData
  } from '../action';

  // Titleize a status enum value ('active' -> 'Active').
  const titleize = (s: string) => s.replace(/\b\w/g, (l) => l.toUpperCase());

  const TrackerDeviceInner = ({ deviceId }: { deviceId: string }) => {
    const { data: device } = useTrackerDevice(deviceId);
    const { data: vehicles, isPending: vehiclesLoading } = useVehicles(1, 200);
    const updateDevice = useUpdateTrackerDevice();
    const deleteDevice = useDeleteTrackerDevice();
    const navigate = useNavigate();
    const [isEditing, setIsEditing] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [pendingData, setPendingData] = useState<TrackerDeviceFormData | null>(
      null
    );

    const form = useTrackerDeviceForm();

    useEffect(() => {
      if (device) form.reset(toFormValues(device));
    }, [device, form]);

    const onSubmit = (data: TrackerDeviceFormData) => {
      setPendingData(data);
      setShowConfirm(true);
    };

    const handleConfirmUpdate = () => {
      if (!device || !pendingData) return;
      updateDevice.mutate(
        { id: device.id, updates: toUpdateBody(pendingData) },
        {
          onSuccess: () => setIsEditing(false),
          onSettled: () => {
            setShowConfirm(false);
            setPendingData(null);
          }
        }
      );
    };

    const handleConfirmDelete = () => {
      if (!device) return;
      deleteDevice.mutate(device.id, {
        onSuccess: () => navigate({ to: '/tracker-devices' }),
        onSettled: () => setShowDelete(false)
      });
    };

    if (!device || vehiclesLoading) return <Loading />;

    const assignedVehicle = vehicles?.data?.find((v) => v.id === device.vehicleId);
    const assignedLabel = assignedVehicle
      ? `${assignedVehicle.make} ${assignedVehicle.model} — ${assignedVehicle.license_plate}`
      : 'Unassigned';

    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Tracker Device</h1>
            <StatusBadge status={device.status} />
            <DeviceOnlineIndicator lastSeenAt={device.lastSeenAt} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDelete(true)}
            >
              Delete permanently
            </Button>
            <Button onClick={() => setIsEditing(!isEditing)}>
              {isEditing ? 'Cancel' : 'Edit'}
            </Button>
          </div>
        </div>

        <form
          className="flex flex-col justify-center"
          id="edit-device-form"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <div className="grid grid-cols-2 gap-11">
              <Controller
                name="imei"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="imei">IMEI *</FieldLabel>
                    <Input
                      {...field}
                      id="imei"
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter IMEI"
                      disabled={!isEditing}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="label"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="label">Label</FieldLabel>
                    <Input
                      {...field}
                      id="label"
                      aria-invalid={fieldState.invalid}
                      placeholder="Label"
                      disabled={!isEditing}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="simNumber"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="simNumber">SIM Number</FieldLabel>
                    <Input
                      {...field}
                      id="simNumber"
                      aria-invalid={fieldState.invalid}
                      placeholder="SIM number"
                      disabled={!isEditing}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {isEditing ? (
                <Controller
                  name="status"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="status">Status</FieldLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(TRACKER_DEVICE_STATUS).map((status) => (
                            <SelectItem key={status} value={status}>
                              {titleize(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              ) : (
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <Input
                    value={titleize(device.status)}
                    disabled
                    className="bg-muted"
                  />
                </Field>
              )}

              {isEditing ? (
                <Controller
                  name="vehicleId"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="vehicleId">
                        Assigned Vehicle
                      </FieldLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vehicle" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED_VEHICLE}>
                            Unassigned
                          </SelectItem>
                          {vehicles?.data?.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.make} {v.model} — {v.license_plate}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              ) : (
                <Field>
                  <FieldLabel>Assigned Vehicle</FieldLabel>
                  <Input value={assignedLabel} disabled className="bg-muted" />
                </Field>
              )}

              <Controller
                name="notes"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field
                    data-invalid={fieldState.invalid}
                    className="col-span-2"
                  >
                    <FieldLabel htmlFor="notes">Notes</FieldLabel>
                    <Textarea
                      {...field}
                      id="notes"
                      rows={4}
                      aria-invalid={fieldState.invalid}
                      placeholder="Notes"
                      disabled={!isEditing}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>
          </FieldGroup>

          {isEditing && (
            <Field className="mt-10 w-fit">
              <Button
                type="submit"
                className="w-fit px-11"
                form="edit-device-form"
                disabled={updateDevice.isPending}
              >
                {updateDevice.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </Field>
          )}
        </form>

        <ConfirmationModal
          open={showConfirm}
          onOpenChange={setShowConfirm}
          title="Update Tracker Device"
          description="Are you sure you want to save these changes?"
          confirmLabel="Save Changes"
          loading={updateDevice.isPending}
          onConfirm={handleConfirmUpdate}
          onCancel={() => setPendingData(null)}
        />

        <ConfirmationModal
          open={showDelete}
          onOpenChange={setShowDelete}
          title="Delete Tracker Device"
          description="This permanently removes the device record and its history. This action cannot be undone. To retire the device while keeping its record, set its status to Decommissioned instead."
          confirmLabel="Delete permanently"
          variant="destructive"
          loading={deleteDevice.isPending}
          onConfirm={handleConfirmDelete}
        />
      </div>
    );
  };

  export default TrackerDeviceInner;
  ```

- [ ] **Step 2: Flesh out the stub `apps/web/src/routes/_authenticated/tracker-devices.$deviceId.tsx`** (created in Task 2) — replace its placeholder `component: () => <div />` with the real component below (thin, reads the param, mirrors `tools.$toolsId.tsx`).
  ```tsx
  import TrackerDeviceInner from '@/components/pages/tracker-devices/device-details';
  import { createFileRoute, useParams } from '@tanstack/react-router';

  export const Route = createFileRoute('/_authenticated/tracker-devices/$deviceId')({
    component: RouteComponent
  });

  function RouteComponent() {
    const { deviceId } = useParams({
      from: '/_authenticated/tracker-devices/$deviceId'
    });
    return <TrackerDeviceInner deviceId={deviceId} />;
  }
  ```

- [ ] **Step 3: Build — regenerates `routeTree.gen.ts` and typechecks the fleshed-out `$deviceId` route plus every typed `<Link>` in the feature.** From `motorpool-management-system-web/`:
  ```
  pnpm --filter @mms/web build
  pnpm --filter @mms/web lint
  ```
  Both must pass clean.

- [ ] **Step 4: Commit.**
  ```
  git add apps/web/src/components/pages/tracker-devices/device-details/index.tsx apps/web/src/routes/_authenticated/tracker-devices.$deviceId.tsx
  git commit -m "feat(web): add tracker device detail page with edit, decommission, and delete"
  ```

---

### Task 5 — Surface the assigned tracker on the Vehicle detail page

**Files:**
- Create `apps/web/src/components/pages/vehicles/vehicle-inner/vehicle-tracker-summary.tsx`
- Modify `apps/web/src/components/pages/vehicles/vehicle-inner/page.tsx`

**Interfaces:**
- Consumes: `useVehicleTrackerDevice` (Task 1), `useUserRole` (`@/hooks/use-user-role` → `{ data: { role } }`), `USER_ROLES`, `StatusBadge`, `DeviceOnlineIndicator`, `Card*`, `Skeleton`, `Radio` (lucide, verified present), `Link`.
- Produces: `VehicleTrackerSummary({ vehicleId })`; a new read-only section on the vehicle detail page.

- [ ] **Step 1: Write `apps/web/src/components/pages/vehicles/vehicle-inner/vehicle-tracker-summary.tsx`.** Admin-only (the tracker API is admin-gated), so `useUserRole` gates both the fetch (`enabled`) and the render. Prefers the *active* device; links to the Trackers detail/list for management.
  ```tsx
  import { Link } from '@tanstack/react-router';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
  } from '@/components/ui/card';
  import { Radio } from 'lucide-react';
  import StatusBadge from '@/components/shared/status-badge';
  import { DeviceOnlineIndicator } from '@/components/shared/device-online-indicator';
  import { Skeleton } from '@/components/ui/skeleton';
  import { useVehicleTrackerDevice } from '@/lib/query/tracker-devices';
  import { useUserRole } from '@/hooks/use-user-role';
  import { USER_ROLES } from '@/lib/enums';

  interface VehicleTrackerSummaryProps {
    vehicleId: string;
  }

  // Read-only surfacing of the vehicle's assigned tracker. Management (assign/
  // replace/decommission) lives on the admin Trackers page — this only reads.
  // The tracker-devices API is admin-only, so this renders nothing for non-admins
  // (and skips the fetch to avoid a needless 403).
  export const VehicleTrackerSummary = ({
    vehicleId
  }: VehicleTrackerSummaryProps) => {
    const { data: role } = useUserRole();
    const isAdmin = role?.role === USER_ROLES.admin;
    const { data, isLoading } = useVehicleTrackerDevice(vehicleId, isAdmin);

    if (!isAdmin) return null;

    if (isLoading) {
      return (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full rounded-lg md:w-1/2" />
        </div>
      );
    }

    const device =
      data?.data?.find((d) => d.status === 'active') ?? data?.data?.[0];

    return (
      <div className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">GPS Tracker</h2>
        <Card className="md:w-1/2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-5 w-5" />
              Assigned Tracker
            </CardTitle>
            <CardDescription>
              The GPS device currently registered to this vehicle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {device ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">IMEI</span>
                  <Link
                    to="/tracker-devices/$deviceId"
                    params={{ deviceId: device.id }}
                    className="font-medium hover:underline"
                  >
                    {device.imei}
                  </Link>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Status</span>
                  <StatusBadge status={device.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Connectivity
                  </span>
                  <DeviceOnlineIndicator lastSeenAt={device.lastSeenAt} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Last Seen
                  </span>
                  <span className="text-sm">
                    {device.lastSeenAt
                      ? new Date(device.lastSeenAt).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No tracker assigned.{' '}
                <Link to="/tracker-devices" className="underline">
                  Manage trackers
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };
  ```

- [ ] **Step 2: Wire it into `page.tsx`.** Add the import after the existing `VehicleMaintenanceInsights` import (line ~32):
  ```tsx
  import { VehicleTrackerSummary } from './vehicle-tracker-summary';
  ```
  And render it as a sibling immediately after the `<VehicleMaintenanceInsights ... />` line (~542):
  ```tsx
        <VehicleMaintenanceInsights vehicleId={vehicleId} />
        <VehicleTrackerSummary vehicleId={vehicleId} />
  ```

- [ ] **Step 3: Build + lint** (from `motorpool-management-system-web/`): `pnpm --filter @mms/web build` and `pnpm --filter @mms/web lint`. Must pass.

- [ ] **Step 4: Commit.**
  ```
  git add apps/web/src/components/pages/vehicles/vehicle-inner/vehicle-tracker-summary.tsx apps/web/src/components/pages/vehicles/vehicle-inner/page.tsx
  git commit -m "feat(web): surface assigned GPS tracker on vehicle detail page"
  ```

---

### Task 6 — Playwright e2e spec

**Files:**
- Create `apps/web/e2e/trackers.spec.ts`

**Interfaces:**
- Consumes: `login` / `shot` / `CREDENTIALS` / `apiLogin` / `apiGet` / `listData` (`./helpers`). Prereq (per `playwright.config.ts`): the app must already be running — web on `http://localhost:5173`, API on `http://localhost:3001` (`pnpm dev` from `motorpool-management-system-web/`). The suite drives the running app; it does not start servers.

- [ ] **Step 1: Write `apps/web/e2e/trackers.spec.ts`** — mirrors `trip-lifecycle.spec.ts` (UI drive + API assertion + role-gating check). Uses a unique IMEI per run so reruns don't collide with `IMEI_TAKEN`.
  ```ts
  import { test, expect } from '@playwright/test';
  import { login, shot, CREDENTIALS, apiLogin, apiGet, listData } from './helpers';

  test('admin registers a tracker device and it appears in the list', async ({
    page,
    request
  }) => {
    const imei = `E2E${Date.now()}`;

    await login(page, 'admin');

    // Trackers lives under the Settings group in the sidebar (admin-only).
    await page.getByRole('link', { name: 'Trackers', exact: true }).first().click();
    await page.waitForURL(/\/tracker-devices/, { timeout: 15_000 });
    await expect(
      page.getByRole('heading', { name: 'Tracker Devices' })
    ).toBeVisible({ timeout: 15_000 });

    // Register a new device.
    await page.getByRole('link', { name: 'Register Device' }).click();
    await page.waitForURL(/\/tracker-devices\/add-device/, { timeout: 15_000 });
    await page.locator('#imei').fill(imei);
    await page.locator('#label').fill('E2E Unit');
    await page.getByRole('button', { name: 'Register Device' }).click();

    // Two-step confirm modal.
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Register Device' }).click();

    // Back on the list, the new IMEI is visible.
    await page.waitForURL(/\/tracker-devices$/, { timeout: 15_000 });
    await expect(page.getByText(imei)).toBeVisible({ timeout: 15_000 });
    await shot(page, 'trackers-1-registered');

    // The API confirms it persisted.
    const admin = await apiLogin(request, CREDENTIALS.admin);
    const devices = listData(
      await apiGet(request, '/api/tracker-devices', admin.token)
    );
    expect(
      devices.some((d) => d.imei === imei),
      'device persisted via API'
    ).toBeTruthy();
  });

  test('non-admin cannot see or reach the Trackers page', async ({ page }) => {
    await login(page, 'driver');

    // Not surfaced in the sidebar for drivers.
    await expect(
      page.getByRole('link', { name: 'Trackers', exact: true })
    ).toHaveCount(0);

    // Direct navigation is redirected to the dashboard by the auth guard.
    await page.goto('/tracker-devices');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });
  ```

- [ ] **Step 2: Run the e2e suite** (app must be running). From `motorpool-management-system-web/`:
  ```
  pnpm --filter @mms/web test:e2e
  ```
  Both new tests must pass (existing smoke/lifecycle specs stay green — `workers: 1`, so no DB races).

- [ ] **Step 3: Commit.**
  ```
  git add apps/web/e2e/trackers.spec.ts
  git commit -m "test(web): e2e for tracker device registration and admin-only gating"
  ```

---

### Task 7 — Root README functional-doc update

**Files:**
- Modify `README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Add a tracker-registry subsection to §12 ("Live GPS tracking and the map").** Insert immediately **before** the `---` that closes §12 (after the current "Security" bullet):
  ```markdown
  ### 12.1 Tracker device registry (Admins)

  Behind the live map is a registry of the physical GPS units. Admins manage it from the **Trackers** screen (under *Settings* in the menu):

  - **Register a device.** Record a tracker by its **IMEI**, with an optional label, SIM number, lifecycle status, and free-text notes. A device may be left **unassigned** (a spare) or tied to a vehicle at registration.
  - **Assign / replace.** A device can be assigned to a vehicle. A vehicle may have **at most one _active_ tracker** at a time — the system blocks a second active assignment, so replacing a unit means deactivating or decommissioning the old one first.
  - **Lifecycle status.** Each device is *active*, *inactive*, or *decommissioned*. Only *active* devices feed live positions.
  - **Online / offline.** Separately from lifecycle status, each device shows an **online/offline** indicator derived from how recently it last reported in (within the last few minutes = online).
  - **Decommission / delete.** Devices can be decommissioned (kept for history) or deleted outright.
  - **On the vehicle page.** A vehicle's detail page shows a read-only **GPS Tracker** panel with its assigned device's IMEI, status, and connectivity (Admins only).

  **Who can manage trackers.** The Trackers registry is **Admin-only**, end to end (menu, pages, and API).
  ```

- [ ] **Step 2: Add a permissions-table row to §15.** Directly **after** the `| **GPS live tracking + Analytics** | ...` row:
  ```markdown
  | **Tracker device registry** | Manage | — | — | — | — |
  ```

- [ ] **Step 3: Commit.**
  ```
  git add README.md
  git commit -m "docs: document the admin tracker device registry and its permissions"
  ```

---

## Self-Review

**Docs scope (spec §13) — no deliverable silently dropped.** The §13 documentation is split across the three plans by ownership: the `DEVELOPER_GUIDE.md` tracker-devices endpoint docs are owned by **Plan 1** (already done); `apps/gps-gateway/README.md` and the `tools/firmware` distinguishing note are owned by **Plan 3**; **this plan (Plan 2) owns only the root-README functional update** (Task 7). Plan 2 therefore intentionally touches no other §13 doc.

| Spec / requirement | Covered by |
| --- | --- |
| Admin-only Trackers management page (list) | Task 2 (page + `allowedRoles` route → guard + sidebar) |
| Register a device | Task 3 (add-device form + route) |
| Assign a device to a vehicle | Task 3 (vehicle picker) + Task 4 (reassign in edit) |
| Replace a device (respect one-active-per-vehicle) | Task 4 (status flip + reassign) + Task 1 (`VEHICLE_HAS_ACTIVE_DEVICE` toast) |
| Decommission a device | Task 4 (status → decommissioned via Save) |
| Delete a device | Task 4 (destructive `ConfirmationModal` + `useDeleteTrackerDevice`) |
| Online/offline from `lastSeenAt` | Task 1 (`isDeviceOnline`) + Task 2 (`DeviceOnlineIndicator`, used in list/detail/vehicle) |
| Device status badge (active/inactive/decommissioned) | Task 2 (`status-badge.tsx` switch extension) |
| Surface assigned tracker on Vehicle detail | Task 5 (`VehicleTrackerSummary`, admin-gated) |
| Data layer (api/query/mutation) | Task 1 |
| 409 `IMEI_TAKEN` / `VEHICLE_HAS_ACTIVE_DEVICE` surfaced as toasts | Task 1 (`onError` uses `error.message`), exercised by Tasks 3–4 |
| TanStack Query invalidation on every mutation | Task 1 (all three hooks invalidate `['tracker-devices']`) |
| sonner toasts in mutation hooks | Task 1 |
| Two-step confirm on every create/update/delete | Tasks 3, 4 (`ConfirmationModal`) |
| Admin-only enforcement | Task 2 (`allowedRoles`), Task 5 (`useUserRole` gate), backend `requireRole` (Plan 1) |
| e2e verification (register + gating) | Task 6 |
| No unit tests; verify via tsc/eslint/vite build + Playwright | Every task's verification step |
| Root README functional-doc update | Task 7 |
| TypeScript ESM, no `any`, match existing patterns | Global Constraints; all code copies existing file idioms |
| Never edit `routeTree.gen.ts`, guard, or sidebar | File Structure ("Never touch"); routes are data-driven |
| Branch `production`, scoped `git add`, no `Co-Authored-By`, no push/merge | Global Constraints; every commit step |
