import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({ email: 'boss@test.local', role: 'admin' });
  return authHeader(user.id, user.email, 'admin');
}

describe('spare-parts module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates, reads, updates, and deletes a spare part (admin)', async () => {
    const header = await adminHeader();
    const created = await request(app)
      .post('/api/spare-parts')
      .set('Authorization', header)
      .field('name', 'Brake Pad')
      .field('brand', 'Bendix')
      .field('quantity', '25');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Brake Pad', brand: 'Bendix', quantity: 25 });
    const id = created.body.id as string;

    const updated = await request(app)
      .patch(`/api/spare-parts/${id}`)
      .set('Authorization', header)
      .field('quantity', '10');
    expect(updated.body.quantity).toBe(10);

    const removed = await request(app).delete(`/api/spare-parts/${id}`).set('Authorization', header);
    expect(removed.status).toBe(204);
  });

  it('defaults quantity to 0 and lists newest-first with a total count', async () => {
    const header = await adminHeader();
    await request(app).post('/api/spare-parts').set('Authorization', header).field('name', 'Older');
    await request(app).post('/api/spare-parts').set('Authorization', header).field('name', 'Newer');
    const res = await request(app).get('/api/spare-parts').set('Authorization', header);
    expect(res.body.count).toBe(2);
    expect(res.body.data[0].name).toBe('Newer'); // updatedAt desc
    expect(res.body.data[1].quantity).toBe(0);
  });

  it('is readable by driver but 403 for security_guard (spec §5 asymmetry)', async () => {
    const { user: drv } = await createTestUser({ email: 'd@test.local', role: 'driver' });
    const okd = await request(app)
      .get('/api/spare-parts')
      .set('Authorization', authHeader(drv.id, drv.email, 'driver'));
    expect(okd.status).toBe(200);

    const { user: grd } = await createTestUser({ email: 'g@test.local', role: 'security_guard' });
    const forbidden = await request(app)
      .get('/api/spare-parts')
      .set('Authorization', authHeader(grd.id, grd.email, 'security_guard'));
    expect(forbidden.status).toBe(403);
  });

  it('403s writes for non-admins and 404s a missing part', async () => {
    const { user } = await createTestUser({ email: 'r@test.local', role: 'requester' });
    const forbidden = await request(app)
      .post('/api/spare-parts')
      .set('Authorization', authHeader(user.id, user.email, 'requester'))
      .field('name', 'X');
    expect(forbidden.status).toBe(403);

    const miss = await request(app)
      .get('/api/spare-parts/00000000-0000-4000-8000-00000000dead')
      .set('Authorization', await adminHeader());
    expect(miss.status).toBe(404);
  });
});
