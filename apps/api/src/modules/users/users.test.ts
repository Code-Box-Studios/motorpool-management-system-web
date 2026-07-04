import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({ email: 'boss@test.local', role: 'admin' });
  return { admin: user, header: authHeader(user.id, user.email, 'admin') };
}

describe('GET /api/users', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('lists users with their role name and filters by ?role=', async () => {
    const { header } = await adminHeader();
    await createTestUser({ email: 'd1@test.local', role: 'driver' });

    const all = await request(app).get('/api/users').set('Authorization', header);
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(2);

    const admins = await request(app).get('/api/users?role=admin').set('Authorization', header);
    expect(admins.body.count).toBe(1);
    expect(admins.body.data[0]).toMatchObject({ email: 'boss@test.local', role: 'admin' });
  });

  it('paginates with a total count', async () => {
    const { header } = await adminHeader();
    await createTestUser({ email: 'a@test.local', role: 'driver' });
    await createTestUser({ email: 'b@test.local', role: 'driver' });
    const res = await request(app)
      .get('/api/users?page=1&limit=2')
      .set('Authorization', header);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.count).toBe(3);
  });

  it('is readable by non-admin roles (name lookups)', async () => {
    const { user } = await createTestUser({ role: 'security_guard' });
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', authHeader(user.id, user.email, 'security_guard'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/users', () => {
  beforeEach(truncateAll);

  it('creates a user and, for the driver role, the linked driver row', async () => {
    const { header } = await adminHeader();
    const driverRole = await prisma.role.upsert({
      where: { name: 'driver' },
      update: {},
      create: { name: 'driver' }
    });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'newdriver@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'New Driver')
      .field('roleId', driverRole.id);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'newdriver@test.local', role: 'driver' });

    const driver = await prisma.driver.findUnique({ where: { email: 'newdriver@test.local' } });
    expect(driver).not.toBeNull();
    expect(driver?.userId).toBe(res.body.id);
  });

  it('links an existing unlinked personnel record instead of duplicating it', async () => {
    const { header, admin } = await adminHeader();
    const driverRole = await prisma.role.upsert({
      where: { name: 'driver' },
      update: {},
      create: { name: 'driver' }
    });
    const personnel = await prisma.driver.create({
      data: { email: 'vet@test.local', fullName: 'Veteran Driver', status: 'active' }
    });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'vet@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'Veteran Driver')
      .field('roleId', driverRole.id);
    expect(res.status).toBe(201);
    expect(await prisma.driver.count()).toBe(1);
    const linked = await prisma.driver.findUnique({ where: { id: personnel.id } });
    expect(linked?.userId).toBe(res.body.id);

    // a login attempt for a driver email already linked to a user must conflict,
    // even though no users-table row shares that email (the driver's own row does)
    const alreadyLinkedDriver = await prisma.driver.create({
      data: { email: 'linked@test.local', fullName: 'Linked Driver', status: 'active', userId: admin.id }
    });
    const again = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', alreadyLinkedDriver.email)
      .field('password', 'Password123!')
      .field('fullName', 'Someone Else')
      .field('roleId', driverRole.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('does not create a driver row for non-driver roles', async () => {
    const { header } = await adminHeader();
    const role = await prisma.role.upsert({
      where: { name: 'requester' },
      update: {},
      create: { name: 'requester' }
    });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'req@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'Req User')
      .field('roleId', role.id);
    expect(res.status).toBe(201);
    expect(await prisma.driver.count()).toBe(0);
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const { header } = await adminHeader();
    const role = await prisma.role.upsert({
      where: { name: 'requester' },
      update: {},
      create: { name: 'requester' }
    });
    await createTestUser({ email: 'dupe@test.local', role: 'requester' });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'dupe@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'Dupe')
      .field('roleId', role.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects an unknown roleId with 400 INVALID_ROLE', async () => {
    const { header } = await adminHeader();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', header)
      .field('email', 'x@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'X')
      .field('roleId', '00000000-0000-4000-8000-00000000dead');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ROLE');
  });

  it('rejects non-admin callers with 403', async () => {
    const { user } = await createTestUser({ role: 'driver' });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', authHeader(user.id, user.email, 'driver'))
      .field('email', 'y@test.local')
      .field('password', 'Password123!')
      .field('fullName', 'Y')
      .field('roleId', '00000000-0000-4000-8000-00000000dead');
    expect(res.status).toBe(403);
  });
});
