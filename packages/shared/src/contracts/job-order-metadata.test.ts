import { describe, it, expect } from 'vitest';
import {
  createJobOrderBodySchema,
  completeRepairBodySchema,
  JOB_ORDER_SERVICES
} from './job-orders.js';
describe('job-order service metadata', () => {
  it('preserves explicit maintenance classification and location on creation', () => {
    const body = createJobOrderBodySchema.parse({
      vehicleId: '00000000-0000-4000-8000-000000000001',
      branchId: '00000000-0000-4000-8000-000000000002',
      incidentDate: '2026-10-25',
      incidentDetails: 'Oil service',
      maintenanceType: 'preventive_corrective',
      serviceLocation: 'outside'
    });
    expect(body).toMatchObject({
      maintenanceType: 'preventive_corrective',
      serviceLocation: 'outside'
    });
  });
  it('allows the administrator to record service location at completion', () => {
    expect(
      completeRepairBodySchema.parse({
        repairDone: 'simple',
        completedMileage: 1000,
        maintenanceType: 'inspection',
        serviceLocation: 'motorpool'
      })
    ).toMatchObject({
      maintenanceType: 'inspection',
      serviceLocation: 'motorpool'
    });
  });
  it('offers preventive and corrective only as one merged job-order choice', () => {
    for (const maintenanceType of ['preventive', 'corrective']) {
      expect(
        completeRepairBodySchema.safeParse({
          repairDone: 'simple',
          completedMileage: 1000,
          maintenanceType
        }).success
      ).toBe(false);
    }
  });
  it('lists the oil and water level check among the standard services', () => {
    expect(JOB_ORDER_SERVICES).toContain('Check up oil and water level');
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
