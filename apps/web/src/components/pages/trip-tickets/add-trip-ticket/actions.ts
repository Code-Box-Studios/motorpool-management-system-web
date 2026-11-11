// src/components/pages/trip-tickets/add-trip-ticket/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTripTicket } from '@/lib/mutation/trip-tickets';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import type { NewTripTicket } from '@/lib/types';

import { datesFieldSchema, outingPayload } from './outings';
import { participantFields, validateTripPeople } from '../participant-fields';

const tripTicketSchema = z
  .object({
    // Requester info (auto-filled)
    requested_by: z.string().uuid('Requester is required'),

    // Office/Branch info
    branch_id: z.string().uuid('Please select a branch'),
    office_id: z.string().uuid('Please select a department/office'),
    office_head_id: z
      .string()
      .uuid('Please select an office head')
      .optional()
      .or(z.literal('')),

    // Trip purpose and participants
    purpose: z.string().min(1, 'Purpose is required'),
    ...participantFields,
    participants_count: z.coerce
      .number()
      .min(1, 'Number of participants must be at least 1'),

    // Trip details
    vehicle_id: z.string().uuid('Please select a vehicle'),
    driver_id: z.string().uuid('Please select a driver'),
    destination: z.string().min(1, 'Destination is required'),
    destination_latitude: z.number().min(-90).max(90).nullable(),
    destination_longitude: z.number().min(-180).max(180).nullable(),

    // One or more non-consecutive outings (an event on the 17th AND the 21st is
    // one ticket, two dates) — mirrors the server's own checks (dates.ts) so a
    // requester is warned here rather than bounced by a 409 after submitting.
    dates: datesFieldSchema,

    // Optional fields
    remarks: z.string().optional().or(z.literal('')),

    // System fields (auto-set or admin-only)
    date_requested: z.string().min(1, 'Date requested is required'),
    status: z.enum(Object.values(TRIP_TICKET_STATUS) as [string, ...string[]]),

    // Admin/Guard fields (not shown in create form)
    prepared_by: z.string().optional().or(z.literal(''))
  })
  .superRefine(validateTripPeople);

export type TripTicketFormData = z.infer<typeof tripTicketSchema>;

export const useTripTicketForm = () => {
  const today = new Date().toISOString().split('T')[0];

  return useForm<TripTicketFormData>({
    resolver: zodResolver(tripTicketSchema),
    defaultValues: {
      requested_by: '',
      branch_id: '',
      office_head_id: '',
      office_id: '',
      purpose: '',
      participant_type: 'students',
      participant_employee_ids: [],
      guide_ids: [],
      participants: [],
      participants_count: 1,
      vehicle_id: '',
      driver_id: '',
      destination: '',
      destination_latitude: null,
      destination_longitude: null,
      // 08:00-17:00: a working default window, matching what "Add another
      // date" seeds a new row with — so the first row, an appended row, and
      // (via form.tsx's initialDate effect, which only fills in the date)
      // a row seeded from a calendar click all behave the same.
      dates: [{ date: '', returnDate: '', start: '08:00', end: '17:00' }],
      remarks: '',
      date_requested: today,
      status: 'pending_admin_approval',
      prepared_by: ''
    }
  });
};

export const useAddTripTicketAction = () => {
  const createTripTicket = useCreateTripTicket();

  const addTripTicket = async (data: TripTicketFormData) => {
    // Book calendar and time selections in the fleet's Asia/Manila timezone.
    // Each outing preserves its independent departure and return dates.
    const tripTicketData = {
      ...data,
      participantType: data.participant_type,
      participantEmployeeIds:
        data.participant_type === 'employees'
          ? data.participant_employee_ids
          : [],
      participants:
        data.participant_type === 'students' ? data.participants : [],
      // Guides are already ids: no split, no join, no reconciliation against a
      // count. Renamed to the wire's camelCase here because mapCreateBody reads
      // `guideIds`; the snake_case `guide_ids` the spread also carries is not a
      // trip_tickets column and is dropped there.
      guideIds: data.guide_ids,
      dates: data.dates.map(outingPayload)
    };

    await createTripTicket.mutateAsync(tripTicketData as NewTripTicket);
  };

  return { addTripTicket, isLoading: createTripTicket.isPending };
};
