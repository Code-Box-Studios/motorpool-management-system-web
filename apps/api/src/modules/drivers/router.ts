import { Router } from 'express';
import { USER_ROLES, createDriverBodySchema, updateDriverBodySchema } from '@mms/shared';
import { createUploader } from '../../lib/uploads.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const photoUpload = createUploader('drivers');

export const driversRouter = Router();

driversRouter.use(requireAuth);
driversRouter.get('/', controller.list);
driversRouter.get('/:id', controller.getById);
// multer only engages on multipart/form-data, so a JSON caller is untouched.
driversRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  photoUpload.single('photo'),
  validateBody(createDriverBodySchema),
  controller.create
);
driversRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  photoUpload.single('photo'),
  validateBody(updateDriverBodySchema),
  controller.update
);
driversRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
