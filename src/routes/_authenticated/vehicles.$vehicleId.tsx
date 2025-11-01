import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/vehicles/$vehicleId')({
  component: RouteComponent
});

function RouteComponent() {
  return <div>Hello "/assets/vehicles/$id/"!</div>;
}
