import { z } from 'zod';
import { TOOL_STATUS } from '../enums.js';
import { booleanFromString, nullableDate, nullableString, nullableUuid } from './common.js';

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
