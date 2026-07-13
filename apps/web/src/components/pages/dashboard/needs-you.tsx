import { Link } from '@tanstack/react-router';
import { useAllTripTickets } from '@/lib/query/trip-tickets';
import { useAllJobOrders } from '@/lib/query/job-orders';
import { useAllVehicles } from '@/lib/query/vehicles';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import StatusBadge from '@/components/shared/status-badge';
import { TRIP_TICKET_STATUS, JOB_ORDER_STATUS } from '@/lib/enums';
import { formatRef } from '@/lib/utils/reference';

interface AttentionItem {
  key: string;
  ref: string;
  title: string;
  subtitle: string;
  status: string;
  actionLabel: string;
  to: string;
  params: Record<string, string>;
}

/**
 * The first thing an admin should see is not a number — it is the list of
 * things that will not move until a human touches them. Trips waiting to be
 * approved, repairs waiting for a mechanic.
 */
const NeedsYou = () => {
  const { data: trips, isLoading: tripsLoading } = useAllTripTickets();
  const { data: jobOrders, isLoading: jobsLoading } = useAllJobOrders();
  const { data: vehicles } = useAllVehicles();

  const vehicleLabel = (vehicleId: string | null | undefined) => {
    const vehicle = vehicleId
      ? vehicles?.find((v) => v.id === vehicleId)
      : undefined;
    return vehicle
      ? `${vehicle.make} ${vehicle.model} · ${vehicle.license_plate}`
      : 'Vehicle unassigned';
  };

  const loading = tripsLoading || jobsLoading;

  const items: AttentionItem[] = [
    ...(trips ?? [])
      .filter((t) => t.status === TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL)
      .map((t) => ({
        key: `trip-${t.id}`,
        ref: formatRef('TT', t.ticket_no),
        title: `Trip approval — ${t.destination}`,
        subtitle: vehicleLabel(t.vehicle_id),
        status: t.status ?? '',
        actionLabel: 'Review',
        to: '/trip-tickets/$id',
        params: { id: t.id }
      })),
    ...(jobOrders ?? [])
      .filter((o) => o.status === JOB_ORDER_STATUS.PENDING)
      .map((o) => ({
        key: `job-${o.id}`,
        ref: formatRef('JO', o.order_no),
        title: `Assign mechanic — ${o.incident_details ?? 'repair'}`,
        subtitle: vehicleLabel(o.vehicle_id),
        status: o.status ?? '',
        actionLabel: 'Assign',
        to: '/job-order/$id',
        params: { id: o.id }
      }))
  ];

  return (
    <section className="bg-card border-border rounded-[20px] border p-5 md:p-6">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="bg-signal size-2 rounded-full" />
          <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
            Needs you
          </span>
        </div>
        {!loading && (
          <span className="text-muted-foreground text-sm">
            {items.length === 0 ? 'All clear' : `${items.length} waiting`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground py-6 text-sm">
          Nothing is waiting on you. Approvals and unassigned repairs land here.
        </p>
      ) : (
        <ul>
          {items.map((item) => (
            <li
              key={item.key}
              className="border-border flex flex-wrap items-center gap-3.5 border-t py-3.5"
            >
              <span className="text-ink-soft flex-none font-mono text-sm whitespace-nowrap">
                {item.ref}
              </span>
              <div className="min-w-[180px] flex-1">
                <div className="font-semibold">{item.title}</div>
                <div className="text-slate text-xs">{item.subtitle}</div>
              </div>
              <StatusBadge status={item.status} />
              <Button size="sm" asChild>
                <Link to={item.to} params={item.params}>
                  {item.actionLabel}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default NeedsYou;
