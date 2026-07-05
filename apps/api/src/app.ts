import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/router.js';
import { driversRouter } from './modules/drivers/router.js';
import { referenceRouter } from './modules/reference/router.js';
import { sparePartsRouter } from './modules/spare-parts/router.js';
import { maintenanceRouter } from './modules/maintenance/router.js';
import { standardsRouter } from './modules/maintenance/standards.router.js';
import { toolsRouter } from './modules/tools/router.js';
import { usersRouter } from './modules/users/router.js';
import { vehiclesRouter } from './modules/vehicles/router.js';

// App factory so tests can mount a fresh instance without listening.
export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  if (process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined) {
    app.use(pinoHttp());
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(
    '/uploads',
    (_req, res, next) => {
      // Images must be embeddable by the cross-origin FE (spec §9);
      // helmet's default CORP: same-origin would block them.
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(config.uploadsDir)
  );

  app.use('/api/auth', authRouter);
  app.use('/api', referenceRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/drivers', driversRouter);
  app.use('/api/vehicles', vehiclesRouter);
  app.use('/api/spare-parts', sparePartsRouter);
  app.use('/api/tools', toolsRouter);
  app.use('/api/maintenance', maintenanceRouter);
  app.use('/api/maintenance-standards', standardsRouter);

  // Domain routers mount here in later plans.

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);

  return app;
}
