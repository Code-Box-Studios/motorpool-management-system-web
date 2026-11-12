import { z } from 'zod';
import { MAINTENANCE_TYPE } from '@/lib/enums';

// Keep empty inputs distinct from an explicit zero until request construction.
export const maintenanceSchema = z.object({
  vehicle_id: z.string().uuid('Please select a vehicle'),
  date: z.string().min(1, 'Date is required'),
  type: z.enum(Object.values(MAINTENANCE_TYPE) as [string, ...string[]]),
  description: z.string().optional(),
  cost: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0),
      'Cost must be 0 or greater'
    )
    .optional(),
  mileage: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        (Number.isSafeInteger(Number(value)) && Number(value) >= 0),
      'Mileage must be a whole number 0 or greater'
    )
    .optional(),
  next_due: z.string().optional()
});

export type MaintenanceFormData = z.infer<typeof maintenanceSchema>;
