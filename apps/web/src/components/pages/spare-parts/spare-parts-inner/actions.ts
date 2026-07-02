// src/components/pages/spare-parts/spare-parts-inner/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const sparePartUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  brand: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().min(0, 'Quantity must be 0 or greater'),
  newImage: z.instanceof(File).optional()
});

export type UpdateSparePartFormData = z.infer<typeof sparePartUpdateSchema>;

export const useSparePartUpdateForm = () => {
  return useForm({
    resolver: zodResolver(sparePartUpdateSchema),
    defaultValues: {
      name: '',
      brand: '',
      description: '',
      quantity: 0
    }
  });
};
