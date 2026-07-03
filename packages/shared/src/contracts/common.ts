import { z } from 'zod';

// ?page= / ?limit= — both optional; both omitted means "return everything".
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
