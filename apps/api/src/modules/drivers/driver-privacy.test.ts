import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestBranch,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();
const privateFields = [
  'sssNumber',
  'tin',
  'dateOfBirth',
  'address',
  'hireDate',
  'emergencyContactName',
  'emergencyContactPhone',
  'notes'
];

async function personnel() {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const { user } = await createTestUser({
    email: 'driver@test.local',
    role: 'driver',
    branchId: branch.id
  });
  const driver = await prisma.driver.create({
    data: {
      email: user.email,
      fullName: 'Synthetic Driver',
      userId: user.id,
      branchId: branch.id,
      status: 'active',
      phone: '555-0100',
      licenseNumber: 'SYNTHETIC-LICENSE',
      sssNumber: 'SYNTHETIC-SSS',
      tin: 'SYNTHETIC-TIN',
      address: 'Synthetic address',
      dateOfBirth: new Date('1990-01-01'),
      hireDate: new Date('2020-01-01'),
      emergencyContactName: 'Synthetic contact',
      emergencyContactPhone: '555-0111',
      notes: 'Private personnel note'
    }
  });
  return { branch, vehicle, driver, user };
}

function assertOperationalDriver(
  payload: Record<string, unknown>,
  driver: { id: string; branchId: string | null; userId: string | null }
) {
  expect(payload).toMatchObject({
    id: driver.id,
    fullName: 'Synthetic Driver',
    branchId: driver.branchId,
    userId: driver.userId,
    status: 'active',
    phone: '555-0100',
    licenseNumber: 'SYNTHETIC-LICENSE'
  });
  for (const key of privateFields) expect(payload).not.toHaveProperty(key);
}

describe('driver personnel privacy', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  for (const role of ['requester', 'security_guard', 'evp_operations']) {
    it(`limits ${role} driver lookup responses to operational fields`, async () => {
      const s = await personnel();
      const { user } = await createTestUser({
        email: `${role}@test.local`,
        role,
        branchId: s.branch.id
      });
      const header = authHeader(user.id, user.email, role, s.branch.id);
      const list = await request(app)
        .get('/api/drivers')
        .set('Authorization', header);
      const detail = await request(app)
        .get(`/api/drivers/${s.driver.id}`)
        .set('Authorization', header);
      expect(list.status).toBe(200);
      expect(detail.status).toBe(200);
      assertOperationalDriver(list.body.data[0], s.driver);
      assertOperationalDriver(detail.body, s.driver);
    });
  }

  it('preserves personnel fields for administrators and the linked driver only', async () => {
    const s = await personnel();
    const { user: admin } = await createTestUser({ email: 'admin@test.local' });
    for (const header of [
      authHeader(admin.id, admin.email, 'admin'),
      authHeader(s.user.id, s.user.email, 'driver', s.branch.id)
    ]) {
      const list = await request(app)
        .get('/api/drivers')
        .set('Authorization', header);
      const detail = await request(app)
        .get(`/api/drivers/${s.driver.id}`)
        .set('Authorization', header);
      expect(list.status).toBe(200);
      expect(detail.status).toBe(200);
      for (const row of [list.body.data[0], detail.body]) {
        expect(row).toMatchObject({
          sssNumber: 'SYNTHETIC-SSS',
          tin: 'SYNTHETIC-TIN',
          address: 'Synthetic address'
        });
      }
    }
  });

  it('does not grant personnel authority to a linked user with a non-driver role', async () => {
    const s = await personnel();
    const role = await prisma.role.create({ data: { name: 'requester' } });
    await prisma.userRole.update({
      where: { userId: s.user.id },
      data: { roleId: role.id }
    });
    const header = authHeader(
      s.user.id,
      s.user.email,
      'requester',
      s.branch.id
    );
    const response = await request(app)
      .get(`/api/drivers/${s.driver.id}`)
      .set('Authorization', header);
    expect(response.status).toBe(200);
    assertOperationalDriver(response.body, s.driver);
  });

  it('omits personnel fields from list/detail trip and mechanic embeds for every reader', async () => {
    const s = await personnel();
    const { user: owner } = await createTestUser({
      email: 'requester@test.local',
      role: 'requester',
      branchId: s.branch.id
    });
    const { user: admin } = await createTestUser({ email: 'admin@test.local' });
    const trip = await prisma.tripTicket.create({
      data: {
        branchId: s.branch.id,
        vehicleId: s.vehicle.id,
        driverId: s.driver.id,
        requestedById: owner.id,
        preparedBy: 'Audit',
        dateRequested: new Date(),
        destination: 'Synthetic',
        purpose: 'Privacy test'
      }
    });
    const order = await prisma.jobOrder.create({
      data: {
        branchId: s.branch.id,
        vehicleId: s.vehicle.id,
        assignedMechanicId: s.driver.id,
        requestedById: owner.id
      }
    });
    for (const header of [
      authHeader(owner.id, owner.email, 'requester', s.branch.id),
      authHeader(admin.id, admin.email, 'admin')
    ]) {
      for (const [path, embed] of [
        [`/trip-tickets/${trip.id}`, 'driver'],
        ['/trip-tickets', 'driver'],
        [`/job-orders/${order.id}`, 'assignedMechanic'],
        ['/job-orders', 'assignedMechanic']
      ] as const) {
        const response = await request(app)
          .get(`/api${path}`)
          .set('Authorization', header);
        expect(response.status).toBe(200);
        const row = response.body.data ? response.body.data[0] : response.body;
        assertOperationalDriver(row[embed], s.driver);
      }
    }
  });
});
