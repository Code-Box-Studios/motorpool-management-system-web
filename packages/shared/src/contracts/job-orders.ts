import { z } from 'zod';
import {
  JOB_ORDER_STATUS,
  REPAIR_DONE_TYPE,
  MAINTENANCE_TYPE
} from '../enums.js';
import {
  paginationQuerySchema,
  searchQuerySchema,
  sortQuerySchema
} from './common.js';

const serviceMetadata = {
  maintenanceType: z.nativeEnum(MAINTENANCE_TYPE).nullable().optional(),
  serviceLocation: z.enum(['motorpool', 'outside']).nullable().optional()
};

// The standard services a requester picks from. Anything else goes in
// `incidentDetails`, shown as "Additional Services to be done".
export const JOB_ORDER_SERVICES = [
  'Check and replace engine oil',
  'Check and replace oil filter',
  'Check up brake system',
  'Check up under chassis',
  'Check up charging system',
  'Check up lighting system',
  'Check up tire pressure',
  'Check and cleaning of air cleaner element',
  'Check up electrical system',
  'Check up hydraulic oil level'
] as const;
export type JobOrderService = (typeof JOB_ORDER_SERVICES)[number];

/**
 * One line naming what a job order is for: the picked services, then any
 * additional work. Notifications, approval queues and reports use it as the
 * order's title, so an order with only picked services still says something.
 */
export function describeJobOrder(order: {
  services?: readonly string[] | null;
  incidentDetails?: string | null;
}): string | null {
  const details = order.incidentDetails?.trim() || null;
  const services = order.services?.filter(Boolean) ?? [];
  if (services.length === 0) return details;
  const list = services.join(', ');
  return details ? `${list}; ${details}` : list;
}

const jobOrderBodyFieldsSchema = z.object({
  ...serviceMetadata,
  vehicleId: z.string().uuid(),
  branchId: z.string().uuid(),
  incidentDate: z.coerce.date(),
  // Picked from the standard list; duplicates collapse.
  services: z
    .array(z.enum(JOB_ORDER_SERVICES))
    .transform((picked) => [...new Set(picked)]),
  // Additional services to be done, beyond the list. Optional now that the
  // list carries the common ones.
  incidentDetails: z.string().nullable().optional(),
  requestedById: z.string().uuid().nullable().optional(),
  remarks: z.string().nullable().optional()
});

// A repair request that says nothing about the work is one nobody can act on:
// the admin assigns a mechanic and notes the parts off the back of it. So it
// needs a picked service, additional services written out, or both.
export const createJobOrderBodySchema = jobOrderBodyFieldsSchema
  .extend({ services: jobOrderBodyFieldsSchema.shape.services.default([]) })
  .superRefine((body, ctx) => {
    if (body.services.length === 0 && !body.incidentDetails?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['services'],
        message: 'Choose a service or describe the additional services'
      });
    }
  });
export type CreateJobOrderBody = z.infer<typeof createJobOrderBodySchema>;

// PATCH legal only while pending (service-enforced); never changes status.
// The service re-checks the services-or-details rule against the stored order.
export const updateJobOrderBodySchema = jobOrderBodyFieldsSchema.partial();
export type UpdateJobOrderBody = z.infer<typeof updateJobOrderBodySchema>;

// note(admin): assigns a mechanic and records spare parts used (quantity is a
// NEW per-part input; the old FE stored ids only).
export const noteJobOrderBodySchema = z.object({
  assignedMechanicId: z.string().uuid(),
  dateOfRequest: z.coerce.date().nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  spareParts: z
    .array(
      z.object({
        sparePartId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).default(1)
      })
    )
    .default([])
});
export type NoteJobOrderBody = z.infer<typeof noteJobOrderBodySchema>;

// complete-repair(admin). completedMileage is required: the maintenance row this
// writes is what "last service" means to the risk model, and a row with no
// odometer on it reads as "never serviced" — so a completed repair used to make
// a vehicle look MORE overdue, not less.
export const completeRepairBodySchema = z.object({
  ...serviceMetadata,
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
  .merge(searchQuerySchema)
  .extend({
    status: z.nativeEnum(JOB_ORDER_STATUS).optional(),
    repairDone: z.nativeEnum(REPAIR_DONE_TYPE).optional()
  })
  .merge(sortQuerySchema(JOB_ORDER_SORT_COLUMNS));
export type JobOrdersListQuery = z.infer<typeof jobOrdersListQuerySchema>;
