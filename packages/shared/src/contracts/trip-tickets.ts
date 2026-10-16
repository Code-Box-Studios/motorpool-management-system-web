import { z } from 'zod';
import { FUEL_TYPE, TRIP_TICKET_STATUS } from '../enums.js';
import {
  paginationQuerySchema,
  searchQuerySchema,
  sortQuerySchema
} from './common.js';

// One outing: a date with its own departure and return. An event may run on the
// 17th and the 21st, so a ticket carries a list of these rather than one window.
export const tripDateInputSchema = z
  .object({
    startTs: z.coerce.date(),
    endTs: z.coerce.date()
  })
  .refine((d) => d.endTs > d.startTs, {
    message: 'A date must end after it starts',
    path: ['endTs']
  });
export type TripDateInput = z.infer<typeof tripDateInputSchema>;

// Create: a new ticket is always born pending_admin_approval; the client cannot
// choose a status. preparedBy is DB-required but the FE leaves it blank → default ''.
const tripTicketBodyFieldsSchema = z.object({
  branchId: z.string().uuid(),
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  officeId: z.string().uuid().nullable().optional(),
  officeHeadId: z.string().uuid().nullable().optional(),
  destination: z.string().min(1),
  destinationLatitude: z.number().min(-90).max(90).nullable().optional(),
  destinationLongitude: z.number().min(-180).max(180).nullable().optional(),
  purpose: z.string().min(1),
  dateRequested: z.coerce.date(),
  participants: z.array(z.string()).default([]),
  participantsCount: z.coerce.number().int().min(1).nullable().optional(),
  preparedBy: z.string().default(''),
  requestedById: z.string().uuid().nullable().optional(),
  remarks: z.string().nullable().optional(),
  startTs: z.coerce.date().nullable().optional(),
  endTs: z.coerce.date().nullable().optional(),
  dates: z.array(tripDateInputSchema).default([]),
  // New guides are active users with the driver or requester role.
  // An absent guideIds on PATCH preserves historical assignments; an empty
  // list is rejected because each trip needs at least one guide.
  guideIds: z.array(z.string().uuid()).min(1)
});
function validateDestinationCoordinates(
  body: {
    destinationLatitude?: number | null;
    destinationLongitude?: number | null;
  },
  ctx: z.RefinementCtx
) {
  const latitude = body.destinationLatitude;
  const longitude = body.destinationLongitude;
  const bothAbsent = latitude === undefined && longitude === undefined;
  const bothCleared = latitude === null && longitude === null;
  const bothNumbers =
    typeof latitude === 'number' && typeof longitude === 'number';
  if (!bothAbsent && !bothCleared && !bothNumbers) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['destinationLatitude'],
      message: 'Provide both destination coordinates, or clear both'
    });
  }
}

export const createTripTicketBodySchema =
  tripTicketBodyFieldsSchema.superRefine(validateDestinationCoordinates);
export type CreateTripTicketBody = z.infer<typeof createTripTicketBodySchema>;

// PATCH is only legal while pending_admin_approval (service-enforced); status is
// never editable here — transitions own it.
export const updateTripTicketBodySchema = tripTicketBodyFieldsSchema
  .partial()
  .superRefine(validateDestinationCoordinates);
export type UpdateTripTicketBody = z.infer<typeof updateTripTicketBodySchema>;

/**
 * The date rows a request is really asking for.
 *
 * `dates` is the truth. The legacy `startTs`/`endTs` pair is still accepted and
 * folded into a single row, so existing callers — the e2e suite and the web form
 * until it is rebuilt — keep working unchanged.
 */
export function normaliseTripDates(body: {
  dates?: TripDateInput[];
  startTs?: Date | null;
  endTs?: Date | null;
}): TripDateInput[] {
  if (body.dates && body.dates.length > 0) return body.dates;
  if (body.startTs && body.endTs) {
    return [{ startTs: body.startTs, endTs: body.endTs }];
  }
  return [];
}

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

// Reassign the guides on an already-approved ticket (admin only) — the generic
// PATCH is frozen the moment a ticket leaves pending_admin_approval, and a
// guide changing on the morning of the trip is the ordinary case.
//
// Deliberately NOT `.min(1)`, unlike the create body: `.min(1)` would have zod
// answer an empty list with a generic 400 VALIDATION_ERROR, and on THIS
// endpoint the empty case is the one that needs its own name —
// replaceTripTicketGuides throws 400 NO_GUIDES for it. Same reason `dates` on
// the create body is `.default([])` rather than `.min(1)`.
export const reassignGuidesBodySchema = z.object({
  guideIds: z.array(z.string().uuid())
});
export type ReassignGuidesBody = z.infer<typeof reassignGuidesBodySchema>;

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
  .merge(searchQuerySchema)
  .extend({
    requestedBy: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    driverId: z.string().uuid().optional(),
    status: z.nativeEnum(TRIP_TICKET_STATUS).optional()
  })
  .merge(sortQuerySchema(TRIP_TICKET_SORT_COLUMNS));
export type TripTicketsListQuery = z.infer<typeof tripTicketsListQuerySchema>;
