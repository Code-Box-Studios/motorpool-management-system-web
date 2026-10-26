import { describe, it, expect } from 'vitest';
import {
  createJobOrderBodySchema,
  completeRepairBodySchema
} from './job-orders.js';
describe('job-order service metadata', () => {
  it('preserves explicit maintenance classification and location on creation', () => {
    const body = createJobOrderBodySchema.parse({
      vehicleId: '00000000-0000-4000-8000-000000000001',
      branchId: '00000000-0000-4000-8000-000000000002',
      incidentDate: '2026-10-25',
      incidentDetails: 'Oil service',
      maintenanceType: 'preventive',
      serviceLocation: 'outside'
    });
    expect(body).toMatchObject({
      maintenanceType: 'preventive',
      serviceLocation: 'outside'
    });
  });
  it('allows the administrator to record service location at completion', () => {
    expect(
      completeRepairBodySchema.parse({
        repairDone: 'simple',
        completedMileage: 1000,
        maintenanceType: 'corrective',
        serviceLocation: 'motorpool'
      })
    ).toMatchObject({
      maintenanceType: 'corrective',
      serviceLocation: 'motorpool'
    });
  });
  it('rejects invented service location values', () => {
    expect(
      completeRepairBodySchema.safeParse({
        repairDone: 'simple',
        completedMileage: 1000,
        serviceLocation: 'somewhere'
      }).success
    ).toBe(false);
  });
});
