import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

describe('/api/users/me', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('returns the caller their own profile, whatever their role', async () => {
    const { user } = await createTestUser({
      email: 'guard@test.local',
      role: 'security_guard',
      fullName: 'Gate Guard'
    });
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', authHeader(user.id, user.email, 'security_guard'));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.email).toBe('guard@test.local');
    expect(res.body.fullName).toBe('Gate Guard');
    expect(res.body.role).toBe('security_guard');
    // Never leak the hash, whatever else the row carries.
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('401s without a token', async () => {
    expect((await request(app).get('/api/users/me')).status).toBe(401);
    expect((await request(app).patch('/api/users/me').send({})).status).toBe(
      401
    );
  });

  it('lets a non-admin edit their own name, phone and address', async () => {
    const { user } = await createTestUser({
      email: 'driver@test.local',
      role: 'driver'
    });
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', authHeader(user.id, user.email, 'driver'))
      .send({ fullName: 'New Name', phone: '0917', address: 'Davao' });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('New Name');
    expect(res.body.phone).toBe('0917');
    expect(res.body.address).toBe('Davao');
  });

  // The point of the narrow schema: these fields decide what a user may do, so
  // they must not be reachable from the one write a non-admin can make.
  it('ignores role, status and branch smuggled into the body', async () => {
    const branch = await prisma.branch.create({ data: { name: 'Other' } });
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' }
    });
    const { user } = await createTestUser({
      email: 'sneaky@test.local',
      role: 'requester'
    });

    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', authHeader(user.id, user.email, 'requester'))
      .send({
        fullName: 'Still Me',
        roleId: adminRole?.id,
        status: 'inactive',
        branchId: branch.id
      });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Still Me');
    // Unchanged: still a requester, still active, still their original branch.
    expect(res.body.role).toBe('requester');
    expect(res.body.status).toBe('active');
    expect(res.body.branchId).not.toBe(branch.id);

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      include: { userRole: { include: { role: true } } }
    });
    expect(row?.userRole?.role.name).toBe('requester');
    expect(row?.status).toBe('active');
  });

  // The route takes no id at all, so there is no other row to aim it at.
  it('cannot be pointed at another user', async () => {
    const { user: victim } = await createTestUser({
      email: 'victim@test.local',
      role: 'driver',
      fullName: 'Victim'
    });
    const { user: attacker } = await createTestUser({
      email: 'attacker@test.local',
      role: 'driver'
    });

    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', authHeader(attacker.id, attacker.email, 'driver'))
      .send({ id: victim.id, fullName: 'Pwned' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(attacker.id);
    expect(
      (await prisma.user.findUnique({ where: { id: victim.id } }))?.fullName
    ).toBe('Victim');
  });
});
