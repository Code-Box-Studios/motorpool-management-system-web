import { Router } from 'express';
import { USER_ROLES } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import * as controller from './controller.js';

// Whoever may decide may read the record of decisions.
const APPROVAL_ROLES = [
  USER_ROLES.admin,
  USER_ROLES.evp_operations
] as const;

export const approvalsRouter = Router();

approvalsRouter.use(requireAuth, requireRole(...APPROVAL_ROLES));
approvalsRouter.get('/history', controller.history);
