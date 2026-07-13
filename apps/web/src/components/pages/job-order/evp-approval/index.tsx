import { useState } from 'react';
import { useTripTickets } from '@/lib/query/trip-tickets';
import {
  useApproveEvpTripTicket,
  useDisapproveTripTicket
} from '@/lib/mutation/trip-tickets';
import { useJobOrders } from '@/lib/query/job-orders';
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

/**
 * The EVP's entire job is one question: what needs my sign-off? So this is a
 * queue, not a dashboard — no navigation rail, no tables to scroll sideways.
 * Each item is a card that states the decision and its two outcomes.
 */
export default function EvpApprovalPage() {
  const approveEvpTripTicket = useApproveEvpTripTicket();
  const disapproveTripTicket = useDisapproveTripTicket();
  const approveJobOrder = useApproveJobOrder();
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'disapprove' | null>(
    null
  );
  const [disapprovedReason, setDisapprovedReason] = useState('');

  const { data: tripTicketsData, isLoading } = useTripTickets(1, 100);
  const { data: jobOrdersData, isLoading: jobOrdersLoading } = useJobOrders(
    1,
    100
  );
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

  const pendingTickets =
    tripTicketsData?.data?.filter(
      (t) => t.status === TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL
    ) ?? [];
  const pendingJobOrders =
    jobOrdersData?.data?.filter(
      (o) => o.status === JOB_ORDER_STATUS.ASSIGNED_MECHANIC
    ) ?? [];

  const loading = isLoading || jobOrdersLoading;
  const total = pendingTickets.length + pendingJobOrders.length;

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-8 md:px-6 md:py-12">
      <SectionLabel>Awaiting your sign-off</SectionLabel>

      {loading ? (
        <Skeleton className="h-12 w-72" />
      ) : (
        <h1 className="text-3xl font-medium tracking-tight md:text-[44px] md:leading-[1.05]">
          {total === 0
            ? 'Nothing needs you'
            : `${total} thing${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} you`}
        </h1>
      )}
      <p className="text-slate mt-2 text-base">
        Fuel budgets and repair sign-offs. Declining always asks for a reason.
      </p>

      {loading ? (
        <div className="mt-10 space-y-4">
          <Skeleton className="h-40 w-full rounded-[20px]" />
          <Skeleton className="h-40 w-full rounded-[20px]" />
        </div>
      ) : (
        <>
          {/* ---------- Fuel sign-off ---------- */}
          {pendingTickets.length > 0 && (
            <section className="mt-10">
              <SectionLabel>Fuel sign-off · Trip tickets</SectionLabel>
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
                        {formatRef('TT', ticket.id)}
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
                        <Link to="/trip-tickets/$id" params={{ id: ticket.id }}>
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
            <section className="mt-10">
              <SectionLabel>Repair sign-off · Job orders</SectionLabel>
              <div className="flex flex-col gap-4">
                {pendingJobOrders.map((order) => (
                  <article
                    key={order.id}
                    className="bg-card border-border flex flex-wrap items-center gap-5 rounded-[20px] border p-6"
                  >
                    <div className="min-w-[230px] flex-1">
                      <div className="text-muted-foreground font-mono text-xs">
                        {formatRef('JO', order.id)}
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
    </div>
  );
}
