import { Router } from 'express';
import { USER_ROLES, createTrackerDeviceBodySchema, updateTrackerDeviceBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const trackerDevicesRouter = Router();

// Admin-only device management.
trackerDevicesRouter.get('/', requireAuth, requireRole(USER_ROLES.admin), controller.list);
trackerDevicesRouter.get('/:id', requireAuth, requireRole(USER_ROLES.admin), controller.getById);
trackerDevicesRouter.post(
  '/',
  requireAuth,
  requireRole(USER_ROLES.admin),
  validateBody(createTrackerDeviceBodySchema),
  controller.create
);
trackerDevicesRouter.patch(
  '/:id',
  requireAuth,
  requireRole(USER_ROLES.admin),
  validateBody(updateTrackerDeviceBodySchema),
  controller.update
);
trackerDevicesRouter.delete('/:id', requireAuth, requireRole(USER_ROLES.admin), controller.remove);
