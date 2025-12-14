// src/components/pages/vehicles/vehicle-inner/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FUEL_TYPE, VEHICLE_STATUS } from '@/lib/enums';

const updateVehicleSchema = z.object({
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.coerce.number().min(1900, 'Year must be at least 1900'),
  license_plate: z.string().min(1, 'License plate is required'),
  vin: z.string().min(1, 'VIN is required'),
  status: z.enum(Object.values(VEHICLE_STATUS) as [string, ...string[]]),
  branch: z.string().min(1, 'Branch is required'),
  fuel_type: z.enum(Object.values(FUEL_TYPE) as [string, ...string[]]),
  mileage: z.coerce.number().min(0, 'Mileage must be non-negative'),
  insurance_expiry: z.string().min(1, 'Insurance expiry is required'),
  registration_expiry: z.string().min(1, 'Registration expiry is required'),
  capacity: z.coerce.number().min(1, 'Capacity must be at least 1'),
  newImages: z.array(z.instanceof(File)).optional()
});

export type UpdateVehicleFormData = z.infer<typeof updateVehicleSchema>;

export const useVehicleUpdateForm = () => {
  return useForm<UpdateVehicleFormData>({
    resolver: zodResolver(updateVehicleSchema),
    defaultValues: {
      make: '',
      model: '',
      year: new Date().getFullYear(),
      license_plate: '',
      vin: '',
      status: 'available',
      branch: '',
      fuel_type: '',
      mileage: 0,
      insurance_expiry: '',
      registration_expiry: '',
      capacity: 1,
      newImages: []
    }
  });
};