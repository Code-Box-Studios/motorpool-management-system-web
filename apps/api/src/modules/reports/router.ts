import { Router } from 'express';
import { reportQuerySchema, USER_ROLES } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { generateReport } from './service.js';
export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole(USER_ROLES.admin));
reportsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await generateReport(reportQuerySchema.parse(req.query)));
  } catch (error) {
    next(error);
  }
});
