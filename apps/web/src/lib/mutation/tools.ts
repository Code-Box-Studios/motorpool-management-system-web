import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTool, updateTool } from '@/lib/supabase/tools';
import type { NewTool, UpdateTool } from '../types';

export const useCreateTool = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tool,
      file
    }: {
      tool: Omit<NewTool, 'image'>;
      file?: File;
    }) => createTool(tool, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
    }
  });
};

export const useUpdateTool = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
      file,
      removeImage
    }: {
      id: string;
      updates: Omit<UpdateTool, 'image'>;
      file?: File;
      removeImage?: boolean;
    }) => updateTool(id, updates, file, removeImage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
    }
  });
};
