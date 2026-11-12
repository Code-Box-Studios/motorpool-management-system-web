import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { USER_ROLES } from '@mms/shared';
import { prisma } from '../lib/prisma.js';
import { authHeader, createTestUser } from '../test/factories.js';
import { truncateAll } from '../test/db.js';
import { errorHandler } from './error-handler.js';
import { requireAuth } from './require-auth.js';
import { requireRole } from './require-role.js';

// Minimal app exercising the real middleware chain.
function buildApp() {
  const app = express();
  app.get(
    '/admin-only',
    requireAuth,
    requireRole(USER_ROLES.admin, USER_ROLES.evp_operations),
    (_req, res) => res.json({ ok: true })
  );
  app.use(errorHandler);
  return app;
}

async function headerFor(role: string): Promise<string> {
  const { user } = await createTestUser({ email: `${role}@test.local`, role });
  return authHeader(user.id, user.email, role);
}

describe('requireRole', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());
  it('admits an allowed role', async () => {
    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', await headerFor('admin'));
    expect(res.status).toBe(200);
  });

  it('admits the second allowed role', async () => {
    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', await headerFor('evp_operations'));
    expect(res.status).toBe(200);
  });

  it('rejects a disallowed role with 403 FORBIDDEN', async () => {
    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', await headerFor('driver'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(buildApp()).get('/admin-only');
    expect(res.status).toBe(401);
  });
});
