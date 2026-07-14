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
import { lastServiceTime } from '@/lib/maintenance-format';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { usePredictiveMaintenanceData } from '@/lib/query/analytics';
import { getNextMaintenanceDueMileage } from '@/lib/utils/predictive-maintenance';
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
  const { data: predictions, isLoading } = usePredictiveMaintenanceData();

  const handleViewAll = () => {
    navigate({
      to: '/maintenance',
      search: { tab: 'preventive' }
    });
  };

  // Map predictions to preventive maintenance view:
  // show vehicles approaching their next maintenance due mileage
  const vehiclesDueForMaintenance = (predictions ?? []).map((v) => {
    const maintenanceDue = getNextMaintenanceDueMileage(v.mileage);
    const kmRemaining = maintenanceDue - v.mileage;
    let reason: string;
    if (kmRemaining <= 0) {
      reason = `Overdue for ${maintenanceDue.toLocaleString()} km service`;
    } else if (kmRemaining <= 500) {
      reason = `Approaching ${maintenanceDue.toLocaleString()} km service interval`;
    } else {
      reason = `${kmRemaining.toLocaleString()} km until next scheduled service`;
    }

    return {
      id: v.vehicleId,
      plateNumber: v.licensePlate,
      vehicleName: v.vehicleName,
      mileage: v.mileage,
      maintenanceDue,
      // Kept null rather than coerced to 'N/A': the card renders "No records"
      // for a vehicle that has never been serviced, and any placeholder string
      // here would reach `new Date()` as "Invalid Date".
      lastMaintenance: v.lastMaintenanceDate,
      priority: v.priority,
      reason
    };
  });

  const highPriorityByOldest = [...vehiclesDueForMaintenance]
    .filter((v) => v.priority === 'high')
    .sort(
      (a, b) =>
        lastServiceTime(a.lastMaintenance) - lastServiceTime(b.lastMaintenance)
    );

  const displayedVehicles = showViewAll
    ? highPriorityByOldest.slice(0, 2)
    : vehiclesDueForMaintenance;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            <div className="flex items-center gap-2">
              <span>Preventive Maintenance</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="text-primary h-4 w-4 cursor-help" />
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
        {isLoading ? (
          <div className={showViewAll ? 'grid grid-cols-1 gap-4' : CARD_GRID}>
            {Array.from({ length: showViewAll ? 2 : 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : displayedVehicles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No vehicles currently due for preventive maintenance.
          </p>
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
                priority={vehicle.priority}
                reason={vehicle.reason}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PreventiveMaintenance;
