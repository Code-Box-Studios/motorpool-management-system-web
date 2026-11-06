import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Maximize2, Minimize2, RadioTower } from 'lucide-react';
import PageHeader from '@/components/shared/page-header';
import VehicleMap from '@/components/shared/vehicle-map';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api/client';
import { useLatestGpsData } from '@/lib/query/gps';
import { useTrackerDevices } from '@/lib/query/tracker-devices';
import { useAllVehicles } from '@/lib/query/vehicles';
import {
  hasGpsPosition,
  reportAge,
  vehicleConnection,
  type TrackingVehicle
} from '@/lib/utils/gps-tracking';
import VehicleOverview from './vehicle-overview';
import RouteHistory from './route-history';

export default function GpsMapPage() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null
  );
  const [mode, setMode] = useState('live');
  const [now, setNow] = useState(Date.now);
  const [fitRequest, setFitRequest] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const gps = useLatestGpsData();
  const gpsData = gps.data ?? [];
  const trackerQuery = useTrackerDevices(
    {},
    { sortBy: 'imei', sortOrder: 'asc' }
  );
  const vehicles = useAllVehicles();
  const registryUnavailable =
    trackerQuery.isError ||
    trackerQuery.errorUpdatedAt > trackerQuery.dataUpdatedAt;
  const trackerReadForbidden =
    trackerQuery.error instanceof ApiError && trackerQuery.error.status === 403;
  const gpsUnavailable = gps.isError || gps.errorUpdatedAt > gps.dataUpdatedAt;
  const { refetch: refreshTrackers } = trackerQuery;

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!trackerReadForbidden) void refreshTrackers();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refreshTrackers, trackerReadForbidden]);
  useEffect(() => {
    const update = () =>
      setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const choices = useMemo(() => {
    const byId = new Map<string, TrackingVehicle>();
    for (const tracker of trackerQuery.data?.data ?? []) {
      if (!tracker.vehicleId) continue;
      const vehicle = vehicles.data?.find((v) => v.id === tracker.vehicleId);
      const previous = byId.get(tracker.vehicleId);
      if (previous?.tracker?.status === 'active') continue;
      byId.set(tracker.vehicleId, {
        id: tracker.vehicleId,
        tracker,
        plate: vehicle?.license_plate ?? tracker.label ?? 'Assigned vehicle',
        description: vehicle ? `${vehicle.make} ${vehicle.model}` : tracker.imei
      });
    }
    for (const point of gps.data ?? []) {
      if (!point.vehicles) continue;
      byId.set(point.vehicles.id, {
        ...byId.get(point.vehicles.id),
        id: point.vehicles.id,
        point,
        plate: point.vehicles.license_plate,
        description: `${point.vehicles.make} ${point.vehicles.model}`
      });
    }
    return [...byId.values()].sort((a, b) => a.plate.localeCompare(b.plate));
  }, [trackerQuery.data, vehicles.data, gps.data]);
  const selected =
    choices.find((v) => v.id === selectedVehicleId) ?? choices[0];
  const connection = selected
    ? vehicleConnection(selected, now, registryUnavailable)
    : 'unknown';
  const connections = useMemo(
    () => (selected ? { [selected.id]: connection } : {}),
    [selected, connection]
  );
  const selectVehicle = (id: string | null) => {
    setSelectedVehicleId(id);
    setFocusRequest((n) => n + 1);
  };
  const toggleFullscreen = async () => {
    if (!workspaceRef.current) return;
    if (document.fullscreenElement === workspaceRef.current)
      await document.exitFullscreen();
    else await workspaceRef.current.requestFullscreen();
  };
  const mapHeight = isFullscreen ? '100%' : '520px';

  return (
    <div className="space-y-5">
      {!isFullscreen && (
        <PageHeader
          title="GPS Map"
          description="Live vehicle telemetry and recorded routes from real tracker reports."
        />
      )}
      <div
        ref={workspaceRef}
        className={cn(
          'bg-background space-y-4',
          isFullscreen && 'flex h-dvh flex-col overflow-y-auto p-4'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {isFullscreen && (
              <h1 className="mb-1 text-lg font-semibold">GPS Map</h1>
            )}
            <p className="text-muted-foreground text-sm">
              {trackerQuery.data?.count ?? choices.length} registered tracker
              {(trackerQuery.data?.count ?? choices.length) === 1 ? '' : 's'} ·
              Live positions refresh every 5s
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </Button>
        </div>
        {selected && (
          <VehicleOverview
            vehicle={selected}
            now={now}
            connection={connection}
            gpsUnavailable={gpsUnavailable}
          />
        )}
        <div
          className={cn(
            'grid min-h-0 gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]',
            isFullscreen && 'flex-1'
          )}
        >
          <Card
            className={cn(
              'min-h-0 gap-0 overflow-hidden py-0',
              isFullscreen
                ? 'max-h-72 xl:max-h-none'
                : 'max-h-80 xl:max-h-[720px]'
            )}
          >
            <div className="border-b px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <RadioTower className="text-signal size-4" />
                Registered Trackers
              </h2>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                Choose a vehicle to inspect its latest report or route.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {!choices.length && (trackerQuery.isPending || gps.isPending) ? (
                <p className="text-muted-foreground p-3 text-sm">
                  Loading trackers…
                </p>
              ) : !choices.length ? (
                <p className="text-muted-foreground p-3 text-sm">
                  {registryUnavailable
                    ? 'Tracker list is unavailable.'
                    : 'No assigned trackers found.'}
                </p>
              ) : (
                choices.map((vehicle) => {
                  const state = vehicleConnection(
                    vehicle,
                    now,
                    registryUnavailable
                  );
                  return (
                    <button
                      key={vehicle.id}
                      type="button"
                      aria-pressed={selected?.id === vehicle.id}
                      onClick={() => selectVehicle(vehicle.id)}
                      className={cn(
                        'mb-1 w-full rounded-xl p-3 text-left transition-colors',
                        selected?.id === vehicle.id
                          ? 'bg-accent ring-border ring-1 ring-inset'
                          : 'hover:bg-muted'
                      )}
                    >
                      <span className="block text-sm font-semibold">
                        {vehicle.plate}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                        {vehicle.description}
                      </span>
                      {vehicle.tracker && (
                        <span className="text-muted-foreground mt-1 block truncate text-[11px]">
                          {vehicle.tracker.label || vehicle.tracker.imei}
                        </span>
                      )}
                      <span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              'size-1.5 rounded-full',
                              state === 'online'
                                ? 'bg-emerald-500'
                                : 'bg-slate-400'
                            )}
                          />
                          {state === 'online'
                            ? 'Online'
                            : state === 'offline'
                              ? 'Offline'
                              : 'Unknown'}
                        </span>
                        <span className="text-muted-foreground">
                          {vehicle.point
                            ? reportAge(vehicle.point.created_at, now)
                            : 'No location yet'}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {registryUnavailable && (
              <p
                role="alert"
                className="text-status-wait-fg border-t px-4 py-3 text-xs leading-5"
              >
                Tracker connection details are unavailable. A recent GPS receipt
                still proves contact.
              </p>
            )}
          </Card>
          <Card className="flex min-h-0 min-w-0 flex-col gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <Tabs value={mode} onValueChange={setMode}>
                <TabsList>
                  <TabsTrigger value="live">Live map</TabsTrigger>
                  <TabsTrigger value="history" disabled={!selected}>
                    Route history
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {mode === 'live' && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      !selected?.point || !hasGpsPosition(selected.point)
                    }
                    onClick={() => selected && selectVehicle(selected.id)}
                  >
                    <Crosshair className="size-3.5" />
                    Locate vehicle
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!gpsData.length}
                    onClick={() => {
                      setSelectedVehicleId(null);
                      setFitRequest((n) => n + 1);
                    }}
                  >
                    Fit fleet
                  </Button>
                </div>
              )}
            </div>
            {mode === 'history' && selected ? (
              <RouteHistory
                vehicleId={selected.id}
                mapHeight={mapHeight}
                fullscreen={isFullscreen}
              />
            ) : (
              <>
                {gpsUnavailable && (
                  <div
                    role="alert"
                    className="bg-status-wait-bg/40 text-status-wait-fg border-b px-4 py-3 text-sm"
                  >
                    GPS updates are unavailable. Showing the last received
                    positions.{' '}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void gps.refetch()}
                    >
                      Retry GPS
                    </Button>
                  </div>
                )}
                {gps.isPending && !gpsUnavailable ? (
                  <div
                    role="status"
                    className="text-muted-foreground flex min-h-64 items-center justify-center text-sm"
                  >
                    Loading GPS positions…
                  </div>
                ) : (
                  <div
                    className={cn(
                      'min-h-0',
                      isFullscreen && 'min-h-64 flex-1 [&>div]:max-h-none'
                    )}
                  >
                    <VehicleMap
                      gpsData={gpsData}
                      height={mapHeight}
                      selectedVehicleId={selectedVehicleId}
                      onSelectedVehicleIdChange={selectVehicle}
                      focusRequest={focusRequest}
                      fitRequest={fitRequest}
                      trackerConnections={connections}
                    />
                  </div>
                )}
                <p className="text-muted-foreground border-t px-4 py-2.5 text-[11px]">
                  Reported ignition is separate from tracker connection. Old GPS
                  reports remain marked as last known positions.
                </p>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
