import { useQuery } from '@tanstack/react-query';
import type {
  SparePartsModelAlgorithm,
  PredictiveMaintenanceAlgorithm
} from '@mms/shared';
import {
  getDashboardMetrics,
  getPredictiveMaintenanceResult,
  getSparePartsAssociations,
  getSparePartsModel
} from '@/lib/api/analytics';

// Both dashboard-metric hooks below share this key so they dedupe onto a
// single GET /analytics/dashboard request when used together (see
// components/pages/dashboard/index.tsx).
const DASHBOARD_QUERY_KEY = ['analytics', 'dashboard'];

// Both hooks cache the complete result; select only changes an observer's view.
const predictiveMaintenanceOptions = (
  algorithm: PredictiveMaintenanceAlgorithm,
  refreshOnChange: boolean
) => ({
  queryKey: ['analytics', 'predictive-maintenance', algorithm],
  queryFn: () => getPredictiveMaintenanceResult(algorithm),
  staleTime: refreshOnChange ? 0 : 5 * 60 * 1000,
  refetchOnWindowFocus: !refreshOnChange,
  retry: refreshOnChange ? false : 3
});

export const usePredictiveMaintenanceResult = (
  algorithm: PredictiveMaintenanceAlgorithm = 'random_forest',
  refreshOnChange = false
) => useQuery(predictiveMaintenanceOptions(algorithm, refreshOnChange));

// Preserve the array view consumed outside the full model-results panel.
export const usePredictiveMaintenanceData = (
  algorithm: PredictiveMaintenanceAlgorithm = 'random_forest',
  refreshOnChange = false
) => {
  return useQuery({
    ...predictiveMaintenanceOptions(algorithm, refreshOnChange),
    select: (result) => result.data
  });
};

// Fetch association rules for co-replaced spare parts.
export const useSparePartsAssociations = () => {
  return useQuery({
    queryKey: ['analytics', 'spare-parts-associations'],
    queryFn: getSparePartsAssociations,
    staleTime: 5 * 60 * 1000
  });
};

export const useSparePartsModel = (
  algorithm: SparePartsModelAlgorithm,
  enabled = true
) => {
  return useQuery({
    queryKey: ['analytics', 'spare-parts-model', algorithm],
    queryFn: () => getSparePartsModel(algorithm),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    enabled
  });
};

// Fetch vehicle status counts for dashboard metrics. `enabled` is for the one
// caller that reads these before it knows whose dashboard it is rendering: the
// whole /analytics router is admin/EVP only, so every other role would fire a
// 403 for a metric strip it never gets shown.
export const useVehicleStatusCounts = (enabled: boolean = true) => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: getDashboardMetrics,
    staleTime: 30 * 1000,
    enabled,
    select: (metrics) => ({
      available: metrics.available,
      underMaintenance: metrics.underMaintenance,
      onTrip: metrics.onTrip,
      outOfService: metrics.outOfService,
      total: metrics.total
    })
  });
};

// Fetch completed trips count. See useVehicleStatusCounts for `enabled` — these
// two share a query key, so they must be gated together or the disabled one is
// served the other's fetch anyway.
export const useCompletedTripsCount = (enabled: boolean = true) => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: getDashboardMetrics,
    staleTime: 30 * 1000,
    enabled,
    select: (metrics) => metrics.completedTrips
  });
};
