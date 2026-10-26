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

// Employees are people, like office heads — no name uniqueness (§4.3). What
// differs is branchId: REQUIRED and non-nullable, so `nullableUuid` is
// deliberately NOT used here. The guide picker is branch-locked (§5.2), so an
// employee with a NULL branch would appear in no branch's picker anywhere,
// with no error and no way to notice.
export const createEmployeeBodySchema = z.object({
  name: z.string().min(1),
  position: nullableString,
  phone: nullableString,
  branchId: z.string().uuid()
});
export type CreateEmployeeBody = z.infer<typeof createEmployeeBodySchema>;

export const updateEmployeeBodySchema = createEmployeeBodySchema.partial();
export type UpdateEmployeeBody = z.infer<typeof updateEmployeeBodySchema>;

// Employees are the only org resource with a list filter: the guide picker
// asks for one branch's roster. includeArchived/page/limit come from
// organizationListQuerySchema above — EXTEND it, never redeclare it. Zod
// strips unknown keys, so the employees route must parse THIS schema; parsing
// the base one drops ?branchId= silently and shows every branch's roster.
export const employeesListQuerySchema = organizationListQuerySchema.extend({
  branchId: z.string().uuid().optional()
});
export type EmployeesListQuery = z.infer<typeof employeesListQuerySchema>;

export const ORGANIZATION_CSV_MAX_BYTES = 512 * 1024;
export const ORGANIZATION_CSV_MAX_ROWS = 1000;
export const ORGANIZATION_CSV_HEADERS = {
  employees: [
    'id',
    'name',
    'position',
    'phone',
    'branch_id',
    'branch_name',
    'archived_at'
  ],
  'office-heads': [
    'id',
    'name',
    'branch_id',
    'branch_name',
    'office_id',
    'office_name',
    'archived_at'
  ]
} as const;
export type OrganizationCsvResource = keyof typeof ORGANIZATION_CSV_HEADERS;
export const organizationCsvBodySchema = z
  .object({
    csv: z.string().min(1).max(ORGANIZATION_CSV_MAX_BYTES),
    previewToken: z.string().optional()
  })
  .strict();
export type OrganizationCsvBody = z.infer<typeof organizationCsvBodySchema>;
export interface OrganizationCsvPreview {
  created: number;
  updated: number;
  total: number;
  errors: { row: number; message: string }[];
  previewToken: string;
  records: { row: number; action: 'create' | 'update'; name: string }[];
}
