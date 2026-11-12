import { useScopedListSearch } from '@/hooks/use-scoped-list-search';
import { matchesSearch } from '@mms/shared';
import ListSearchInput from '@/components/shared/list-search-input';
import ListToolbar from '@/components/shared/list-toolbar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typography';
import { useNavigate } from '@tanstack/react-router';
import { PreventiveMaintenanceCard } from '@/components/shared/preventive-maintenance-card';
import {
  lastServiceTime,
  PRIORITY,
  type MaintenancePriority
} from '@/lib/maintenance-format';
import TableFilters from '@/components/shared/table-filters';
import EmptyState from '@/components/shared/empty-state';
import { useListControls } from '@/hooks/use-list-controls';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { usePredictiveMaintenanceData } from '@/lib/query/analytics';
import { preventiveSummary } from '@/lib/utils/predictive-maintenance';
import { Skeleton } from '@/components/ui/skeleton';

interface PreventiveMaintenanceProps {
  showViewAll?: boolean;
}

// Full width on the dashboard's half-width column; up to three across on the
// Maintenance tab. Four across squeezed the cards until plates and distances
// hyphenated mid-word.
const CARD_GRID = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';

const PreventiveMaintenance = ({
  showViewAll = true
}: PreventiveMaintenanceProps) => {
  const navigate = useNavigate();
  const { filters, setFilter, clearFilters, hasFilters } = useListControls([
    'preventivePriority'
  ]);
  const {
    data: predictions,
    isLoading,
    error,
    refetch
  } = usePredictiveMaintenanceData();
  const { search, setSearch } = useScopedListSearch('preventiveSearch');
  const clearSearch = () => setSearch('');

  const handleViewAll = () => {
    navigate({
      to: '/maintenance',
      search: { tab: 'preventive' }
    });
  };

  const vehiclesDueForMaintenance = (predictions ?? []).map((v) => {
    const summary = preventiveSummary(v);
    return {
      id: v.vehicleId,
      plateNumber: v.licensePlate,
      vehicleName: v.vehicleName,
      mileage: v.mileage,
      maintenanceDue: summary.due,
      lastMaintenance: v.lastMaintenanceDate,
      priority: summary.priority,
      reason: summary.reason,
      status: summary.status,
      nextDueDate: v.nextMaintenanceDueDate,
      progress: summary.progress
    };
  });
  const unknownCount = vehiclesDueForMaintenance.filter(
    (v) => v.status === 'unknown'
  ).length;
  const highPriorityByOldest = [...vehiclesDueForMaintenance]
    .filter((v) => v.status === 'overdue' || v.status === 'due_soon')
    .sort(
      (a, b) =>
        Number(a.priority !== 'high') - Number(b.priority !== 'high') ||
        lastServiceTime(a.lastMaintenance) - lastServiceTime(b.lastMaintenance)
    );

  const displayedVehicles = showViewAll
    ? highPriorityByOldest.slice(0, 2)
    : vehiclesDueForMaintenance.filter(
        (vehicle) =>
          (!filters.preventivePriority ||
            vehicle.priority === filters.preventivePriority) &&
          matchesSearch(search, [
            vehicle.vehicleName,
            vehicle.plateNumber,
            vehicle.reason,
            PRIORITY[vehicle.priority].priorityLabel
          ])
      );

  return (
    <Card className="h-full" role="region" aria-label="Preventive vehicles">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <CardTitle className="min-w-[min(100%,16rem)] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span>Preventive Maintenance</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="text-signal h-4 w-4 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <div className="space-y-1">
                      <p className="mb-2 text-sm font-semibold">
                        Preventive Maintenance Schedule
                      </p>
                      <p className="text-xs">• Every 6 months - Oil change</p>
                      <p className="text-xs">
                        • Every 3 years - Coolant replacement
                      </p>
                      <p className="text-xs">
                        • Every 6 years (maximum) - Tire replacement
                      </p>
                      <p className="text-xs">
                        • As needed based on usage - Brake inspection
                      </p>
                      <p className="text-xs">
                        • Every 100,000 miles - Belt replacement
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Typography
              variant={'p-sm'}
              className="text-muted-foreground font-normal"
            >
              Vehicles due for maintenance based on mileage and service
              intervals
            </Typography>
          </CardTitle>
          {showViewAll && (
            <CardDescription className="flex items-center space-x-3">
              <Button onClick={handleViewAll}>View All</Button>
            </CardDescription>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!showViewAll && (
          <ListToolbar
            searchControl={
              <ListSearchInput
                value={search}
                onChange={setSearch}
                label="Search preventive vehicles"
              />
            }
            filterControl={
              <TableFilters
                filters={[
                  {
                    key: 'preventivePriority',
                    label: 'Priority',
                    options: (
                      ['high', 'medium', 'low'] as MaintenancePriority[]
                    ).map((priority) => ({
                      value: priority,
                      label: PRIORITY[priority].priorityLabel
                    }))
                  }
                ]}
                values={filters}
                onChange={setFilter}
                onClear={clearFilters}
              />
            }
          />
        )}
        {!isLoading && !error && unknownCount > 0 && (
          <p className="text-slate mb-4 text-sm" role="status">
            {unknownCount} vehicle(s) need service history or a maintenance
            deadline before due status can be confirmed.
          </p>
        )}
        {error ? (
          <div
            role="alert"
            className="border-border space-y-3 rounded-2xl border p-5"
          >
            <p>Unable to load preventive maintenance. {error.message}</p>
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <div className={showViewAll ? 'grid grid-cols-1 gap-4' : CARD_GRID}>
            {Array.from({ length: showViewAll ? 2 : 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : displayedVehicles.length === 0 ? (
          <EmptyState
            message={
              unknownCount > 0
                ? 'Service deadlines cannot be confirmed for every vehicle.'
                : 'No vehicles currently due for preventive maintenance.'
            }
            search={!showViewAll ? search : undefined}
            onClearSearch={clearSearch}
            hasFilters={!showViewAll && hasFilters}
            onClearFilters={clearFilters}
          />
        ) : (
          <div className={showViewAll ? 'grid grid-cols-1 gap-4' : CARD_GRID}>
            {displayedVehicles.map((vehicle) => (
              <PreventiveMaintenanceCard
                key={vehicle.id}
                id={vehicle.id}
                plateNumber={vehicle.plateNumber}
                vehicleName={vehicle.vehicleName}
                mileage={vehicle.mileage}
                maintenanceDue={vehicle.maintenanceDue}
                lastMaintenance={vehicle.lastMaintenance}
                reason={vehicle.reason}
                status={vehicle.status}
                nextDueDate={vehicle.nextDueDate}
                progress={vehicle.progress}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PreventiveMaintenance;
