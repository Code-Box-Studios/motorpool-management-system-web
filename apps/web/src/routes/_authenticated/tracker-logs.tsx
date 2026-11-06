import { createFileRoute } from '@tanstack/react-router';
import TrackerLogs from '@/components/pages/tracker-logs';
import { AdminOnly } from '@/components/shared/admin-only';

export const Route = createFileRoute('/_authenticated/tracker-logs')({
  validateSearch: (search: Record<string, unknown>): { deviceId?: string } => ({
    deviceId:
      typeof search.deviceId === 'string' && search.deviceId.trim()
        ? search.deviceId
        : undefined
  }),
  component: TrackerLogsRoute
});

function TrackerLogsRoute() {
  const { deviceId } = Route.useSearch();
  return (
    <AdminOnly>
      <TrackerLogs key={deviceId ?? ''} deviceId={deviceId} />
    </AdminOnly>
  );
}
