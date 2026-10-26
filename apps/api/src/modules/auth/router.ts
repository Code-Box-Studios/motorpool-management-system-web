import { Router } from 'express';
import { loginBodySchema } from '@mms/shared';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/require-auth.js';
import * as controller from './controller.js';
import {
  listTestAccounts,
  switchTestAccount,
  switchTestAccountSchema
} from './test-accounts.js';

export const authRouter = Router();

authRouter.post('/login', validateBody(loginBodySchema), controller.login);
authRouter.get('/me', requireAuth, controller.me);
authRouter.post('/refresh', controller.refresh);
authRouter.post('/logout', controller.logout);

authRouter.get('/test-accounts', requireAuth, listTestAccounts);
authRouter.post(
  '/test-accounts/switch',
  requireAuth,
  validateBody(switchTestAccountSchema),
  switchTestAccount
);
