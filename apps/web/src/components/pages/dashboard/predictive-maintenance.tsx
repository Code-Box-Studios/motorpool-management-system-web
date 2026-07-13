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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import {
  usePredictiveMaintenanceData,
  useSparePartsAssociations
} from '@/lib/query/analytics';
import { getNextMaintenanceDueMileage } from '@/lib/utils/predictive-maintenance';
import { Skeleton } from '@/components/ui/skeleton';

interface PredictiveMaintenanceProps {
  showViewAll?: boolean;
}

const PredictiveMaintenance = ({
  showViewAll = true
}: PredictiveMaintenanceProps) => {
  const navigate = useNavigate();
  const { data: predictions, isLoading: predictionsLoading } =
    usePredictiveMaintenanceData();
  const { data: associations, isLoading: associationsLoading } =
    useSparePartsAssociations();

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
    mileage: v.mileage,
    maintenanceDue: getNextMaintenanceDueMileage(v.mileage),
    lastMaintenance: v.lastMaintenanceDate ?? 'N/A',
    priority: v.priority,
    reason: v.reason,
    predictedDate: v.predictedFailureDate
  }));

  const coReplacedParts =
    associations && associations.length > 0
      ? associations.map((r) => ({
          partA: r.partA,
          partB: r.partB,
          frequency: r.frequency
        }))
      : [];

  const highPriorityByOldest = [...predictedVehicles]
    .filter((v) => v.priority === 'high')
    .sort(
      (a, b) =>
        new Date(a.lastMaintenance).getTime() -
        new Date(b.lastMaintenance).getTime()
    );

  const displayedVehicles = showViewAll
    ? highPriorityByOldest.slice(0, 2)
    : predictedVehicles;

  return (
    <div className="space-y-6">
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              <div className="flex items-center gap-2">
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
                          Uses historical data and usage patterns to predict
                          when vehicle components are likely to fail, allowing
                          proactive maintenance scheduling.
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Typography
                variant={'p-sm'}
                className="font-normal text-gray-500"
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
          {predictionsLoading ? (
            <div
              className={`grid gap-4 ${showViewAll ? 'grid-cols-1' : 'md:grid-cols-2 lg:grid-cols-4'}`}
            >
              {Array.from({ length: showViewAll ? 2 : 4 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-lg" />
              ))}
            </div>
          ) : displayedVehicles.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No vehicles currently at risk. All vehicles are well-maintained.
            </p>
          ) : (
            <div
              className={`grid gap-4 ${showViewAll ? 'grid-cols-1' : 'md:grid-cols-2 lg:grid-cols-4'}`}
            >
              {displayedVehicles.map((vehicle) => (
                <PreventiveMaintenanceCard
                  key={vehicle.id}
                  id={vehicle.id}
                  plateNumber={vehicle.plateNumber}
                  vehicleName={vehicle.vehicleName}
                  mileage={vehicle.mileage}
                  maintenanceDue={vehicle.maintenanceDue}
                  lastMaintenance={vehicle.lastMaintenance}
                  priority={vehicle.priority}
                  reason={vehicle.reason}
                  predictedSchedule={vehicle.reason.replace(
                    'Predicted next: ',
                    ''
                  )}
                  predictedDate={vehicle.predictedDate}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!showViewAll && (
        <Card>
          <CardHeader>
            <CardTitle>Frequently Co-Replaced Parts</CardTitle>
            <CardDescription>
              Parts that are commonly replaced together based on maintenance
              history
            </CardDescription>
          </CardHeader>
          <CardContent>
            {associationsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : coReplacedParts.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Not enough job order data to compute spare parts associations
                yet. As more job orders with spare parts are recorded, patterns
                will appear here.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part A</TableHead>
                    <TableHead>Part B</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coReplacedParts.map((pair, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {pair.partA}
                      </TableCell>
                      <TableCell className="font-medium">
                        {pair.partB}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-gray-200">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{ width: `${pair.frequency}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground text-sm">
                            {pair.frequency}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PredictiveMaintenance;
