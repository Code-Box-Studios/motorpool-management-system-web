import AddTool from '@/components/pages/tools/add-tools';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/tools/add-tools')({
  component: AddTool
});
