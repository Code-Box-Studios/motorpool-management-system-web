// src/lib/api/vehicles.ts
import { api, toAssetUrl, toRelativeAssetPath } from './client.js';
import { getAllBranches } from './shared.js';
import type {
  Vehicle,
  VehicleWithBranch,
  NewVehicle,
  UpdateVehicle
} from '../types';
import type { VehicleResponse } from '@mms/shared';

// Reshape the API's camelCase vehicle row into the FE's snake_case Vehicle
// type. Typed return (no `as`) so tsc enforces every `vehicles` table column.
// `insuranceExpiry`/`registrationExpiry`/`createdAt`/`updatedAt` are genuine
// Prisma columns but aren't statically declared on `VehicleResponse` (they
// only arrive via the schema's `.passthrough()`) -- read them off a narrow
// local intersection cast rather than widening the function's return type.
// NOTE: the API's Vehicle model also tracks latitude/longitude/lastLocationUpdate
// (GPS-derived), but the FE `vehicles` table type (types/supabase.ts) has no
// such columns -- that data lives in the separate gps_data table/adapter --
// so they're deliberately not read/mapped here (including them would fail the
// tsc gate: excess properties not on `Vehicle`).
function toSnake(v: VehicleResponse): Vehicle {
  const p = v as VehicleResponse & {
    insuranceExpiry: string;
    registrationExpiry: string;
    createdAt: string;
    updatedAt: string;
  };
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    vin: v.vin,
    license_plate: v.licensePlate,
    capacity: v.capacity,
    fuel_type: v.fuelType,
    mileage: v.mileage,
    status: v.status,
    images: v.images.map((u) => toAssetUrl(u) ?? u),
    branch: v.branchId ?? '',
    maintenance_standard_id: v.maintenanceStandardId ?? null,
    insurance_expiry: p.insuranceExpiry.slice(0, 10), // @db.Date -> YYYY-MM-DD for <input type="date">
    registration_expiry: p.registrationExpiry.slice(0, 10),
    created_at: p.createdAt,
    updated_at: p.updatedAt
  };
}

// Fetch a page of vehicles + every branch (for the branch_name lookup), reshaped.
export async function getVehicles(
  page = 1,
  limit = 10,
  sort?: { sortBy: string; sortOrder: 'asc' | 'desc' }
): Promise<{ data: VehicleWithBranch[]; count: number | null }> {
  const [res, branches] = await Promise.all([
    api.get<{ data: VehicleResponse[]; count: number }>('/vehicles', {
      page,
      limit,
      ...(sort ?? {})
    }),
    getAllBranches()
  ]);
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const data: VehicleWithBranch[] = res.data.map((v) => {
    const row = toSnake(v);
    return {
      ...row,
      branch_name: row.branch
        ? (branchMap.get(row.branch) ?? row.branch)
        : 'N/A'
    };
  });
  return { data, count: res.count };
}

// Every vehicle, unpaginated (see getAllDrivers). Used by the vehicle pickers.
export async function getAllVehicles(): Promise<VehicleWithBranch[]> {
  const [res, branches] = await Promise.all([
    api.get<{ data: VehicleResponse[]; count: number }>('/vehicles'),
    getAllBranches()
  ]);
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  return res.data.map((v) => {
    const row = toSnake(v);
    return {
      ...row,
      branch_name: row.branch
        ? (branchMap.get(row.branch) ?? row.branch)
        : 'N/A'
    };
  });
}

export async function getVehicleById(id: string): Promise<Vehicle> {
  return toSnake(await api.get<VehicleResponse>(`/vehicles/${id}`));
}

// Builds the multipart body shared by create/update: text fields (camelCase,
// matching the API's zod schema) + an `images` file part per new file. Reads
// directly off the FE's snake_case Partial<NewVehicle> shape (no `any`).
function vehicleFormData(v: Partial<NewVehicle>, files: File[]): FormData {
  const fd = new FormData();
  const fields: Record<string, unknown> = {
    make: v.make,
    model: v.model,
    year: v.year,
    vin: v.vin,
    licensePlate: v.license_plate,
    capacity: v.capacity,
    fuelType: v.fuel_type,
    mileage: v.mileage,
    status: v.status,
    insuranceExpiry: v.insurance_expiry,
    registrationExpiry: v.registration_expiry,
    branchId: v.branch,
    maintenanceStandardId: v.maintenance_standard_id
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) fd.append(key, String(value));
  }
  for (const file of files) fd.append('images', file);
  return fd;
}

export async function createVehicle(
  vehicle: NewVehicle,
  files: File[] = []
): Promise<Vehicle> {
  return toSnake(
    await api.postForm<VehicleResponse>(
      '/vehicles',
      vehicleFormData(vehicle, files)
    )
  );
}

export async function updateVehicle(
  id: string,
  updates: UpdateVehicle,
  files: File[] = [],
  removedImages: string[] = []
): Promise<Vehicle> {
  const fd = vehicleFormData(updates, files);
  // removedImages arrive as rendered absolute URLs (toAssetUrl); the API matches
  // them against the RELATIVE stored path, so strip the base back off first.
  for (const url of removedImages)
    fd.append('removedImages', toRelativeAssetPath(url));
  return toSnake(await api.patchForm<VehicleResponse>(`/vehicles/${id}`, fd));
}
