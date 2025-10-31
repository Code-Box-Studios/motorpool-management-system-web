import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/maintenance-schedule/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/maintenance-schedule/"!</div>
}
