// src/lib/api/job-orders.ts
import { api } from './client.js';
import type { JobOrderWithRelations, NewJobOrder } from '../types';

// Shape of the `vehicle` embed (Prisma `Vehicle` model, SELECTED subset —
// jobOrderInclude only pulls id/make/model/licensePlate).
interface JobOrderVehicleApiResponse {
  id: string;
  make: string;
  model: string;
  licensePlate: string;
}

// Shape of a `spareParts` join row (Prisma `JobOrderSparePart`, camelCase);
// only `sparePartId` is needed to rebuild the legacy `spare_parts_used` id
// array the FE still reads in a couple of places.
interface JobOrderSparePartApiResponse {
  sparePartId: string;
}

// Shape of a job order row as returned by the API (Prisma `JobOrder` model,
// camelCase), with the `vehicle`/`spareParts` relations embedded (jobOrderInclude
// is applied on every read endpoint — list, getAll, getById, and every transition).
interface JobOrderApiResponse {
  id: string;
  orderNo: number;
  vehicleId: string;
  branchId: string;
  status: string | null;
  incidentDate: string | null;
  incidentDetails: string | null;
  requestedById: string | null;
  notedById: string | null;
  approvedById: string | null;
  assignedMechanicId: string | null;
  dateOfRequest: string | null;
  dateApproved: string | null;
  targetDate: string | null;
  actualDateOfRelease: string | null;
  repairDone: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  vehicle?: JobOrderVehicleApiResponse | null;
  spareParts?: JobOrderSparePartApiResponse[];
}

// Reshape the API's camelCase job order (embedding `vehicle` + `spareParts`)
// into the FE's snake_case `JobOrderWithRelations`: rename vehicle -> vehicles
// (licensePlate -> license_plate), and rebuild `spare_parts_used` (the old
// ids-only array) from the spareParts join so components that still read it
// keep working. Typed return (no `as`) so tsc enforces every `job_orders` column.
// Note: incidentDate/dateOfRequest/dateApproved/targetDate/actualDateOfRelease
// are `@db.Date` but every FE consumer binds them to `<input type="datetime-local">`
// (not `type="date"`), so they're passed through as full ISO strings, unsliced.
function toSnake(o: JobOrderApiResponse): JobOrderWithRelations {
  return {
    id: o.id,
    order_no: o.orderNo,
    vehicle_id: o.vehicleId,
    branch_id: o.branchId,
    status: o.status,
    incident_date: o.incidentDate,
    incident_details: o.incidentDetails,
    requested_by: o.requestedById,
    noted_by: o.notedById,
    approved_by: o.approvedById,
    assigned_mechanic: o.assignedMechanicId,
    date_of_request: o.dateOfRequest,
    date_approved: o.dateApproved,
    target_date: o.targetDate,
    actual_date_of_release: o.actualDateOfRelease,
    repair_done: o.repairDone,
    remarks: o.remarks,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    spare_parts_used: o.spareParts ? o.spareParts.map((sp) => sp.sparePartId) : null,
    vehicles: o.vehicle
      ? {
          id: o.vehicle.id,
          make: o.vehicle.make,
          model: o.vehicle.model,
          license_plate: o.vehicle.licensePlate
        }
      : null
  };
}

// Outgoing create/update body (camelCase, matches the API's
// createJobOrderBodySchema/updateJobOrderBodySchema). incidentDetails/remarks
// are `.nullable().optional()` on the API, so PATCH can send `null` to clear.
interface JobOrderRequestBody {
  vehicleId?: string;
  branchId?: string;
  incidentDate?: string;
  incidentDetails?: string | null;
  requestedById?: string;
  remarks?: string | null;
}

// snake_case -> camelCase for the create body. vehicleId/branchId are
// `.uuid()` REQUIRED by the API — map '' -> undefined so an unset id is
// OMITTED rather than sent as an invalid empty-string uuid. Only the 6 fields
// the API accepts are forwarded (status/mechanic/dates/repair are dropped —
// a new job order is always born `pending` and those go through transitions).
function mapCreateBody(o: NewJobOrder): JobOrderRequestBody {
  return {
    vehicleId: o.vehicle_id || undefined,
    branchId: o.branch_id || undefined,
    incidentDate: o.incident_date || undefined,
    incidentDetails: o.incident_details ?? undefined,
    requestedById: o.requested_by || undefined,
    remarks: o.remarks ?? undefined
  };
}

// PATCH is admin-only + pending-only (service-enforced) and only forwards the
// create-schema fields — status/mechanic/dates/repair changes go through the
// transition mutations below, so any such keys a caller still sends are
// dropped here. Only keys actually present on `u` are forwarded so a partial
// edit stays partial.
function mapUpdateBody(u: Record<string, unknown>): JobOrderRequestBody {
  const body: JobOrderRequestBody = {};
  if (u.vehicle_id !== undefined) body.vehicleId = (u.vehicle_id as string) || undefined;
  if (u.branch_id !== undefined) body.branchId = (u.branch_id as string) || undefined;
  if (u.incident_date !== undefined) body.incidentDate = (u.incident_date as string) || undefined;
  if (u.incident_details !== undefined) {
    body.incidentDetails = (u.incident_details as string) === '' ? null : (u.incident_details as string);
  }
  if (u.requested_by !== undefined) body.requestedById = (u.requested_by as string) || undefined;
  if (u.remarks !== undefined) body.remarks = (u.remarks as string) === '' ? null : (u.remarks as string);
  return body;
}

// `userId`/`userRole` are kept ONLY for call-site compatibility — the API
// server-scopes the result set by the JWT actor's role (spec §6), so they are
// intentionally unused here (prefixed `_` to satisfy noUnusedParameters).
export async function getJobOrders(
  page = 1,
  limit = 10,
  _userId?: string,
  _userRole?: string
): Promise<{ data: JobOrderWithRelations[]; count: number | null }> {
  const res = await api.get<{ data: JobOrderApiResponse[]; count: number }>('/job-orders', { page, limit });
  return { data: res.data.map(toSnake), count: res.count };
}

export async function getAllJobOrders(_userId?: string, _userRole?: string): Promise<JobOrderWithRelations[]> {
  const res = await api.get<{ data: JobOrderApiResponse[]; count: number }>('/job-orders');
  return res.data.map(toSnake);
}

export async function getJobOrderById(id: string): Promise<JobOrderWithRelations> {
  return toSnake(await api.get<JobOrderApiResponse>(`/job-orders/${id}`));
}

export async function createJobOrder(jobOrder: NewJobOrder): Promise<JobOrderWithRelations> {
  return toSnake(await api.post<JobOrderApiResponse>('/job-orders', mapCreateBody(jobOrder)));
}

export async function updateJobOrder(id: string, updates: Record<string, unknown>): Promise<JobOrderWithRelations> {
  return toSnake(await api.patch<JobOrderApiResponse>(`/job-orders/${id}`, mapUpdateBody(updates)));
}

export async function deleteJobOrder(id: string): Promise<void> {
  await api.del(`/job-orders/${id}`);
}

// --- Transitions (§8): dedicated endpoints that own status changes. Each
// returns the job order in the same shape as the read endpoints. ---

// admin: note the job order (pending -> assigned_mechanic) — assigns a
// mechanic, schedule dates, and the noted spare parts (now `{sparePartId,
// quantity}` pairs, replacing the old ids-only array).
export async function noteJobOrder(
  id: string,
  body: {
    assignedMechanicId: string;
    dateOfRequest?: string;
    targetDate?: string;
    spareParts: { sparePartId: string; quantity: number }[];
  }
): Promise<JobOrderWithRelations> {
  return toSnake(await api.post<JobOrderApiResponse>(`/job-orders/${id}/note`, body));
}

// evp_operations: approve the noted job order (assigned_mechanic -> ongoing_repair). No body.
export async function approveJobOrder(id: string): Promise<JobOrderWithRelations> {
  return toSnake(await api.post<JobOrderApiResponse>(`/job-orders/${id}/approve`));
}

// admin: complete the repair (ongoing_repair -> repaired).
export async function completeRepairJobOrder(
  id: string,
  body: { repairDone: string; remarks?: string; actualDateOfRelease?: string }
): Promise<JobOrderWithRelations> {
  return toSnake(await api.post<JobOrderApiResponse>(`/job-orders/${id}/complete-repair`, body));
}
