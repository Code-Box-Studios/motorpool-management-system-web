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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

const vehiclesDueForMaintenance = [
  {
    id: '1',
    plateNumber: 'ABC-1234',
    vehicleName: 'Toyota Hilux',
    mileage: 48500,
    maintenanceDue: 50000,
    lastMaintenance: '2025-11-15',
    priority: 'high' as const,
    reason: 'Approaching 50,000 km service interval'
  },
  {
    id: '2',
    plateNumber: 'XYZ-5678',
    vehicleName: 'Mitsubishi L300',
    mileage: 29800,
    maintenanceDue: 30000,
    lastMaintenance: '2025-10-20',
    priority: 'high' as const,
    reason: 'Scheduled 30,000 km maintenance due'
  },
  {
    id: '3',
    plateNumber: 'DEF-9012',
    vehicleName: 'Isuzu D-Max',
    mileage: 23400,
    maintenanceDue: 25000,
    lastMaintenance: '2025-12-01',
    priority: 'medium' as const,
    reason: 'Preventive maintenance approaching'
  },
  {
    id: '4',
    plateNumber: 'GHI-3456',
    vehicleName: 'Ford Ranger',
    mileage: 19200,
    maintenanceDue: 20000,
    lastMaintenance: '2025-11-28',
    priority: 'medium' as const,
    reason: '20,000 km service approaching'
  }
];

interface PreventiveMaintenanceProps {
  showViewAll?: boolean;
}

const PreventiveMaintenance = ({
  showViewAll = true
}: PreventiveMaintenanceProps) => {
  const navigate = useNavigate();

  const handleViewAll = () => {
    navigate({
      to: '/maintenance',
      search: { tab: 'preventive' }
    });
  };

  const displayedVehicles = showViewAll
    ? vehiclesDueForMaintenance.slice(0, 4)
    : vehiclesDueForMaintenance;

  return (
    <Card>
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
            <Typography variant={'p-sm'} className="font-normal text-gray-500">
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
      </CardContent>
    </Card>
  );
};

export default PreventiveMaintenance;
