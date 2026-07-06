import { Router } from 'express';
import { USER_ROLES, completeRepairBodySchema, createJobOrderBodySchema, noteJobOrderBodySchema, updateJobOrderBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';
import * as transitionsController from './transitions.controller.js';

const JOB_ORDER_ROLES = [USER_ROLES.admin, USER_ROLES.requester, USER_ROLES.evp_operations, USER_ROLES.driver] as const;

export const jobOrdersRouter = Router();

jobOrdersRouter.use(requireAuth);
jobOrdersRouter.get('/', requireRole(...JOB_ORDER_ROLES), controller.list);
jobOrdersRouter.get('/:id', requireRole(...JOB_ORDER_ROLES), controller.getById);
jobOrdersRouter.post('/', requireRole(...JOB_ORDER_ROLES), validateBody(createJobOrderBodySchema), controller.create);
jobOrdersRouter.patch('/:id', requireRole(USER_ROLES.admin), validateBody(updateJobOrderBodySchema), controller.update);
jobOrdersRouter.delete('/:id', requireRole(USER_ROLES.admin), controller.remove);

jobOrdersRouter.post('/:id/note', requireRole(USER_ROLES.admin), validateBody(noteJobOrderBodySchema), transitionsController.note);
jobOrdersRouter.post('/:id/approve', requireRole(USER_ROLES.evp_operations), transitionsController.approve);
jobOrdersRouter.post('/:id/complete-repair', requireRole(USER_ROLES.admin), validateBody(completeRepairBodySchema), transitionsController.completeRepair);
