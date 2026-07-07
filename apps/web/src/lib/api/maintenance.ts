// src/lib/api/maintenance.ts
import { api } from './client.js';
import type { Maintenance, NewMaintenance, UpdateMaintenance } from '../types';

// Shape of a maintenance row as returned by the API (Prisma camelCase).
interface MaintenanceApiResponse {
  id: string;
  vehicleId: string;
  type: string;
  date: string;
  cost: number | null;
  mileage: number | null;
  nextDue: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// Reshape the API's camelCase maintenance row into the FE's snake_case
// Maintenance type. Typed return (no `as`) so tsc enforces every
// `maintenance` table column.
function toSnake(m: MaintenanceApiResponse): Maintenance {
  return {
    id: m.id,
    vehicle_id: m.vehicleId,
    type: m.type,
    date: m.date,
    cost: m.cost,
    mileage: m.mileage,
    next_due: m.nextDue,
    description: m.description,
    created_at: m.createdAt,
    updated_at: m.updatedAt
  };
}

// Outgoing create/update body (camelCase, matches the API's
// createMaintenanceBodySchema/updateMaintenanceBodySchema).
interface MaintenanceRequestBody {
  vehicleId?: string;
  type?: string;
  date?: string;
  cost?: number | null;
  mileage?: number | null;
  nextDue?: string | null;
  description?: string | null;
}

// snake_case -> camelCase for the outgoing body. `next_due`/`description`
// empty strings are normalized to `null` (matches the old Supabase adapter's
// cleanup and avoids the API's z.coerce.date() rejecting `''` as an invalid
// date on `nextDue`).
function toMaintenanceBody(m: NewMaintenance | UpdateMaintenance): MaintenanceRequestBody {
  return {
    vehicleId: m.vehicle_id ?? undefined,
    type: m.type ?? undefined,
    date: m.date ?? undefined,
    cost: m.cost,
    mileage: m.mileage,
    nextDue: m.next_due === '' ? null : m.next_due,
    description: m.description === '' ? null : m.description
  };
}

// Fetch a page of maintenance records (date desc, server-sorted).
export const getMaintenances = async (
  page: number = 1,
  limit: number = 10
): Promise<{ data: Maintenance[]; count: number | null }> => {
  const res = await api.get<{ data: MaintenanceApiResponse[]; count: number }>('/maintenance', {
    page,
    limit
  });
  return { data: res.data.map(toSnake), count: res.count };
};

// Fetch every maintenance record, unpaginated (omits page/limit).
export const getAllMaintenances = async (): Promise<Maintenance[]> => {
  const res = await api.get<{ data: MaintenanceApiResponse[]; count: number }>('/maintenance');
  return res.data.map(toSnake);
};

export const getMaintenanceById = async (id: string): Promise<Maintenance> => {
  return toSnake(await api.get<MaintenanceApiResponse>(`/maintenance/${id}`));
};

export const createMaintenance = async (maintenance: NewMaintenance): Promise<Maintenance> => {
  return toSnake(
    await api.post<MaintenanceApiResponse>('/maintenance', toMaintenanceBody(maintenance))
  );
};

export const updateMaintenance = async (
  id: string,
  updates: UpdateMaintenance
): Promise<Maintenance> => {
  return toSnake(
    await api.patch<MaintenanceApiResponse>(`/maintenance/${id}`, toMaintenanceBody(updates))
  );
};

export const deleteMaintenance = async (id: string): Promise<void> => {
  await api.del(`/maintenance/${id}`);
};
