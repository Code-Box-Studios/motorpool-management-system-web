import { z } from 'zod';
import {
  booleanFromString,
  nullableString,
  nullableUuid,
  paginationQuerySchema
} from './common.js';

// ?includeArchived=true is used ONLY by the admin Organization page. Every
// other caller gets active records, which is what removes archived rows from
// every dropdown in the app without touching those call sites.
export const organizationListQuerySchema = paginationQuerySchema.extend({
  includeArchived: booleanFromString.optional()
});
export type OrganizationListQuery = z.infer<typeof organizationListQuerySchema>;

export const createBranchBodySchema = z.object({
  name: z.string().min(1),
  location: nullableString
});
export type CreateBranchBody = z.infer<typeof createBranchBodySchema>;

export const updateBranchBodySchema = createBranchBodySchema.partial();
export type UpdateBranchBody = z.infer<typeof updateBranchBodySchema>;

export const createOfficeBodySchema = z.object({
  name: z.string().min(1),
  branchId: nullableUuid,
  headId: nullableUuid
});
export type CreateOfficeBody = z.infer<typeof createOfficeBodySchema>;

export const updateOfficeBodySchema = createOfficeBodySchema.partial();
export type UpdateOfficeBody = z.infer<typeof updateOfficeBodySchema>;

export const createOfficeHeadBodySchema = z.object({
  name: z.string().min(1),
  branchId: nullableUuid,
  officeId: nullableUuid
});
export type CreateOfficeHeadBody = z.infer<typeof createOfficeHeadBodySchema>;

export const updateOfficeHeadBodySchema = createOfficeHeadBodySchema.partial();
export type UpdateOfficeHeadBody = z.infer<typeof updateOfficeHeadBodySchema>;
