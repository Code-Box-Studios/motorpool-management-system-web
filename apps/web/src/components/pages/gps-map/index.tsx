import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, RadioTower } from 'lucide-react';
import PageHeader from '@/components/shared/page-header';
import VehicleMap from '@/components/shared/vehicle-map';
import StatusBadge from '@/components/shared/status-badge';
import { DeviceOnlineIndicator } from '@/components/shared/device-online-indicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLatestGpsData } from '@/lib/query/gps';
import { useTrackerDevices } from '@/lib/query/tracker-devices';
import { useAllVehicles } from '@/lib/query/vehicles';
import { assignedVehicleLabel } from '@/lib/utils/tracker-devices';

const MAP_CENTER: [number, number] = [7.0731, 125.6128];

export default function GpsMapPage() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null
  );
  const { data: gpsData = [], isLoading: gpsLoading } = useLatestGpsData();
  const { data: trackerData, isLoading: trackersLoading } = useTrackerDevices({
    page: 1,
    limit: 100
  });
  const { data: vehicles, isLoading: vehiclesLoading } = useAllVehicles();

  const vehiclesById = useMemo(
    () => new Map((vehicles ?? []).map((vehicle) => [vehicle.id, vehicle])),
    [vehicles]
  );
  const locatedVehicleIds = useMemo(
    () =>
      new Set(
        gpsData.flatMap((point) =>
          point.vehicles?.id ? [point.vehicles.id] : []
        )
      ),
    [gpsData]
  );

  useEffect(() => {
    const syncFullscreen = () =>
      setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () =>
      document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    if (!workspaceRef.current) return;
    if (document.fullscreenElement === workspaceRef.current) {
      await document.exitFullscreen();
    } else {
      await workspaceRef.current.requestFullscreen();
    }
  };

  return (
    <div className="space-y-6">
      {!isFullscreen && (
        <PageHeader
          title="GPS Map"
          description="Select a registered tracker to focus the live map on its vehicle."
        />
      )}

      <div
        ref={workspaceRef}
        className={cn(
          'bg-background grid gap-4',
          isFullscreen
            ? 'h-screen grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-4'
            : ''
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {isFullscreen ? (
            <div>
              <h1 className="text-xl font-semibold">GPS Map</h1>
              <p className="text-muted-foreground text-sm">
                Live fleet tracking
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {trackerData?.count ?? 0} registered tracker
              {trackerData?.count === 1 ? '' : 's'}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? (
              <Minimize2 className="mr-2 size-4" />
            ) : (
              <Maximize2 className="mr-2 size-4" />
            )}
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </Button>
        </div>

        <div className="grid min-h-0 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <Card className="min-h-0 overflow-hidden">
            <CardContent className="flex h-full min-h-64 flex-col p-0">
              <div className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <RadioTower className="text-signal size-4" />
                  <h2 className="font-semibold">Registered Trackers</h2>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Select a tracker with a location to focus the map.
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {trackersLoading || vehiclesLoading ? (
                  <p className="text-muted-foreground p-3 text-sm">
                    Loading trackers…
                  </p>
                ) : trackerData?.data.length ? (
                  trackerData.data.map((tracker) => {
                    const hasLocation =
                      !!tracker.vehicleId &&
                      locatedVehicleIds.has(tracker.vehicleId);
                    const vehicle = vehiclesById.get(tracker.vehicleId ?? '');
                    const label = assignedVehicleLabel(
                      tracker.vehicleId,
                      vehicle,
                      false
                    );
                    const selected = tracker.vehicleId === selectedVehicleId;
                    return (
                      <button
                        key={tracker.id}
                        type="button"
                        disabled={!hasLocation}
                        onClick={() =>
                          tracker.vehicleId &&
                          setSelectedVehicleId(tracker.vehicleId)
                        }
                        className={cn(
                          'w-full rounded-xl p-3 text-left transition-colors',
                          selected
                            ? 'bg-status-move-bg ring-status-move-fg ring-1'
                            : 'hover:bg-muted',
                          !hasLocation && 'cursor-not-allowed opacity-60'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold">{label}</span>
                          <StatusBadge status={tracker.status} />
                        </div>
                        <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
                          {tracker.label || tracker.imei}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <DeviceOnlineIndicator
                            lastSeenAt={tracker.lastSeenAt}
                          />
                          <span className="text-muted-foreground text-xs">
                            {hasLocation ? 'Locate on map' : 'No location yet'}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground p-3 text-sm">
                    No tracker devices found.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden">
            <CardContent className="h-full p-0">
              {gpsLoading ? (
                <div className="text-muted-foreground flex h-full min-h-96 items-center justify-center text-sm">
                  Loading GPS data…
                </div>
              ) : (
                <VehicleMap
                  gpsData={gpsData}
                  center={MAP_CENTER}
                  zoom={13}
                  height={
                    isFullscreen ? 'calc(100vh - 7rem)' : 'calc(100vh - 18rem)'
                  }
                  selectedVehicleId={selectedVehicleId}
                  onSelectedVehicleIdChange={setSelectedVehicleId}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
