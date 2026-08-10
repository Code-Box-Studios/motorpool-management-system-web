import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTool, updateTool, deleteTool } from '@/lib/api/tools';
import type { NewTool, UpdateTool } from '../types';
import { toast } from 'sonner';

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

// Delete a tool (admin only, enforced by the API). A tool still referenced by a
// borrow request is refused with a 409 — toast the server's message verbatim
// rather than a generic failure.
export const useDeleteTool = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTool(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      toast.success('Tool deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });
};
