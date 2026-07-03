import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

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

export const usersListQuerySchema = paginationQuerySchema.extend({
  role: z.string().optional()
});
export type UsersListQuery = z.infer<typeof usersListQuerySchema>;
