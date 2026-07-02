// src/components/pages/tools/tools-inner/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TOOL_STATUS } from '@/lib/enums';

const toolUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  status: z.enum(Object.values(TOOL_STATUS) as [string, ...string[]]),
  borrowed_by: z.string().optional(),
  borrowed_date: z.string().optional(),
  estimated_return_date: z.string().optional(),
  newImage: z.instanceof(File).optional()
});

export type UpdateToolFormData = z.infer<typeof toolUpdateSchema>;

export const useToolUpdateForm = () => {
  return useForm<UpdateToolFormData>({
    resolver: zodResolver(toolUpdateSchema),
    defaultValues: {
      name: '',
      description: '',
      status: 'available',
      borrowed_by: '',
      borrowed_date: '',
      estimated_return_date: ''
    }
  });
};
