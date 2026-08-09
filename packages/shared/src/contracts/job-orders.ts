import { z } from 'zod';
import { JOB_ORDER_STATUS, REPAIR_DONE_TYPE } from '../enums.js';
import { paginationQuerySchema, sortQuerySchema } from './common.js';

export const createJobOrderBodySchema = z.object({
  vehicleId: z.string().uuid(),
  branchId: z.string().uuid(),
  // A repair request that does not say what happened is a repair request nobody
  // can act on: the admin has to assign a mechanic and note the parts off the
  // back of it. Both were optional.
  incidentDate: z.coerce.date(),
  incidentDetails: z.string().min(1),
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

// complete-repair(admin). completedMileage is required: the maintenance row this
// writes is what "last service" means to the risk model, and a row with no
// odometer on it reads as "never serviced" — so a completed repair used to make
// a vehicle look MORE overdue, not less.
export const completeRepairBodySchema = z.object({
  repairDone: z.nativeEnum(REPAIR_DONE_TYPE),
  completedMileage: z.coerce.number().int().nonnegative(),
  remarks: z.string().nullable().optional(),
  actualDateOfRelease: z.coerce.date().nullable().optional()
});
export type CompleteRepairBody = z.infer<typeof completeRepairBodySchema>;

// The list's sortable columns — the table's visible columns, nothing more.
// `vehicle` and `assignedMechanic` sort through their to-one relations
// server-side (vehicle make / mechanic full name).
export const JOB_ORDER_SORT_COLUMNS = [
  'orderNo',
  'status',
  'vehicle',
  'incidentDate',
  'assignedMechanic',
  'targetDate',
  'repairDone'
] as const;

export const jobOrdersListQuerySchema = paginationQuerySchema
  .extend({
    status: z.nativeEnum(JOB_ORDER_STATUS).optional()
  })
  .merge(sortQuerySchema(JOB_ORDER_SORT_COLUMNS));
export type JobOrdersListQuery = z.infer<typeof jobOrdersListQuerySchema>;
