// src/components/pages/trip-tickets/add-trip-ticket/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTripTicket } from '@/lib/mutation/trip-tickets';
import type { NewTripTicket } from '@/lib/types';
import { TRIP_TICKET_STATUS, FUEL_TYPE } from '@/lib/enums';

const tripTicketSchema = z.object({
  // Requester info (auto-filled)
  requested_by: z.string().uuid('Requester is required'),
  
  // Office/Branch info
  branch_id: z.string().uuid('Please select a branch'),
  office_id: z.string().uuid('Please select a department/office'),
  office_head_id: z.string().uuid('Please select an office head').optional().or(z.literal('')),
  
  // Trip purpose and participants
  purpose: z.string().min(1, 'Purpose is required'),
  participants: z.string().min(1, 'Participants are required'), // Will be stored as array in DB
  participants_count: z.coerce.number().min(1, 'Number of participants must be at least 1'),
  
  // Trip details
  vehicle_id: z.string().uuid('Please select a vehicle'),
  driver_id: z.string().uuid('Please select a driver'),
  destination: z.string().min(1, 'Destination is required'),
  start_ts: z.string().min(1, 'Start date and time is required'),
  end_ts: z.string().min(1, 'End date and time is required'),
  
  // Optional fields
  remarks: z.string().optional().or(z.literal('')),
  
  // System fields (auto-set or admin-only)
  date_requested: z.string().min(1, 'Date requested is required'),
  status: z.enum(Object.values(TRIP_TICKET_STATUS) as [string, ...string[]]),
  
  // Admin/Guard fields (not shown in create form)
  approved_by: z.string().uuid().optional().or(z.literal('')),
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
      start_ts: '',
      end_ts: '',
      remarks: '',
      date_requested: today,
      status: 'pending_admin_approval',
      approved_by: '',
      prepared_by: ''
    }
  });
};

export const useAddTripTicketAction = () => {
  const createTripTicket = useCreateTripTicket();

  const addTripTicket = async (data: TripTicketFormData) => {
    // Convert participants string to array for database
    const tripTicketData = {
      ...data,
      participants: data.participants.split(',').map(p => p.trim()).filter(p => p.length > 0)
    };
    
    await createTripTicket.mutateAsync(tripTicketData as any);
  };

  return { addTripTicket, isLoading: createTripTicket.isPending };
};
