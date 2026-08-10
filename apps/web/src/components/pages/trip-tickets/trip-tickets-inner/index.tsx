import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import { Controller } from 'react-hook-form';
import { useNavigate, useParams } from '@tanstack/react-router';
import QRCode from 'react-qr-code';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loading } from '@/components/ui/loader';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import {
  RecordHeader,
  DetailSection,
  DetailGrid,
  DetailItem
} from '@/components/shared/detail-view';
import { BorrowedBadge } from '@/components/shared/borrowed-badge';
import { isBorrowed } from '@/lib/borrowed';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';
import {
  useTripTicketUpdateForm,
  type UpdateTripTicketFormData
} from './actions';
import { FuelAllocationDialog, ReasonDialog } from '../transition-dialogs';
import { useTripTicket } from '@/lib/query/trip-tickets';
import {
  useApproveTripTicket,
  useCancelTripTicket,
  useDisapproveTripTicket,
  useUpdateTripTicket
} from '@/lib/mutation/trip-tickets';
import { useAllDrivers } from '@/lib/query/drivers';
import { useAllVehicles } from '@/lib/query/vehicles';
import { useBranches } from '@/lib/query/shared';
import { useDepartmentOffices } from '@/lib/query/offices';
import { useAdmins, useAllUsers } from '@/lib/query/user-management';
import { useAuth } from '@/hooks/use-auth';
import { useUserRole } from '@/hooks/use-user-role';
import { useBreadcrumbLabel } from '@/hooks/use-breadcrumb';
import { formatRef } from '@/lib/utils/reference';
import { FUEL_TYPE, TRIP_TICKET_STATUS } from '@/lib/enums';

// A date-only column ('YYYY-MM-DD') parses as UTC midnight, which renders as the
// previous day west of Greenwich — pin it to local time before formatting.
const dateOf = (value: string | null | undefined) => {
  if (!value) return undefined;
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value
  );
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
};

const dateTimeOf = (value: string | null | undefined) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
};

const sentenceCase = (value: string | null | undefined) =>
  value
    ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
    : undefined;

const TripTicketsInner = () => {
  const { id } = useParams({ from: '/_authenticated/trip-tickets/$id' });
  const tripTicketId = id;

  const { data: tripTicket } = useTripTicket(tripTicketId);
  // Unpaginated: this ticket's vehicle/driver may sit past any page, and the
  // pickers have to be able to offer every one of them.
  const { data: drivers, isPending: driversLoading } = useAllDrivers();
  const { data: vehicles, isPending: vehiclesLoading } = useAllVehicles();
  const { data: branches, isPending: branchesLoading } = useBranches();
  const { data: offices } = useDepartmentOffices();
  const { data: admins } = useAdmins();
  const { data: allUsers } = useAllUsers();
  const { user } = useAuth();
  const { data: userRole } = useUserRole();
  const updateTripTicket = useUpdateTripTicket();
  const approveTripTicket = useApproveTripTicket();
  const disapproveTripTicket = useDisapproveTripTicket();
  const cancelTripTicket = useCancelTripTicket();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [participants, setParticipants] = useState<string[]>(['']);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] =
    useState<UpdateTripTicketFormData | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [disapproveOpen, setDisapproveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const form = useTripTicketUpdateForm();

  useBreadcrumbLabel(
    tripTicket ? formatRef('TT', tripTicket.ticket_no) : undefined
  );

  const resetFromTicket = useCallback(() => {
    if (!tripTicket) return;

    // Initialize participants from trip ticket
    if (tripTicket.participants && Array.isArray(tripTicket.participants)) {
      setParticipants(
        tripTicket.participants.length > 0 ? tripTicket.participants : ['']
      );
    } else if (typeof tripTicket.participants === 'string') {
      const participantsList = (tripTicket.participants as string)
        .split(',')
        .map((p: string) => p.trim())
        .filter((p: string) => p);
      setParticipants(participantsList.length > 0 ? participantsList : ['']);
    }

    const startDateTime = tripTicket.start_ts
      ? tripTicket.start_ts.slice(0, 16)
      : '';
    const endDateTime = tripTicket.end_ts ? tripTicket.end_ts.slice(0, 16) : '';

    form.reset({
      vehicle_id: tripTicket.vehicle_id,
      driver_id: tripTicket.driver_id,
      branch_id: tripTicket.branch_id,
      requested_by: tripTicket.requested_by || tripTicket.prepared_by,
      destination: tripTicket.destination,
      purpose: tripTicket.purpose,
      date_requested: tripTicket.date_requested,
      start_ts: startDateTime,
      end_ts: endDateTime,
      status: tripTicket.status || 'pending_admin_approval',
      pre_trip_guard: tripTicket.pre_trip_guard || '',
      post_trip_guard: tripTicket.post_trip_guard || '',
      remarks: tripTicket.remarks || '',
      cancellation_reason: tripTicket.cancellation_reason || '',
      disapproved_reason: tripTicket.disapproved_reason || '',
      participants: tripTicket.participants
        ? tripTicket.participants.join(', ')
        : '',
      office_id: tripTicket.office_id || '',
      office_head_id: tripTicket.office_head_id || '',
      allocation_date: tripTicket.allocation_date || '',
      allocation_trip_to: tripTicket.allocation_trip_to || '',
      allocation_purpose: tripTicket.allocation_purpose || '',
      allocation_vehicle_id: tripTicket.allocation_vehicle_id || '',
      allocation_fuel_type: tripTicket.allocation_fuel_type || '',
      allocation_approved_by_evp_operations:
        tripTicket.allocation_approved_by_evp_operations || ''
    });
  }, [tripTicket, form]);

  useEffect(() => {
    resetFromTicket();
  }, [resetFromTicket]);

  const onSubmit = (data: UpdateTripTicketFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmUpdate = () => {
    if (tripTicket && pendingData) {
      const updates = { ...pendingData } as Record<string, unknown>;
      if (pendingData.participants) {
        updates.participants = pendingData.participants
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
      }

      updateTripTicket.mutate(
        {
          id: tripTicket.id,
          updates
        },
        {
          onSuccess: () => {
            setIsEditing(false);
            setShowConfirm(false);
            setPendingData(null);
            navigate({ to: '/trip-tickets' });
          }
        }
      );
    }
  };

  const handleCancelEdit = () => {
    resetFromTicket();
    setIsEditing(false);
  };

  if (!tripTicket) return <Loading />;

  // Ids are database keys: a person gets the name behind the id, or nothing.
  const personName = (userId: string | null | undefined) => {
    if (!userId) return undefined;
    const person =
      allUsers?.find((user) => user.id === userId) ??
      admins?.find((admin) => admin.id === userId);
    return person?.full_name || undefined;
  };

  const vehicleOf = (vehicleId: string | null | undefined) =>
    vehicleId ? vehicles?.find((v) => v.id === vehicleId) : undefined;

  const vehicle = vehicleOf(tripTicket.vehicle_id);
  const vehicleName = vehiclesLoading
    ? 'Loading...'
    : vehicle && `${vehicle.make} ${vehicle.model}`;

  // A branch may borrow another branch's van when it needs to — that is allowed.
  // But the person approving this trip is the one sanctioning the borrow, and
  // until now nothing on this page told them it was one: the vehicle read the
  // same whether it belonged to the branch or not.
  const borrowedFrom = isBorrowed(tripTicket.branch_id, vehicle?.branch)
    ? (vehicle?.branch_name ?? 'another branch')
    : null;

  const allocationVehicle = vehicleOf(tripTicket.allocation_vehicle_id);

  const driverName = driversLoading
    ? 'Loading...'
    : drivers?.find((d) => d.id === tripTicket.driver_id)?.full_name;

  const branchName = branchesLoading
    ? 'Loading...'
    : branches?.find((b) => b.id === tripTicket.branch_id)?.name;

  const officeName = offices?.find((o) => o.id === tripTicket.office_id)?.name;

  const requestedByName = personName(
    tripTicket.requested_by || tripTicket.prepared_by
  );

  const participantNames = (
    Array.isArray(tripTicket.participants)
      ? tripTicket.participants
      : String(tripTicket.participants ?? '').split(',')
  )
    .map((p) => p.trim())
    .filter(Boolean);

  // The allocation is created by the admin's approval; until then there is no
  // record to show — not an empty one waiting to be filled in.
  const hasAllocation = Boolean(
    tripTicket.fuel_allocation_id ||
      tripTicket.allocation_date ||
      tripTicket.allocation_trip_to ||
      tripTicket.allocation_purpose ||
      tripTicket.allocation_vehicle_id ||
      tripTicket.allocation_fuel_type
  );

  const metaParts: ReactNode[] = [
    vehicleName,
    vehicle?.license_plate ? (
      <span className="font-mono">{vehicle.license_plate}</span>
    ) : null,
    driverName
  ].filter(Boolean);

  // Opening a ticket used to be a dead end: the page named its status and gave
  // no way to move it, so an admin who came here to decide had to go back to
  // the list to do it. The decisions belong on the record you are reading.
  //
  // What is offered mirrors the server's transitions (api transitions.ts) —
  // both the allowed-from sets and cancel's rule that the actor is an admin or
  // the requester who owns the ticket (`requestedById`, which is why
  // `prepared_by` is not a fallback here). A terminal ticket offers nothing.
  const isAdmin = userRole?.roles?.name?.toLowerCase() === 'admin';
  const isOwner = Boolean(user?.id && tripTicket.requested_by === user.id);
  const status = tripTicket.status || TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL;
  const canApprove =
    isAdmin && status === TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL;
  const canDisapprove =
    isAdmin &&
    (status === TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL ||
      status === TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL);
  const canCancel =
    (isAdmin || isOwner) &&
    (status === TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL ||
      status === TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL ||
      status === TRIP_TICKET_STATUS.APPROVED);
  const transitionPending =
    approveTripTicket.isPending ||
    disapproveTripTicket.isPending ||
    cancelTripTicket.isPending;

  return (
    <div>
      <RecordHeader
        reference={formatRef('TT', tripTicket.ticket_no)}
        title={tripTicket.destination}
        status={tripTicket.status}
        meta={
          metaParts.length > 0
            ? metaParts.map((part, index) => (
                <Fragment key={index}>
                  {index > 0 && ' · '}
                  {part}
                </Fragment>
              ))
            : undefined
        }
        backTo="/trip-tickets"
        backLabel="Trip Tickets"
        actions={
          canApprove || canDisapprove || canCancel ? (
            <>
              {canApprove && (
                <Button
                  onClick={() => setApproveOpen(true)}
                  disabled={transitionPending}
                >
                  Approve and allocate fuel
                </Button>
              )}
              {canDisapprove && (
                // A normal decision in the approval chain, not a destructive
                // one — red is reserved for cancel, which discards the request.
                <Button
                  variant="outline"
                  onClick={() => setDisapproveOpen(true)}
                  disabled={transitionPending}
                >
                  Disapprove
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="destructive"
                  onClick={() => setCancelOpen(true)}
                  disabled={transitionPending}
                >
                  Cancel trip ticket
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {isEditing ? (
        <form id="edit-trip-ticket-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FormLayout>
            <FormSection
              title="Trip"
              description="Who is going where, and when."
            >
              <div className="flex flex-col gap-5">
                <FormRow>
                  <Controller
                    name="vehicle_id"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="vehicle_id">Vehicle *</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!isEditing}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a vehicle" />
                          </SelectTrigger>
                          <SelectContent>
                            {vehiclesLoading ? (
                              <SelectItem value="loading" disabled>
                                Loading vehicles...
                              </SelectItem>
                            ) : (
                              vehicles
                                ?.filter(
                                  (v) =>
                                    v.status === 'available' ||
                                    v.id === tripTicket.vehicle_id
                                )
                                .map((v) => (
                                  <SelectItem key={v.id} value={v.id}>
                                    {v.make} {v.model} - {v.license_plate}
                                  </SelectItem>
                                ))
                            )}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="driver_id"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="driver_id">Driver *</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!isEditing}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a driver" />
                          </SelectTrigger>
                          <SelectContent>
                            {driversLoading ? (
                              <SelectItem value="loading" disabled>
                                Loading drivers...
                              </SelectItem>
                            ) : (
                              drivers
                                ?.filter(
                                  (driver) =>
                                    driver.status === 'active' ||
                                    driver.id === tripTicket.driver_id
                                )
                                .map((driver) => (
                                  <SelectItem key={driver.id} value={driver.id}>
                                    {driver.full_name}
                                  </SelectItem>
                                ))
                            )}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FormRow>

                <FormRow>
                  <Controller
                    name="branch_id"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="branch_id">Branch *</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!isEditing}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a branch" />
                          </SelectTrigger>
                          <SelectContent>
                            {branchesLoading ? (
                              <SelectItem value="loading" disabled>
                                Loading branches...
                              </SelectItem>
                            ) : (
                              branches?.map((branch) => (
                                <SelectItem key={branch.id} value={branch.id}>
                                  {branch.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="requested_by"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="requested_by">
                          Requested By *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="requested_by"
                          type="text"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter preparer name"
                          disabled={!isEditing}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FormRow>

                <FormRow>
                  <Controller
                    name="destination"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="destination">
                          Destination *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="destination"
                          type="text"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter destination"
                          disabled={!isEditing}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="date_requested"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="date_requested">
                          Date Requested *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="date_requested"
                          type="date"
                          aria-invalid={fieldState.invalid}
                          disabled={!isEditing}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FormRow>

                <FormRow>
                  <Controller
                    name="start_ts"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="start_ts">
                          Start Date & Time *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="start_ts"
                          type="datetime-local"
                          aria-invalid={fieldState.invalid}
                          disabled={!isEditing}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="end_ts"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="end_ts">
                          End Date & Time *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="end_ts"
                          type="datetime-local"
                          aria-invalid={fieldState.invalid}
                          disabled={!isEditing}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FormRow>

                <FormRow>
                  <Controller
                    name="pre_trip_guard"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="pre_trip_guard">
                          Pre-Trip Guard
                        </FieldLabel>
                        <Input
                          {...field}
                          id="pre_trip_guard"
                          type="text"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter guard name"
                          disabled={!isEditing}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="post_trip_guard"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="post_trip_guard">
                          Post-Trip Guard
                        </FieldLabel>
                        <Input
                          {...field}
                          id="post_trip_guard"
                          type="text"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter guard name"
                          disabled={!isEditing}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FormRow>

                <Controller
                  name="participants"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="participants">
                        Participants
                      </FieldLabel>
                      <div className="space-y-2">
                        {participants.map((participant, index) => (
                          <div key={index} className="flex gap-2">
                            <Input
                              value={participant}
                              onChange={(e) => {
                                const newParticipants = [...participants];
                                newParticipants[index] = e.target.value;
                                setParticipants(newParticipants);
                                // Update form value as comma-separated string
                                field.onChange(
                                  newParticipants
                                    .filter((p) => p.trim())
                                    .join(', ')
                                );
                              }}
                              placeholder={`Participant ${index + 1} name`}
                              disabled={!isEditing}
                            />
                          </div>
                        ))}
                      </div>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="purpose"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="purpose">Purpose *</FieldLabel>
                      <Textarea
                        {...field}
                        id="purpose"
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter trip purpose"
                        disabled={!isEditing}
                        rows={3}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="remarks"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="remarks">Remarks</FieldLabel>
                      <Textarea
                        {...field}
                        id="remarks"
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter any remarks"
                        disabled={!isEditing}
                        rows={3}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="cancellation_reason"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="cancellation_reason">
                        Cancellation Reason
                        {tripTicket.status === TRIP_TICKET_STATUS.CANCELLED &&
                          ' *'}
                      </FieldLabel>
                      <Textarea
                        {...field}
                        id="cancellation_reason"
                        aria-invalid={fieldState.invalid}
                        placeholder="Reason for cancellation"
                        disabled={!isEditing}
                        rows={2}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="disapproved_reason"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="disapproved_reason">
                        Disapproval Reason
                        {tripTicket.status === TRIP_TICKET_STATUS.DISAPPROVED &&
                          ' *'}
                      </FieldLabel>
                      <Textarea
                        {...field}
                        id="disapproved_reason"
                        aria-invalid={fieldState.invalid}
                        placeholder="Reason for disapproval"
                        disabled={!isEditing}
                        rows={2}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>
            </FormSection>

            <FormSection
              title="Fuel Allocation"
              description="Fuel allocation details for this trip ticket."
            >
              <div className="flex flex-col gap-5">
                <FormRow>
                  <Controller
                    name="allocation_date"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="allocation_date">
                          Allocation Date *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="allocation_date"
                          type="date"
                          aria-invalid={fieldState.invalid}
                          disabled={!isEditing}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="allocation_trip_to"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="allocation_trip_to">
                          Trip To *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="allocation_trip_to"
                          type="text"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter destination"
                          disabled={!isEditing}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FormRow>

                <FormRow>
                  <Controller
                    name="allocation_vehicle_id"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="allocation_vehicle_id">
                          Allocation Vehicle *
                        </FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!isEditing}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a vehicle" />
                          </SelectTrigger>
                          <SelectContent>
                            {vehiclesLoading ? (
                              <SelectItem value="loading" disabled>
                                Loading vehicles...
                              </SelectItem>
                            ) : (
                              vehicles
                                ?.filter(
                                  (v) =>
                                    v.status === 'available' ||
                                    v.id === tripTicket.allocation_vehicle_id
                                )
                                .map((v) => (
                                  <SelectItem key={v.id} value={v.id}>
                                    {v.make} {v.model} - {v.license_plate}
                                  </SelectItem>
                                ))
                            )}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="allocation_fuel_type"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="allocation_fuel_type">
                          Fuel Type *
                        </FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!isEditing}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select fuel type" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(FUEL_TYPE).map((fuel) => (
                              <SelectItem key={fuel} value={fuel}>
                                {sentenceCase(fuel)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FormRow>

                <Controller
                  name="allocation_approved_by_evp_operations"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="allocation_approved_by_evp_operations">
                        Approved By EVP Operations
                      </FieldLabel>
                      <Input
                        {...field}
                        id="allocation_approved_by_evp_operations"
                        type="text"
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter approver name"
                        disabled={!isEditing}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="allocation_purpose"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="allocation_purpose">
                        Allocation Purpose *
                      </FieldLabel>
                      <Textarea
                        {...field}
                        id="allocation_purpose"
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter allocation purpose"
                        rows={3}
                        disabled={!isEditing}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>
            </FormSection>

            <FormActions>
              <Button
                type="submit"
                form="edit-trip-ticket-form"
                disabled={updateTripTicket.isPending}
              >
                {updateTripTicket.isPending
                  ? 'Updating...'
                  : 'Update Trip Ticket'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEdit}
                disabled={updateTripTicket.isPending}
              >
                Cancel
              </Button>
            </FormActions>
          </FormLayout>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <DetailSection title="Trip">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <DetailGrid className="min-w-0 flex-1">
                <DetailItem
                  label="Vehicle"
                  value={
                    vehicleName && (
                      <span className="flex flex-wrap items-center gap-2">
                        {vehicleName}
                        {borrowedFrom && <BorrowedBadge from={borrowedFrom} />}
                      </span>
                    )
                  }
                />
                <DetailItem label="Plate" value={vehicle?.license_plate} mono />
                <DetailItem label="Driver" value={driverName} />
                <DetailItem label="Branch" value={branchName} />
                <DetailItem label="Office" value={officeName} />
                <DetailItem label="Requested By" value={requestedByName} />
                <DetailItem
                  label="Destination"
                  value={tripTicket.destination}
                />
                <DetailItem
                  label="Date Requested"
                  value={dateOf(tripTicket.date_requested)}
                />
                <DetailItem
                  label="Start"
                  value={dateTimeOf(tripTicket.start_ts)}
                />
                <DetailItem label="End" value={dateTimeOf(tripTicket.end_ts)} />
                <DetailItem
                  label="Pre-Trip Guard"
                  value={personName(tripTicket.pre_trip_guard)}
                />
                <DetailItem
                  label="Post-Trip Guard"
                  value={personName(tripTicket.post_trip_guard)}
                />
                <DetailItem
                  label="Participants"
                  wide
                  value={
                    participantNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {participantNames.map((name) => (
                          <Badge key={name} variant="outline">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ) : undefined
                  }
                />
                <DetailItem label="Purpose" value={tripTicket.purpose} wide />
                <DetailItem label="Remarks" value={tripTicket.remarks} wide />
                {tripTicket.status === TRIP_TICKET_STATUS.CANCELLED && (
                  <DetailItem
                    label="Cancellation Reason"
                    value={tripTicket.cancellation_reason}
                    wide
                  />
                )}
                {tripTicket.status === TRIP_TICKET_STATUS.DISAPPROVED && (
                  <DetailItem
                    label="Disapproval Reason"
                    value={tripTicket.disapproved_reason}
                    wide
                  />
                )}
              </DetailGrid>

              <aside className="border-border flex shrink-0 flex-col items-center gap-3 rounded-xl border p-4 lg:w-52">
                <div className="bg-background rounded-md p-2">
                  <QRCode value={tripTicket.id} size={128} />
                </div>
                <p className="text-muted-foreground text-center text-xs">
                  Gate pass — the guard scans this at check-out and check-in.
                </p>
              </aside>
            </div>
          </DetailSection>

          <DetailSection
            title="Fuel Allocation"
            description={
              hasAllocation
                ? 'Fuel allocation details for this trip ticket.'
                : undefined
            }
          >
            {hasAllocation ? (
              <DetailGrid>
                <DetailItem
                  label="Allocation Date"
                  value={dateOf(tripTicket.allocation_date)}
                />
                <DetailItem
                  label="Trip To"
                  value={tripTicket.allocation_trip_to}
                />
                <DetailItem
                  label="Allocation Vehicle"
                  value={
                    allocationVehicle &&
                    `${allocationVehicle.make} ${allocationVehicle.model}`
                  }
                />
                <DetailItem
                  label="Allocation Plate"
                  value={allocationVehicle?.license_plate}
                  mono
                />
                <DetailItem
                  label="Fuel Type"
                  value={sentenceCase(tripTicket.allocation_fuel_type)}
                />
                <DetailItem
                  label="Liters"
                  value={`${tripTicket.allocation_liters} L`}
                />
                <DetailItem
                  label="Approved By EVP Operations"
                  value={personName(
                    tripTicket.allocation_approved_by_evp_operations
                  )}
                />
                <DetailItem
                  label="Allocation Purpose"
                  value={tripTicket.allocation_purpose}
                  wide
                />
              </DetailGrid>
            ) : (
              <p className="text-muted-foreground text-sm">
                No fuel allocation yet — it is set when an admin approves this
                trip ticket.
              </p>
            )}
          </DetailSection>
        </div>
      )}

      {/* The same dialogs the list opens from its status menu — the wording of
          a decision must not depend on which screen it was taken from. Each
          mutation refetches this ticket, so the header's actions follow the
          status they just moved it to. */}
      <FuelAllocationDialog
        open={approveOpen}
        ticket={tripTicket}
        onOpenChange={setApproveOpen}
        isLoading={approveTripTicket.isPending}
        onConfirm={(allocation) =>
          approveTripTicket.mutate({ id: tripTicket.id, ...allocation })
        }
      />

      <ReasonDialog
        open={disapproveOpen}
        onOpenChange={setDisapproveOpen}
        title="Disapprove Trip Ticket"
        description="Please provide a reason for disapproving this trip ticket."
        label="Disapproved Reason *"
        placeholder="Enter reason for disapproval"
        confirmLabel="Confirm Disapproval"
        isLoading={disapproveTripTicket.isPending}
        onConfirm={(reason) =>
          disapproveTripTicket.mutate({ id: tripTicket.id, reason })
        }
      />

      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel Trip Ticket"
        description="Please provide a reason for cancelling this trip ticket."
        label="Cancellation Reason *"
        placeholder="Enter reason for cancellation..."
        confirmLabel="Confirm Cancellation"
        isLoading={cancelTripTicket.isPending}
        onConfirm={(reason) =>
          cancelTripTicket.mutate({ id: tripTicket.id, reason })
        }
      />

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Update Trip Ticket"
        description="Are you sure you want to save these changes to the trip ticket?"
        confirmLabel="Update Trip Ticket"
        loading={updateTripTicket.isPending}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
};

export default TripTicketsInner;
