import { Router } from 'express';
import { USER_ROLES } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { gpsGuide } from './guide.js';

export const documentationRouter = Router();

documentationRouter.get(
  '/gps',
  requireAuth,
  requireRole(USER_ROLES.admin),
  (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(gpsGuide);
  }
);
