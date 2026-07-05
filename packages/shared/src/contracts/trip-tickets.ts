import { z } from 'zod';
import { FUEL_TYPE, TRIP_TICKET_STATUS } from '../enums.js';
import { paginationQuerySchema } from './common.js';

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
export const approveTripTicketBodySchema = z.object({
  liters: z.coerce.number().positive(),
  fuelType: z.nativeEnum(FUEL_TYPE),
  date: z.coerce.date(),
  purpose: z.string().min(1),
  tripTo: z.string().min(1)
});
export type ApproveTripTicketBody = z.infer<typeof approveTripTicketBodySchema>;

// disapprove / cancel require a reason.
export const reasonBodySchema = z.object({ reason: z.string().min(1) });
export type ReasonBody = z.infer<typeof reasonBodySchema>;

export const tripTicketsListQuerySchema = paginationQuerySchema.extend({
  requestedBy: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  status: z.nativeEnum(TRIP_TICKET_STATUS).optional()
});
export type TripTicketsListQuery = z.infer<typeof tripTicketsListQuerySchema>;
