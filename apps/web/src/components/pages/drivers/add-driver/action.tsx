import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { DRIVER_STATUS_DB } from '@/lib/enums';

export const driverSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  date_of_birth: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  license_number: z.string().min(1, 'License number is required'),
  license_type: z.string().optional(),
  license_expiry: z.string().optional(),
  sss_number: z.string().optional(),
  tin: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  hire_date: z.string().optional(),
  status: z.enum([...DRIVER_STATUS_DB] as [string, ...string[]]),
  notes: z.string().optional()
});

export type DriverFormData = z.infer<typeof driverSchema>;

export const useDriverForm = () => {
  return useForm<DriverFormData>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      full_name: '',
      license_number: '',
      status: 'active'
    }
  });
};
