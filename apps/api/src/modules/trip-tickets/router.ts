import { Router } from 'express';
import {
  USER_ROLES,
  approveTripTicketBodySchema,
  checkInBodySchema,
  checkOutBodySchema,
  createTripTicketBodySchema,
  reasonBodySchema,
  updateTripTicketBodySchema
} from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';
import * as transitionsController from './transitions.controller.js';

export const tripTicketsRouter = Router();

tripTicketsRouter.use(requireAuth);
tripTicketsRouter.get('/', controller.list); // any authenticated role, service-scoped
tripTicketsRouter.get('/:id', controller.getById);
tripTicketsRouter.post('/', validateBody(createTripTicketBodySchema), controller.create); // any authenticated role
tripTicketsRouter.patch('/:id', validateBody(updateTripTicketBodySchema), controller.update); // owner or admin (service-checked)
tripTicketsRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);

tripTicketsRouter.post('/:id/approve', requireRole(USER_ROLES.admin), validateBody(approveTripTicketBodySchema), transitionsController.approve);
tripTicketsRouter.post('/:id/approve-evp', requireRole(USER_ROLES.evp_operations), transitionsController.approveEvp);
tripTicketsRouter.post('/:id/disapprove', requireRole(USER_ROLES.admin, USER_ROLES.evp_operations), validateBody(reasonBodySchema), transitionsController.disapprove);
tripTicketsRouter.post('/:id/cancel', requireRole(USER_ROLES.admin, USER_ROLES.requester), validateBody(reasonBodySchema), transitionsController.cancel);

tripTicketsRouter.post('/:id/check-out', requireRole(USER_ROLES.security_guard), validateBody(checkOutBodySchema), transitionsController.checkOut);
tripTicketsRouter.post('/:id/check-in', requireRole(USER_ROLES.security_guard), validateBody(checkInBodySchema), transitionsController.checkIn);
