import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
  branchId: z.string().uuid().nullable()
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
