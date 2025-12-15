import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/guard-confirmation/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/guard-confirmation"!</div>
}
