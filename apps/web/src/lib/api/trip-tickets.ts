// src/lib/api/trip-tickets.ts
import { api } from './client.js';
import type { TripTicket, NewTripTicket } from '../types';

// Shape of the `fuelAllocation` embed (Prisma `FuelAllocation` model, camelCase).
interface FuelAllocationApiResponse {
  id: string;
  tripTicketId: string;
  vehicleId: string;
  branchId: string;
  requestedById: string;
  approvedByEvpId: string | null;
  liters: number;
  fuelType: string;
  date: string;
  purpose: string;
  tripTo: string;
  status: string;
  disapprovedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// Shape of a trip ticket row as returned by the API (Prisma `TripTicket`
// model, camelCase), with the `fuelAllocation` relation embedded.
interface TripTicketApiResponse {
  id: string;
  ticketNo: number;
  branchId: string;
  driverId: string;
  vehicleId: string;
  officeId: string | null;
  officeHeadId: string | null;
  destination: string;
  purpose: string;
  dateRequested: string;
  participants: string[];
  participantsCount: number | null;
  preparedBy: string;
  requestedById: string | null;
  remarks: string | null;
  qrId: string | null;
  status: string;
  approvedByAdminId: string | null;
  disapprovedReason: string | null;
  cancellationReason: string | null;
  preTripGuardId: string | null;
  preTripCheckedById: string | null;
  preTripCheckedAt: string | null;
  postTripGuardId: string | null;
  postTripCheckedById: string | null;
  postTripCheckedAt: string | null;
  startTs: string | null;
  endTs: string | null;
  createdAt: string;
  updatedAt: string;
  fuelAllocation: FuelAllocationApiResponse | null;
}

// Reshape the API's camelCase trip ticket (embedding `fuelAllocation`) into the
// FE's snake_case Row, flattening the allocation onto denormalized `allocation_*`
// columns (spec §6.1 read contract). Typed return (no `as`) so tsc enforces every
// `trip_tickets` column, including the legacy/dead columns the new API dropped
// (kept on the FE Row type but always null now: attachment_path/pdf_path/
// qr_path/approved_by_evp_operation).
function toSnake(t: TripTicketApiResponse): TripTicket {
  const fa = t.fuelAllocation;
  return {
    id: t.id,
    ticket_no: t.ticketNo,
    branch_id: t.branchId,
    driver_id: t.driverId,
    vehicle_id: t.vehicleId,
    office_id: t.officeId ?? null,
    office_head_id: t.officeHeadId ?? null,
    destination: t.destination,
    purpose: t.purpose,
    date_requested: t.dateRequested.slice(0, 10), // @db.Date -> YYYY-MM-DD for <input type="date">/display
    participants: t.participants ?? [],
    participants_count: t.participantsCount ?? null,
    prepared_by: t.preparedBy,
    requested_by: t.requestedById ?? null,
    remarks: t.remarks ?? null,
    qr_id: t.qrId ?? t.id,
    status: t.status,
    approved_by_admin: t.approvedByAdminId ?? null,
    disapproved_reason: t.disapprovedReason ?? null,
    cancellation_reason: t.cancellationReason ?? null,
    pre_trip_guard: t.preTripGuardId ?? null,
    pre_trip_checked_by: t.preTripCheckedById ?? null,
    pre_trip_checked_at: t.preTripCheckedAt ?? null,
    post_trip_guard: t.postTripGuardId ?? null,
    post_trip_checked_by: t.postTripCheckedById ?? null,
    post_trip_checked_at: t.postTripCheckedAt ?? null,
    start_ts: t.startTs ?? null,
    end_ts: t.endTs ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    // Denormalized allocation_* flattened from the fuelAllocation embed:
    allocation_date: fa?.date ? fa.date.slice(0, 10) : null, // @db.Date -> YYYY-MM-DD
    allocation_trip_to: fa?.tripTo ?? null,
    allocation_purpose: fa?.purpose ?? null,
    allocation_vehicle_id: fa?.vehicleId ?? null,
    allocation_fuel_type: fa?.fuelType ?? null,
    allocation_liters: fa?.liters ?? 0, // FE column is non-nullable `number`
    allocation_approved_by_evp_operations: fa?.approvedByEvpId ?? null,
    fuel_allocation_id: fa?.id ?? null,
    // Legacy columns the new API dropped — kept in the FE Row type, always null:
    attachment_path: null,
    pdf_path: null,
    qr_path: null,
    approved_by_evp_operation: null
  };
}

// Outgoing create/update body (camelCase, matches the API's
// createTripTicketBodySchema/updateTripTicketBodySchema). PATCH (mapUpdateBody)
// forwards only a subset of these keys, and only when present on the input.
interface TripTicketRequestBody {
  branchId?: string;
  driverId?: string;
  vehicleId?: string;
  officeId?: string;
  officeHeadId?: string;
  destination?: string;
  purpose?: string;
  dateRequested?: string;
  participants?: string[];
  participantsCount?: number | null;
  preparedBy?: string;
  requestedById?: string;
  remarks?: string | null;
  startTs?: string | null;
  endTs?: string | null;
}

// snake_case -> camelCase for the create body. driverId/vehicleId/branchId are
// `.uuid()` REQUIRED (non-nullable) by the API — map '' -> undefined so an
// unset id is OMITTED rather than sent as an invalid empty-string uuid (the
// create form always selects real ids, so this is a defensive no-op today).
function mapCreateBody(t: NewTripTicket): TripTicketRequestBody {
  return {
    branchId: t.branch_id || undefined,
    driverId: t.driver_id || undefined,
    vehicleId: t.vehicle_id || undefined,
    officeId: t.office_id || undefined,
    officeHeadId: t.office_head_id || undefined,
    destination: t.destination,
    purpose: t.purpose,
    dateRequested: t.date_requested,
    participants: t.participants ?? undefined,
    participantsCount: t.participants_count ?? undefined,
    preparedBy: t.prepared_by,
    requestedById: t.requested_by || undefined,
    remarks: t.remarks ?? undefined,
    startTs: t.start_ts ?? undefined,
    endTs: t.end_ts ?? undefined
  };
}

// PATCH is only legal while pending_admin_approval (service-enforced), and only
// forwards the create-schema fields — status changes go through the transition
// mutations, and allocation_*/reasons/qr_* are never PATCH-able, so any such
// keys a caller still sends (e.g. the trip-ticket detail edit form) are dropped
// here. Only keys actually present on `u` are forwarded (mirrors the old
// Supabase adapter's `!== undefined` guards) so a partial edit stays partial.
function mapUpdateBody(u: Record<string, unknown>): TripTicketRequestBody {
  const body: TripTicketRequestBody = {};
  if (u.driver_id !== undefined)
    body.driverId = (u.driver_id as string) || undefined;
  if (u.vehicle_id !== undefined)
    body.vehicleId = (u.vehicle_id as string) || undefined;
  if (u.branch_id !== undefined)
    body.branchId = (u.branch_id as string) || undefined;
  if (u.office_id !== undefined)
    body.officeId = (u.office_id as string) || undefined;
  if (u.office_head_id !== undefined)
    body.officeHeadId = (u.office_head_id as string) || undefined;
  if (u.destination !== undefined) body.destination = u.destination as string;
  if (u.purpose !== undefined) body.purpose = u.purpose as string;
  if (u.date_requested !== undefined)
    body.dateRequested = u.date_requested as string;
  if (u.participants !== undefined) {
    body.participants =
      typeof u.participants === 'string'
        ? u.participants
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p.length > 0)
        : (u.participants as string[]);
  }
  if (u.participants_count !== undefined)
    body.participantsCount = u.participants_count as number | null;
  if (u.requested_by !== undefined)
    body.requestedById = (u.requested_by as string) || undefined;
  if (u.prepared_by !== undefined) body.preparedBy = u.prepared_by as string;
  if (u.remarks !== undefined)
    body.remarks = (u.remarks as string) === '' ? null : (u.remarks as string);
  if (u.start_ts !== undefined) body.startTs = u.start_ts as string | null;
  if (u.end_ts !== undefined) body.endTs = u.end_ts as string | null;
  return body;
}

export async function getTripTickets(
  page = 1,
  limit = 10,
  userId?: string,
  branchId?: string,
  driverId?: string,
  sort?: { sortBy: string; sortOrder: 'asc' | 'desc' }
): Promise<{ data: TripTicket[]; count: number | null }> {
  const res = await api.get<{ data: TripTicketApiResponse[]; count: number }>(
    '/trip-tickets',
    {
      page,
      limit,
      requestedBy: userId,
      branchId,
      driverId,
      ...(sort ?? {})
    }
  );
  return { data: res.data.map(toSnake), count: res.count };
}

export async function getAllTripTickets(
  userId?: string,
  branchId?: string
): Promise<TripTicket[]> {
  const res = await api.get<{ data: TripTicketApiResponse[]; count: number }>(
    '/trip-tickets',
    {
      requestedBy: userId,
      branchId
    }
  );
  return res.data.map(toSnake);
}

export async function getTripTicketById(id: string): Promise<TripTicket> {
  return toSnake(await api.get<TripTicketApiResponse>(`/trip-tickets/${id}`));
}

export async function createTripTicket(
  tripTicket: NewTripTicket
): Promise<TripTicket> {
  return toSnake(
    await api.post<TripTicketApiResponse>(
      '/trip-tickets',
      mapCreateBody(tripTicket)
    )
  );
}

export async function updateTripTicket(
  id: string,
  updates: Record<string, unknown>
): Promise<TripTicket> {
  return toSnake(
    await api.patch<TripTicketApiResponse>(
      `/trip-tickets/${id}`,
      mapUpdateBody(updates)
    )
  );
}

export async function deleteTripTicket(id: string): Promise<void> {
  await api.del(`/trip-tickets/${id}`);
}

// --- Transitions (§8): dedicated endpoints that own status changes. Each
// returns the ticket in the same shape as the read endpoints. ---

export async function approveTripTicket(
  id: string,
  body: {
    liters: number;
    fuelType: string;
    date: string;
    purpose: string;
    tripTo: string;
  }
): Promise<TripTicket> {
  return toSnake(
    await api.post<TripTicketApiResponse>(`/trip-tickets/${id}/approve`, body)
  );
}

export async function approveEvpTripTicket(id: string): Promise<TripTicket> {
  return toSnake(
    await api.post<TripTicketApiResponse>(`/trip-tickets/${id}/approve-evp`)
  );
}

export async function disapproveTripTicket(
  id: string,
  reason: string
): Promise<TripTicket> {
  return toSnake(
    await api.post<TripTicketApiResponse>(`/trip-tickets/${id}/disapprove`, {
      reason
    })
  );
}

export async function cancelTripTicket(
  id: string,
  reason: string
): Promise<TripTicket> {
  return toSnake(
    await api.post<TripTicketApiResponse>(`/trip-tickets/${id}/cancel`, {
      reason
    })
  );
}

// The guard reads the odometer at the gate, out and back. It is the only thing
// that advances the vehicle's mileage — which every preventive and predictive
// maintenance number is computed from.
export async function checkOutTripTicket(
  id: string,
  startMileage: number
): Promise<TripTicket> {
  return toSnake(
    await api.post<TripTicketApiResponse>(`/trip-tickets/${id}/check-out`, {
      startMileage
    })
  );
}

export async function checkInTripTicket(
  id: string,
  endMileage: number
): Promise<TripTicket> {
  return toSnake(
    await api.post<TripTicketApiResponse>(`/trip-tickets/${id}/check-in`, {
      endMileage
    })
  );
}
