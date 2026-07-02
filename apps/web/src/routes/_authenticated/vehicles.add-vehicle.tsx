import AddVehicle from '@/components/pages/vehicles/add-vehicle/page';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/vehicles/add-vehicle')({
  component: AddVehicle
});
