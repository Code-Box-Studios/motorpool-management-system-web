import { Router } from 'express';
import { USER_ROLES, completeTrackingBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './tracking.controller.js';

export const trackingRouter = Router();

trackingRouter.use(requireAuth);
trackingRouter.post(
  '/:id/complete',
  requireRole(USER_ROLES.admin),
  validateBody(completeTrackingBodySchema),
  controller.complete
);
