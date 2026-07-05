import { Router } from 'express';
import { USER_ROLES, createScheduleItemBodySchema, createStandardBodySchema, updateStandardBodySchema } from '@mms/shared';
import { INVENTORY_READ_ROLES } from '../../lib/access.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './standards.controller.js';

export const standardsRouter = Router();

standardsRouter.use(requireAuth);
standardsRouter.get('/', requireRole(...INVENTORY_READ_ROLES), controller.list);

// Static child-collection routes must precede the '/:id' matcher.
standardsRouter.delete(
  '/schedule-items/:itemId',
  requireRole(USER_ROLES.admin),
  controller.removeScheduleItem
);
standardsRouter.post(
  '/:id/schedule-items',
  requireRole(USER_ROLES.admin),
  validateBody(createScheduleItemBodySchema),
  controller.addScheduleItem
);

standardsRouter.get('/:id', requireRole(...INVENTORY_READ_ROLES), controller.getById);
standardsRouter.post('/', requireRole(USER_ROLES.admin), validateBody(createStandardBodySchema), controller.create);
standardsRouter.patch('/:id', requireRole(USER_ROLES.admin), validateBody(updateStandardBodySchema), controller.update);
standardsRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
