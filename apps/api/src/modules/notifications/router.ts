import { Router } from 'express';
import { markNotificationsReadBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const notificationsRouter = Router();

// No requireRole anywhere in here on purpose: a notification is addressed to a
// person, and every endpoint is scoped to the caller's own id in the repository.
// Gating by role would be the wrong axis and would lock roles out of their bell.
notificationsRouter.use(requireAuth);
notificationsRouter.get('/', controller.list);
notificationsRouter.post(
  '/mark-read',
  validateBody(markNotificationsReadBodySchema),
  controller.markRead
);
notificationsRouter.post('/mark-all-read', controller.markAllRead);
