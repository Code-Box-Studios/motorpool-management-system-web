import { z } from 'zod';
import { INTERVAL_TYPE, MAINTENANCE_TYPE } from '../enums.js';

// ----- Simple service-history rows (/maintenance) -----
export const createMaintenanceBodySchema = z.object({
  vehicleId: z.string().uuid(),
  type: z.nativeEnum(MAINTENANCE_TYPE),
  date: z.coerce.date(),
  cost: z.coerce.number().min(0).nullable().optional(),
  mileage: z.coerce.number().int().min(0).nullable().optional(),
  nextDue: z.coerce.date().nullable().optional(), // manually entered, NOT computed
  description: z.string().nullable().optional()
});
export type CreateMaintenanceBody = z.infer<typeof createMaintenanceBodySchema>;

export const updateMaintenanceBodySchema = createMaintenanceBodySchema.partial();
export type UpdateMaintenanceBody = z.infer<typeof updateMaintenanceBodySchema>;

// ----- Standards + nested schedule items (/maintenance-standards) -----
export const createScheduleItemBodySchema = z.object({
  taskName: z.string().min(1),
  taskDescription: z.string().nullable().optional(),
  intervalType: z.nativeEnum(INTERVAL_TYPE).default('mileage'),
  intervalMileage: z.coerce.number().int().min(0).nullable().optional(),
  intervalMonths: z.coerce.number().int().min(0).nullable().optional()
});
export type CreateScheduleItemBody = z.infer<typeof createScheduleItemBodySchema>;

export const createStandardBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  scheduleItems: z.array(createScheduleItemBodySchema).optional()
});
export type CreateStandardBody = z.infer<typeof createStandardBodySchema>;

export const updateStandardBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional()
});
export type UpdateStandardBody = z.infer<typeof updateStandardBodySchema>;

// ----- Per-vehicle tracking (/vehicles/:id/maintenance-tracking, /maintenance-tracking/:id/complete) -----
export const assignTrackingBodySchema = z.object({
  maintenanceStandardId: z.string().uuid()
});
export type AssignTrackingBody = z.infer<typeof assignTrackingBodySchema>;

export const completeTrackingBodySchema = z.object({
  completedMileage: z.coerce.number().int().min(0),
  notes: z.string().nullable().optional()
});
export type CompleteTrackingBody = z.infer<typeof completeTrackingBodySchema>;
