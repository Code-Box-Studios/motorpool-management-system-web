// src/lib/api/spare-parts.ts
import { api, toAssetUrl } from './client.js';
import type { SparePart, NewSparePart, UpdateSparePart } from '../types';

// Shape of a spare-part row as returned by the API (Prisma camelCase).
interface SparePartApiResponse {
  id: string;
  name: string;
  brand: string | null;
  quantity: number;
  image: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// Reshape the API's camelCase spare-part row into the FE's snake_case
// SparePart type. Typed return (no `as`) so tsc enforces every `spare_parts`
// table column. `toAssetUrl` turns the relative /uploads path into an
// absolute URL for <img src>.
function toSnake(p: SparePartApiResponse): SparePart {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    quantity: p.quantity,
    image: toAssetUrl(p.image),
    description: p.description,
    created_at: p.createdAt,
    updated_at: p.updatedAt
  };
}

// Fetch a page of spare parts, reshaped (API sorts updatedAt desc).
export async function getSpareParts(
  page = 1,
  limit = 10
): Promise<{ data: SparePart[]; count: number | null }> {
  const res = await api.get<{ data: SparePartApiResponse[]; count: number }>('/spare-parts', {
    page,
    limit
  });
  return { data: res.data.map(toSnake), count: res.count };
}

export async function getSparePartById(id: string): Promise<SparePart> {
  return toSnake(await api.get<SparePartApiResponse>(`/spare-parts/${id}`));
}

// Every spare part, unpaginated (see getAllDrivers). Used by the parts pickers.
export async function getAllSpareParts(): Promise<SparePart[]> {
  const res =
    await api.get<{ data: SparePartApiResponse[]; count: number }>(
      '/spare-parts'
    );
  return res.data.map(toSnake);
}

// Builds the multipart body shared by create/update: text fields (camelCase,
// matching the API's zod schema) + the `image` file part when provided.
function sparePartFormData(p: Partial<NewSparePart>, file?: File): FormData {
  const fd = new FormData();
  const fields: Record<string, unknown> = {
    name: p.name,
    brand: p.brand,
    quantity: p.quantity,
    description: p.description
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) fd.append(key, String(value));
  }
  if (file) fd.append('image', file);
  return fd;
}

export async function createSparePart(sparePart: NewSparePart, file?: File): Promise<SparePart> {
  return toSnake(
    await api.postForm<SparePartApiResponse>('/spare-parts', sparePartFormData(sparePart, file))
  );
}

export async function updateSparePart(
  id: string,
  updates: UpdateSparePart,
  file?: File,
  removeImage: boolean = false
): Promise<SparePart> {
  const fd = sparePartFormData(updates, file);
  if (removeImage) fd.append('removeImage', 'true');
  return toSnake(await api.patchForm<SparePartApiResponse>(`/spare-parts/${id}`, fd));
}

export async function deleteSparePart(id: string): Promise<void> {
  await api.del(`/spare-parts/${id}`);
}
