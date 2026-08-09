import { z } from 'zod';
import {
  booleanFromString,
  nullableString,
  paginationQuerySchema,
  sortQuerySchema
} from './common.js';

// The list's sortable columns — the table's visible columns, nothing more.
export const SPARE_PART_SORT_COLUMNS = [
  'name',
  'brand',
  'quantity',
  'description'
] as const;
export const sparePartsListQuerySchema = paginationQuerySchema.merge(
  sortQuerySchema(SPARE_PART_SORT_COLUMNS)
);
export type SparePartsListQuery = z.infer<typeof sparePartsListQuerySchema>;

export const createSparePartBodySchema = z.object({
  name: z.string().min(1),
  brand: nullableString,
  quantity: z.coerce.number().int().min(0).default(0),
  description: nullableString
});
export type CreateSparePartBody = z.infer<typeof createSparePartBodySchema>;

export const updateSparePartBodySchema = createSparePartBodySchema.partial().extend({
  removeImage: booleanFromString.optional()
});
export type UpdateSparePartBody = z.infer<typeof updateSparePartBodySchema>;
