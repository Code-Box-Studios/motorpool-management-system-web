// src/components/pages/trip-tickets/add-trip-ticket/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTripTicket } from '@/lib/mutation/trip-tickets';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import type { NewTripTicket } from '@/lib/types';

// One row per outing: a calendar date plus a departure and return time, all
// still separate strings here — they only become a single ISO instant (in the
// browser's own timezone) when the trip is submitted (see addTripTicket below).
const dateRowSchema = z.object({
  date: z.string().min(1, 'Pick a date'),
  start: z.string().min(1, 'Departure time'),
  end: z.string().min(1, 'Return time')
});

// A row's own instants, or null while it is still incomplete (required-field
// errors already cover that case, so overlap/ordering checks skip it).
function rowSpan(row: z.infer<typeof dateRowSchema>) {
  if (!row.date || !row.start || !row.end) return null;
  const start = new Date(`${row.date}T${row.start}`);
  const end = new Date(`${row.date}T${row.end}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

const datesFieldSchema = z
  .array(dateRowSchema)
  .min(1, 'A trip needs at least one date')
  .superRefine((rows, ctx) => {
    const spans = rows.map(rowSpan);

    spans.forEach((span, i) => {
      if (span && !(span.end.getTime() > span.start.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Return must be after departure',
          path: [i, 'end']
        });
      }
    });

    // Mirrors the server's half-open semantics: [aStart, aEnd) intersects
    // [bStart, bEnd) iff aStart < bEnd && aEnd > bStart. Two dates that merely
    // touch — one ends exactly when the next begins — are NOT an overlap.
    for (let i = 0; i < spans.length; i++) {
      const a = spans[i];
      if (!a) continue;
      for (let j = i + 1; j < spans.length; j++) {
        const b = spans[j];
        if (!b) continue;
        if (
          a.start.getTime() < b.end.getTime() &&
          a.end.getTime() > b.start.getTime()
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'This date overlaps another one above',
            path: [j, 'date']
          });
        }
      }
    }
  });

const tripTicketSchema = z.object({
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
  participants: z.string().min(1, 'Participants are required'), // Will be stored as array in DB
  participants_count: z.coerce
    .number()
    .min(1, 'Number of participants must be at least 1'),

  // Trip details
  vehicle_id: z.string().uuid('Please select a vehicle'),
  driver_id: z.string().uuid('Please select a driver'),
  destination: z.string().min(1, 'Destination is required'),

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
});

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
      participants: '',
      participants_count: 1,
      vehicle_id: '',
      driver_id: '',
      destination: '',
      dates: [{ date: '', start: '', end: '' }],
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
    // Convert participants string to array for database, and each date row
    // to the single ISO instant the API expects. `new Date(`${date}T${time}`)`
    // parses as browser-local time; toISOString() then converts to UTC — that
    // is correct (the requester picks a wall-clock time in their own zone,
    // the server stores the instant), it just means a requester in a
    // different timezone from the motorpool gets a different instant than
    // the date input implies.
    const tripTicketData = {
      ...data,
      participants: data.participants
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
      dates: data.dates.map((d) => ({
        startTs: new Date(`${d.date}T${d.start}`).toISOString(),
        endTs: new Date(`${d.date}T${d.end}`).toISOString()
      }))
    };

    await createTripTicket.mutateAsync(tripTicketData as NewTripTicket);
  };

  return { addTripTicket, isLoading: createTripTicket.isPending };
};
