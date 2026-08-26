import { Router } from 'express';
import {
  USER_ROLES,
  createBranchBodySchema,
  updateBranchBodySchema
} from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const organizationRouter = Router();

// requireAuth is applied per-route, NOT router-wide (organizationRouter.use(...)).
// This router is mounted at the generic '/api' prefix, same as referenceRouter,
// alongside sibling routers (gps, tracker-devices) that authenticate some of
// their own routes with a device key instead of a Bearer token. A router-wide
// requireAuth would run for every '/api/*' request that reaches this router —
// even ones that match no route here — and reject those device-key requests
// with 401 before they ever get to the router that actually owns them.

// Reads stay open to every authenticated role: the booking, user, vehicle and
// job-order forms all populate their dropdowns from these.
organizationRouter.get('/branches', requireAuth, controller.listBranches);

organizationRouter.post(
  '/branches',
  requireAuth,
  requireRole(USER_ROLES.admin),
  validateBody(createBranchBodySchema),
  controller.createBranch
);
organizationRouter.patch(
  '/branches/:id',
  requireAuth,
  requireRole(USER_ROLES.admin),
  validateBody(updateBranchBodySchema),
  controller.updateBranch
);
// POST rather than DELETE or a PATCH field: archiving is an operation that can
// FAIL with a structured list of blockers, which neither of those reads like.
organizationRouter.post(
  '/branches/:id/archive',
  requireAuth,
  requireRole(USER_ROLES.admin),
  controller.archiveBranch
);
organizationRouter.post(
  '/branches/:id/restore',
  requireAuth,
  requireRole(USER_ROLES.admin),
  controller.restoreBranch
);
