import type { Request, Response } from 'express';
import type { CreateUserBody } from '@mms/shared';
import { usersListQuerySchema } from '@mms/shared';
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
  const avatarPath = req.file ? publicUploadPath('avatars', req.file.filename) : null;
  res.status(201).json(await service.create(body, avatarPath));
}
