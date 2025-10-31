import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/reservations/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/reservations/"!</div>
}
