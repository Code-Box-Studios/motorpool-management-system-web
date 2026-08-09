import { z } from 'zod';

// ?page= / ?limit= — both optional; both omitted means "return everything".
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// ?sortBy= / ?sortOrder= — sortBy is allow-listed per entity, so a caller can
// never order a list by a private or unindexed column. Both optional: omitting
// them keeps the list's default ordering.
export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];
export const sortQuerySchema = <T extends readonly [string, ...string[]]>(
  columns: T
) =>
  z.object({
    sortBy: z.enum(columns).optional(),
    sortOrder: z.enum(SORT_ORDERS).optional()
  });

// ----- Multipart preprocessors -----
// Everything in a multipart/form-data body arrives as a string. These coerce
// the three-valued "absent = leave / '' = clear / value = set" convention the
// image-and-borrow-field forms rely on. NEVER use z.coerce.boolean() for a
// multipart flag — it treats the string 'false' as true.

// A flag whose only truthy value is the literal string 'true'.
export const booleanFromString = z.preprocess(
  (v) => (typeof v === 'string' ? v === 'true' : v),
  z.boolean()
);

// Optional-nullable string: absent → undefined (leave), '' → null (clear).
export const nullableString = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().nullable().optional()
);

// Optional-nullable UUID with the same three-valued convention.
export const nullableUuid = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().uuid().nullable().optional()
);

// Optional-nullable date: absent → undefined, '' → null, value → coerced Date.
export const nullableDate = z.preprocess(
  (v) => (v === '' ? null : v),
  z.coerce.date().nullable().optional()
);
