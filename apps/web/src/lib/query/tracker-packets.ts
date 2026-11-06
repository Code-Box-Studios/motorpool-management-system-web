import { useQuery } from '@tanstack/react-query';
import type { TrackerPacketQuery } from '@mms/shared';
import { getTrackerPackets } from '@/lib/api/tracker-packets';

export function useTrackerPackets(
  params: TrackerPacketQuery,
  autoRefresh: boolean,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['tracker-packet-logs', params],
    queryFn: () => getTrackerPackets(params),
    enabled,
    // Each filter/device/cursor owns its data. Never retain a different page's rows.
    placeholderData: undefined,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: autoRefresh && !params.cursor ? 5000 : false
  });
}
