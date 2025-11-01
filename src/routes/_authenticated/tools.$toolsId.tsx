import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/tools/$toolsId')({
  component: RouteComponent
});

function RouteComponent() {
  return <div>Hello "/assets/tools/$toolsId"!</div>;
}
