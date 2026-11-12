import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../test/factories.js';
import { truncateAll } from '../test/db.js';
import { errorHandler } from './error-handler.js';
import { requireAuth } from './require-auth.js';

const app = express();
app.get('/identity', requireAuth, (req, res) => res.json(req.user));
app.use(errorHandler);

describe('current account authentication', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('resolves role, branch, and email from the stored account despite forged claims', async () => {
    const branch = await createTestBranch();
    const otherBranch = await createTestBranch('Other branch');
    const { user } = await createTestUser({
      role: 'security_guard',
      branchId: branch.id
    });
    const response = await request(app)
      .get('/identity')
      .set(
        'Authorization',
        authHeader(user.id, 'forged@test.local', 'admin', otherBranch.id)
      );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: user.id,
      email: user.email,
      role: 'security_guard',
      branchId: branch.id
    });
  });

  it('rejects a credential version that predates the current account', async () => {
    const { user } = await createTestUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { authVersion: 1 }
    });
    const response = await request(app)
      .get('/identity')
      .set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(response.status).toBe(401);
    const current = await request(app)
      .get('/identity')
      .set('Authorization', authHeader(user.id, user.email, 'admin', null, 1));
    expect(current.status).toBe(200);
  });
});
