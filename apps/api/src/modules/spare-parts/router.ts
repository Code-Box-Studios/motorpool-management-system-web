import { Router } from 'express';
import {
  USER_ROLES,
  createSparePartBodySchema,
  updateSparePartBodySchema
} from '@mms/shared';
import { INVENTORY_READ_ROLES } from '../../lib/access.js';
import { createUploader } from '../../lib/uploads.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const imageUpload = createUploader('spare-parts');

export const sparePartsRouter = Router();

sparePartsRouter.use(requireAuth);
sparePartsRouter.get(
  '/',
  requireRole(...INVENTORY_READ_ROLES),
  controller.list
);
sparePartsRouter.get(
  '/:id',
  requireRole(...INVENTORY_READ_ROLES),
  controller.getById
);
sparePartsRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  imageUpload.single('image'),
  validateBody(createSparePartBodySchema),
  controller.create
);
sparePartsRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  imageUpload.single('image'),
  validateBody(updateSparePartBodySchema),
  controller.update
);
sparePartsRouter.delete(
  '/:id',
  requireRole(USER_ROLES.admin),
  controller.remove
);
