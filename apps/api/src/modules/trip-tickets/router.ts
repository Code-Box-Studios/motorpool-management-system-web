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
tripTicketsRouter.post(
  '/',
  validateBody(createTripTicketBodySchema),
  controller.create
); // any authenticated role
tripTicketsRouter.patch(
  '/:id',
  validateBody(updateTripTicketBodySchema),
  controller.update
); // owner or admin (service-checked)
tripTicketsRouter.delete(
  '/:id',
  requireRole(USER_ROLES.admin),
  controller.remove
);

tripTicketsRouter.post(
  '/:id/approve',
  requireRole(USER_ROLES.admin),
  validateBody(approveTripTicketBodySchema),
  transitionsController.approve
);
// Admin is the override here too: without it an admin-approved ticket sits at
// pending_fuel_allocation_approval with no way forward when no EVP is around —
// the same dead end the job-order approve had.
tripTicketsRouter.post(
  '/:id/approve-evp',
  requireRole(USER_ROLES.admin, USER_ROLES.evp_operations),
  transitionsController.approveEvp
);
tripTicketsRouter.post(
  '/:id/disapprove',
  requireRole(USER_ROLES.admin, USER_ROLES.evp_operations),
  validateBody(reasonBodySchema),
  transitionsController.disapprove
);
tripTicketsRouter.post(
  '/:id/cancel',
  requireRole(USER_ROLES.admin, USER_ROLES.requester),
  validateBody(reasonBodySchema),
  transitionsController.cancel
);

// The guard works the gate; admin is an override for when none is on duty.
// Without it an approved trip has no way out of the yard and — worse — a trip
// already on the road has no way to be closed, so the van never comes back to
// 'available' and the odometer never advances.
tripTicketsRouter.post(
  '/:id/check-out',
  requireRole(USER_ROLES.admin, USER_ROLES.security_guard),
  validateBody(checkOutBodySchema),
  transitionsController.checkOut
);
tripTicketsRouter.post(
  '/:id/check-in',
  requireRole(USER_ROLES.admin, USER_ROLES.security_guard),
  validateBody(checkInBodySchema),
  transitionsController.checkIn
);
