import { Router } from 'express';
import { USER_ROLES, changePasswordBodySchema, createUserBodySchema, updateUserBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import { createUploader } from '../../lib/uploads.js';
import * as controller from './controller.js';

const avatarUpload = createUploader('avatars');

export const usersRouter = Router();

usersRouter.use(requireAuth);
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
