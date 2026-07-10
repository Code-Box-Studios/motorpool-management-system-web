import { useQuery } from '@tanstack/react-query';
import {
  getTrackerDevices,
  getTrackerDeviceById,
  type TrackerDeviceListParams
} from '@/lib/api/tracker-devices';

export const useTrackerDevices = (params: TrackerDeviceListParams = {}) => {
  return useQuery({
    queryKey: ['tracker-devices', params],
    queryFn: () => getTrackerDevices(params)
  });
};

export const useTrackerDevice = (id: string) => {
  return useQuery({
    // Shares the plural ['tracker-devices'] root so mutation invalidations
    // (which invalidate ['tracker-devices']) prefix-match and refresh this
    // detail query — TanStack Query invalidation is prefix-based on the key array.
    queryKey: ['tracker-devices', id],
    queryFn: () => getTrackerDeviceById(id),
    enabled: !!id
  });
};

// The tracker(s) registered to a vehicle (expect 0 or 1 active). Used by the
// Vehicle detail surfacing. `enabled` lets the caller gate the admin-only fetch.
export const useVehicleTrackerDevice = (vehicleId: string, enabled = true) => {
  return useQuery({
    queryKey: ['tracker-devices', { vehicleId }],
    queryFn: () => getTrackerDevices({ vehicleId }),
    enabled: enabled && !!vehicleId
  });
};
