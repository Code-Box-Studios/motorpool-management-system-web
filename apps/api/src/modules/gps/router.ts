import { Router } from 'express';
import { USER_ROLES, ingestGpsBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireDeviceKey } from '../../middleware/require-device-key.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const ANALYTICS_ROLES = [USER_ROLES.admin, USER_ROLES.evp_operations] as const;

export const gpsRouter = Router();

// Device-key auth, NOT requireAuth. Auth runs BEFORE body validation.
gpsRouter.post('/ingest', requireDeviceKey, validateBody(ingestGpsBodySchema), controller.ingest);

// User-JWT reads, admin/evp only.
gpsRouter.get('/latest', requireAuth, requireRole(...ANALYTICS_ROLES), controller.latest);
gpsRouter.get('/history', requireAuth, requireRole(...ANALYTICS_ROLES), controller.history);
