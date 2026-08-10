import { Router } from 'express';
import {
  USER_ROLES,
  createToolBodySchema,
  updateToolBodySchema
} from '@mms/shared';
import { INVENTORY_READ_ROLES } from '../../lib/access.js';
import { createUploader } from '../../lib/uploads.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const imageUpload = createUploader('tools');

export const toolsRouter = Router();

toolsRouter.use(requireAuth);
toolsRouter.get('/', requireRole(...INVENTORY_READ_ROLES), controller.list);
toolsRouter.get(
  '/:id',
  requireRole(...INVENTORY_READ_ROLES),
  controller.getById
);
toolsRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  imageUpload.single('image'),
  validateBody(createToolBodySchema),
  controller.create
);
toolsRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  imageUpload.single('image'),
  validateBody(updateToolBodySchema),
  controller.update
);
toolsRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
