import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

describe('Admin documentation', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());
  it('requires authentication before returning guide content', async () => {
    const result = await request(app).get('/api/docs/gps');
    expect(result.status).toBe(401);
    expect(JSON.stringify(result.body)).not.toContain('104.198.172.49');
  });

  it.each([
    'requester',
    'driver',
    'security_guard',
    'evp_operations',
    'superadmin'
  ])('rejects the %s role on direct API access', async (role) => {
    const { user } = await createTestUser({ role });
    const result = await request(app)
      .get('/api/docs/gps')
      .set('Authorization', authHeader(user.id, user.email, role));
    expect(result.status).toBe(403);
    expect(JSON.stringify(result.body)).not.toContain('104.198.172.49');
  });

  it('serves all guide chapters privately to any Admin account', async () => {
    const { user } = await createTestUser({ role: 'admin' });
    const result = await request(app)
      .get('/api/docs/gps')
      .set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.body.id).toBe('gps');
    expect(
      result.body.sections.map((section: { id: string }) => section.id)
    ).toEqual([
      'start',
      'install',
      'register',
      'verify',
      'troubleshoot',
      'technical',
      'reference'
    ]);
    expect(
      result.body.sections.every(
        (section: { blocks: unknown[] }) => section.blocks.length > 0
      )
    ).toBe(true);
  });
});
