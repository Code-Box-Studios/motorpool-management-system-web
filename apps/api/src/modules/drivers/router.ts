import { Router } from 'express';
import { USER_ROLES, createDriverBodySchema, updateDriverBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const driversRouter = Router();

driversRouter.use(requireAuth);
driversRouter.get('/', controller.list);
driversRouter.get('/:id', controller.getById);
driversRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  validateBody(createDriverBodySchema),
  controller.create
);
driversRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  validateBody(updateDriverBodySchema),
  controller.update
);
driversRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
