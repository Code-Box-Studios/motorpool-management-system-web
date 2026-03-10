import { useQuery } from '@tanstack/react-query';
import {
  getVehiclesWithMaintenanceHistory,
  getJobOrdersWithSpareParts,
  getVehicleStatusCounts,
  getCompletedTripsCount
} from '../supabase/analytics';
import { computeFleetRiskAssessments } from '../utils/predictive-maintenance';
import {
  computeAssociationRules,
  buildTransactions
} from '../utils/spare-parts-association';

/**
 * Fetch vehicles + maintenance history, then compute predictive risk scores.
 */
export const usePredictiveMaintenanceData = () => {
  return useQuery({
    queryKey: ['analytics', 'predictive-maintenance'],
    queryFn: async () => {
      const { vehicles, maintenances } =
        await getVehiclesWithMaintenanceHistory();
      return computeFleetRiskAssessments(vehicles, maintenances);
    },
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
};

/**
 * Fetch job orders + spare parts, then compute association rules.
 */
export const useSparePartsAssociations = () => {
  return useQuery({
    queryKey: ['analytics', 'spare-parts-associations'],
    queryFn: async () => {
      const { jobOrders, spareParts } = await getJobOrdersWithSpareParts();

      const partLookup = new Map(spareParts.map((p) => [p.id, p.name]));
      const transactions = buildTransactions(jobOrders);

      return computeAssociationRules(
        transactions,
        partLookup,
        0.1, // min support
        0.3  // min confidence
      );
    },
    staleTime: 5 * 60 * 1000
  });
};

/**
 * Fetch real-time vehicle status counts for dashboard metrics.
 */
export const useVehicleStatusCounts = () => {
  return useQuery({
    queryKey: ['analytics', 'vehicle-status-counts'],
    queryFn: getVehicleStatusCounts,
    staleTime: 30 * 1000 // 30 seconds
  });
};

/**
 * Fetch completed trips count.
 */
export const useCompletedTripsCount = () => {
  return useQuery({
    queryKey: ['analytics', 'completed-trips-count'],
    queryFn: getCompletedTripsCount,
    staleTime: 30 * 1000
  });
};
