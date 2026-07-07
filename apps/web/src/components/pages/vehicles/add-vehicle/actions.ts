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
  branchId: z.string().uuid('Branch is required'),
  fuel_type: z.enum(Object.values(FUEL_TYPE) as [string, ...string[]]),
  mileage: z.coerce.number().min(0, 'Mileage must be non-negative'),
  insurance_expiry: z.string().min(1, 'Insurance expiry is required'),
  registration_expiry: z.string().min(1, 'Registration expiry is required'),
  capacity: z.coerce.number().min(1, 'Capacity must be at least 1'),
  images: z.array(z.instanceof(File)).optional(),
  newImages: z.array(z.instanceof(File)).optional()
});export type VehicleFormData = z.infer<typeof vehicleSchema>;

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
      branchId: '',
      fuel_type: '',
      mileage: 0,
      insurance_expiry: '',
      registration_expiry: '',
      capacity: 1,
      images: [],
      newImages: []
    }
  });
};

export const useAddVehicleAction = () => {
  const createVehicle = useCreateVehicle();

  const addVehicle = async (data: VehicleFormData) => {
    // The form field is `branchId` (a branch UUID from the <Select>), but the
    // FE's Vehicle row type (and what the adapter sends on) names the column
    // `branch` -- map it explicitly so the value actually reaches the API.
    const { images, branchId, ...rest } = data;
    const vehicle: Omit<NewVehicle, 'images'> = { ...rest, branch: branchId };
    await createVehicle.mutateAsync({ vehicle, files: images || [] });
  };

  return { addVehicle, isLoading: createVehicle.isPending };
};