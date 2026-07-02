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
  Wrench
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePredictiveMaintenanceData } from '@/lib/query/analytics';
import { getNextMaintenanceDueMileage } from '@/lib/utils/predictive-maintenance';

interface VehicleMaintenanceInsightsProps {
  vehicleId: string;
}

export const VehicleMaintenanceInsights = ({
  vehicleId
}: VehicleMaintenanceInsightsProps) => {
  const { data: allPredictions, isLoading } = usePredictiveMaintenanceData();

  const prediction = allPredictions?.find((p) => p.vehicleId === vehicleId);

  if (isLoading) {
    return (
      <div className="mt-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!prediction) {
    return null;
  }

  const maintenanceDue = getNextMaintenanceDueMileage(prediction.mileage);
  const kmRemaining = maintenanceDue - prediction.mileage;
  const mileageProgress = Math.min(
    (prediction.mileage / maintenanceDue) * 100,
    100
  );

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
        {/* Preventive Maintenance Card */}
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
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Status</span>
              <Badge
                variant={
                  kmRemaining <= 0
                    ? 'destructive'
                    : kmRemaining <= 500
                      ? 'default'
                      : 'secondary'
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
              <div className="flex items-center gap-2 text-sm">
                <Gauge className="text-muted-foreground h-4 w-4" />
                <span className="text-muted-foreground">Current Mileage:</span>
                <span className="font-medium">
                  {prediction.mileage.toLocaleString()} km
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="text-muted-foreground">Next Service At:</span>
                <span className="font-medium">
                  {maintenanceDue.toLocaleString()} km
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="text-muted-foreground h-4 w-4" />
                <span className="text-muted-foreground">Last Service:</span>
                <span className="font-medium">
                  {prediction.lastMaintenanceDate
                    ? new Date(
                        prediction.lastMaintenanceDate
                      ).toLocaleDateString()
                    : 'No records'}
                </span>
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">Mileage progress</span>
                <span className="text-muted-foreground">
                  {Math.round(mileageProgress)}%
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-200">
                <div
                  className={`h-2.5 rounded-full ${
                    mileageProgress >= 100
                      ? 'bg-red-500'
                      : mileageProgress >= 80
                        ? 'bg-orange-500'
                        : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(mileageProgress, 100)}%` }}
                />
              </div>
            </div>

            <p className="text-muted-foreground text-sm italic">
              {preventiveReason}
            </p>
          </CardContent>
        </Card>

        {/* Predictive Maintenance Card */}
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
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Risk Level</span>
              <Badge
                variant={
                  prediction.priority === 'high'
                    ? 'destructive'
                    : prediction.priority === 'medium'
                      ? 'default'
                      : 'secondary'
                }
              >
                {prediction.priority === 'high'
                  ? 'High Risk'
                  : prediction.priority === 'medium'
                    ? 'Medium Risk'
                    : 'Low Risk'}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-muted-foreground">Risk Score:</span>
                <span className="font-medium">{prediction.riskScore}/100</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Gauge className="text-muted-foreground h-4 w-4" />
                <span className="text-muted-foreground">
                  KM Since Last Service:
                </span>
                <span className="font-medium">
                  {prediction.kmSinceLastMaint.toLocaleString()} km
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Activity className="text-muted-foreground h-4 w-4" />
                <span className="text-muted-foreground">Avg Daily Usage:</span>
                <span className="font-medium">
                  {prediction.avgDailyKm} km/day
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Wrench className="text-muted-foreground h-4 w-4" />
                <span className="text-muted-foreground">
                  Services (12 months):
                </span>
                <span className="font-medium">{prediction.maintFreq12m}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-red-500" />
                <span className="text-muted-foreground">
                  Predicted Maintenance:
                </span>
                <span className="font-medium">
                  {new Date(
                    prediction.predictedFailureDate
                  ).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">Risk level</span>
                <span className="text-muted-foreground">
                  {prediction.riskScore}%
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-200">
                <div
                  className={`h-2.5 rounded-full ${
                    prediction.riskScore >= 65
                      ? 'bg-red-500'
                      : prediction.riskScore >= 40
                        ? 'bg-orange-500'
                        : 'bg-green-500'
                  }`}
                  style={{
                    width: `${Math.min(prediction.riskScore, 100)}%`
                  }}
                />
              </div>
            </div>

            <p className="text-muted-foreground text-sm italic">
              {prediction.reason}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
