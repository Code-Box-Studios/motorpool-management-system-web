// src/components/pages/tools/add-tools/action.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTool } from '@/lib/mutation/tools';
import type { NewTool } from '@/lib/types';
import { TOOL_STATUS } from '@/lib/enums';

const toolSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  status: z.enum(Object.values(TOOL_STATUS) as [string, ...string[]]),
  borrowed_by: z.string().optional(),
  borrowed_date: z.string().optional(),
  estimated_return_date: z.string().optional(),
  image: z.instanceof(File).optional()
});

export type ToolFormData = z.infer<typeof toolSchema>;

export const useToolForm = () => {
  return useForm<ToolFormData>({
    resolver: zodResolver(toolSchema),
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

export const useAddToolAction = () => {
  const createTool = useCreateTool();

  const addTool = async (data: ToolFormData) => {
    const { image, ...tool } = data;
    const toolData = {
      ...tool,
      description: tool.description || null,
      borrowed_by: tool.borrowed_by || null,
      borrowed_date: tool.borrowed_date || null,
      estimated_return_date: tool.estimated_return_date || null
    };
    await createTool.mutateAsync({
      tool: toolData as Omit<NewTool, 'image'>,
      file: image
    });
  };

  return { addTool, isLoading: createTool.isPending };
};
