import { useState } from 'react';
import { Crosshair, History, RotateCcw } from 'lucide-react';
import VehicleMap from '@/components/shared/vehicle-map';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGpsRouteHistory } from '@/lib/query/gps';
import { hasGpsPosition } from '@/lib/utils/gps-tracking';

function localDateTime(time: number): string {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function RouteHistory({
  vehicleId,
  mapHeight,
  fullscreen
}: {
  vehicleId: string;
  mapHeight: string;
  fullscreen: boolean;
}) {
  const [range, setRange] = useState(() => ({
    from: new Date(Date.now() - 3600_000).toISOString(),
    to: new Date().toISOString()
  }));
  const [from, setFrom] = useState(() => localDateTime(Date.parse(range.from)));
  const [to, setTo] = useState(() => localDateTime(Date.parse(range.to)));
  const [error, setError] = useState('');
  const [fitRequest, setFitRequest] = useState(0);
  const route = useGpsRouteHistory({ vehicleId, ...range });
  const validPoints = route.data?.points.filter(hasGpsPosition) ?? [];
  const applyPreset = (minutes: number) => {
    const end = Date.now(),
      start = end - minutes * 60_000;
    setRange({
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString()
    });
    setFrom(localDateTime(start));
    setTo(localDateTime(end));
    setError('');
  };
  const load = () => {
    const start = new Date(from).getTime(),
      end = new Date(to).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end))
      return setError('Choose a valid start and end time.');
    if (end <= start) return setError('End time must be after start time.');
    if (end - start > 24 * 3600_000)
      return setError('Choose a period of 24 hours or less.');
    const next = {
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString()
    };
    setError('');
    setRange(next);
    if (next.from === range.from && next.to === range.to) void route.refetch();
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b px-4 py-4">
        <div className="flex flex-wrap gap-1.5">
          {[
            [15, 'Last 15 minutes'],
            [60, 'Last hour'],
            [360, 'Last 6 hours'],
            [1440, 'Last 24 hours']
          ].map(([minutes, label]) => (
            <Button
              key={minutes}
              variant="secondary"
              size="sm"
              onClick={() => applyPreset(Number(minutes))}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="min-w-0 text-xs font-medium">
            From
            <Input
              aria-label="From"
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1.5 w-full max-w-full min-w-0"
            />
          </label>
          <label className="min-w-0 text-xs font-medium">
            To
            <Input
              aria-label="To"
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1.5 w-full max-w-full min-w-0"
            />
          </label>
          <Button size="sm" onClick={load}>
            Load route
          </Button>
        </div>
        <p className="text-muted-foreground text-[11px]">
          Times use your browser’s timezone. Select up to 24 hours per view.
        </p>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
      {route.isPending ? (
        <div
          role="status"
          className="text-muted-foreground flex min-h-64 items-center justify-center text-sm"
        >
          Loading route history…
        </div>
      ) : route.isError ? (
        <div
          role="alert"
          className="flex min-h-64 flex-col items-center justify-center gap-3 p-5 text-center"
        >
          <p className="font-medium">Route history could not be loaded.</p>
          <p className="text-muted-foreground text-sm">{route.error.message}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void route.refetch()}
          >
            <RotateCcw className="size-3.5" />
            Retry route
          </Button>
        </div>
      ) : !validPoints.length ? (
        <div className="text-muted-foreground flex min-h-64 flex-col items-center justify-center gap-3 p-5 text-center">
          <History className="size-6" />
          <p className="text-sm font-medium">No GPS reports in this period</p>
          <p className="text-xs">Try another time range for this vehicle.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <div>
              <p className="text-sm font-medium">
                {validPoints.length} recorded position
                {validPoints.length === 1 ? '' : 's'}
              </p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                {new Date(range.from).toLocaleString()} —{' '}
                {new Date(range.to).toLocaleString()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFitRequest((n) => n + 1)}
            >
              <Crosshair className="size-3.5" />
              Fit route
            </Button>
          </div>
          <div
            className={fullscreen ? 'min-h-64 flex-1 [&>div]:max-h-none' : ''}
          >
            <VehicleMap
              gpsData={[]}
              routePoints={route.data!.points}
              routeKey={`${vehicleId}:${range.from}:${range.to}`}
              fitRequest={fitRequest}
              height={mapHeight}
            />
          </div>
          <div className="text-muted-foreground flex flex-wrap justify-between gap-3 border-t px-4 py-3 text-xs">
            <span>
              <strong className="text-foreground">Route start</strong> ·{' '}
              {new Date(validPoints[0].created_at).toLocaleString()}
            </span>
            <span>
              <strong className="text-foreground">Route end</strong> ·{' '}
              {new Date(validPoints.at(-1)!.created_at).toLocaleString()}
            </span>
          </div>
          <p className="text-muted-foreground border-t px-4 py-2 text-[11px]">
            Lines connect recorded positions. Missing intervals appear as gaps.
            Latest vehicle telemetry remains above.
          </p>
        </>
      )}
    </div>
  );
}
