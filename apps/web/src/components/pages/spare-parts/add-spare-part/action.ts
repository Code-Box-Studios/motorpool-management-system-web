// src/components/pages/spare-parts/add-spare-part/action.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateSparePart } from '@/lib/mutation/spare-parts';
import type { NewSparePart } from '@/lib/types';

const sparePartSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  brand: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().min(0, 'Quantity must be 0 or greater'),
  image: z.instanceof(File).optional()
});

export type SparePartFormData = z.infer<typeof sparePartSchema>;

export const useSparePartForm = () => {
  return useForm({
    resolver: zodResolver(sparePartSchema),
    defaultValues: {
      name: '',
      brand: '',
      description: '',
      quantity: 0
    }
  });
};

export const useAddSparePartAction = () => {
  const createSparePart = useCreateSparePart();

  const addSparePart = async (data: SparePartFormData) => {
    const { image, ...sparePart } = data;
    const sparePartData = {
      ...sparePart,
      brand: sparePart.brand || null,
      description: sparePart.description || null,
      quantity: sparePart.quantity || 0
    };
    await createSparePart.mutateAsync({
      sparePart: sparePartData as Omit<NewSparePart, 'image'>,
      file: image
    });
  };

  return { addSparePart, isLoading: createSparePart.isPending };
};
