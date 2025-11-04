import Vehicles from '@/components/pages/vehicles';
import { createFileRoute } from '@tanstack/react-router';
import { CarIcon } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/vehicles/')({
  component: Vehicles,
  staticData: {
    title: 'Vehicles',
    icon: CarIcon,
    group: 'Assets'
  }
});
