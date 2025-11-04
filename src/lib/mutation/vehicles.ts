// src/lib/mutation/vehicles.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createVehicle, updateVehicle } from '@/lib/supabase/vehicles';
import type { NewVehicle, UpdateVehicle } from '../types'; // Updated imports

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
      files
    }: {
      id: string;
      updates: Omit<UpdateVehicle, 'images'>; 
      files?: File[];
    }) => updateVehicle(id, updates, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    }
  });
};