import { describe, expect, it } from 'vitest';
import { updateDriverBodySchema } from './drivers.js';

describe('optional driver dates', () => {
  it('accepts explicit JSON null on updates to clear all date fields', () => {
    const result = updateDriverBodySchema.parse({
      dateOfBirth: null,
      hireDate: null,
      licenseExpiry: null
    });
    expect(result).toEqual({
      dateOfBirth: null,
      hireDate: null,
      licenseExpiry: null
    });
  });
  it('accepts the multipart null convention without coercing it to a date', () => {
    expect(
      updateDriverBodySchema.parse({
        dateOfBirth: 'null',
        hireDate: 'null',
        licenseExpiry: 'null'
      })
    ).toEqual({ dateOfBirth: null, hireDate: null, licenseExpiry: null });
  });
  it('preserves omitted dates and rejects blank or invalid values', () => {
    expect(updateDriverBodySchema.parse({ fullName: 'Updated Name' })).toEqual({
      fullName: 'Updated Name'
    });
    expect(updateDriverBodySchema.safeParse({ dateOfBirth: '' }).success).toBe(
      false
    );
  });
});
