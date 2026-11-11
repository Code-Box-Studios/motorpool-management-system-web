import { describe, expect, it } from 'vitest';
import {
  createTripTicketBodySchema,
  updateTripTicketBodySchema
} from './trip-tickets.js';

const employeeId = '44444444-4444-4444-8444-444444444444';
const guideId = '55555555-5555-4555-8555-555555555555';
const base = {
  branchId: '11111111-1111-4111-8111-111111111111',
  driverId: '22222222-2222-4222-8222-222222222222',
  vehicleId: '33333333-3333-4333-8333-333333333333',
  destination: 'Campus',
  purpose: 'Trip',
  dateRequested: '2026-11-11',
  participants: ['Student One'],
  guideIds: [guideId]
};

describe('trip participant contracts', () => {
  it('accepts employee roster participants without guides and preserves their identities', () => {
    const result = createTripTicketBodySchema.parse({
      ...base,
      participantType: 'employees',
      participantEmployeeIds: [employeeId],
      guideIds: []
    });
    expect(result).toMatchObject({
      participantType: 'employees',
      participantEmployeeIds: [employeeId],
      guideIds: []
    });
  });

  it('defaults existing callers to students with no employee participants', () => {
    expect(createTripTicketBodySchema.parse(base)).toMatchObject({
      participantType: 'students',
      participantEmployeeIds: []
    });
  });

  it('requires a guide for students', () => {
    const result = createTripTicketBodySchema.safeParse({
      ...base,
      participantType: 'students',
      guideIds: []
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some((issue) => issue.path[0] === 'guideIds')
      ).toBe(true);
  });

  it('requires at least one employee participant', () => {
    expect(
      createTripTicketBodySchema.safeParse({
        ...base,
        participantType: 'employees',
        participantEmployeeIds: []
      }).success
    ).toBe(false);
  });

  it('rejects roster identities on student participant requests', () => {
    expect(
      createTripTicketBodySchema.safeParse({
        ...base,
        participantType: 'students',
        participantEmployeeIds: [employeeId]
      }).success
    ).toBe(false);
  });

  it('rejects unsupported participant types', () => {
    expect(
      createTripTicketBodySchema.safeParse({
        ...base,
        participantType: 'visitors'
      }).success
    ).toBe(false);
  });

  it('leaves absent PATCH fields absent and defers empty-guide rules to the stored ticket type', () => {
    expect(
      updateTripTicketBodySchema.parse({ destination: 'Another campus' })
    ).toEqual({ destination: 'Another campus' });
    expect(updateTripTicketBodySchema.parse({ guideIds: [] })).toEqual({
      guideIds: []
    });
    expect(
      updateTripTicketBodySchema.parse({
        participantType: 'employees',
        participantEmployeeIds: [employeeId],
        guideIds: []
      })
    ).toEqual({
      participantType: 'employees',
      participantEmployeeIds: [employeeId],
      guideIds: []
    });
  });
});
