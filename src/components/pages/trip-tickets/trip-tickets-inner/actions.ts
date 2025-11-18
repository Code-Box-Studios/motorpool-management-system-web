// src/components/pages/trip-tickets/trip-tickets-inner/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TRIP_TICKET_STATUS, FUEL_TYPE } from '@/lib/enums';

const tripTicketUpdateSchema = z.object({
  vehicle_id: z.string().uuid('Please select a vehicle'),
  driver_id: z.string().uuid('Please select a driver'),
  branch_id: z.string().uuid('Please select a branch'),
  approved_by: z.string().uuid('Please select an approver'),
  prepared_by: z.string().min(1, 'Prepared by is required'),
  destination: z.string().min(1, 'Destination is required'),
  purpose: z.string().min(1, 'Purpose is required'),
  date_requested: z.string().min(1, 'Date requested is required'),
  pickup_date_time: z.string().min(1, 'Pickup date and time is required'),
  return_date: z.string().min(1, 'Return date is required'),
  status: z.enum(Object.values(TRIP_TICKET_STATUS) as [string, ...string[]]),
  pre_trip_guard: z.string().optional(),
  post_trip_guard: z.string().optional(),
  remarks: z.string().optional(),
  // Fuel allocation fields (required)
  allocation_date: z.string().min(1, 'Allocation date is required'),
  allocation_trip_to: z.string().min(1, 'Trip to is required'),
  allocation_purpose: z.string().min(1, 'Allocation purpose is required'),
  allocation_vehicle_id: z.string().uuid('Please select an allocation vehicle'),
  allocation_km: z.coerce.number().min(0, 'Kilometers must be 0 or greater'),
  allocation_liters: z.coerce.number().min(0, 'Liters must be 0 or greater'),
  allocation_fuel_type: z.enum(Object.values(FUEL_TYPE) as [string, ...string[]], {
    errorMap: () => ({ message: 'Please select a fuel type' })
  }),
  allocation_requested_by: z.string().uuid('Please select who requested'),
  allocation_approved_by_evp_operations: z.string().optional(),
  allocation_status: z.enum(['pending', 'approved', 'completed'] as const).optional()
});

export type UpdateTripTicketFormData = z.infer<typeof tripTicketUpdateSchema>;

export const useTripTicketUpdateForm = () => {
  return useForm<UpdateTripTicketFormData>({
    resolver: zodResolver(tripTicketUpdateSchema),
    defaultValues: {
      vehicle_id: '',
      driver_id: '',
      branch_id: '',
      approved_by: '',
      prepared_by: '',
      destination: '',
      purpose: '',
      date_requested: '',
      pickup_date_time: '',
      return_date: '',
      status: 'pending',
      pre_trip_guard: '',
      post_trip_guard: '',
      remarks: '',
      allocation_date: '',
      allocation_trip_to: '',
      allocation_purpose: '',
      allocation_vehicle_id: '',
      allocation_km: 0,
      allocation_liters: 0,
      allocation_fuel_type: '',
      allocation_requested_by: '',
      allocation_approved_by_evp_operations: '',
      allocation_status: 'pending'
    }
  });
};
