import ToolsInner from '@/components/pages/tools/tools-inner';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/tools/$toolsId')({
  component: RouteComponent
});

function RouteComponent() {
  const { toolsId } = useParams({ from: '/_authenticated/tools/$toolsId' });
  return <ToolsInner toolId={toolsId} />;
}
