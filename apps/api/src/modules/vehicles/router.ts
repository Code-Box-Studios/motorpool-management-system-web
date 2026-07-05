import { Router } from 'express';
import { USER_ROLES, createVehicleBodySchema, updateVehicleBodySchema } from '@mms/shared';
import { createUploader } from '../../lib/uploads.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const imageUpload = createUploader('vehicles');

export const vehiclesRouter = Router();

vehiclesRouter.use(requireAuth);
vehiclesRouter.get('/', controller.list); // any authenticated role (spec §5)
vehiclesRouter.get('/:id', controller.getById);
vehiclesRouter.post(
  '/',
  requireRole(USER_ROLES.admin),
  imageUpload.array('images', 10),
  validateBody(createVehicleBodySchema),
  controller.create
);
vehiclesRouter.patch(
  '/:id',
  requireRole(USER_ROLES.admin),
  imageUpload.array('images', 10),
  validateBody(updateVehicleBodySchema),
  controller.update
);
vehiclesRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
