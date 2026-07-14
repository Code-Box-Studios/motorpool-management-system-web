import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Calendar,
  Gauge,
  TrendingUp,
  Activity,
  Wrench,
  Info
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MaintenanceMeter,
  MaintenanceRow
} from '@/components/shared/preventive-maintenance-card';
import {
  formatMaintenanceDate,
  meterTone,
  priorityMeterTone
} from '@/lib/maintenance-format';
import { usePredictiveMaintenanceData } from '@/lib/query/analytics';
import { getNextMaintenanceDueMileage } from '@/lib/utils/predictive-maintenance';

interface VehicleMaintenanceInsightsProps {
  vehicleId: string;
}

const RISK_LABEL = {
  high: 'High Risk',
  medium: 'Medium Risk',
  low: 'Low Risk'
} as const;

const RISK_BADGE = {
  high: 'stop',
  medium: 'wait',
  low: 'neutral'
} as const;

export const VehicleMaintenanceInsights = ({
  vehicleId
}: VehicleMaintenanceInsightsProps) => {
  const { data: allPredictions, isLoading } = usePredictiveMaintenanceData();

  const prediction = allPredictions?.find((p) => p.vehicleId === vehicleId);

  if (isLoading) {
    return (
      <div className="mt-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!prediction) {
    return null;
  }

  const maintenanceDue = getNextMaintenanceDueMileage(prediction.mileage);
  const kmRemaining = maintenanceDue - prediction.mileage;
  // A vehicle at 0 km has a next-service mileage of 0 too; guard the divide.
  const mileageProgress =
    maintenanceDue > 0
      ? Math.min((prediction.mileage / maintenanceDue) * 100, 100)
      : 0;

  const preventiveReason =
    kmRemaining <= 0
      ? `Overdue for ${maintenanceDue.toLocaleString()} km service`
      : kmRemaining <= 500
        ? `Approaching ${maintenanceDue.toLocaleString()} km service interval`
        : `${kmRemaining.toLocaleString()} km until next scheduled service`;

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-xl font-semibold">Maintenance Insights</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-5 w-5" />
              Preventive Maintenance
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="text-muted-foreground h-4 w-4 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Based on mileage intervals and scheduled service cycles.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              Service status based on mileage intervals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-sm">Status</span>
              <Badge
                variant={
                  kmRemaining <= 0
                    ? 'stop'
                    : kmRemaining <= 500
                      ? 'wait'
                      : 'neutral'
                }
              >
                {kmRemaining <= 0
                  ? 'Overdue'
                  : kmRemaining <= 500
                    ? 'Due Soon'
                    : 'On Schedule'}
              </Badge>
            </div>

            <div className="space-y-2">
              <MaintenanceRow
                icon={Gauge}
                label="Current Mileage"
                value={`${prediction.mileage.toLocaleString()} km`}
              />
              <MaintenanceRow
                icon={AlertTriangle}
                iconClassName="text-status-wait-fg"
                label="Next Service At"
                value={`${maintenanceDue.toLocaleString()} km`}
              />
              <MaintenanceRow
                icon={Calendar}
                label="Last Service"
                value={formatMaintenanceDate(
                  prediction.lastMaintenanceDate,
                  'No records'
                )}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground truncate">
                  Mileage progress
                </span>
                <span className="text-muted-foreground shrink-0 whitespace-nowrap">
                  {Math.round(mileageProgress)}%
                </span>
              </div>
              <MaintenanceMeter
                value={mileageProgress}
                tone={meterTone(mileageProgress)}
              />
            </div>

            <p className="text-muted-foreground text-sm italic">
              {preventiveReason}
            </p>
          </CardContent>
        </Card>

        {/* Leads with the score and the reason behind it — the mileage triplet
            belongs to the preventive card beside it, not here. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5" />
              Predictive Maintenance
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="text-muted-foreground h-4 w-4 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      AI-powered analysis using usage patterns & maintenance
                      history to predict component failures.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              Risk assessment based on data analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-sm">Risk Level</span>
              <Badge variant={RISK_BADGE[prediction.priority]}>
                {RISK_LABEL[prediction.priority]}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground truncate text-xs">
                  Risk score
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  <span className="text-2xl leading-none font-semibold">
                    {prediction.riskScore}
                  </span>
                  <span className="text-muted-foreground text-sm">/100</span>
                </span>
              </div>
              <MaintenanceMeter
                value={prediction.riskScore}
                tone={priorityMeterTone(prediction.priority)}
              />
            </div>

            <p className="text-ink-soft text-sm">{prediction.reason}</p>

            <div className="border-border space-y-2 border-t pt-3">
              <MaintenanceRow
                icon={Calendar}
                iconClassName="text-status-stop-fg"
                label="Predicted Maintenance"
                value={formatMaintenanceDate(prediction.predictedFailureDate)}
              />
              <MaintenanceRow
                icon={TrendingUp}
                label="Since Last Service"
                value={`${prediction.kmSinceLastMaint.toLocaleString()} km`}
              />
              <MaintenanceRow
                icon={Activity}
                label="Avg Daily Usage"
                value={`${prediction.avgDailyKm.toLocaleString()} km/day`}
              />
              <MaintenanceRow
                icon={Wrench}
                label="Services (12 months)"
                value={prediction.maintFreq12m}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
