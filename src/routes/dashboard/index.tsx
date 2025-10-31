import AuthenticatedLayout from "@/components/layout/authenticated-layout";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AuthenticatedLayout>Hello "/dashboard/"!</AuthenticatedLayout>;
}
