import ListToolbar from '@/components/shared/list-toolbar';
import { matchesSearch } from '@mms/shared';
import ListSearchInput from '@/components/shared/list-search-input';
import TableFilters from '@/components/shared/table-filters';
import { useListControls } from '@/hooks/use-list-controls';
import EmptyState from '@/components/shared/empty-state';
import { useEffect, useState } from 'react';
import { useAllTripTickets } from '@/lib/query/trip-tickets';
import {
  useApproveEvpTripTicket,
  useDisapproveTripTicket
} from '@/lib/mutation/trip-tickets';
import { useAllJobOrders } from '@/lib/query/job-orders';
import { useApproveJobOrder } from '@/lib/mutation/job-orders';
import { useAllDrivers } from '@/lib/query/drivers';
import { useAllVehicles } from '@/lib/query/vehicles';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TRIP_TICKET_STATUS, JOB_ORDER_STATUS } from '@/lib/enums';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ApproveJobOrderModal } from '@/components/pages/job-order/job-order-inner/approve-job-order-modal';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import { formatRef } from '@/lib/utils/reference';

// A section heading: a signal dot and a tracked, uppercase label.
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-3 flex items-center gap-2">
    <span className="bg-signal size-2 rounded-full" />
    <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
      {children}
    </span>
  </div>
);

export default function ApprovalQueue({
  onCountChange
}: {
  onCountChange: (count: number) => void;
}) {
  const approveEvpTripTicket = useApproveEvpTripTicket();
  const disapproveTripTicket = useDisapproveTripTicket();
  const approveJobOrder = useApproveJobOrder();
  const [search, setSearch] = useState('');
  const { filters, setFilter, clearFilters, hasFilters } = useListControls([
    'pendingKind'
  ]);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'disapprove' | null>(
    null
  );
  const [disapprovedReason, setDisapprovedReason] = useState('');

  const { data: tripTicketsData, isLoading } = useAllTripTickets();
  const { data: jobOrdersData, isLoading: jobOrdersLoading } =
    useAllJobOrders();
  // People and vehicles are shown by name and plate — never by database id.
  const { data: drivers } = useAllDrivers();
  const { data: vehicles } = useAllVehicles();

  const getDriverName = (driverId: string | null | undefined) => {
    if (!driverId) return 'Not assigned';
    return drivers?.find((d) => d.id === driverId)?.full_name ?? 'Unknown';
  };

  const getVehicle = (vehicleId: string | null | undefined) =>
    vehicleId ? vehicles?.find((v) => v.id === vehicleId) : undefined;

  const handleApprove = (ticketId: string) => {
    setSelectedTicket(ticketId);
    setActionType('approve');
  };

  const handleDisapprove = (ticketId: string) => {
    setSelectedTicket(ticketId);
    setActionType('disapprove');
    setDisapprovedReason('');
  };

  const confirmApprove = () => {
    if (selectedTicket) {
      approveEvpTripTicket.mutate({ id: selectedTicket });
      setSelectedTicket(null);
      setActionType(null);
    }
  };

  const confirmDisapprove = () => {
    if (selectedTicket && disapprovedReason.trim()) {
      disapproveTripTicket.mutate({
        id: selectedTicket,
        reason: disapprovedReason
      });
      setSelectedTicket(null);
      setActionType(null);
      setDisapprovedReason('');
    }
  };

  const handleApproveJobOrder = (orderId: string) => {
    approveJobOrder.mutateAsync({ id: orderId }).catch(() => {
      // The mutation hook already surfaces the failure as a toast.
    });
  };

  const allPendingTickets =
    tripTicketsData?.filter(
      (t) => t.status === TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL
    ) ?? [];
  const allPendingJobOrders =
    jobOrdersData?.filter(
      (o) => o.status === JOB_ORDER_STATUS.ASSIGNED_MECHANIC
    ) ?? [];

  const pendingTickets = allPendingTickets.filter((ticket) => {
    const vehicle = getVehicle(ticket.vehicle_id);
    return (
      (!filters.pendingKind || filters.pendingKind === 'fuel') &&
      matchesSearch(search, [
        'Fuel sign-off Trip tickets',
        formatRef('TT', ticket.ticket_no),
        ticket.destination,
        ticket.purpose,
        ticket.allocation_fuel_type,
        getDriverName(ticket.driver_id),
        vehicle?.make,
        vehicle?.model,
        vehicle?.license_plate
      ])
    );
  });
  const pendingJobOrders = allPendingJobOrders.filter(
    (order) =>
      (!filters.pendingKind || filters.pendingKind === 'repair') &&
      matchesSearch(search, [
        'Repair sign-off Job orders',
        formatRef('JO', order.order_no),
        order.incident_details,
        order.vehicles?.make,
        order.vehicles?.model,
        order.vehicles?.license_plate,
        getDriverName(order.assigned_mechanic)
      ])
  );

  const loading = isLoading || jobOrdersLoading;
  const total = allPendingTickets.length + allPendingJobOrders.length;
  useEffect(() => {
    onCountChange(loading ? 0 : total);
  }, [loading, total, onCountChange]);

  return (
    <>
      <ListToolbar
        searchControl={
          <ListSearchInput
            value={search}
            onChange={setSearch}
            label="Search pending approvals"
          />
        }
        filterControl={
          <TableFilters
            filters={[
              {
                key: 'pendingKind',
                label: 'Request type',
                options: [
                  { value: 'fuel', label: 'Fuel · Trip ticket' },
                  { value: 'repair', label: 'Repair · Job order' }
                ]
              }
            ]}
            values={filters}
            onChange={setFilter}
            onClear={clearFilters}
          />
        }
      />
      {loading ? (
        <div className="mt-10 space-y-4">
          <Skeleton className="h-40 w-full rounded-[20px]" />
          <Skeleton className="h-40 w-full rounded-[20px]" />
        </div>
      ) : (
        <>
          {/* ---------- Fuel sign-off ---------- */}
          {pendingTickets.length > 0 && (
            <section className="mt-6">
              <SectionLabel>
                Fuel sign-off · Trip tickets ({pendingTickets.length})
              </SectionLabel>
              <div className="flex flex-col gap-4">
                {pendingTickets.map((ticket) => {
                  const vehicle = getVehicle(ticket.vehicle_id);
                  return (
                    <article
                      key={ticket.id}
                      className="bg-card border-border flex flex-wrap items-center gap-5 rounded-[20px] border p-6"
                    >
                      <div className="min-w-[230px] flex-1">
                        <div className="text-muted-foreground font-mono text-xs">
                          {formatRef('TT', ticket.ticket_no)}
                        </div>
                        <h3 className="mt-1 text-lg font-semibold tracking-tight">
                          {ticket.destination}
                        </h3>
                        <p className="text-slate mt-1.5 text-sm leading-relaxed">
                          {ticket.purpose}
                          {vehicle && (
                            <>
                              <br />
                              {vehicle.make} {vehicle.model} ·{' '}
                              <span className="font-mono text-xs">
                                {vehicle.license_plate}
                              </span>
                            </>
                          )}
                          {ticket.driver_id && (
                            <> · driver {getDriverName(ticket.driver_id)}</>
                          )}
                        </p>
                      </div>

                      <div className="flex-none text-right">
                        <div className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                          Fuel budget
                        </div>
                        <div className="text-2xl font-medium tracking-tight">
                          {ticket.allocation_liters} L
                        </div>
                        {ticket.allocation_fuel_type && (
                          <div className="text-slate mt-0.5 text-xs capitalize">
                            {ticket.allocation_fuel_type}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-none gap-2.5">
                        <Button
                          onClick={() => handleApprove(ticket.id)}
                          disabled={approveEvpTripTicket.isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          title="A reason is required"
                          onClick={() => handleDisapprove(ticket.id)}
                          disabled={disapproveTripTicket.isPending}
                        >
                          Decline
                        </Button>
                        <Button variant="ghost" size="icon" asChild>
                          <Link
                            to="/trip-tickets/$id"
                            params={{ id: ticket.id }}
                          >
                            <Eye />
                            <span className="sr-only">View trip ticket</span>
                          </Link>
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---------- Repair sign-off ---------- */}
          {pendingJobOrders.length > 0 && (
            <section className="mt-6">
              <SectionLabel>
                Repair sign-off · Job orders ({pendingJobOrders.length})
              </SectionLabel>
              <div className="flex flex-col gap-4">
                {pendingJobOrders.map((order) => (
                  <article
                    key={order.id}
                    className="bg-card border-border flex flex-wrap items-center gap-5 rounded-[20px] border p-6"
                  >
                    <div className="min-w-[230px] flex-1">
                      <div className="text-muted-foreground font-mono text-xs">
                        {formatRef('JO', order.order_no)}
                      </div>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight">
                        {order.incident_details ?? 'Repair'}
                        {order.vehicles && (
                          <>
                            {' — '}
                            {order.vehicles.make} {order.vehicles.model}{' '}
                            <span className="font-mono text-sm">
                              {order.vehicles.license_plate}
                            </span>
                          </>
                        )}
                      </h3>
                      <p className="text-slate mt-1.5 text-sm leading-relaxed">
                        Mechanic{' '}
                        <strong className="text-foreground font-semibold">
                          {getDriverName(order.assigned_mechanic)}
                        </strong>
                        {order.target_date && (
                          <>
                            {' '}
                            · target{' '}
                            {new Date(order.target_date).toLocaleDateString()}
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-none gap-2.5">
                      <ApproveJobOrderModal
                        onSubmit={() => handleApproveJobOrder(order.id)}
                        isLoading={approveJobOrder.isPending}
                      />
                      <Button variant="ghost" size="icon" asChild>
                        <Link to="/job-order/$id" params={{ id: order.id }}>
                          <Eye />
                          <span className="sr-only">View job order</span>
                        </Link>
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {total > 0 &&
            pendingTickets.length === 0 &&
            pendingJobOrders.length === 0 && (
              <div className="mt-6">
                <EmptyState
                  message="No pending approvals."
                  hasFilters={hasFilters}
                  onClearFilters={clearFilters}
                  search={search}
                  onClearSearch={() => setSearch('')}
                />
              </div>
            )}
          {total === 0 && (
            <div className="border-border text-muted-foreground mt-10 rounded-[20px] border border-dashed py-16 text-center">
              You&apos;re all caught up. Nothing is waiting on your sign-off.
            </div>
          )}
        </>
      )}

      <ConfirmationModal
        open={actionType === 'approve'}
        onOpenChange={() => setActionType(null)}
        title="Approve trip ticket"
        description="Approving releases the fuel budget and moves the ticket to its next stage."
        confirmLabel="Approve"
        loading={approveEvpTripTicket.isPending}
        onConfirm={confirmApprove}
        onCancel={() => {
          setSelectedTicket(null);
          setActionType(null);
        }}
      />

      <AlertDialog
        open={actionType === 'disapprove'}
        onOpenChange={() => setActionType(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline trip ticket</AlertDialogTitle>
            <AlertDialogDescription>
              The requester will see this reason, so make it useful.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="disapproved_reason">Reason for declining</Label>
            <Textarea
              id="disapproved_reason"
              value={disapprovedReason}
              onChange={(e) => setDisapprovedReason(e.target.value)}
              placeholder="e.g. Fuel budget exceeds the allowance for this route."
              className="mt-2"
              rows={4}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setActionType(null);
                setDisapprovedReason('');
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDisapprove}
              disabled={!disapprovedReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
