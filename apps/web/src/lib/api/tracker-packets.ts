import type { TrackerPacketPage, TrackerPacketQuery } from '@mms/shared';
import { api } from './client';

export function getTrackerPackets(
  params: TrackerPacketQuery
): Promise<TrackerPacketPage> {
  return api.get<TrackerPacketPage>('/gps/packet-logs', { ...params });
}
