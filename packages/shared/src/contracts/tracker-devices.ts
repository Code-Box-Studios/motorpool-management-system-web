import { z } from 'zod';
import { TRACKER_DEVICE_STATUS } from '../enums.js';
import { paginationQuerySchema } from './common.js';

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

export const trackerDevicesListQuerySchema = paginationQuerySchema.extend({
  vehicleId: z.string().uuid().optional(),
  status: statusSchema.optional()
});
export type TrackerDevicesListQuery = z.infer<typeof trackerDevicesListQuerySchema>;

// The gateway sends the identifier the tracker reported; we resolve it to a vehicle.
export const resolveDeviceQuerySchema = z.object({ deviceId: z.string().min(1) });
export type ResolveDeviceQuery = z.infer<typeof resolveDeviceQuerySchema>;

export interface ResolveDeviceResponse {
  vehicleId: string;
}
