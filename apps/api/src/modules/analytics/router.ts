import { Router } from 'express';
import { USER_ROLES } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import * as controller from './controller.js';

const ANALYTICS_ROLES = [USER_ROLES.admin, USER_ROLES.evp_operations] as const;

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requireRole(...ANALYTICS_ROLES));
analyticsRouter.get('/dashboard', controller.dashboard);
analyticsRouter.get(
  '/predictive-maintenance',
  controller.predictiveMaintenance
);
analyticsRouter.get('/association-rules', controller.associationRules);
