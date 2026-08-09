import { z } from 'zod';
import { TOOL_STATUS } from '../enums.js';
import {
  booleanFromString,
  nullableDate,
  nullableString,
  nullableUuid,
  paginationQuerySchema,
  sortQuerySchema
} from './common.js';

// The list's sortable columns — the table's visible columns, nothing more.
// `borrowedBy` sorts by the borrowing driver's name through the to-one relation.
export const TOOL_SORT_COLUMNS = [
  'name',
  'status',
  'borrowedBy',
  'estimatedReturnDate',
  'description'
] as const;
export const toolsListQuerySchema = paginationQuerySchema.merge(
  sortQuerySchema(TOOL_SORT_COLUMNS)
);
export type ToolsListQuery = z.infer<typeof toolsListQuerySchema>;

// Permissive by design: the tools UI writes borrow/return state directly onto
// the tool row (no borrow-request entity, no enforced invariants — spec §6).
export const createToolBodySchema = z.object({
  name: z.string().min(1),
  description: nullableString,
  status: z.nativeEnum(TOOL_STATUS).default('available'),
  borrowedById: nullableUuid, // -> drivers.id
  borrowedDate: nullableDate,
  estimatedReturnDate: nullableDate
});
export type CreateToolBody = z.infer<typeof createToolBodySchema>;

export const updateToolBodySchema = createToolBodySchema.partial().extend({
  removeImage: booleanFromString.optional()
});
export type UpdateToolBody = z.infer<typeof updateToolBodySchema>;
