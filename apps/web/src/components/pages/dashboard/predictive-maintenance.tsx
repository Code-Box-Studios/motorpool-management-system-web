import { useScopedListSearch } from '@/hooks/use-scoped-list-search';
import { useState } from 'react';
import { matchesSearch } from '@mms/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Typography } from '@/components/ui/typography';
import { useNavigate } from '@tanstack/react-router';
import { PredictiveMaintenanceCard } from '@/components/shared/preventive-maintenance-card';
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
import {
  usePredictiveMaintenanceData,
  useSparePartsModel
} from '@/lib/query/analytics';
import MaintenanceModelControls from './maintenance-model-controls';
import {
  DEFAULT_MAINTENANCE_MODELS,
  RISK_MODEL_NAMES
} from '@/lib/maintenance-models';
import ListSearchInput from '@/components/shared/list-search-input';
import ListToolbar from '@/components/shared/list-toolbar';
import SparePartsModels from './spare-parts-models';
import { Skeleton } from '@/components/ui/skeleton';

interface PredictiveMaintenanceProps {
  showViewAll?: boolean;
}

// Four across squeezed the cards until "Isuzu Traviz", "MMS-0004" and
// "49,000 km" all broke mid-word.
const CARD_GRID = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';

const PredictiveMaintenance = ({
  showViewAll = true
}: PredictiveMaintenanceProps) => {
  const navigate = useNavigate();
  const { filters, setFilter, clearFilters, hasFilters } = useListControls([
    'predictiveRisk'
  ]);
  const [selectedModels, setSelectedModels] = useState(
    DEFAULT_MAINTENANCE_MODELS
  );
  const [appliedModels, setAppliedModels] = useState(
    DEFAULT_MAINTENANCE_MODELS
  );
  const predictionsQuery = usePredictiveMaintenanceData(
    appliedModels.risk,
    !showViewAll
  );
  const partsQuery = useSparePartsModel(appliedModels.parts, !showViewAll);
  const predictions = predictionsQuery.data;
  const predictionsLoading = showViewAll
    ? predictionsQuery.isLoading
    : predictionsQuery.isFetching;
  const busy = predictionsQuery.isFetching || partsQuery.isFetching;
  const { search, setSearch } = useScopedListSearch('predictiveSearch');
  const clearSearch = () => setSearch('');

  function runModels() {
    if (selectedModels.risk === appliedModels.risk)
      void predictionsQuery.refetch();
    if (selectedModels.parts === appliedModels.parts) void partsQuery.refetch();
    setAppliedModels(selectedModels);
  }

  const handleViewAll = () => {
    navigate({
      to: '/maintenance',
      search: { tab: 'predictive' }
    });
  };

  // `usedFallback` is per-request, so all rows agree; show one honest indicator
  // when the scores are the rule-based estimate rather than the ML model.
  const usedFallback = (predictions ?? []).some((v) => v.usedFallback);

  const predictedVehicles = (predictions ?? []).map((v) => ({
    id: v.vehicleId,
    plateNumber: v.licensePlate,
    vehicleName: v.vehicleName,
    riskScore: v.riskScore,
    kmSinceLastMaint: v.kmSinceLastMaint,
    avgDailyKm: v.avgDailyKm,
    // Kept null rather than coerced to 'N/A' — a placeholder string reaches
    // `new Date()` as "Invalid Date", and it is only a sort key here anyway.
    lastMaintenance: v.lastMaintenanceDate,
    priority: v.priority,
    reason: v.reason,
    predictedDate: v.predictedFailureDate
  }));

  const highPriorityByOldest = [...predictedVehicles]
    .filter((v) => v.priority === 'high')
    .sort(
      (a, b) =>
        lastServiceTime(a.lastMaintenance) - lastServiceTime(b.lastMaintenance)
    );

  const displayedVehicles = showViewAll
    ? highPriorityByOldest.slice(0, 2)
    : predictedVehicles.filter(
        (vehicle) =>
          (!filters.predictiveRisk ||
            vehicle.priority === filters.predictiveRisk) &&
          matchesSearch(search, [
            vehicle.vehicleName,
            vehicle.plateNumber,
            vehicle.reason,
            PRIORITY[vehicle.priority].riskLabel
          ])
      );

  return (
    <div className="space-y-6">
      {!showViewAll && (
        <MaintenanceModelControls
          selected={selectedModels}
          applied={appliedModels}
          onChange={setSelectedModels}
          onRun={runModels}
          busy={busy}
        />
      )}
      <Card
        className="h-full"
        role="region"
        aria-label="Predictive vehicles"
        aria-busy={predictionsLoading}
      >
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <CardTitle className="min-w-[min(100%,16rem)] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span>Predictive Maintenance</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="text-primary h-4 w-4 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <div className="space-y-1">
                        <p className="mb-2 text-sm font-semibold">
                          Predictive Maintenance
                        </p>
                        <p className="text-xs">
                          {usedFallback
                            ? 'Usage-based estimate from mileage, daily usage, and service frequency.'
                            : 'Uses historical data and usage patterns to predict when vehicle components are likely to fail, allowing proactive maintenance scheduling.'}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {(!showViewAll || usedFallback) && (
                  <Badge variant="outline" className="font-normal">
                    {usedFallback
                      ? appliedModels.risk === 'usage_rules'
                        ? 'Usage-based estimate'
                        : 'Rule-based estimate'
                      : RISK_MODEL_NAMES[appliedModels.risk]}
                  </Badge>
                )}
              </div>
              <Typography
                variant={'p-sm'}
                className="text-muted-foreground font-normal"
              >
                Vehicles predicted to need maintenance based on data analysis
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
                  label="Search predictive vehicles"
                />
              }
              filterControl={
                <TableFilters
                  filters={[
                    {
                      key: 'predictiveRisk',
                      label: 'Risk',
                      options: (
                        ['high', 'medium', 'low'] as MaintenancePriority[]
                      ).map((priority) => ({
                        value: priority,
                        label: PRIORITY[priority].riskLabel
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
          {predictionsLoading ? (
            <div className={showViewAll ? 'grid grid-cols-1 gap-4' : CARD_GRID}>
              {Array.from({ length: showViewAll ? 2 : 3 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-xl" />
              ))}
            </div>
          ) : predictionsQuery.isError ? (
            <div role="alert" className="space-y-3 text-sm">
              <p>
                Could not load vehicle risk results. Try running the model
                again.
              </p>
              <Button
                variant="outline"
                onClick={() => void predictionsQuery.refetch()}
              >
                Retry vehicle results
              </Button>
            </div>
          ) : displayedVehicles.length === 0 ? (
            <EmptyState
              message="No vehicles currently at risk. All vehicles are well-maintained."
              search={!showViewAll ? search : undefined}
              onClearSearch={clearSearch}
              hasFilters={!showViewAll && hasFilters}
              onClearFilters={clearFilters}
            />
          ) : (
            <div className={showViewAll ? 'grid grid-cols-1 gap-4' : CARD_GRID}>
              {displayedVehicles.map((vehicle) => (
                <PredictiveMaintenanceCard
                  key={vehicle.id}
                  id={vehicle.id}
                  plateNumber={vehicle.plateNumber}
                  vehicleName={vehicle.vehicleName}
                  riskScore={vehicle.riskScore}
                  priority={vehicle.priority}
                  reason={vehicle.reason}
                  predictedDate={vehicle.predictedDate}
                  kmSinceLastMaint={vehicle.kmSinceLastMaint}
                  avgDailyKm={vehicle.avgDailyKm}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!showViewAll && (
        <SparePartsModels
          algorithm={appliedModels.parts}
          result={partsQuery.data}
          isFetching={partsQuery.isFetching}
          isError={partsQuery.isError}
        />
      )}
    </div>
  );
};

export default PredictiveMaintenance;
