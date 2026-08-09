import { z } from 'zod';
import { TRACKER_DEVICE_STATUS } from '../enums.js';
import { paginationQuerySchema, sortQuerySchema } from './common.js';

const statusSchema = z.nativeEnum(TRACKER_DEVICE_STATUS);

// Register a tracker: imei is required; vehicleId optional (a device may be an
// unassigned spare). status defaults to active.
export const createTrackerDeviceBodySchema = z.object({
  imei: z.string().min(1),
  vehicleId: z.string().uuid().nullable().optional(),
  label: z.string().nullable().optional(),
  simNumber: z.string().nullable().optional(),
  status: statusSchema.default('active'),
  notes: z.string().nullable().optional()
});
export type CreateTrackerDeviceBody = z.infer<typeof createTrackerDeviceBodySchema>;

export const updateTrackerDeviceBodySchema = createTrackerDeviceBodySchema.partial();
export type UpdateTrackerDeviceBody = z.infer<typeof updateTrackerDeviceBodySchema>;

// The list's sortable columns — the table's visible columns, nothing more.
// (Vehicle is resolved client-side from a lookup, so it is not sortable here.)
export const TRACKER_DEVICE_SORT_COLUMNS = [
  'imei',
  'label',
  'simNumber',
  'status',
  'lastSeenAt'
] as const;
export const trackerDevicesListQuerySchema = paginationQuerySchema
  .extend({
    vehicleId: z.string().uuid().optional(),
    status: statusSchema.optional()
  })
  .merge(sortQuerySchema(TRACKER_DEVICE_SORT_COLUMNS));
export type TrackerDevicesListQuery = z.infer<typeof trackerDevicesListQuerySchema>;

// The gateway sends the identifier the tracker reported; we resolve it to a vehicle.
export const resolveDeviceQuerySchema = z.object({ deviceId: z.string().min(1) });
export type ResolveDeviceQuery = z.infer<typeof resolveDeviceQuerySchema>;

export interface ResolveDeviceResponse {
  vehicleId: string;
}
