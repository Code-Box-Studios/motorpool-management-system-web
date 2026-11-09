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
  usePredictiveMaintenanceResult,
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
  const predictionsQuery = usePredictiveMaintenanceResult(
    appliedModels.risk,
    !showViewAll
  );
  const partsQuery = useSparePartsModel(appliedModels.parts, !showViewAll);
  const predictions = predictionsQuery.data?.data;
  const unscoredVehicles = predictionsQuery.data?.unscoredVehicles ?? [];
  const riskThreshold = predictionsQuery.data?.riskThreshold;
  const isLogisticRegression = appliedModels.risk === 'logistic_regression';
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
    priorityLabel: isLogisticRegression
      ? `${v.priority[0].toUpperCase()}${v.priority.slice(1)} score`
      : PRIORITY[v.priority].riskLabel,
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
            vehicle.priorityLabel
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
                      <Info className="text-signal h-4 w-4 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <div className="space-y-1">
                        <p className="mb-2 text-sm font-semibold">
                          Predictive Maintenance
                        </p>
                        <p className="text-xs">
                          {isLogisticRegression
                            ? 'Shows the supplied model score. What it predicts and over what period still needs confirmation.'
                            : "Uses the selected model's learned probabilities to assess maintenance risk."}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Badge variant="outline" className="font-normal">
                  {RISK_MODEL_NAMES[appliedModels.risk]}
                </Badge>
              </div>
              <Typography
                variant={'p-sm'}
                className="text-muted-foreground font-normal"
              >
                {isLogisticRegression
                  ? 'Model scores from available vehicle history'
                  : 'Vehicles predicted to need maintenance based on data analysis'}
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
          {isLogisticRegression &&
            !predictionsLoading &&
            !predictionsQuery.isError &&
            riskThreshold !== undefined && (
              <p className="text-muted-foreground mb-4 text-sm">
                Model threshold: {riskThreshold}%
              </p>
            )}
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
                      label: isLogisticRegression ? 'Score' : 'Risk',
                      options: (
                        ['high', 'medium', 'low'] as MaintenancePriority[]
                      ).map((priority) => ({
                        value: priority,
                        label: isLogisticRegression
                          ? `${priority[0].toUpperCase()}${priority.slice(1)} score`
                          : PRIORITY[priority].riskLabel
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
              <p className="text-muted-foreground">
                {predictionsQuery.error?.message}
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
              message={
                unscoredVehicles.length > 0 && predictedVehicles.length === 0
                  ? 'No vehicles could be scored with the available history.'
                  : isLogisticRegression
                    ? 'No vehicle model scores to display.'
                    : 'No vehicles currently at risk. All vehicles are well-maintained.'
              }
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
                  scoreMode={isLogisticRegression ? 'model' : 'risk'}
                  kmSinceLastMaint={vehicle.kmSinceLastMaint}
                  avgDailyKm={vehicle.avgDailyKm}
                />
              ))}
            </div>
          )}
          {!predictionsLoading &&
            !predictionsQuery.isError &&
            unscoredVehicles.length > 0 && (
              <section
                aria-label="Unscored vehicles"
                className="border-border mt-4 space-y-3 rounded-xl border p-4"
              >
                <h3 className="text-sm font-medium">
                  Unable to score ({unscoredVehicles.length})
                </h3>
                <ul className="space-y-3 text-sm">
                  {unscoredVehicles.map((vehicle) => (
                    <li key={vehicle.vehicleId} className="space-y-1">
                      <p className="font-medium">
                        {vehicle.licensePlate} · {vehicle.make} {vehicle.model}
                      </p>
                      <p className="text-muted-foreground">{vehicle.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          {isLogisticRegression && (
            <p className="text-muted-foreground mt-4 text-xs">
              What this score predicts and over what period still needs
              confirmation. This model does not provide a service date.
            </p>
          )}
          {appliedModels.risk === 'decision_tree' && (
            <p className="text-muted-foreground mt-4 text-xs">
              Decision Tree uses mileage since service, service frequency, and
              hours recorded under maintenance. The model author's downtime
              definition remains unconfirmed; vehicles without audit history use
              zero hours.
            </p>
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
