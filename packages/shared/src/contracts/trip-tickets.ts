import { z } from 'zod';
import { FUEL_TYPE, TRIP_TICKET_STATUS } from '../enums.js';
import { paginationQuerySchema, sortQuerySchema } from './common.js';

// Create: a new ticket is always born pending_admin_approval; the client cannot
// choose a status. preparedBy is DB-required but the FE leaves it blank → default ''.
export const createTripTicketBodySchema = z.object({
  branchId: z.string().uuid(),
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  officeId: z.string().uuid().nullable().optional(),
  officeHeadId: z.string().uuid().nullable().optional(),
  destination: z.string().min(1),
  purpose: z.string().min(1),
  dateRequested: z.coerce.date(),
  participants: z.array(z.string()).default([]),
  participantsCount: z.coerce.number().int().min(1).nullable().optional(),
  preparedBy: z.string().default(''),
  requestedById: z.string().uuid().nullable().optional(),
  remarks: z.string().nullable().optional(),
  startTs: z.coerce.date().nullable().optional(),
  endTs: z.coerce.date().nullable().optional()
});
export type CreateTripTicketBody = z.infer<typeof createTripTicketBodySchema>;

// PATCH is only legal while pending_admin_approval (service-enforced); status is
// never editable here — transitions own it.
export const updateTripTicketBodySchema = createTripTicketBodySchema.partial();
export type UpdateTripTicketBody = z.infer<typeof updateTripTicketBodySchema>;

// approve(admin) carries the fuel-allocation payload.
//
// The litre cap is a typo guard, not physics: `positive()` alone accepted a
// 9,999,999-litre allocation, which is a fat finger no one would catch until the
// fuel bill. 1000 L is far above any single trip in a motorpool this size — move
// it if the fleet grows into it.
export const MAX_FUEL_ALLOCATION_LITERS = 1000;

export const approveTripTicketBodySchema = z.object({
  liters: z.coerce.number().positive().max(MAX_FUEL_ALLOCATION_LITERS),
  fuelType: z.nativeEnum(FUEL_TYPE),
  date: z.coerce.date(),
  purpose: z.string().min(1),
  tripTo: z.string().min(1)
});
export type ApproveTripTicketBody = z.infer<typeof approveTripTicketBodySchema>;

// disapprove / cancel require a reason.
export const reasonBodySchema = z.object({ reason: z.string().min(1) });
export type ReasonBody = z.infer<typeof reasonBodySchema>;

// The guard reads the odometer at the gate, out and back. Required, not
// optional: an optional reading is a reading nobody takes, and this is the only
// thing in the system that advances vehicles.mileage — which every preventive
// and predictive maintenance number is computed from.
export const checkOutBodySchema = z.object({
  startMileage: z.coerce.number().int().nonnegative()
});
export type CheckOutBody = z.infer<typeof checkOutBodySchema>;

export const checkInBodySchema = z.object({
  endMileage: z.coerce.number().int().nonnegative()
});
export type CheckInBody = z.infer<typeof checkInBodySchema>;

// The list's sortable columns — the table's visible columns, nothing more.
export const TRIP_TICKET_SORT_COLUMNS = [
  'ticketNo',
  'destination',
  'purpose',
  'startTs',
  'endTs',
  'status'
] as const;

export const tripTicketsListQuerySchema = paginationQuerySchema
  .extend({
    requestedBy: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    driverId: z.string().uuid().optional(),
    status: z.nativeEnum(TRIP_TICKET_STATUS).optional()
  })
  .merge(sortQuerySchema(TRIP_TICKET_SORT_COLUMNS));
export type TripTicketsListQuery = z.infer<typeof tripTicketsListQuerySchema>;
