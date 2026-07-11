import { cn } from '@/lib/utils';
import { isDeviceOnline } from '@/lib/utils/tracker-devices';

// Small green/gray dot + label showing device liveness derived from lastSeenAt
// recency (NOT the status enum). See isDeviceOnline for the threshold.
export function DeviceOnlineIndicator({
  lastSeenAt
}: {
  lastSeenAt: string | null;
}) {
  const online = isDeviceOnline(lastSeenAt);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          'size-2 rounded-full',
          online ? 'bg-emerald-500' : 'bg-slate-400'
        )}
      />
      <span className="text-sm">{online ? 'Online' : 'Offline'}</span>
    </span>
  );
}
