import { createFileRoute } from '@tanstack/react-router';
import { CarIcon } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/vehicles/')({
  component: RouteComponent,
  staticData: {
    title: 'Vehicles',
    icon: CarIcon,
    group: 'Assets'
  }
});

function RouteComponent() {
  return <div>Hello "/assets/vehicles/"!</div>;
}
