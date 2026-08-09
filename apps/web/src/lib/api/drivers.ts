// src/lib/api/drivers.ts
import { DRIVER_STATUS_DB } from '@mms/shared';
import { api, toAssetUrl } from './client.js';
import type { Driver, NewDriver, UpdateDriver } from '../types';

type DriverStatusDb = (typeof DRIVER_STATUS_DB)[number];

// Shape of a driver row as returned by the API (Prisma camelCase).
interface DriverApiResponse {
  id: string;
  userId: string | null;
  email: string;
  fullName: string;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  licenseNumber: string | null;
  licenseType: string | null;
  licenseExpiry: string | null;
  status: DriverStatusDb;
  assignedVehicleId: string | null;
  branchId: string | null;
  sssNumber: string | null;
  tin: string | null;
  hireDate: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  photo: string | null;
  createdAt: string;
  updatedAt: string;
}

// Reshape the API's camelCase driver row into the FE's snake_case Driver type.
// Typed return (no `as`) so tsc enforces every `drivers` table column.
function toSnakeDriver(d: DriverApiResponse): Driver {
  return {
    id: d.id,
    email: d.email,
    full_name: d.fullName,
    phone: d.phone,
    address: d.address,
    date_of_birth: d.dateOfBirth ? d.dateOfBirth.slice(0, 10) : null, // @db.Date -> YYYY-MM-DD for <input type="date">
    license_number: d.licenseNumber,
    license_type: d.licenseType,
    license_expiry: d.licenseExpiry ? d.licenseExpiry.slice(0, 10) : null,
    status: d.status,
    assigned_vehicle_id: d.assignedVehicleId,
    branch_id: d.branchId,
    sss_number: d.sssNumber,
    tin: d.tin,
    hire_date: d.hireDate ? d.hireDate.slice(0, 10) : null,
    emergency_contact_name: d.emergencyContactName,
    emergency_contact_phone: d.emergencyContactPhone,
    notes: d.notes,
    // Stored relative (/uploads/drivers/x.jpg) but served by the API, not the
    // web dev server — absolute for <img src>.
    photo: toAssetUrl(d.photo),
    updated_at: d.updatedAt
  };
}

// The API's driver-status enum is lowercase (DRIVER_STATUS_DB); a caller that
// still supplies the old display value ('Active'/'Inactive'/'On Trip') gets
// normalized down before the request goes out.
const DISPLAY_TO_DB: Record<string, DriverStatusDb> = {
  Active: 'active',
  Inactive: 'inactive',
  'On Trip': 'on_trip'
};

function toDbStatus(status: string): DriverStatusDb {
  if ((DRIVER_STATUS_DB as readonly string[]).includes(status)) {
    return status as DriverStatusDb;
  }
  return DISPLAY_TO_DB[status] ?? DRIVER_STATUS_DB[0];
}

// Outgoing create/update body (camelCase; dates stay ISO strings — the API's
// zod schemas coerce them to Date server-side).
interface DriverRequestBody {
  email?: string;
  fullName?: string;
  phone?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  licenseNumber?: string | null;
  licenseType?: string | null;
  licenseExpiry?: string | null;
  status?: DriverStatusDb;
  assignedVehicleId?: string | null;
  branchId?: string | null;
  sssNumber?: string | null;
  tin?: string | null;
  hireDate?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
}

// snake_case -> camelCase + lowercase-status translation for the outgoing body.
function toDriverBody(d: NewDriver | UpdateDriver): DriverRequestBody {
  return {
    email: d.email ?? undefined,
    fullName: d.full_name ?? undefined,
    phone: d.phone,
    address: d.address,
    dateOfBirth: d.date_of_birth,
    licenseNumber: d.license_number,
    licenseType: d.license_type,
    licenseExpiry: d.license_expiry,
    status: d.status ? toDbStatus(d.status) : undefined,
    assignedVehicleId: d.assigned_vehicle_id,
    branchId: d.branch_id,
    sssNumber: d.sss_number,
    tin: d.tin,
    hireDate: d.hire_date,
    emergencyContactName: d.emergency_contact_name,
    emergencyContactPhone: d.emergency_contact_phone,
    notes: d.notes
  };
}

export const getDrivers = async (
  page: number = 1,
  limit: number = 10,
  sort?: { sortBy: string; sortOrder: 'asc' | 'desc' }
): Promise<{ data: Driver[]; count: number | null }> => {
  const res = await api.get<{ data: DriverApiResponse[]; count: number }>(
    '/drivers',
    { page, limit, ...(sort ?? {}) }
  );
  return { data: res.data.map(toSnakeDriver), count: res.count };
};

// Every driver, unpaginated — the API returns the full set when page/limit are
// omitted. Use this for pickers and id -> name lookups. (Asking for a `limit`
// above 200 is rejected by the API, which silently emptied these lists.)
export const getAllDrivers = async (): Promise<Driver[]> => {
  const res = await api.get<{ data: DriverApiResponse[]; count: number }>(
    '/drivers'
  );
  return res.data.map(toSnakeDriver);
};

export const getDriverById = async (id: string): Promise<Driver> => {
  return toSnakeDriver(await api.get<DriverApiResponse>(`/drivers/${id}`));
};

// A photo can only travel as multipart, so create/update go out as form data
// whenever one is involved. Text fields keep the same camelCase names the JSON
// body used — the API's zod schema coerces them either way.
function driverFormData(d: NewDriver | UpdateDriver, file?: File): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(toDriverBody(d))) {
    if (value !== undefined && value !== null) fd.append(key, String(value));
  }
  if (file) fd.append('photo', file);
  return fd;
}

export const createDriver = async (
  driver: NewDriver,
  file?: File
): Promise<Driver> => {
  if (!file) {
    return toSnakeDriver(
      await api.post<DriverApiResponse>('/drivers', toDriverBody(driver))
    );
  }
  return toSnakeDriver(
    await api.postForm<DriverApiResponse>(
      '/drivers',
      driverFormData(driver, file)
    )
  );
};

export const updateDriver = async (
  id: string,
  updates: UpdateDriver,
  file?: File,
  removePhoto: boolean = false
): Promise<Driver> => {
  if (!file && !removePhoto) {
    return toSnakeDriver(
      await api.patch<DriverApiResponse>(
        `/drivers/${id}`,
        toDriverBody(updates)
      )
    );
  }
  const fd = driverFormData(updates, file);
  if (removePhoto) fd.append('removePhoto', 'true');
  return toSnakeDriver(
    await api.patchForm<DriverApiResponse>(`/drivers/${id}`, fd)
  );
};

// DELETE /drivers/:id returns 204 — capture the row via getDriverById BEFORE
// deleting so the caller still gets the deleted row back (matches the old
// Supabase `.delete().select().single()` contract).
export const deleteDriver = async (id: string): Promise<Driver> => {
  const driver = await getDriverById(id);
  await api.del(`/drivers/${id}`);
  return driver;
};
