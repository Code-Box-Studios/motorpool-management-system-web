import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema } from './common.js';

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  status: z.enum(['active', 'inactive']),
  branchId: z.string().uuid().nullable(),
  role: z.string().nullable(),
  createdAt: z.string()
});
export type UserResponse = z.infer<typeof userResponseSchema>;

export const createUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  phone: z.string().optional(),
  address: z.string().optional()
});
export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const updateUserBodySchema = z.object({
  fullName: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  roleId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  phone: z.string().optional(),
  address: z.string().optional()
});
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8)
});
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

// The list's sortable columns — the table's visible columns, nothing more.
// `role` and `branch` sort through their to-one relations server-side.
export const USER_SORT_COLUMNS = [
  'fullName',
  'role',
  'branch',
  'status',
  'createdAt'
] as const;
export const usersListQuerySchema = paginationQuerySchema
  .extend({
    role: z.string().optional()
  })
  .merge(sortQuerySchema(USER_SORT_COLUMNS));
export type UsersListQuery = z.infer<typeof usersListQuerySchema>;
