import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/drivers/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/drivers/"!</div>
}
