import MetricCard from '@/components/shared/metric-card';
import VehicleMap from '@/components/shared/vehicle-map';
import { useLatestGpsData, useInsertGpsData } from '@/lib/query/gps';
import { useVehicles } from '@/lib/query/vehicles';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { Play, Square } from 'lucide-react';
import GuardConfirmationPage from '@/components/pages/trip-tickets/guard-confirmation';
import EvpApprovalPage from '@/components/pages/job-order/evp-approval';
import { useUserRole } from '@/hooks/use-user-role';
import { USER_ROLES } from '@/lib/enums';
import PreventiveMaintenance from './preventive-maintenance';
import PredictiveMaintenance from './predictive-maintenance';

// Davao City route coordinates
const davaoCityRoute = [
  { lat: 7.0731, lng: 125.6128 }, // Starting point - Roxas Avenue
  { lat: 7.0745, lng: 125.6142 }, // San Pedro Street
  { lat: 7.076, lng: 125.6155 }, // CM Recto Avenue
  { lat: 7.078, lng: 125.617 }, // JP Laurel Avenue
  { lat: 7.08, lng: 125.619 }, // Quirino Avenue
  { lat: 7.082, lng: 125.621 }, // Ulas
  { lat: 7.085, lng: 125.624 }, // Agdao
  { lat: 7.088, lng: 125.627 } // Buhangin
];

const Dashboard = () => {
  const { data: gpsData, isLoading: gpsLoading } = useLatestGpsData();
  const { data: vehiclesData } = useVehicles(1, 100);
  const insertGps = useInsertGpsData();
  const { data: userRole } = useUserRole();

  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [currentRouteIndex, setCurrentRouteIndex] = useState(0);
  const [demoVehicleId, setDemoVehicleId] = useState<string | null>(null);

  // Find first available vehicle for simulation
  useEffect(() => {
    if (vehiclesData?.data && vehiclesData.data.length > 0 && !demoVehicleId) {
      setDemoVehicleId(vehiclesData.data[0].id);
    }
  }, [vehiclesData, demoVehicleId]);

  // Start demo simulation
  const startDemo = () => {
    if (demoVehicleId) {
      setIsDemoRunning(true);
      setCurrentRouteIndex(0);
    }
  };

  // Stop demo simulation
  const stopDemo = () => {
    setIsDemoRunning(false);
    setCurrentRouteIndex(0);
  };

  // Simulate vehicle movement
  useEffect(() => {
    if (!isDemoRunning || !demoVehicleId) return;

    const interval = setInterval(() => {
      const currentPosition = davaoCityRoute[currentRouteIndex];
      const nextIndex = (currentRouteIndex + 1) % davaoCityRoute.length;
      const nextPosition = davaoCityRoute[nextIndex];

      const calculateHeading = (
        from: typeof currentPosition,
        to: typeof currentPosition
      ) => {
        const dLon = ((to.lng - from.lng) * Math.PI) / 180;
        const lat1 = (from.lat * Math.PI) / 180;
        const lat2 = (to.lat * Math.PI) / 180;

        const y = Math.sin(dLon) * Math.cos(lat2);
        const x =
          Math.cos(lat1) * Math.sin(lat2) -
          Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const heading = (Math.atan2(y, x) * 180) / Math.PI;

        return (heading + 360) % 360;
      };

      const heading = calculateHeading(currentPosition, nextPosition);
      const speed = 30 + Math.random() * 20;

      insertGps.mutate({
        vehicle_id: demoVehicleId,
        trip_id: null,
        latitude: currentPosition.lat,
        longitude: currentPosition.lng,
        speed,
        heading,
        engine_status: 'on'
      });

      setCurrentRouteIndex(nextIndex);
    }, 3000);

    return () => clearInterval(interval);
  }, [isDemoRunning, demoVehicleId, currentRouteIndex, insertGps]);

  // Check user role and show appropriate view
  const userRoleName = userRole?.roles?.name;

  // If user is security guard, show the guard confirmation page
  if (userRoleName === USER_ROLES.security_guard) {
    return <GuardConfirmationPage />;
  }

  // If user is EVP Operations, show the approval page
  if (userRoleName === USER_ROLES.evp_operations) {
    return <EvpApprovalPage />;
  }

  if (gpsLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-muted-foreground">Loading GPS data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-5">
        <MetricCard title="Available Vehicles" value={11} />
        <MetricCard title="Under Maintenance" value={5} />
        <MetricCard title="Waiting for Spare Parts" value={6} />
        <MetricCard title="Trips Completed" value={183} />
      </div>

      <div className="grid h-full grid-cols-2 gap-5">
        <PreventiveMaintenance />
        <PredictiveMaintenance />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Vehicle Tracking</CardTitle>
              <CardDescription>
                Real-time GPS location tracking of all vehicles in the fleet
                (Davao Region)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {!isDemoRunning ? (
                <Button onClick={startDemo} disabled={!demoVehicleId} size="sm">
                  <Play className="mr-2 h-4 w-4" />
                  Start Demo
                </Button>
              ) : (
                <Button onClick={stopDemo} variant="destructive" size="sm">
                  <Square className="mr-2 h-4 w-4" />
                  Stop Demo
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <VehicleMap
            gpsData={gpsData || []}
            height="600px"
            center={[7.0731, 125.6128]}
            zoom={13}
          />
        </CardContent>
      </Card>

      {isDemoRunning && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-800">
              🚗 Demo vehicle is moving through Davao City. The marker updates
              every 3 seconds with GPS coordinates, speed, heading, and engine
              status.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
