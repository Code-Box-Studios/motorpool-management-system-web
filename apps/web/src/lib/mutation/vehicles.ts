// src/lib/mutation/vehicles.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createVehicle,
  updateVehicle,
  deleteVehicle
} from '@/lib/api/vehicles';
import type { NewVehicle, UpdateVehicle } from '../types'; // Updated imports
import { toast } from 'sonner';

export const useCreateVehicle = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      vehicle,
      files
    }: {
      vehicle: Omit<NewVehicle, 'images'>;
      files?: File[];
    }) => createVehicle(vehicle, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    }
  });
};

export const useUpdateVehicle = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
      files,
      removedImages
    }: {
      id: string;
      updates: Omit<UpdateVehicle, 'images'>;
      files?: File[];
      removedImages?: string[];
    }) => updateVehicle(id, updates, files, removedImages),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    }
  });
};

// Delete a vehicle (admin only, enforced by the API). A vehicle still
// referenced by trips, job orders, maintenance or GPS rows comes back as a 409
// whose message names the way out ("set it out of service instead") — toast the
// server's message verbatim so the admin is told what to do, not just that it
// failed.
export const useDeleteVehicle = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVehicle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Vehicle deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });
};
