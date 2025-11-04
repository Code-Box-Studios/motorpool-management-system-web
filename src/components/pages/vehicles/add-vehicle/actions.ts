// src/components/pages/vehicles/add-vehicle/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateVehicle } from '@/lib/mutation/vehicles';
import type { NewVehicle } from '@/lib/types'; 
import { FUEL_TYPE, VEHICLE_STATUS } from '@/lib/enums';

const vehicleSchema = z.object({
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.coerce.number().min(1900, 'Year must be at least 1900'),
  license_plate: z.string().min(1, 'License plate is required'),
  vin: z.string().min(1, 'VIN is required'),
 status: z.enum(Object.values(VEHICLE_STATUS) as [string, ...string[]]),
  assigned_driver: z.string().optional(),
  branch: z.string().min(1, 'Location is required'),
  fuel_type: z.enum(Object.values(FUEL_TYPE) as [string, ...string[]]),
  mileage: z.coerce.number().min(0, 'Mileage must be non-negative'),
  insurance_expiry: z.string().min(1, 'Insurance expiry is required'),
  registration_expiry: z.string().min(1, 'Registration expiry is required'),
  images: z.array(z.instanceof(File)).optional()
});

export type VehicleFormData = z.infer<typeof vehicleSchema>;

export const useVehicleForm = () => {
  return useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      make: '',
      model: '',
      year: new Date().getFullYear(),
      license_plate: '',
      vin: '',
      status: 'available',
      assigned_driver: '',
      branch: '',
      fuel_type: '',
      mileage: 0,
      insurance_expiry: '',
      registration_expiry: '',
      images: []
    }
  });
};

export const useAddVehicleAction = () => {
  const createVehicle = useCreateVehicle();

  const addVehicle = async (data: VehicleFormData) => {
    const { images, ...vehicle } = data;
    const vehicleData = {
      ...vehicle,
      assigned_driver: vehicle.assigned_driver ?? null,
    };
    await createVehicle.mutateAsync({ vehicle: vehicleData as Omit<NewVehicle, 'images'>, files: images || [] }); 
  };

  return { addVehicle, isLoading: createVehicle.isPending };
};