import { useListControls } from '@/hooks/use-list-controls';
import EmptyState from '@/components/shared/empty-state';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { matchesSearch } from '@mms/shared';
import { useAuth } from '@/hooks/use-auth';
import { useAllVehicles } from '@/lib/query/vehicles';
import { useAllDrivers } from '@/lib/query/drivers';
import { useAllTripTickets } from '@/lib/query/trip-tickets';
import { useCancelTripTicket } from '@/lib/mutation/trip-tickets';
import { resolveStatus } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import ListToolbar from '@/components/shared/list-toolbar';
import ListSearchInput from '@/components/shared/list-search-input';
import TableFilters from '@/components/shared/table-filters';
import TablePagination from '@/components/shared/table-pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RequestCard from './request-card';
import { AddTripTicket } from '../add-trip-ticket/form';
import { ReasonDialog } from '../transition-dialogs';
import { formatRef } from '@/lib/utils/reference';
import type { TripTicket } from '@/lib/types';

const WAITING = ['pending_admin_approval', 'pending_fuel_allocation_approval'];
const CANCELLABLE = [...WAITING, 'approved'];
const ACTIVE_TAB =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground dark:data-[state=active]:border-primary';

function RequestList({
  title,
  tickets,
  vehicleLabel,
  driverLabel,
  onCancel,
  history = false
}: {
  title: string;
  tickets: TripTicket[];
  vehicleLabel: (id: string) => string;
  driverLabel: (id: string) => string;
  onCancel: (id: string) => void;
  history?: boolean;
}) {
  const controls = useListControls(['requestStatus']);
  const navigate = useNavigate();
  const [localSearch, setLocalSearch] = useState('');
  const [localStatus, setLocalStatus] = useState('');
  const [localPage, setLocalPage] = useState(1);
  const search = history ? controls.search : localSearch;
  const status = history ? (controls.filters.requestStatus ?? '') : localStatus;
  const page = history ? controls.page : localPage;
  const setSearch = history ? controls.setSearch : setLocalSearch;
  const setStatus = history
    ? (value: string) => {
        void navigate({
          to: '.',
          search: (previous: Record<string, unknown>) => ({
            ...previous,
            requestTab: 'history',
            requestStatus: value || undefined,
            page: undefined
          }),
          replace: true,
          resetScroll: false
        });
      }
    : setLocalStatus;
  const setPage = history ? controls.setPage : setLocalPage;
  const filtered = tickets.filter(
    (ticket) =>
      (!status || ticket.status === status) &&
      matchesSearch(search, [
        formatRef('TT', ticket.ticket_no),
        ticket.destination,
        ticket.purpose,
        vehicleLabel(ticket.vehicle_id),
        driverLabel(ticket.driver_id),
        resolveStatus(ticket.status ?? '').label
      ])
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages);
  const statuses = Object.values(TRIP_TICKET_STATUS)
    .filter((value) =>
      history ? !WAITING.includes(value) : WAITING.includes(value)
    )
    .map((value) => ({ value, label: resolveStatus(value).label }));
  return (
    <section className="min-w-0 space-y-5" aria-label={title}>
      <ListToolbar
        viewControl={
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {filtered.length} request{filtered.length === 1 ? '' : 's'}
          </p>
        }
        searchControl={
          <ListSearchInput
            key={history ? 'history-search' : 'waiting-search'}
            value={search}
            onChange={(value) => {
              setSearch(value);
              if (!history) setPage(1);
            }}
            label={`Search ${title.toLowerCase()}`}
          />
        }
        filterControl={
          <TableFilters
            filters={[
              {
                key: 'status',
                label: history ? 'Status' : 'Approval',
                options: statuses
              }
            ]}
            values={{ status }}
            onChange={(_key, value) => {
              setStatus(value);
              if (!history) setPage(1);
            }}
            onClear={() => {
              setStatus('');
              if (!history) setPage(1);
            }}
          />
        }
      />
      <div className="space-y-4">
        {filtered.slice((current - 1) * 10, current * 10).map((ticket) => (
          <RequestCard
            key={ticket.id}
            ticket={ticket}
            vehicle={vehicleLabel(ticket.vehicle_id)}
            driver={driverLabel(ticket.driver_id)}
            canCancel={CANCELLABLE.includes(ticket.status ?? '')}
            onCancel={onCancel}
          />
        ))}
        {filtered.length === 0 && (
          <div className="bg-card rounded-[20px]">
            <EmptyState
              message={
                history
                  ? 'No request history yet.'
                  : 'Nothing waiting on approval.'
              }
              search={search}
              onClearSearch={() => setSearch('')}
              hasFilters={Boolean(status)}
              onClearFilters={() => setStatus('')}
            />
          </div>
        )}
      </div>
      <TablePagination
        page={current}
        totalPages={pages}
        onPageChange={setPage}
      />
    </section>
  );
}

export default function RequesterDashboard() {
  const { user } = useAuth();
  const { filters, setFilter } = useListControls([
    'requestTab',
    'requestStatus'
  ]);
  const tab =
    filters.requestTab === 'history' ||
    (!filters.requestTab && filters.requestStatus)
      ? 'history'
      : 'waiting';
  const { data: tickets = [], isLoading, error } = useAllTripTickets(user?.id);
  const { data: vehicles = [] } = useAllVehicles();
  const { data: drivers = [] } = useAllDrivers();
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const cancel = useCancelTripTicket();
  const createTrigger = useRef<HTMLButtonElement | null>(null);
  const cancelTrigger = useRef<HTMLElement | null>(null);
  const startCancel = (id: string) => {
    cancelTrigger.current = document.activeElement as HTMLElement | null;
    setCancelling(id);
  };
  const waiting = tickets.filter((ticket) =>
    WAITING.includes(ticket.status ?? '')
  );
  const history = tickets.filter(
    (ticket) => !WAITING.includes(ticket.status ?? '')
  );
  const vehicleLabel = (id: string) => {
    const vehicle = vehicles.find((item) => item.id === id);
    return vehicle
      ? `${vehicle.make} ${vehicle.model} · ${vehicle.license_plate}`
      : 'Not assigned';
  };
  const driverLabel = (id: string) =>
    drivers.find((item) => item.id === id)?.full_name ?? 'Not assigned';
  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 space-y-6 md:py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span
              className="bg-signal size-2 rounded-full"
              aria-hidden="true"
            />
            <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
              Your trip requests
            </span>
          </div>
          <h1 className="text-3xl font-medium tracking-tight md:text-4xl">
            My requests
          </h1>
          <p className="text-muted-foreground mt-2">
            {waiting.length} request{waiting.length === 1 ? '' : 's'} waiting on
            approval.
          </p>
        </div>
        <Button
          ref={createTrigger}
          className="h-11"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          Request a trip
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : error ? (
        <p role="alert">Unable to load requests. {error.message}</p>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => setFilter('requestTab', value)}
          className="gap-0"
        >
          <TabsList className="h-auto">
            <TabsTrigger value="waiting" className={`${ACTIVE_TAB} h-11 px-4`}>
              Waiting{waiting.length > 0 ? ` (${waiting.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="history" className={`${ACTIVE_TAB} h-11 px-4`}>
              History
            </TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-6">
            <RequestList
              title={
                tab === 'waiting' ? 'Waiting on approval' : 'Request history'
              }
              history={tab === 'history'}
              tickets={tab === 'waiting' ? waiting : history}
              vehicleLabel={vehicleLabel}
              driverLabel={driverLabel}
              onCancel={startCancel}
            />
          </TabsContent>
        </Tabs>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className="sm:max-w-3xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            createTrigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Request Trip Ticket</DialogTitle>
            <DialogDescription>
              Submit a trip ticket request for admin approval.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {createOpen && (
              <AddTripTicket onDone={() => setCreateOpen(false)} />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <ReasonDialog
        returnFocusRef={cancelTrigger}
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        title="Cancel Trip Ticket"
        description="Provide a reason for cancelling this request."
        label="Cancellation Reason *"
        placeholder="Enter reason for cancellation..."
        cancelLabel="No, keep it"
        confirmLabel="Yes, cancel request"
        isLoading={cancel.isPending}
        onConfirm={(reason) => {
          if (cancelling)
            cancel.mutate(
              { id: cancelling, reason },
              { onSuccess: () => setCancelling(null) }
            );
        }}
      />
    </div>
  );
}
