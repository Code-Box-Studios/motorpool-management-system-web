import { Router } from 'express';
import { USER_ROLES, createMaintenanceBodySchema, updateMaintenanceBodySchema } from '@mms/shared';
import { INVENTORY_READ_ROLES } from '../../lib/access.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const maintenanceRouter = Router();

maintenanceRouter.use(requireAuth);
maintenanceRouter.get('/', requireRole(...INVENTORY_READ_ROLES), controller.list);
maintenanceRouter.get('/:id', requireRole(...INVENTORY_READ_ROLES), controller.getById);
maintenanceRouter.post('/', requireRole(USER_ROLES.admin), validateBody(createMaintenanceBodySchema), controller.create);
maintenanceRouter.patch('/:id', requireRole(USER_ROLES.admin), validateBody(updateMaintenanceBodySchema), controller.update);
maintenanceRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
