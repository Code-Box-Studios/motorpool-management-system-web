import { z } from 'zod';

export const participantFields = {
  participant_type: z.enum(['students', 'employees']),
  // How a student trip lists its party: typed names, or a headcount alone.
  // Form-only — the API just sees names (possibly none) and a count.
  participant_entry: z.enum(['names', 'count']),
  participant_employee_ids: z.array(z.string().uuid('Select an employee')),
  participants: z.array(z.string().trim().min(1)),
  participants_count: z.coerce
    .number()
    .int('Enter a whole number')
    .min(1, 'Number of participants must be at least 1'),
  guide_ids: z.array(z.string().uuid('Select an employee'))
};

export function validateTripPeople(
  data: {
    participant_type: 'students' | 'employees';
    participant_entry: 'names' | 'count';
    participant_employee_ids: string[];
    participants: string[];
    guide_ids: string[];
  },
  ctx: z.RefinementCtx
) {
  const employeeTrip = data.participant_type === 'employees';
  if (employeeTrip && data.participant_employee_ids.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['participant_employee_ids'],
      message: 'Select at least one employee participant'
    });
  }
  // A headcount-only student trip has no names to require; its count is
  // checked by participants_count itself.
  if (
    !employeeTrip &&
    data.participant_entry === 'names' &&
    data.participants.length === 0
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['participants'],
      message: 'Participants are required'
    });
  }
  if (!employeeTrip && data.guide_ids.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['guide_ids'],
      message: 'Student trips need at least one guide'
    });
  }
  if (
    employeeTrip &&
    data.participant_employee_ids.some((id) => data.guide_ids.includes(id))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['guide_ids'],
      message: 'An employee cannot be both a participant and a guide'
    });
  }
}
