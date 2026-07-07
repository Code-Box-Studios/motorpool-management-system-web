import { useQuery } from '@tanstack/react-query';
import {
  getDashboardMetrics,
  getPredictiveMaintenanceData,
  getSparePartsAssociations
} from '@/lib/api/analytics';

// Both dashboard-metric hooks below share this key so they dedupe onto a
// single GET /analytics/dashboard request when used together (see
// components/pages/dashboard/index.tsx).
const DASHBOARD_QUERY_KEY = ['analytics', 'dashboard'];

// Fetch predictive-maintenance risk assessments for every vehicle.
export const usePredictiveMaintenanceData = () => {
  return useQuery({
    queryKey: ['analytics', 'predictive-maintenance'],
    queryFn: getPredictiveMaintenanceData,
    staleTime: 5 * 60 * 1000
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

// Fetch vehicle status counts for dashboard metrics.
export const useVehicleStatusCounts = () => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: getDashboardMetrics,
    staleTime: 30 * 1000,
    select: (metrics) => ({
      available: metrics.available,
      underMaintenance: metrics.underMaintenance,
      onTrip: metrics.onTrip,
      outOfService: metrics.outOfService,
      total: metrics.total
    })
  });
};

// Fetch completed trips count.
export const useCompletedTripsCount = () => {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: getDashboardMetrics,
    staleTime: 30 * 1000,
    select: (metrics) => metrics.completedTrips
  });
};
