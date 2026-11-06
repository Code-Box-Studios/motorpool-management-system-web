import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowUpRight,
  CarFront,
  Crosshair,
  MapPin,
  Radio,
  RefreshCw,
  Search,
  TriangleAlert
} from 'lucide-react';
import VehicleMap from '@/components/shared/vehicle-map';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useLatestGpsData } from '@/lib/query/gps';
import { useAllVehicles } from '@/lib/query/vehicles';
import {
  getTrackerDevices,
  type TrackerDevice
} from '@/lib/api/tracker-devices';
import {
  DEVICE_ONLINE_THRESHOLD_MS,
  isDeviceOnline
} from '@/lib/utils/tracker-devices';
import { cn } from '@/lib/utils';

// Fetch every page: a larger fleet must not silently lose trackers after row 100.
async function getActiveTrackers() {
  const devices: TrackerDevice[] = [];
  for (let page = 1; ; page++) {
    const result = await getTrackerDevices(
      { page, limit: 100, status: 'active' },
      { sortBy: 'imei', sortOrder: 'asc' }
    );
    devices.push(...result.data);
    if (!result.data.length || devices.length >= result.count) return devices;
  }
}

function ageLabel(value: string | null | undefined, now: number) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Never received';
  const seconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function FleetTracking() {
  const gps = useLatestGpsData();
  const trackers = useQuery({
    queryKey: ['tracker-devices', 'dashboard-active'],
    queryFn: getActiveTrackers,
    refetchInterval: 15000
  });
  const vehicles = useAllVehicles();
  // Keep the last failure visible during automatic retries until a read succeeds.
  const gpsFailed = gps.isError || gps.errorUpdatedAt > gps.dataUpdatedAt;
  const trackersFailed =
    trackers.isError || trackers.errorUpdatedAt > trackers.dataUpdatedAt;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [fitRequest, setFitRequest] = useState(0);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(() => {
    const points = new Map(
      (gps.data ?? [])
        .filter(
          (point) =>
            point.vehicles &&
            point.latitude !== null &&
            point.longitude !== null &&
            Number.isFinite(point.latitude) &&
            Number.isFinite(point.longitude) &&
            Math.abs(point.latitude) <= 90 &&
            Math.abs(point.longitude) <= 180
        )
        .map((point) => [point.vehicles!.id, point])
    );
    const byVehicle = new Map(
      (trackers.data ?? [])
        .filter((t) => t.vehicleId)
        .map((t) => [t.vehicleId!, t])
    );
    // A failed registry read is unknown connectivity, never an empty/offline fleet.
    const ids = trackersFailed
      ? new Set([...byVehicle.keys(), ...points.keys()])
      : new Set(byVehicle.keys());
    return [...ids]
      .map((id) => {
        const point = points.get(id);
        const tracker = byVehicle.get(id);
        const vehicle =
          point?.vehicles ?? vehicles.data?.find((v) => v.id === id);
        const online = trackersFailed
          ? null
          : isDeviceOnline(tracker?.lastSeenAt ?? null);
        const fresh =
          !!point &&
          Number.isFinite(Date.parse(point.created_at)) &&
          now - Date.parse(point.created_at) < DEVICE_ONLINE_THRESHOLD_MS;
        const motion = !point
          ? 'No location'
          : !fresh
            ? 'Last known position'
            : point.speed === null
              ? 'Speed unknown'
              : point.speed > 0
                ? 'Moving'
                : 'Stopped';
        return {
          id,
          point,
          tracker,
          vehicle,
          online,
          fresh,
          motion,
          plate: vehicle?.license_plate ?? tracker?.label ?? 'Assigned vehicle',
          description: vehicle
            ? `${vehicle.make} ${vehicle.model}`
            : (tracker?.imei ?? 'Vehicle details unavailable'),
          attention: online !== true || !fresh
        };
      })
      .sort((a, b) => a.plate.localeCompare(b.plate));
  }, [gps.data, trackers.data, trackersFailed, vehicles.data, now]);

  const selected =
    rows.find((row) => row.id === selectedId) ??
    (rows.length === 1 ? rows[0] : undefined);
  const filtered = rows.filter(
    (row) =>
      (!attentionOnly || row.attention) &&
      `${row.plate} ${row.description}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  const mapPoints = rows.flatMap((row) => (row.point ? [row.point] : []));
  const loading =
    (gps.isLoading && !gpsFailed) || (trackers.isLoading && !trackersFailed);
  const statusUnknown = trackersFailed || trackers.isLoading;
  const positionUnknown = gpsFailed || gps.isLoading;
  const attention = rows.filter((row) => row.attention).length;
  const unassigned = trackers.data?.filter((t) => !t.vehicleId).length ?? 0;
  const selectVehicle = (id: string | null) => {
    setSelectedId(id);
    setFocusRequest((n) => n + 1);
  };
  const retry = () => {
    void gps.refetch();
    void trackers.refetch();
    void vehicles.refetch();
  };

  return (
    <Card
      role="region"
      aria-label="Vehicle Tracking"
      className="gap-0 overflow-hidden py-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <div className="flex items-center gap-2.5">
            <Radio className="text-signal size-4" aria-hidden="true" />
            <h2 className="text-base font-semibold">Vehicle Tracking</h2>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Your tracked fleet, at a glance.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/gps-map">
            Open GPS map <ArrowUpRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 border-y sm:grid-cols-4">
        {[
          {
            label: 'Online',
            value: statusUnknown ? '—' : rows.filter((r) => r.online).length,
            color: 'bg-emerald-500'
          },
          {
            label: 'Moving',
            value:
              statusUnknown || positionUnknown
                ? '—'
                : rows.filter(
                    (r) => r.online && r.fresh && (r.point?.speed ?? 0) > 0
                  ).length,
            color: 'bg-emerald-500'
          },
          {
            label: 'Stopped',
            value:
              statusUnknown || positionUnknown
                ? '—'
                : rows.filter(
                    (r) => r.online && r.fresh && r.point?.speed === 0
                  ).length,
            color: 'bg-blue-500'
          },
          {
            label: 'Needs attention',
            value: statusUnknown || positionUnknown ? '—' : attention,
            color: 'bg-amber-500'
          }
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 px-5 py-3 sm:px-6"
          >
            <span
              className={cn('size-1.5 shrink-0 rounded-full', stat.color)}
            />
            <div>
              <p className="text-muted-foreground text-xs">{stat.label}</p>
              <p className="text-xl leading-7 font-semibold tabular-nums">
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {(gpsFailed || trackersFailed || vehicles.isError) && (
        <div
          role="alert"
          className="bg-status-wait-bg text-status-wait-fg flex flex-wrap items-center gap-2 border-b px-5 py-3 text-sm"
        >
          <TriangleAlert className="size-4 shrink-0" />
          <span className="flex-1">
            {gpsFailed
              ? 'GPS positions could not be updated. Any displayed positions are the last received.'
              : trackersFailed
                ? 'Tracker status is unavailable. Connectivity is unknown.'
                : 'Some vehicle details are unavailable.'}
          </span>
          <Button variant="ghost" size="sm" onClick={retry}>
            Retry tracking
          </Button>
        </div>
      )}

      <div className="grid min-w-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="min-w-0 border-b lg:border-r lg:border-b-0">
          <div className="space-y-3 p-4">
            <div className="relative">
              <Search
                className="text-muted-foreground absolute top-2.5 left-3 size-4"
                aria-hidden="true"
              />
              <Input
                aria-label="Search tracked vehicles"
                placeholder="Find a vehicle…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1">
              <Button
                variant={!attentionOnly ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={!attentionOnly}
                onClick={() => setAttentionOnly(false)}
              >
                All vehicles{' '}
                <span className="text-muted-foreground">{rows.length}</span>
              </Button>
              <Button
                variant={attentionOnly ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={attentionOnly}
                onClick={() => setAttentionOnly(true)}
              >
                Needs attention
              </Button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto px-2 pb-2 lg:max-h-[380px]">
            {loading ? (
              <p className="text-muted-foreground p-4 text-sm">
                Loading tracked vehicles…
              </p>
            ) : filtered.length ? (
              filtered.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  aria-pressed={selectedId === row.id}
                  onClick={() => selectVehicle(row.id)}
                  className={cn(
                    'focus-visible:ring-ring mb-1 flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors outline-none focus-visible:ring-2',
                    selectedId === row.id
                      ? 'bg-accent ring-border ring-1 ring-inset'
                      : 'hover:bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg',
                      !row.fresh
                        ? 'bg-muted text-muted-foreground'
                        : row.point?.speed === 0
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    )}
                  >
                    <CarFront className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {row.plate}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {row.description}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5',
                          row.online
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-muted-foreground'
                        )}
                      >
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            row.online ? 'bg-emerald-500' : 'bg-slate-400'
                          )}
                        />
                        {row.online === null
                          ? 'Connection unknown'
                          : row.online
                            ? 'Online'
                            : 'Offline'}
                      </span>
                      <span className="text-muted-foreground">
                        {gpsFailed && !row.point
                          ? 'Position unavailable'
                          : row.motion}
                      </span>
                    </span>
                    <span className="text-muted-foreground mt-1 block text-[11px]">
                      {row.point
                        ? `Position · ${ageLabel(row.point.created_at, now)}`
                        : gpsFailed
                          ? 'Position unavailable'
                          : 'Waiting for a GPS fix'}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="text-muted-foreground p-4 text-sm">
                {search || attentionOnly
                  ? 'No vehicles match this view.'
                  : trackersFailed
                    ? 'Tracker list is unavailable.'
                    : 'No trackers assigned to vehicles yet.'}
              </div>
            )}
          </div>
          <div className="text-muted-foreground flex items-center justify-between border-t px-4 py-3 text-xs">
            <span>
              {rows.length} assigned
              {unassigned > 0 ? ` · ${unassigned} unassigned` : ''}
            </span>
            <Link
              to="/tracker-devices"
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              Manage trackers
            </Link>
          </div>
        </div>

        <div className="min-w-0">
          <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
            <span className="text-muted-foreground text-xs">
              {mapPoints.length} reported position
              {mapPoints.length === 1 ? '' : 's'}{' '}
              <span aria-hidden="true">·</span>{' '}
              {gpsFailed ? 'Updates interrupted' : 'Refreshes every 5s'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!mapPoints.length}
              onClick={() => {
                setSelectedId(null);
                setFitRequest((n) => n + 1);
              }}
            >
              <Crosshair className="size-3.5" />
              Fit fleet
            </Button>
          </div>
          <div className="relative isolate">
            {loading && !mapPoints.length ? (
              <div className="text-muted-foreground flex h-80 items-center justify-center text-sm">
                Loading GPS positions…
              </div>
            ) : gpsFailed && !mapPoints.length ? (
              <div className="text-muted-foreground flex h-80 flex-col items-center justify-center gap-3 p-6 text-center">
                <MapPin className="size-7" />
                <p>GPS positions are unavailable.</p>
                <Button variant="outline" size="sm" onClick={retry}>
                  <RefreshCw className="size-3.5" />
                  Retry tracking
                </Button>
              </div>
            ) : (
              <VehicleMap
                gpsData={mapPoints}
                height="360px"
                dashboardPresentation
                selectedVehicleId={selectedId}
                onSelectedVehicleIdChange={selectVehicle}
                focusRequest={focusRequest}
                fitRequest={fitRequest}
              />
            )}
          </div>
          {selected ? (
            <div
              role="region"
              aria-label="Selected vehicle"
              className="space-y-3 border-t px-4 py-4 sm:px-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {selected.plate}
                    <span className="text-muted-foreground ml-2 font-normal">
                      {selected.description}
                    </span>
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      selected.fresh
                        ? 'text-muted-foreground'
                        : 'text-amber-700 dark:text-amber-400'
                    )}
                  >
                    {selected.point
                      ? `${selected.fresh ? 'Position received' : 'Last known position'} · ${ageLabel(selected.point.created_at, now)}`
                      : gpsFailed
                        ? 'Position unavailable'
                        : 'No location received'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selected.point}
                  onClick={() => selectVehicle(selected.id)}
                >
                  <Crosshair className="size-3.5" />
                  Locate vehicle
                </Button>
              </div>
              {selected.point && (
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground text-[11px]">
                      {selected.fresh
                        ? 'Reported speed'
                        : 'Last reported speed'}
                    </dt>
                    <dd className="mt-1 font-medium tabular-nums">
                      {selected.point.speed === null
                        ? 'Unknown'
                        : `${Math.round(selected.point.speed)} km/h`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-[11px]">
                      Reported ignition
                    </dt>
                    <dd className="mt-1 font-medium">
                      {selected.point.engine_status === 'on' ||
                      selected.point.engine_status === 'off'
                        ? selected.point.engine_status.toUpperCase()
                        : 'Unknown'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-[11px]">
                      Heading
                    </dt>
                    <dd className="mt-1 font-medium tabular-nums">
                      {selected.point.heading === null
                        ? 'Unknown'
                        : `${Math.round(selected.point.heading)}°`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-[11px]">
                      Position time
                    </dt>
                    <dd
                      className="mt-1 text-xs"
                      title={new Date(
                        selected.point.created_at
                      ).toLocaleString()}
                    >
                      {new Date(selected.point.created_at).toLocaleTimeString(
                        [],
                        { hour: '2-digit', minute: '2-digit' }
                      )}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground border-t px-5 py-4 text-sm">
              Select a vehicle or map marker to see its latest report.
            </div>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 text-[11px]">
            {[
              ['bg-emerald-600', 'Moving'],
              ['bg-blue-600', 'Stopped'],
              ['bg-slate-500', 'Old / unknown position']
            ].map(([color, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', color)} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
