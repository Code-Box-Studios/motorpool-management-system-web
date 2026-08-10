import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestUser
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function scaffold() {
  const branch = await createTestBranch();
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'T',
      model: 'H',
      year: 2021,
      vin: 'V1',
      licensePlate: 'P1',
      capacity: 5,
      fuelType: 'diesel',
      mileage: 1000,
      status: 'available',
      branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-01-01')
    }
  });
  return { branch, vehicle };
}

// A job order has to say WHEN and WHAT — both were optional, so a repair request
// could carry neither and still be raised. The date cannot be in the future.
function orderBody(
  s: { branch: { id: string }; vehicle: { id: string } },
  requestedById?: string
) {
  return {
    vehicleId: s.vehicle.id,
    branchId: s.branch.id,
    incidentDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // an hour ago
    incidentDetails: 'Brakes',
    requestedById
  };
}

describe('job-orders module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('creates a job order as pending and reads it back with embeds', async () => {
    const s = await scaffold();
    const { user } = await createTestUser({
      email: 'req@test.local',
      role: 'requester'
    });
    const header = authHeader(user.id, user.email, 'requester');
    const created = await request(app)
      .post('/api/job-orders')
      .set('Authorization', header)
      .send(orderBody(s, user.id));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');
    const fetched = await request(app)
      .get(`/api/job-orders/${created.body.id}`)
      .set('Authorization', header);
    expect(fetched.status).toBe(200);
    expect(fetched.body.vehicle).toBeDefined();
    expect(Array.isArray(fetched.body.spareParts)).toBe(true);
  });

  it('403s security_guard reads; admin/evp see all; requester sees only own', async () => {
    const s = await scaffold();
    const { user: r1 } = await createTestUser({
      email: 'r1@test.local',
      role: 'requester'
    });
    const { user: r2 } = await createTestUser({
      email: 'r2@test.local',
      role: 'requester'
    });
    await request(app)
      .post('/api/job-orders')
      .set('Authorization', authHeader(r1.id, r1.email, 'requester'))
      .send(orderBody(s, r1.id));
    await request(app)
      .post('/api/job-orders')
      .set('Authorization', authHeader(r2.id, r2.email, 'requester'))
      .send(orderBody(s, r2.id));

    const { user: guard } = await createTestUser({
      email: 'g@test.local',
      role: 'security_guard'
    });
    const guardRead = await request(app)
      .get('/api/job-orders')
      .set(
        'Authorization',
        authHeader(guard.id, guard.email, 'security_guard')
      );
    expect(guardRead.status).toBe(403);

    const asR1 = await request(app)
      .get('/api/job-orders')
      .set('Authorization', authHeader(r1.id, r1.email, 'requester'));
    expect(asR1.body.count).toBe(1);
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });
    const asAdmin = await request(app)
      .get('/api/job-orders')
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'));
    expect(asAdmin.body.count).toBe(2);
  });

  it('driver sees orders assigned to their driver row (via drivers.userId)', async () => {
    const s = await scaffold();
    const { user: drvUser } = await createTestUser({
      email: 'drv@test.local',
      role: 'driver'
    });
    const mechanic = await prisma.driver.create({
      data: {
        email: 'mech@test.local',
        fullName: 'Mech',
        status: 'active',
        userId: drvUser.id
      }
    });
    const { user: req } = await createTestUser({
      email: 'rq@test.local',
      role: 'requester'
    });
    // an order assigned to this driver
    await prisma.jobOrder.create({
      data: {
        vehicleId: s.vehicle.id,
        branchId: s.branch.id,
        status: 'assigned_mechanic',
        assignedMechanicId: mechanic.id,
        requestedById: req.id
      }
    });
    // an unrelated order
    await prisma.jobOrder.create({
      data: {
        vehicleId: s.vehicle.id,
        branchId: s.branch.id,
        status: 'pending',
        requestedById: req.id
      }
    });

    const asDriver = await request(app)
      .get('/api/job-orders')
      .set('Authorization', authHeader(drvUser.id, drvUser.email, 'driver'));
    expect(asDriver.status).toBe(200);
    expect(asDriver.body.count).toBe(1);
  });

  it('PATCH admin-only while pending; DELETE admin-only', async () => {
    const s = await scaffold();
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });
    const header = authHeader(admin.id, admin.email, 'admin');
    const created = await request(app)
      .post('/api/job-orders')
      .set('Authorization', header)
      .send(orderBody(s));
    const id = created.body.id as string;
    const patched = await request(app)
      .patch(`/api/job-orders/${id}`)
      .set('Authorization', header)
      .send({ incidentDetails: 'Rotors' });
    expect(patched.status).toBe(200);
    expect(patched.body.incidentDetails).toBe('Rotors');

    await prisma.jobOrder.update({
      where: { id },
      data: { status: 'assigned_mechanic' }
    });
    const late = await request(app)
      .patch(`/api/job-orders/${id}`)
      .set('Authorization', header)
      .send({ incidentDetails: 'X' });
    expect(late.status).toBe(409);

    const del = await request(app)
      .delete(`/api/job-orders/${id}`)
      .set('Authorization', header);
    expect(del.status).toBe(204);
  });
});

describe('job-order request rules', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('the requester is the CALLER, not whoever the body names', async () => {
    const s = await scaffold();
    const { user: requester } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });

    // A requester raising a repair in the ADMIN's name. requestedById used to be
    // spread straight out of the body, and job-order VISIBILITY is scoped on that
    // column — so this both misattributed the request and hid it from its author.
    const res = await request(app)
      .post('/api/job-orders')
      .set(
        'Authorization',
        authHeader(requester.id, requester.email, 'requester')
      )
      .send(orderBody(s, admin.id));
    expect(res.status).toBe(201);
    expect(res.body.requested_by ?? res.body.requestedById).toBe(requester.id);
  });

  it('a job order cannot be raised with NO owner', async () => {
    const s = await scaffold();
    const { user: requester } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });

    const res = await request(app)
      .post('/api/job-orders')
      .set(
        'Authorization',
        authHeader(requester.id, requester.email, 'requester')
      )
      .send({ ...orderBody(s), requestedById: null });
    expect(res.status).toBe(201);
    expect(res.body.requested_by ?? res.body.requestedById).toBe(requester.id);
  });

  it('an admin may still raise a repair on someone else’s behalf', async () => {
    const s = await scaffold();
    const { user: requester } = await createTestUser({
      email: 'r@test.local',
      role: 'requester'
    });
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });

    const res = await request(app)
      .post('/api/job-orders')
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(orderBody(s, requester.id));
    expect(res.status).toBe(201);
    expect(res.body.requested_by ?? res.body.requestedById).toBe(requester.id);
  });

  it('refuses a repair request that does not say what happened', async () => {
    const s = await scaffold();
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });
    const body = orderBody(s) as Record<string, unknown>;
    delete body.incidentDetails;

    const res = await request(app)
      .post('/api/job-orders')
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send(body);
    expect(res.status).toBe(400); // the admin has to assign a mechanic off the back of this
  });

  it('refuses an incident dated in the future', async () => {
    const s = await scaffold();
    const { user: admin } = await createTestUser({
      email: 'a@test.local',
      role: 'admin'
    });

    const res = await request(app)
      .post('/api/job-orders')
      .set('Authorization', authHeader(admin.id, admin.email, 'admin'))
      .send({
        ...orderBody(s),
        incidentDate: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString()
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INCIDENT_IN_THE_FUTURE');
  });
});
