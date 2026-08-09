import { z } from 'zod';
import {
  booleanFromString,
  paginationQuerySchema,
  sortQuerySchema
} from './common.js';

export const driverStatusSchema = z.enum(['active', 'inactive', 'on_trip']);

// The list's sortable columns — the table's visible columns, nothing more.
export const DRIVER_SORT_COLUMNS = [
  'fullName',
  'licenseNumber',
  'phone',
  'status'
] as const;
export const driversListQuerySchema = paginationQuerySchema.merge(
  sortQuerySchema(DRIVER_SORT_COLUMNS)
);
export type DriversListQuery = z.infer<typeof driversListQuerySchema>;

// The photo rides in as a multipart file (field name `photo`), never in the
// body — the server derives its path. Everything else still accepts JSON, so
// the pre-multipart callers keep working.
export const createDriverBodySchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  dateOfBirth: z.coerce.date().optional(),
  licenseNumber: z.string().optional(),
  licenseType: z.string().optional(),
  licenseExpiry: z.coerce.date().optional(),
  status: driverStatusSchema.optional(),
  assignedVehicleId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  sssNumber: z.string().optional(),
  tin: z.string().optional(),
  hireDate: z.coerce.date().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional()
});
export type CreateDriverBody = z.infer<typeof createDriverBodySchema>;

export const updateDriverBodySchema = createDriverBodySchema.partial().extend({
  removePhoto: booleanFromString.optional()
});
export type UpdateDriverBody = z.infer<typeof updateDriverBodySchema>;

// Response type is intentionally loose (Prisma row serialized to JSON);
// the FE consumes it via the shared type, not runtime validation.
export const driverResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  status: driverStatusSchema,
  userId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  assignedVehicleId: z.string().uuid().nullable()
}).passthrough();
export type DriverResponse = z.infer<typeof driverResponseSchema>;
