import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '@mms/shared';
import { signAccessToken } from '../lib/jwt.js';
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

function tokenFor(role: string): string {
  return signAccessToken({
    sub: '11111111-1111-4111-8111-111111111111',
    email: `${role}@test.local`,
    role,
    branchId: null
  });
}

describe('requireRole', () => {
  it('admits an allowed role', async () => {
    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).toBe(200);
  });

  it('admits the second allowed role', async () => {
    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', `Bearer ${tokenFor('evp_operations')}`);
    expect(res.status).toBe(200);
  });

  it('rejects a disallowed role with 403 FORBIDDEN', async () => {
    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', `Bearer ${tokenFor('driver')}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(buildApp()).get('/admin-only');
    expect(res.status).toBe(401);
  });
});
