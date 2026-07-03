import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import * as controller from './controller.js';

export const referenceRouter = Router();

// All reference endpoints require authentication (per-route, not router-wide).
referenceRouter.get('/roles', requireAuth, controller.roles);
referenceRouter.get('/branches', requireAuth, controller.branches);
referenceRouter.get('/offices', requireAuth, controller.offices);
referenceRouter.get('/office-heads', requireAuth, controller.officeHeads);
