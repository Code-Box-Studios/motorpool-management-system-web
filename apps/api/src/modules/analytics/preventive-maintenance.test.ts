import request from 'supertest';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
const app = createApp();
beforeEach(truncateAll);
afterAll(() => prisma.$disconnect());
async function setup() {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { mileage: 25000 }
  });
  const { user } = await createTestUser({ role: 'admin' });
  const header = authHeader(user.id, user.email, 'admin');
  const read = async () => {
    const response = await request(app)
      .get('/api/analytics/predictive-maintenance')
      .set('Authorization', header);
    expect(response.status).toBe(200);
    return response.body.data.find(
      (row: { vehicleId: string }) => row.vehicleId === vehicle.id
    );
  };
  return { vehicle, read };
}
it('keeps an overdue service deadline fixed while mileage advances, and returns the recorded service date', async () => {
  const s = await setup();
  await prisma.maintenance.create({
    data: {
      vehicleId: s.vehicle.id,
      type: 'preventive',
      date: new Date('2026-10-01'),
      mileage: 15000
    }
  });
  expect(await s.read()).toMatchObject({
    lastMaintenanceDate: '2026-10-01',
    lastMaintenanceMileage: 15000,
    nextMaintenanceDueMileage: 20000,
    preventiveStatus: 'overdue',
    preventiveSource: 'service_history'
  });
  await prisma.vehicle.update({
    where: { id: s.vehicle.id },
    data: { mileage: 25001 }
  });
  expect(await s.read()).toMatchObject({
    nextMaintenanceDueMileage: 20000,
    preventiveStatus: 'overdue'
  });
});
it('reports an unknown preventive baseline without inventing a previous service', async () => {
  const s = await setup();
  expect(await s.read()).toMatchObject({
    lastMaintenanceDate: null,
    lastMaintenanceMileage: null,
    nextMaintenanceDueMileage: null,
    nextMaintenanceDueDate: null,
    preventiveStatus: 'unknown',
    preventiveSource: 'unknown'
  });
});
it('uses the current configured maintenance deadlines instead of a generic mileage band', async () => {
  const s = await setup();
  await prisma.maintenance.create({
    data: {
      vehicleId: s.vehicle.id,
      type: 'preventive',
      date: new Date('2026-10-01'),
      mileage: 15000
    }
  });
  const old = await prisma.maintenanceStandard.create({
    data: { name: 'Old standard' }
  });
  const oldItem = await prisma.maintenanceScheduleItem.create({
    data: {
      maintenanceStandardId: old.id,
      taskName: 'Old task',
      intervalType: 'mileage',
      intervalMileage: 1000
    }
  });
  await prisma.vehicleMaintenanceTracking.create({
    data: {
      vehicleId: s.vehicle.id,
      maintenanceScheduleItemId: oldItem.id,
      nextDueMileage: 1000,
      status: 'pending'
    }
  });
  const standard = await prisma.maintenanceStandard.create({
    data: { name: 'Current standard' }
  });
  const item = await prisma.maintenanceScheduleItem.create({
    data: {
      maintenanceStandardId: standard.id,
      taskName: 'Current task',
      intervalType: 'mileage',
      intervalMileage: 10000
    }
  });
  const tracking = await prisma.vehicleMaintenanceTracking.create({
    data: {
      vehicleId: s.vehicle.id,
      maintenanceScheduleItemId: item.id,
      lastCompletedMileage: 17000,
      lastCompletedDate: new Date('2026-10-01'),
      nextDueMileage: 27000,
      status: 'completed'
    }
  });
  await prisma.vehicle.update({
    where: { id: s.vehicle.id },
    data: { maintenanceStandardId: standard.id }
  });
  expect(await s.read()).toMatchObject({
    nextMaintenanceDueMileage: 27000,
    preventiveStatus: 'on_schedule',
    preventiveSource: 'configured_schedule'
  });
  await prisma.vehicleMaintenanceTracking.update({
    where: { id: tracking.id },
    data: { nextDueDate: new Date('2020-01-01') }
  });
  expect(await s.read()).toMatchObject({
    nextMaintenanceDueMileage: 27000,
    nextMaintenanceDueDate: '2020-01-01',
    preventiveStatus: 'overdue'
  });
});
it('ignores future service records when selecting the actual baseline', async () => {
  const s = await setup();
  await prisma.maintenance.createMany({
    data: [
      {
        vehicleId: s.vehicle.id,
        type: 'preventive',
        date: new Date('2026-10-01'),
        mileage: 15000
      },
      {
        vehicleId: s.vehicle.id,
        type: 'preventive',
        date: new Date('2999-01-01'),
        mileage: 50000
      }
    ]
  });
  expect(await s.read()).toMatchObject({
    lastMaintenanceDate: '2026-10-01',
    lastMaintenanceMileage: 15000,
    nextMaintenanceDueMileage: 20000,
    preventiveStatus: 'overdue'
  });
});
