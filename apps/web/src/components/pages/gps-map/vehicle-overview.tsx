import { Clock3, Gauge, KeyRound, MapPin, Radio } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  hasGpsPosition,
  isRecentReport,
  reportAge,
  type TrackingVehicle
} from '@/lib/utils/gps-tracking';

export default function VehicleOverview({
  vehicle,
  now,
  connection,
  gpsUnavailable
}: {
  vehicle: TrackingVehicle;
  now: number;
  connection: 'online' | 'offline' | 'unknown';
  gpsUnavailable: boolean;
}) {
  const point = vehicle.point;
  const fresh = isRecentReport(point?.created_at, now);
  const ignition =
    point?.engine_status === 'on' || point?.engine_status === 'off'
      ? point.engine_status.toUpperCase()
      : 'Unknown';
  const stats = [
    {
      label: 'Position',
      icon: MapPin,
      value: hasGpsPosition(point) ? (
        <span className="block font-mono text-sm leading-6 tabular-nums">
          {point!.latitude!.toFixed(5)}
          <br />
          {point!.longitude!.toFixed(5)}
        </span>
      ) : (
        'Unknown'
      )
    },
    {
      label: fresh ? 'Reported speed' : 'Last reported speed',
      icon: Gauge,
      value:
        point?.speed !== null && point?.speed !== undefined
          ? `${Math.round(point.speed)} km/h`
          : 'Unknown'
    },
    {
      label: fresh ? 'Reported ignition' : 'Last reported ignition',
      icon: KeyRound,
      value: ignition
    },
    {
      label: 'Tracker connection',
      icon: Radio,
      value: (
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              'size-2 rounded-full',
              connection === 'online' ? 'bg-emerald-500' : 'bg-slate-400'
            )}
          />
          {connection === 'online'
            ? 'Online'
            : connection === 'offline'
              ? 'Offline'
              : 'Unknown'}
        </span>
      )
    },
    {
      label: 'Update age',
      icon: Clock3,
      value: reportAge(point?.created_at, now)
    }
  ];
  return (
    <Card
      role="region"
      aria-label="Vehicle telemetry"
      className="gap-0 overflow-hidden py-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold">
            {vehicle.plate}
            <span className="text-muted-foreground ml-2 font-normal">
              {vehicle.description}
            </span>
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Latest vehicle report{' '}
            {point
              ? `· ${new Date(point.created_at).toLocaleString()}`
              : '· No position received'}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            fresh && !gpsUnavailable
              ? 'bg-status-done-bg text-status-done-fg'
              : 'bg-status-wait-bg text-status-wait-fg'
          )}
        >
          {gpsUnavailable
            ? 'GPS updates unavailable'
            : !point
              ? 'Waiting for GPS'
              : fresh
                ? 'Recent GPS report'
                : 'Last known position'}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-y-4 px-4 py-4 sm:grid-cols-3 sm:px-5 xl:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 pr-3">
            <dt className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <stat.icon className="size-3.5 shrink-0" aria-hidden="true" />
              {stat.label}
            </dt>
            <dd className="mt-2 text-base leading-6 font-semibold tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
