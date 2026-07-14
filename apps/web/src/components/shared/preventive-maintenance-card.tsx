/**
 * The two maintenance card variants and the pieces they share.
 *
 * They answer different questions and so must not show the same facts:
 * preventive answers "how far until the next scheduled service" (the mileage
 * triplet + progress), predictive answers "how likely is this to break, and
 * why" (risk score + the drivers behind it).
 */
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Gauge,
  TrendingUp,
  type LucideIcon
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import {
  METER_TONE,
  PRIORITY,
  formatMaintenanceDate,
  meterTone,
  type MaintenancePriority,
  type MaintenanceTone
} from '@/lib/maintenance-format';

export const MaintenanceMeter = ({
  value,
  tone,
  className
}: {
  value: number;
  tone: MaintenanceTone;
  className?: string;
}) => {
  // A vehicle at 0 km has a next-service mileage of 0 too, so the caller's
  // ratio comes through as NaN rather than a number.
  const width = Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;

  return (
    <div
      className={cn(
        'bg-muted h-2 w-full overflow-hidden rounded-full',
        className
      )}
    >
      <div
        className={cn('h-full rounded-full', METER_TONE[tone])}
        style={{ width: `${width}%` }}
      />
    </div>
  );
};

/**
 * A label/value line. The label carries a width floor and truncates while the
 * value never breaks, so a narrow card can't split "49,000 km" across two
 * lines or hyphenate a plate.
 */
export const MaintenanceRow = ({
  icon: Icon,
  label,
  value,
  iconClassName
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  iconClassName?: string;
}) => (
  <div className="flex items-center gap-2 text-sm">
    <Icon
      className={cn(
        'h-4 w-4 shrink-0',
        iconClassName ?? 'text-muted-foreground'
      )}
    />
    <span className="text-muted-foreground min-w-16 flex-1 truncate">
      {label}
    </span>
    <span className="shrink-0 font-medium whitespace-nowrap">{value}</span>
  </div>
);

const VehicleIdentity = ({
  id,
  vehicleName,
  plateNumber,
  badge
}: {
  id: string;
  vehicleName: string;
  plateNumber: string;
  badge: ReactNode;
}) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <Link
        to="/vehicles/$vehicleId"
        params={{ vehicleId: id }}
        title={vehicleName}
        className="block truncate text-base font-semibold hover:underline"
      >
        {vehicleName}
      </Link>
      <p className="text-muted-foreground font-mono text-xs whitespace-nowrap">
        {plateNumber}
      </p>
    </div>
    <div className="shrink-0">{badge}</div>
  </div>
);

interface PreventiveMaintenanceCardProps {
  id: string;
  plateNumber: string;
  vehicleName: string;
  mileage: number;
  maintenanceDue: number;
  lastMaintenance: string | null | undefined;
  priority: MaintenancePriority;
  reason: string;
}

/** How far this vehicle is from its next scheduled service. */
export const PreventiveMaintenanceCard = ({
  id,
  plateNumber,
  vehicleName,
  mileage,
  maintenanceDue,
  lastMaintenance,
  priority,
  reason
}: PreventiveMaintenanceCardProps) => {
  const progress = maintenanceDue > 0 ? (mileage / maintenanceDue) * 100 : 0;

  return (
    <Card className="h-full">
      <CardContent className="space-y-4">
        <VehicleIdentity
          id={id}
          vehicleName={vehicleName}
          plateNumber={plateNumber}
          badge={
            <Badge variant={PRIORITY[priority].badge}>
              {PRIORITY[priority].priorityLabel}
            </Badge>
          }
        />

        <div className="space-y-2">
          <MaintenanceRow
            icon={Gauge}
            label="Current Mileage"
            value={`${mileage.toLocaleString()} km`}
          />
          <MaintenanceRow
            icon={AlertTriangle}
            iconClassName="text-status-wait-fg"
            label="Maintenance Due"
            value={`${maintenanceDue.toLocaleString()} km`}
          />
          <MaintenanceRow
            icon={Calendar}
            label="Last Service"
            value={formatMaintenanceDate(lastMaintenance, 'No records')}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground truncate">
              Mileage progress
            </span>
            <span className="text-muted-foreground shrink-0 whitespace-nowrap">
              {Math.round(Math.min(progress, 100))}%
            </span>
          </div>
          <MaintenanceMeter value={progress} tone={meterTone(progress)} />
        </div>

        <p className="text-muted-foreground border-border border-t pt-3 text-sm italic">
          {reason}
        </p>
      </CardContent>
    </Card>
  );
};

interface PredictiveMaintenanceCardProps {
  id: string;
  plateNumber: string;
  vehicleName: string;
  riskScore: number;
  priority: MaintenancePriority;
  reason: string;
  predictedDate?: string | null;
  kmSinceLastMaint?: number;
  avgDailyKm?: number;
}

/**
 * How likely this vehicle is to need unplanned work, and what is driving that.
 * Deliberately omits the mileage/due/last-service triplet — the preventive card
 * sitting beside it already carries those.
 */
export const PredictiveMaintenanceCard = ({
  id,
  plateNumber,
  vehicleName,
  riskScore,
  priority,
  reason,
  predictedDate,
  kmSinceLastMaint,
  avgDailyKm
}: PredictiveMaintenanceCardProps) => (
  <Card className="h-full">
    <CardContent className="space-y-4">
      <VehicleIdentity
        id={id}
        vehicleName={vehicleName}
        plateNumber={plateNumber}
        badge={
          <Badge variant={PRIORITY[priority].badge}>
            {PRIORITY[priority].riskLabel}
          </Badge>
        }
      />

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground truncate text-xs">
            Risk score
          </span>
          <span className="shrink-0 whitespace-nowrap">
            <span className="text-2xl leading-none font-semibold">
              {riskScore}
            </span>
            <span className="text-muted-foreground text-sm">/100</span>
          </span>
        </div>
        <MaintenanceMeter value={riskScore} tone={PRIORITY[priority].tone} />
      </div>

      <p className="text-ink-soft text-sm">{reason}</p>

      <div className="border-border space-y-2 border-t pt-3">
        <MaintenanceRow
          icon={Calendar}
          iconClassName="text-status-stop-fg"
          label="Predicted Service"
          value={formatMaintenanceDate(predictedDate)}
        />
        {kmSinceLastMaint !== undefined && (
          <MaintenanceRow
            icon={TrendingUp}
            label="Since Last Service"
            value={`${kmSinceLastMaint.toLocaleString()} km`}
          />
        )}
        {avgDailyKm !== undefined && (
          <MaintenanceRow
            icon={Activity}
            label="Avg Daily Usage"
            value={`${avgDailyKm.toLocaleString()} km/day`}
          />
        )}
      </div>
    </CardContent>
  </Card>
);
