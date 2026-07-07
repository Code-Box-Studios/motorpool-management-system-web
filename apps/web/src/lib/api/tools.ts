// src/lib/api/tools.ts
import { api, toAssetUrl } from './client.js';
import type { Tool, NewTool, UpdateTool } from '../types';

// Shape of a tool row as returned by the API (Prisma camelCase).
interface ToolApiResponse {
  id: string;
  name: string;
  description: string | null;
  status: string;
  image: string | null;
  borrowedById: string | null;
  borrowedDate: string | null;
  estimatedReturnDate: string | null;
  createdAt: string;
  updatedAt: string;
}

// Reshape the API's camelCase tool row into the FE's snake_case Tool type.
// Typed return (no `as`) so tsc enforces every `tools` table column.
// `toAssetUrl` turns the relative /uploads path into an absolute URL for
// <img src>.
function toSnake(t: ToolApiResponse): Tool {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    status: t.status,
    image: toAssetUrl(t.image),
    borrowed_by: t.borrowedById,
    borrowed_date: t.borrowedDate,
    estimated_return_date: t.estimatedReturnDate,
    created_at: t.createdAt,
    updated_at: t.updatedAt
  };
}

// Fetch a page of tools, reshaped (API sorts updatedAt desc).
export async function getTools(
  page = 1,
  limit = 10
): Promise<{ data: Tool[]; count: number | null }> {
  const res = await api.get<{ data: ToolApiResponse[]; count: number }>('/tools', { page, limit });
  return { data: res.data.map(toSnake), count: res.count };
}

export async function getToolById(id: string): Promise<Tool> {
  return toSnake(await api.get<ToolApiResponse>(`/tools/${id}`));
}

// Builds the multipart body shared by create/update: text fields (camelCase,
// matching the API's zod schema) + the `image` file part when provided.
function toolFormData(t: Partial<NewTool>, file?: File): FormData {
  const fd = new FormData();
  const fields: Record<string, unknown> = {
    name: t.name,
    description: t.description,
    status: t.status,
    borrowedById: t.borrowed_by,
    borrowedDate: t.borrowed_date,
    estimatedReturnDate: t.estimated_return_date
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) fd.append(key, String(value));
  }
  if (file) fd.append('image', file);
  return fd;
}

export async function createTool(tool: NewTool, file?: File): Promise<Tool> {
  return toSnake(await api.postForm<ToolApiResponse>('/tools', toolFormData(tool, file)));
}

export async function updateTool(
  id: string,
  updates: UpdateTool,
  file?: File,
  removeImage: boolean = false
): Promise<Tool> {
  const fd = toolFormData(updates, file);
  if (removeImage) fd.append('removeImage', 'true');
  return toSnake(await api.patchForm<ToolApiResponse>(`/tools/${id}`, fd));
}
