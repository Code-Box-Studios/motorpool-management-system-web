import { z } from 'zod';
import { FUEL_TYPE, VEHICLE_STATUS } from '../enums.js';
import { nullableUuid } from './common.js';

const vehicleStatusSchema = z.nativeEnum(VEHICLE_STATUS);
const fuelTypeSchema = z.nativeEnum(FUEL_TYPE);

// Validation deliberately mirrors the current (lax) FE rules: year floor 1900
// with no ceiling, plate/vin any non-empty string, dates any parseable value.
export const createVehicleBodySchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1900),
  vin: z.string().min(1),
  licensePlate: z.string().min(1),
  capacity: z.coerce.number().int().min(1),
  fuelType: fuelTypeSchema,
  mileage: z.coerce.number().int().min(0),
  status: vehicleStatusSchema.default('available'),
  insuranceExpiry: z.coerce.date(),
  registrationExpiry: z.coerce.date(),
  branchId: z.string().uuid(),
  maintenanceStandardId: nullableUuid
});
export type CreateVehicleBody = z.infer<typeof createVehicleBodySchema>;

// Partial for PATCH, plus removedImages (URLs to drop from images[] on edit).
export const updateVehicleBodySchema = createVehicleBodySchema.partial().extend({
  removedImages: z.union([z.string(), z.array(z.string())]).optional()
});
export type UpdateVehicleBody = z.infer<typeof updateVehicleBodySchema>;

// Loose response type (Prisma row serialized to JSON); the FE consumes the
// type, not runtime validation.
export const vehicleResponseSchema = z
  .object({
    id: z.string().uuid(),
    make: z.string(),
    model: z.string(),
    year: z.number(),
    vin: z.string(),
    licensePlate: z.string(),
    capacity: z.number(),
    fuelType: fuelTypeSchema,
    mileage: z.number(),
    status: vehicleStatusSchema,
    images: z.array(z.string()),
    branchId: z.string().uuid().nullable(),
    maintenanceStandardId: z.string().uuid().nullable()
  })
  .passthrough();
export type VehicleResponse = z.infer<typeof vehicleResponseSchema>;
