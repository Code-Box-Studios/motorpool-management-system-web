import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/job-order/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/job-order/"!</div>
}
