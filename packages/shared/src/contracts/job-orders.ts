import { z } from 'zod';
import { JOB_ORDER_STATUS, REPAIR_DONE_TYPE } from '../enums.js';
import { paginationQuerySchema } from './common.js';

export const createJobOrderBodySchema = z.object({
  vehicleId: z.string().uuid(),
  branchId: z.string().uuid(),
  incidentDate: z.coerce.date().nullable().optional(),
  incidentDetails: z.string().nullable().optional(),
  requestedById: z.string().uuid().nullable().optional(),
  remarks: z.string().nullable().optional()
});
export type CreateJobOrderBody = z.infer<typeof createJobOrderBodySchema>;

// PATCH legal only while pending (service-enforced); never changes status.
export const updateJobOrderBodySchema = createJobOrderBodySchema.partial();
export type UpdateJobOrderBody = z.infer<typeof updateJobOrderBodySchema>;

// note(admin): assigns a mechanic and records spare parts used (quantity is a
// NEW per-part input; the old FE stored ids only).
export const noteJobOrderBodySchema = z.object({
  assignedMechanicId: z.string().uuid(),
  dateOfRequest: z.coerce.date().nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  spareParts: z
    .array(z.object({ sparePartId: z.string().uuid(), quantity: z.coerce.number().int().min(1).default(1) }))
    .default([])
});
export type NoteJobOrderBody = z.infer<typeof noteJobOrderBodySchema>;

// complete-repair(admin).
export const completeRepairBodySchema = z.object({
  repairDone: z.nativeEnum(REPAIR_DONE_TYPE),
  remarks: z.string().nullable().optional(),
  actualDateOfRelease: z.coerce.date().nullable().optional()
});
export type CompleteRepairBody = z.infer<typeof completeRepairBodySchema>;

export const jobOrdersListQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(JOB_ORDER_STATUS).optional()
});
export type JobOrdersListQuery = z.infer<typeof jobOrdersListQuerySchema>;
