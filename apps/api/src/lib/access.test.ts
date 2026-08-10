import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '@mms/shared';
import {
  booleanFromString,
  nullableDate,
  nullableString,
  createVehicleBodySchema,
  createToolBodySchema,
  completeTrackingBodySchema
} from '@mms/shared';
import { INVENTORY_READ_ROLES } from './access.js';

describe('access + multipart contracts', () => {
  it('INVENTORY_READ_ROLES excludes security_guard (spec §5 asymmetry)', () => {
    expect(INVENTORY_READ_ROLES).toContain(USER_ROLES.driver);
    expect(INVENTORY_READ_ROLES).not.toContain(USER_ROLES.security_guard);
  });

  it('booleanFromString treats only the literal "true" as true', () => {
    expect(booleanFromString.parse('true')).toBe(true);
    expect(booleanFromString.parse('false')).toBe(false);
    expect(booleanFromString.parse(true)).toBe(true);
  });

  it('nullableString: "" clears to null, absent stays undefined', () => {
    expect(nullableString.parse('')).toBeNull();
    expect(nullableString.parse(undefined)).toBeUndefined();
    expect(nullableString.parse('hello')).toBe('hello');
  });

  it('nullableDate: "" clears to null, a value coerces to a Date', () => {
    expect(nullableDate.parse('')).toBeNull();
    expect(nullableDate.parse('2027-06-30')).toBeInstanceOf(Date);
    expect(nullableDate.parse(undefined)).toBeUndefined();
  });

  it('createVehicleBodySchema coerces multipart string fields', () => {
    const parsed = createVehicleBodySchema.parse({
      make: 'Toyota',
      model: 'Hiace',
      year: '2021',
      vin: 'JT123',
      licensePlate: 'ABC-123',
      capacity: '12',
      fuelType: 'diesel',
      mileage: '48000',
      insuranceExpiry: '2027-01-01',
      registrationExpiry: '2027-03-01',
      branchId: '00000000-0000-4000-8000-000000000001'
    });
    expect(parsed.year).toBe(2021);
    expect(parsed.capacity).toBe(12);
    expect(parsed.status).toBe('available'); // default
    expect(parsed.insuranceExpiry).toBeInstanceOf(Date);
  });

  it('createToolBodySchema defaults status and coerces borrow dates', () => {
    const parsed = createToolBodySchema.parse({ name: 'Torque Wrench' });
    expect(parsed.status).toBe('available');
    const borrowed = createToolBodySchema.parse({
      name: 'Jack',
      status: 'borrowed',
      borrowedById: '00000000-0000-4000-8000-000000000009',
      borrowedDate: '2026-07-01'
    });
    expect(borrowed.borrowedDate).toBeInstanceOf(Date);
  });

  it('completeTrackingBodySchema requires a numeric completedMileage', () => {
    expect(
      completeTrackingBodySchema.parse({ completedMileage: '52000' })
        .completedMileage
    ).toBe(52000);
    expect(() => completeTrackingBodySchema.parse({})).toThrow();
  });
});
