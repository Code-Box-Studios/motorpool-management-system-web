import type { Request, Response } from 'express';
import type {
  ChangePasswordBody,
  CreateUserBody,
  UpdateOwnProfileBody,
  UpdateUserBody
} from '@mms/shared';
import { usersListQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { publicUploadPath } from '../../lib/uploads.js';
import * as service from './service.js';

// GET /api/users — optionally filtered by ?role=, paginated.
export async function list(req: Request, res: Response): Promise<void> {
  // Express 5: req.query is read-only — parse here, never in middleware.
  const query = usersListQuerySchema.parse(req.query);
  res.json(await service.list(query));
}

// POST /api/users — creates a login (admin only); multipart avatar optional.
export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateUserBody;
  const avatarPath = req.file
    ? publicUploadPath('avatars', req.file.filename)
    : null;
  res.status(201).json(await service.create(body, avatarPath));
}

// Narrows req.user (populated by requireAuth) or throws 401.
function requireUser(req: Request) {
  if (!req.user)
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.user;
}

// Narrows the :id route param or throws 400.
function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id)
    throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

// PATCH /api/users/:id — updates profile fields and role (admin only); multipart avatar optional.
export async function update(req: Request, res: Response): Promise<void> {
  const avatarPath = req.file
    ? publicUploadPath('avatars', req.file.filename)
    : null;
  res.json(
    await service.update(
      requireIdParam(req),
      req.body as UpdateUserBody,
      avatarPath
    )
  );
}

// GET /api/users/me — the signed-in user's own profile, any role.
export async function getMe(req: Request, res: Response): Promise<void> {
  res.json(await service.getOwnProfile(requireUser(req).id));
}

// PATCH /api/users/me — self-service edit; the id comes from the token, so
// this can only ever write the caller's own row.
export async function updateMe(req: Request, res: Response): Promise<void> {
  const avatarPath = req.file
    ? publicUploadPath('avatars', req.file.filename)
    : null;
  res.json(
    await service.updateOwnProfile(
      requireUser(req).id,
      req.body as UpdateOwnProfileBody,
      avatarPath
    )
  );
}

// PATCH /api/users/:id/password — self (with currentPassword) or admin (without).
export async function changePassword(
  req: Request,
  res: Response
): Promise<void> {
  await service.changePassword(
    requireUser(req),
    requireIdParam(req),
    req.body as ChangePasswordBody
  );
  res.status(204).end();
}

// DELETE /api/users/:id — admin only; refuses self-deletion.
export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireUser(req), requireIdParam(req));
  res.status(204).end();
}
