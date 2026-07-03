import { Router } from 'express';
import { loginBodySchema } from '@mms/shared';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/require-auth.js';
import * as controller from './controller.js';

export const authRouter = Router();

authRouter.post('/login', validateBody(loginBodySchema), controller.login);
authRouter.get('/me', requireAuth, controller.me);
authRouter.post('/refresh', controller.refresh);
authRouter.post('/logout', controller.logout);
