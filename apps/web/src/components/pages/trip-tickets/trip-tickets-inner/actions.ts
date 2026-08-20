// src/components/pages/trip-tickets/trip-tickets-inner/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TRIP_TICKET_STATUS } from '@/lib/enums';

const tripTicketUpdateSchema = z.object({
  vehicle_id: z.string().uuid('Please select a vehicle'),
  driver_id: z.string().uuid('Please select a driver'),
  branch_id: z.string().uuid('Please select a branch'),
  requested_by: z.string().min(1, 'Requested by is required'),
  destination: z.string().min(1, 'Destination is required'),
  purpose: z.string().min(1, 'Purpose is required'),
  date_requested: z.string().min(1, 'Date requested is required'),
  start_ts: z.string().min(1, 'Start date and time is required'),
  end_ts: z.string().min(1, 'End date and time is required'),
  status: z.enum(Object.values(TRIP_TICKET_STATUS) as [string, ...string[]]),
  remarks: z.string().optional(),
  cancellation_reason: z.string().optional(),
  disapproved_reason: z.string().optional(),
  participants: z.string().optional(), // Will be converted to array on submit
  office_id: z.string().optional().or(z.literal('')),
  office_head_id: z.string().optional().or(z.literal('')),
  // Fuel allocation fields (optional - removed allocation_km and allocation_liters)
  allocation_date: z.string().optional().or(z.literal('')),
  allocation_trip_to: z.string().optional().or(z.literal('')),
  allocation_purpose: z.string().optional().or(z.literal('')),
  allocation_vehicle_id: z.string().optional().or(z.literal('')),
  allocation_fuel_type: z.string().optional().or(z.literal('')),
  allocation_approved_by_evp_operations: z.string().optional().or(z.literal(''))
});

export type UpdateTripTicketFormData = z.infer<typeof tripTicketUpdateSchema>;

export const useTripTicketUpdateForm = () => {
  return useForm<UpdateTripTicketFormData>({
    resolver: zodResolver(tripTicketUpdateSchema),
    defaultValues: {
      vehicle_id: '',
      driver_id: '',
      branch_id: '',
      requested_by: '',
      destination: '',
      purpose: '',
      date_requested: '',
      start_ts: '',
      end_ts: '',
      status: 'pending_admin_approval',
      remarks: '',
      cancellation_reason: '',
      disapproved_reason: '',
      participants: '',
      office_id: '',
      office_head_id: '',
      allocation_date: '',
      allocation_trip_to: '',
      allocation_purpose: '',
      allocation_vehicle_id: '',
      allocation_fuel_type: '',
      allocation_approved_by_evp_operations: ''
    }
  });
};
