import { z } from 'zod';
import { booleanFromString, nullableString } from './common.js';

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
