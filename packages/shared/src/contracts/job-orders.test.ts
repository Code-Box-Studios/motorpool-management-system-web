import { describe, expect, it } from 'vitest';
import {
  createJobOrderBodySchema,
  describeJobOrder,
  updateJobOrderBodySchema
} from './job-orders.js';

const base = {
  vehicleId: '11111111-1111-4111-8111-111111111111',
  branchId: '22222222-2222-4222-8222-222222222222',
  incidentDate: '2026-11-01T08:00:00.000Z'
};

describe('job order services', () => {
  it('needs a picked service, additional services, or both', () => {
    expect(createJobOrderBodySchema.safeParse(base).success).toBe(false);
    expect(
      createJobOrderBodySchema.safeParse({ ...base, incidentDetails: '  ' })
        .success
    ).toBe(false);
    expect(
      createJobOrderBodySchema.safeParse({
        ...base,
        services: ['Check up brake system']
      }).success
    ).toBe(true);
    expect(
      createJobOrderBodySchema.safeParse({
        ...base,
        incidentDetails: 'Replace wiper blades'
      }).success
    ).toBe(true);
  });

  it('accepts only listed services and collapses duplicates', () => {
    expect(
      createJobOrderBodySchema.safeParse({ ...base, services: ['Anything'] })
        .success
    ).toBe(false);
    const parsed = createJobOrderBodySchema.parse({
      ...base,
      services: ['Check up tire pressure', 'Check up tire pressure']
    });
    expect(parsed.services).toEqual(['Check up tire pressure']);
  });

  it('leaves services out of a PATCH that does not mention them', () => {
    expect(updateJobOrderBodySchema.parse({ remarks: 'x' })).not.toHaveProperty(
      'services'
    );
  });

  it('describes an order by its services, then any additional work', () => {
    expect(
      describeJobOrder({
        services: ['Check up brake system', 'Check up tire pressure'],
        incidentDetails: null
      })
    ).toBe('Check up brake system, Check up tire pressure');
    expect(
      describeJobOrder({
        services: ['Check up brake system'],
        incidentDetails: ' Replace wipers '
      })
    ).toBe('Check up brake system; Replace wipers');
    expect(describeJobOrder({ services: [], incidentDetails: 'Brakes' })).toBe(
      'Brakes'
    );
    expect(describeJobOrder({ services: [], incidentDetails: '' })).toBeNull();
  });
});
