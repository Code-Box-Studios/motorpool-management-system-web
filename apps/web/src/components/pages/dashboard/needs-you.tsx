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
  search: Record<string, string>;
}

// These buttons used to open the record's DETAIL page, which is read-only — it
// names no approval and no assignment, so "Assign" landed the admin somewhere
// they could not assign and had to walk back to the list to find the row again.
// The controls live on the LIST pages (the job-order row's Note Job Order
// modal, the trip-ticket row's status menu), so that is where these go.
//
// Both lists order on the API's `status` column, and both statuses are Postgres
// enums declared in workflow order, so the state that is waiting on someone is
// the first value of each — `pending` for job orders, `pending_admin_approval`
// for trip tickets. Ascending therefore floats exactly the rows this panel
// names to the top of page 1, riding the ?sortBy/?sortOrder params the list
// pages already read through useListControls — nothing new has to exist there.
// It sorts, it does not filter: past the ten rows a page holds, the rest of
// the waiting work is a page away, and the ref column is how you spot a row.
const WAITING_FIRST = { sortBy: 'status', sortOrder: 'asc' };

/**
 * The first thing an admin should see is not a number — it is the list of
 * things that will not move until a human touches them. Trips waiting to be
 * approved, repairs waiting for a mechanic. Each row hands off to the list page
 * that owns the action, sorted so the waiting work is what loads first.
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
        // Named for where it lands: the Trip Tickets table, whose status pill
        // is the menu carrying Approve and allocate fuel / Disapprove.
        actionLabel: 'Review in Trip Tickets',
        to: '/trip-tickets',
        search: WAITING_FIRST
      })),
    ...(jobOrders ?? [])
      .filter((o) => o.status === JOB_ORDER_STATUS.PENDING)
      .map((o) => ({
        key: `job-${o.id}`,
        ref: formatRef('JO', o.order_no),
        title: `Assign mechanic — ${o.incident_details ?? 'repair'}`,
        subtitle: vehicleLabel(o.vehicle_id),
        status: o.status ?? '',
        // The Job Orders table's row action for a pending order is "Note Job
        // Order" — the modal that picks the mechanic, so the assignment really
        // does happen at the other end of this button.
        actionLabel: 'Assign in Job Orders',
        to: '/job-order',
        search: WAITING_FIRST
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
        <ul className="mt-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="border-border flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t py-3.5"
            >
              {/* Fixed measure so the refs read as a column, not a ragged edge. */}
              <span className="text-ink-soft min-w-16 flex-none font-mono text-sm whitespace-nowrap">
                {item.ref}
              </span>
              <div className="min-w-[180px] flex-1">
                <div className="leading-snug font-semibold">{item.title}</div>
                <div className="text-slate text-xs">{item.subtitle}</div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <StatusBadge status={item.status} />
                <Button size="sm" asChild>
                  <Link to={item.to} search={item.search}>
                    {item.actionLabel}
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default NeedsYou;
