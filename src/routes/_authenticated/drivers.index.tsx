import Drivers from '@/components/pages/drivers';
import { createFileRoute } from '@tanstack/react-router';
import { Users2 } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/drivers/')({
  component: Drivers,
  staticData: {
    title: 'Drivers',
    icon: Users2,
    group: 'Management'
  }
});
