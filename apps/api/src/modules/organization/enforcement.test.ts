import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestOffice,
  createTestOfficeHead,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

// An archived branch, ready to be sent where the UI would never offer it.
async function archivedBranch(header: string) {
  const branch = await createTestBranch('Closed Branch');
  const res = await request(app)
    .post(`/api/branches/${branch.id}/archive`)
    .set('Authorization', header);
  expect(res.status).toBe(200);
  return branch;
}

// An archived office, isolated on its own live branch and with no office
// head attached — so archiving it trips on nothing but its own row.
async function archivedOffice(header: string, branchId: string) {
  const office = await createTestOffice(branchId, 'Closed Office');
  const res = await request(app)
    .post(`/api/offices/${office.id}/archive`)
    .set('Authorization', header);
  expect(res.status).toBe(200);
  return office;
}

// An archived office head, not attached to any office — same reasoning.
async function archivedOfficeHead(header: string, branchId: string) {
  const head = await createTestOfficeHead(branchId, null, 'Closed Head');
  const res = await request(app)
    .post(`/api/office-heads/${head.id}/archive`)
    .set('Authorization', header);
  expect(res.status).toBe(200);
  return head;
}

describe('archived branches are rejected on write, not just hidden', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  async function adminHeader() {
    const { user } = await createTestUser({
      email: 'boss@test.local',
      role: 'admin'
    });
    return authHeader(user.id, user.email, 'admin');
  }

  it('POST /api/users rejects an archived branchId', async () => {
    const header = await adminHeader();
    const branch = await archivedBranch(header);
    // createUserBodySchema requires roleId — the brief's test body omitted
    // it, which would 400 before the archived-parent check ever runs.
    const role = await prisma.role.upsert({
      where: { name: 'requester' },
      update: {},
      create: { name: 'requester' }
    });
    // Multipart, not JSON: the route is behind avatarUpload.single('avatar'),
    // as are the driver and vehicle routes below.
    const req = request(app).post('/api/users').set('Authorization', header);
    for (const [k, v] of Object.entries({
      email: 'new@test.local',
      password: 'Password123!',
      fullName: 'New Person',
      roleId: role.id,
      branchId: branch.id
    })) {
      req.field(k, v);
    }
    const res = await req;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  // G-1: create-path coverage above cannot tell us whether the `update` call
  // site exists at all — reverting the whole service file removes both at
  // once. This is the one that actually pins `update`.
  it('PATCH /api/users/:id rejects an archived branchId', async () => {
    const header = await adminHeader();
    const { user: target } = await createTestUser({
      email: 'existing@test.local',
      role: 'requester'
    });
    const branch = await archivedBranch(header);
    const res = await request(app)
      .patch(`/api/users/${target.id}`)
      .set('Authorization', header)
      .field('branchId', branch.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('POST /api/vehicles rejects an archived branchId', async () => {
    const header = await adminHeader();
    const branch = await archivedBranch(header);
    const req = request(app).post('/api/vehicles').set('Authorization', header);
    const fields: Record<string, string> = {
      make: 'Toyota',
      model: 'Hiace',
      year: '2021',
      vin: 'JT-VIN-ARCH',
      licensePlate: 'ARC-0001',
      capacity: '12',
      fuelType: 'diesel',
      mileage: '1000',
      insuranceExpiry: '2027-01-01',
      registrationExpiry: '2027-03-01',
      branchId: branch.id
    };
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    const res = await req;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('PATCH /api/vehicles/:id rejects an archived branchId', async () => {
    const header = await adminHeader();
    const live = await createTestBranch('Live');
    const vehicle = await createTestVehicle(live.id);
    const dead = await archivedBranch(header);
    const res = await request(app)
      .patch(`/api/vehicles/${vehicle.id}`)
      .set('Authorization', header)
      .field('branchId', dead.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('POST /api/drivers rejects an archived branchId', async () => {
    const header = await adminHeader();
    const branch = await archivedBranch(header);
    const req = request(app).post('/api/drivers').set('Authorization', header);
    for (const [k, v] of Object.entries({
      email: 'newdriver@test.local',
      fullName: 'New Driver',
      branchId: branch.id
    })) {
      req.field(k, v);
    }
    const res = await req;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('PATCH /api/drivers/:id rejects an archived branchId', async () => {
    const header = await adminHeader();
    const live = await createTestBranch('Live');
    const driver = await createTestDriver(live.id);
    const dead = await archivedBranch(header);
    const res = await request(app)
      .patch(`/api/drivers/${driver.id}`)
      .set('Authorization', header)
      .field('branchId', dead.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('POST /api/trip-tickets rejects an archived branchId', async () => {
    const header = await adminHeader();
    // Build the fleet on a LIVE branch, then file the trip against a dead one,
    // so the only thing wrong with the request is the archived branch.
    const live = await createTestBranch('Live');
    const vehicle = await createTestVehicle(live.id);
    const driver = await createTestDriver(live.id);
    const dead = await archivedBranch(header);

    const now = Date.now();
    const res = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', header)
      .send({
        branchId: dead.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'Anywhere',
        purpose: 'Testing',
        dateRequested: '2026-08-26',
        preparedBy: 'Test',
        dates: [
          {
            startTs: new Date(now + 3_600_000).toISOString(),
            endTs: new Date(now + 7_200_000).toISOString()
          }
        ]
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('PATCH /api/trip-tickets/:id rejects an archived branchId', async () => {
    const header = await adminHeader();
    const live = await createTestBranch('Live');
    const vehicle = await createTestVehicle(live.id);
    const driver = await createTestDriver(live.id);
    // Branch B must still be EMPTY when it is archived — the guard refuses to
    // archive a branch with a live trip ticket — so archive it before the
    // ticket below is raised on branch A.
    const dead = await archivedBranch(header);

    const now = Date.now();
    const created = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', header)
      .send({
        branchId: live.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'Anywhere',
        purpose: 'Testing',
        dateRequested: '2026-08-26',
        preparedBy: 'Test',
        dates: [
          {
            startTs: new Date(now + 3_600_000).toISOString(),
            endTs: new Date(now + 7_200_000).toISOString()
          }
        ]
      });
    expect(created.status).toBe(201);

    const res = await request(app)
      .patch(`/api/trip-tickets/${created.body.id}`)
      .set('Authorization', header)
      .send({ branchId: dead.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  // §5.7 was short by a module. A job order is the only branch-writing
  // endpoint that is BOTH an archive blocker (guard.ts counts un-repaired job
  // orders against a branch) and able to create a live record under a branch
  // that is already closed. branchId is required and client-supplied
  // (contracts/job-orders.ts), so hiding the branch from the picker stops it
  // being offered, never sent.
  it('POST /api/job-orders rejects an archived branchId', async () => {
    const header = await adminHeader();
    // The vehicle lives on a LIVE branch, so the archived branchId is the only
    // thing wrong with the request.
    const live = await createTestBranch('Live');
    const vehicle = await createTestVehicle(live.id);
    const dead = await archivedBranch(header);

    const res = await request(app)
      .post('/api/job-orders')
      .set('Authorization', header)
      .send({
        vehicleId: vehicle.id,
        branchId: dead.id,
        incidentDate: new Date(Date.now() - 3_600_000).toISOString(),
        incidentDetails: 'Brakes'
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  // Same reasoning as G-1 above: the create test cannot tell us whether the
  // `update` call site exists at all, so this is the one that pins it.
  it('PATCH /api/job-orders/:id rejects an archived branchId', async () => {
    const header = await adminHeader();
    const live = await createTestBranch('Live');
    const vehicle = await createTestVehicle(live.id);
    // Archive the second branch while it is still EMPTY — an un-repaired job
    // order sitting on it would refuse the archive outright.
    const dead = await archivedBranch(header);

    const created = await request(app)
      .post('/api/job-orders')
      .set('Authorization', header)
      .send({
        vehicleId: vehicle.id,
        branchId: live.id,
        incidentDate: new Date(Date.now() - 3_600_000).toISOString(),
        incidentDetails: 'Brakes'
      });
    expect(created.status).toBe(201);

    const res = await request(app)
      .patch(`/api/job-orders/${created.body.id}`)
      .set('Authorization', header)
      .send({ branchId: dead.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  // G-2: the create test above only ever sends an archived branchId. Since
  // officeId/officeHeadId are skipped by assertOrgRefsActive when absent, a
  // swapped key (officeId: body.officeHeadId) or a dropped one would compile,
  // typecheck and pass every test above without being caught. Each test below
  // sends exactly one archived ref alongside a LIVE branchId, so only the
  // service actually forwarding THAT ref can make it fail.
  it('POST /api/trip-tickets rejects an archived officeId (officeHeadId absent)', async () => {
    const header = await adminHeader();
    const live = await createTestBranch('Live');
    const vehicle = await createTestVehicle(live.id);
    const driver = await createTestDriver(live.id);
    const office = await archivedOffice(header, live.id);

    const now = Date.now();
    const res = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', header)
      .send({
        branchId: live.id,
        officeId: office.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'Anywhere',
        purpose: 'Testing',
        dateRequested: '2026-08-26',
        preparedBy: 'Test',
        dates: [
          {
            startTs: new Date(now + 3_600_000).toISOString(),
            endTs: new Date(now + 7_200_000).toISOString()
          }
        ]
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('POST /api/trip-tickets rejects an archived officeHeadId (officeId absent)', async () => {
    const header = await adminHeader();
    const live = await createTestBranch('Live');
    const vehicle = await createTestVehicle(live.id);
    const driver = await createTestDriver(live.id);
    const head = await archivedOfficeHead(header, live.id);

    const now = Date.now();
    const res = await request(app)
      .post('/api/trip-tickets')
      .set('Authorization', header)
      .send({
        branchId: live.id,
        officeHeadId: head.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'Anywhere',
        purpose: 'Testing',
        dateRequested: '2026-08-26',
        preparedBy: 'Test',
        dates: [
          {
            startTs: new Date(now + 3_600_000).toISOString(),
            endTs: new Date(now + 7_200_000).toISOString()
          }
        ]
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_ARCHIVED');
  });

  it('leaves records that already point at a newly archived branch alone', async () => {
    const header = await adminHeader();
    // The check runs on write, not on read. A vehicle created while its branch
    // was live must keep working after the branch is archived — and archiving
    // is blocked by that vehicle anyway, so this is belt and braces.
    const branch = await createTestBranch('Later Closed');
    const vehicle = await createTestVehicle(branch.id);
    await prisma.branch.update({
      where: { id: branch.id },
      data: { archivedAt: new Date() }
    });
    const res = await request(app)
      .get(`/api/vehicles/${vehicle.id}`)
      .set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.branchId).toBe(branch.id);
  });
});
