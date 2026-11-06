import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { authHeader } from '../../test/factories.js';

const app = createApp();

describe('Admin documentation', () => {
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
    const result = await request(app)
      .get('/api/docs/gps')
      .set(
        'Authorization',
        authHeader(randomUUID(), 'reader@test.local', role)
      );
    expect(result.status).toBe(403);
    expect(JSON.stringify(result.body)).not.toContain('104.198.172.49');
  });

  it('serves all guide chapters privately to any Admin account', async () => {
    const result = await request(app)
      .get('/api/docs/gps')
      .set(
        'Authorization',
        authHeader(randomUUID(), 'another-admin@test.local', 'admin')
      );
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
