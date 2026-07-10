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
