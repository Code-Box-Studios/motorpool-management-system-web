import { Router } from 'express';
import { USER_ROLES, createTripTicketBodySchema, updateTripTicketBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const tripTicketsRouter = Router();

tripTicketsRouter.use(requireAuth);
tripTicketsRouter.get('/', controller.list); // any authenticated role, service-scoped
tripTicketsRouter.get('/:id', controller.getById);
tripTicketsRouter.post('/', validateBody(createTripTicketBodySchema), controller.create); // any authenticated role
tripTicketsRouter.patch('/:id', validateBody(updateTripTicketBodySchema), controller.update); // owner or admin (service-checked)
tripTicketsRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);
