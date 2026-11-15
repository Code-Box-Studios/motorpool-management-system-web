import express from 'express';
import request from 'supertest';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config.js';
import { errorHandler } from '../middleware/error-handler.js';
import { usersRouter } from '../modules/users/router.js';
import { driversRouter } from '../modules/drivers/router.js';
import { vehiclesRouter } from '../modules/vehicles/router.js';
import { sparePartsRouter } from '../modules/spare-parts/router.js';
import { toolsRouter } from '../modules/tools/router.js';
import { AppError } from './errors.js';
import { createUploader } from './uploads.js';

const state = vi.hoisted(() => ({
  updateOwnProfile: vi.fn(),
  put: vi.fn(),
  del: vi.fn()
}));
vi.mock('@vercel/blob', () => ({ put: state.put, del: state.del }));
vi.mock('../middleware/require-auth.js', () => ({
  requireAuth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.user = {
      id: '10000000-0000-4000-8000-000000000091',
      role: 'admin',
      email: 'fixture@example.invalid',
      branchId: null
    };
    next();
  }
}));
vi.mock('../modules/users/service.js', () => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getOwnProfile: vi.fn(),
  updateOwnProfile: state.updateOwnProfile,
  changePassword: vi.fn(),
  remove: vi.fn()
}));

const domains = ['avatars', 'drivers', 'vehicles', 'spare-parts', 'tools'];
function stored() {
  return domains.flatMap((domain) => {
    const dir = path.join(config.uploadsDir, domain);
    return existsSync(dir)
      ? readdirSync(dir).map((name) => path.join(dir, name))
      : [];
  });
}
let before: string[] = [];
function server(responseFailure = false) {
  const app = express();
  if (responseFailure)
    app.use((_req, res, next) => {
      const json = res.json.bind(res);
      let first = true;
      res.json = ((body: unknown) => {
        if (first) {
          first = false;
          throw new Error('Fixture response delivery failure');
        }
        return json(body);
      }) as typeof res.json;
      next();
    });
  app.use('/api/users', usersRouter);
  app.use('/api/drivers', driversRouter);
  app.use('/api/vehicles', vehiclesRouter);
  app.use('/api/spare-parts', sparePartsRouter);
  app.use('/api/tools', toolsRouter);
  app.use(errorHandler);
  return app;
}
const file = { filename: 'image.png', contentType: 'image/png' };
const id = '10000000-0000-4000-8000-000000000092';
beforeEach(() => {
  vi.clearAllMocks();
  before = stored();
  state.del.mockResolvedValue(undefined);
  state.put.mockResolvedValue({
    url: 'https://fixture.public.blob.vercel-storage.com/mms/avatars/new.png'
  });
});
afterEach(() => {
  for (const filename of stored().filter((p) => !before.includes(p)))
    rmSync(filename, { force: true });
});

describe('owning upload operations', () => {
  it.each([
    ['/api/users/me', 'avatar', 'fullName'],
    [`/api/drivers/${id}`, 'photo', 'fullName'],
    [`/api/vehicles/${id}`, 'images', 'make'],
    [`/api/spare-parts/${id}`, 'image', 'name'],
    [`/api/tools/${id}`, 'image', 'name']
  ])(
    'cleans local files after downstream validation fails at %s',
    async (url, field, invalid) => {
      const response = await request(server())
        .patch(url!)
        .field(invalid!, '')
        .attach(field!, Buffer.from('fixture image'), file);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(stored().filter((p) => !before.includes(p))).toEqual([]);
    }
  );

  it('cleans a file when the owning service fails before committing its reference', async () => {
    state.updateOwnProfile.mockRejectedValue(
      new AppError(503, 'FIXTURE_FAILURE', 'Isolated service failure')
    );
    const response = await request(server())
      .patch('/api/users/me')
      .field('fullName', 'Valid Name')
      .attach('avatar', Buffer.from('fixture'), file);
    expect(response.status).toBe(503);
    expect(stored().filter((p) => !before.includes(p))).toEqual([]);
  });

  it('retains the committed avatar when response serialization throws after the service succeeds', async () => {
    state.updateOwnProfile.mockImplementation(
      async (_id, _body, avatarUrl) => ({ id, avatarUrl })
    );
    const response = await request(server(true))
      .patch('/api/users/me')
      .field('fullName', 'Valid Name')
      .attach('avatar', Buffer.from('fixture'), file);
    expect(response.status).toBe(500);
    expect(stored().filter((p) => !before.includes(p))).toHaveLength(1);
  });

  it('removes durable objects after a downstream application rejection', async () => {
    const app = express();
    app.post(
      '/image',
      createUploader('avatars', {
        provider: 'vercel-blob',
        token: 'fixture-token'
      }).single('image'),
      () => {
        throw new AppError(
          409,
          'FIXTURE_CONFLICT',
          'Isolated application conflict'
        );
      }
    );
    app.use(errorHandler);
    const response = await request(app)
      .post('/image')
      .attach('image', Buffer.from('fixture'), file);
    expect(response.status).toBe(409);
    expect(state.del).toHaveBeenCalledWith(
      'https://fixture.public.blob.vercel-storage.com/mms/avatars/new.png',
      { token: 'fixture-token' }
    );
  });

  it('retries a transient cleanup failure without changing the owning request error', async () => {
    state.del.mockRejectedValueOnce(
      new Error('provider temporarily unavailable')
    );
    const app = express();
    app.post(
      '/image',
      createUploader('avatars', {
        provider: 'vercel-blob',
        token: 'fixture-token'
      }).single('image'),
      () => {
        throw new AppError(
          409,
          'FIXTURE_CONFLICT',
          'Isolated application conflict'
        );
      }
    );
    app.use(errorHandler);
    const response = await request(app)
      .post('/image')
      .attach('image', Buffer.from('fixture'), file);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('FIXTURE_CONFLICT');
    expect(state.del).toHaveBeenCalledTimes(2);
  });

  it('bounds exhausted cleanup retries and records no private provider error', async () => {
    state.del.mockRejectedValue(new Error('private-provider-secret'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = express();
      app.post(
        '/image',
        createUploader('avatars', {
          provider: 'vercel-blob',
          token: 'fixture-token'
        }).single('image'),
        () => {
          throw new AppError(
            409,
            'FIXTURE_CONFLICT',
            'Isolated application conflict'
          );
        }
      );
      app.use(errorHandler);
      const response = await request(app)
        .post('/image')
        .attach('image', Buffer.from('fixture'), file);
      expect(response.status).toBe(409);
      expect(state.del).toHaveBeenCalledTimes(3);
      expect(log).toHaveBeenCalledWith(
        'Uncommitted image cleanup failed',
        expect.objectContaining({ event: 'upload_cleanup_failed', attempts: 3 })
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        'private-provider-secret'
      );
    } finally {
      log.mockRestore();
    }
  });
});
