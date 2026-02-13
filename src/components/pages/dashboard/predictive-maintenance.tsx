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

const predictedVehicles = [
  {
    id: '1',
    plateNumber: 'ABC-1234',
    vehicleName: 'Toyota Hilux',
    mileage: 48500,
    maintenanceDue: 50000,
    lastMaintenance: '2025-11-15',
    priority: 'high' as const,
    reason: 'Predicted next: Oil change & filter replacement',
    predictedDate: '2026-02-15'
  },
  {
    id: '2',
    plateNumber: 'XYZ-5678',
    vehicleName: 'Mitsubishi L300',
    mileage: 29800,
    maintenanceDue: 30000,
    lastMaintenance: '2025-10-20',
    priority: 'high' as const,
    reason: 'Predicted next: Brake inspection & tire rotation',
    predictedDate: '2026-02-20'
  },
  {
    id: '3',
    plateNumber: 'DEF-9012',
    vehicleName: 'Isuzu D-Max',
    mileage: 23400,
    maintenanceDue: 25000,
    lastMaintenance: '2025-12-01',
    priority: 'medium' as const,
    reason: 'Predicted next: Brake pad replacement',
    predictedDate: '2026-03-15'
  },
  {
    id: '4',
    plateNumber: 'GHI-3456',
    vehicleName: 'Ford Ranger',
    mileage: 19200,
    maintenanceDue: 20000,
    lastMaintenance: '2025-11-28',
    priority: 'medium' as const,
    reason: 'Predicted next: Belt replacement & coolant flush',
    predictedDate: '2026-03-20'
  }
];

const coReplacedParts = [
  { partA: 'Oil Filter', partB: 'Engine Oil', frequency: 95 },
  { partA: 'Brake Pads', partB: 'Brake Rotors', frequency: 78 },
  { partA: 'Timing Belt', partB: 'Water Pump', frequency: 72 },
  { partA: 'Spark Plugs', partB: 'Ignition Coils', frequency: 65 },
  { partA: 'Air Filter', partB: 'Cabin Filter', frequency: 60 },
  { partA: 'Serpentine Belt', partB: 'Belt Tensioner', frequency: 58 },
  { partA: 'Clutch Disc', partB: 'Pressure Plate', frequency: 88 },
  { partA: 'Thermostat', partB: 'Coolant', frequency: 70 }
];

interface PredictiveMaintenanceProps {
  showViewAll?: boolean;
}

const PredictiveMaintenance = ({
  showViewAll = true
}: PredictiveMaintenanceProps) => {
  const navigate = useNavigate();

  const handleViewAll = () => {
    navigate({
      to: '/maintenance',
      search: { tab: 'predictive' }
    });
  };

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
          <div
            className={`grid gap-4 ${showViewAll ? 'grid-cols-1 md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-4'}`}
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
              />
            ))}
          </div>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part A</TableHead>
                  <TableHead>Part B</TableHead>
                  <TableHead>Frequency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coReplacedParts.map((pair, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{pair.partA}</TableCell>
                    <TableCell className="font-medium">{pair.partB}</TableCell>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PredictiveMaintenance;
