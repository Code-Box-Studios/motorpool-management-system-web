import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createSparePart,
  updateSparePart,
  deleteSparePart
} from '@/lib/api/spare-parts';
import type { NewSparePart, UpdateSparePart } from '@/lib/types';
import { toast } from 'sonner';

export const useCreateSparePart = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sparePart, file }: { sparePart: NewSparePart; file?: File }) =>
      createSparePart(sparePart, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spare_parts'] });
      toast.success('Spare part created successfully');
    },
    onError: (error) => {
      console.error('Error creating spare part:', error);
      toast.error('Failed to create spare part');
    }
  });
};

export const useUpdateSparePart = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
      file,
      removeImage
    }: {
      id: string;
      updates: UpdateSparePart;
      file?: File;
      removeImage?: boolean;
    }) => updateSparePart(id, updates, file, removeImage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spare_parts'] });
      queryClient.invalidateQueries({ queryKey: ['spare_part'] });
      toast.success('Spare part updated successfully');
    },
    onError: (error) => {
      console.error('Error updating spare part:', error);
      toast.error('Failed to update spare part');
    }
  });
};

export const useDeleteSparePart = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSparePart(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spare_parts'] });
      toast.success('Spare part deleted successfully');
    },
    onError: (error) => {
      console.error('Error deleting spare part:', error);
      toast.error('Failed to delete spare part');
    }
  });
};
