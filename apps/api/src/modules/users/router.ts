import { Router } from 'express';
import {
  USER_ROLES,
  changePasswordBodySchema,
  createUserBodySchema,
  updateOwnProfileBodySchema,
  updateUserBodySchema
} from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import { createUploader } from '../../lib/uploads.js';
import * as controller from './controller.js';

const avatarUpload = createUploader('avatars');

export const usersRouter = Router();

usersRouter.use(requireAuth);

// Self-service, any role. MUST be declared before the '/:id' routes below or
// Express matches 'me' as an id and the admin-only guard rejects everyone.
// No id is accepted: the caller is taken from the verified token.
usersRouter.get('/me', controller.getMe);
usersRouter.patch(
  '/me',
  avatarUpload.single('avatar'),
  validateBody(updateOwnProfileBodySchema),
  controller.updateMe
);

usersRouter.get('/', controller.list);
usersRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  avatarUpload.single('avatar'),
  validateBody(createUserBodySchema),
  controller.create
);
usersRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  avatarUpload.single('avatar'),
  validateBody(updateUserBodySchema),
  controller.update
);
usersRouter.patch(
  '/:id/password',
  validateBody(changePasswordBodySchema),
  controller.changePassword
);
usersRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
