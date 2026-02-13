import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import {
  useTripTicketUpdateForm,
  type UpdateTripTicketFormData
} from './actions';
import { useTripTicket } from '@/lib/query/trip-tickets';
import { useUpdateTripTicket } from '@/lib/mutation/trip-tickets';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useDrivers } from '@/lib/query/drivers';
import { useVehicles } from '@/lib/query/vehicles';
import { useBranches } from '@/lib/query/shared';
import { useAdmins, useAllUsers } from '@/lib/query/user-management';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { FUEL_TYPE, TRIP_TICKET_STATUS } from '@/lib/enums';
import { Textarea } from '@/components/ui/textarea';
import { Loading } from '@/components/ui/loader';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';

const TripTicketsInner = () => {
  const { id } = useParams({ from: '/_authenticated/trip-tickets/$id' });
  const tripTicketId = id;

  const { data: tripTicket } = useTripTicket(tripTicketId);
  const { data: drivers, isPending: driversLoading } = useDrivers(1, 100);
  const { data: vehicles, isPending: vehiclesLoading } = useVehicles(1, 100);
  const { data: branches, isPending: branchesLoading } = useBranches();
  const { data: admins, isPending: adminsLoading } = useAdmins();
  const { data: allUsers } = useAllUsers();
  const updateTripTicket = useUpdateTripTicket();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [participants, setParticipants] = useState<string[]>(['']);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] =
    useState<UpdateTripTicketFormData | null>(null);

  const form = useTripTicketUpdateForm();

  const getGuardName = (guardId: string | undefined) => {
    if (!guardId) return 'Not assigned';
    const guard = allUsers?.find((user) => user.id === guardId);
    return guard?.full_name || guardId;
  };

  useEffect(() => {
    if (tripTicket) {
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
      const endDateTime = tripTicket.end_ts
        ? tripTicket.end_ts.slice(0, 16)
        : '';

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
    }
  }, [tripTicket, form]);

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

  if (!tripTicket) return <Loading />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trip Ticket Details</h1>
      </div>

      <form
        className="flex flex-col justify-center"
        id="edit-trip-ticket-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="grid grid-cols-2 gap-11">
            {isEditing ? (
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
                          vehicles?.data
                            ?.filter(
                              (vehicle) =>
                                vehicle.status === 'available' ||
                                vehicle.id === tripTicket.vehicle_id
                            )
                            .map((vehicle) => (
                              <SelectItem key={vehicle.id} value={vehicle.id}>
                                {vehicle.make} {vehicle.model} -{' '}
                                {vehicle.license_plate}
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
            ) : (
              <Field>
                <FieldLabel>Vehicle</FieldLabel>
                <Input
                  value={(() => {
                    const vehicle = vehicles?.data?.find(
                      (v) => v.id === tripTicket.vehicle_id
                    );
                    return vehiclesLoading
                      ? 'Loading...'
                      : vehicle
                        ? `${vehicle.make} ${vehicle.model} - ${vehicle.license_plate}`
                        : '—';
                  })()}
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
            {isEditing ? (
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
                          drivers?.data
                            ?.filter(
                              (driver) =>
                                driver.status === 'Active' ||
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
            ) : (
              <Field>
                <FieldLabel>Driver</FieldLabel>
                <Input
                  value={
                    driversLoading
                      ? 'Loading...'
                      : drivers?.data?.find(
                          (d) => d.id === tripTicket.driver_id
                        )?.full_name || '—'
                  }
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
            {isEditing ? (
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
            ) : (
              <Field>
                <FieldLabel>Branch</FieldLabel>
                <Input
                  value={
                    branchesLoading
                      ? 'Loading...'
                      : branches?.find((b) => b.id === tripTicket.branch_id)
                          ?.name || '—'
                  }
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
            {isEditing ? (
              <Controller
                name="status"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="status">Status</FieldLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!isEditing}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(TRIP_TICKET_STATUS).map((status) => (
                          <SelectItem key={status} value={status}>
                            {status
                              .replace(/_/g, ' ')
                              .replace(/\b\w/g, (l) => l.toUpperCase())}
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
            ) : (
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Input
                  value={(tripTicket.status || 'pending')
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
            {isEditing ? (
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
            ) : (
              <Field>
                <FieldLabel>Requested By</FieldLabel>
                <Input
                  value={
                    adminsLoading
                      ? 'Loading...'
                      : admins?.find(
                          (a) =>
                            a.id ===
                            (tripTicket.requested_by || tripTicket.prepared_by)
                        )?.full_name ||
                        tripTicket.prepared_by ||
                        '—'
                  }
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
            <Controller
              name="destination"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="destination">Destination *</FieldLabel>
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
                  <FieldLabel htmlFor="end_ts">End Date & Time *</FieldLabel>
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
            <Controller
              name="pre_trip_guard"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="pre_trip_guard">
                    Pre-Trip Guard
                  </FieldLabel>
                  {isEditing ? (
                    <Input
                      {...field}
                      id="pre_trip_guard"
                      type="text"
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter guard name"
                      disabled={!isEditing}
                    />
                  ) : (
                    <div className="bg-muted rounded-md border px-3 py-2 text-sm">
                      {getGuardName(field.value)}
                    </div>
                  )}
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
                  {isEditing ? (
                    <Input
                      {...field}
                      id="post_trip_guard"
                      type="text"
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter guard name"
                      disabled={!isEditing}
                    />
                  ) : (
                    <div className="bg-muted rounded-md border px-3 py-2 text-sm">
                      {getGuardName(field.value)}
                    </div>
                  )}
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
                <Field data-invalid={fieldState.invalid} className="col-span-2">
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
                <Field data-invalid={fieldState.invalid} className="col-span-2">
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
            {(tripTicket.status === TRIP_TICKET_STATUS.CANCELLED ||
              isEditing) && (
              <Controller
                name="cancellation_reason"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field
                    data-invalid={fieldState.invalid}
                    className="col-span-2"
                  >
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
            )}
            {(tripTicket.status === TRIP_TICKET_STATUS.DISAPPROVED ||
              isEditing) && (
              <Controller
                name="disapproved_reason"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field
                    data-invalid={fieldState.invalid}
                    className="col-span-2"
                  >
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
            )}
            <Controller
              name="participants"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="col-span-2">
                  <FieldLabel htmlFor="participants">Participants</FieldLabel>
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
                              newParticipants.filter((p) => p.trim()).join(', ')
                            );
                          }}
                          placeholder={`Participant ${index + 1} name`}
                          disabled={!isEditing}
                          className={!isEditing ? 'bg-muted' : ''}
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
          </div>

          {/* Fuel Allocation Section */}
          <div className="mt-8 flex flex-col gap-2">
            <h2 className="text-xl font-semibold">Fuel Allocation</h2>
            <p className="text-muted-foreground text-sm">
              Fuel allocation details for this trip ticket.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-11">
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
            {isEditing ? (
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
                          vehicles?.data
                            ?.filter(
                              (vehicle) =>
                                vehicle.status === 'available' ||
                                vehicle.id === tripTicket.allocation_vehicle_id
                            )
                            .map((vehicle) => (
                              <SelectItem key={vehicle.id} value={vehicle.id}>
                                {vehicle.make} {vehicle.model} -{' '}
                                {vehicle.license_plate}
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
            ) : (
              <Field>
                <FieldLabel>Allocation Vehicle</FieldLabel>
                <Input
                  value={(() => {
                    const vehicle = vehicles?.data?.find(
                      (v) => v.id === tripTicket.allocation_vehicle_id
                    );
                    return vehiclesLoading
                      ? 'Loading...'
                      : vehicle
                        ? `${vehicle.make} ${vehicle.model} - ${vehicle.license_plate}`
                        : '—';
                  })()}
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
            {isEditing ? (
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
                            {fuel.charAt(0).toUpperCase() +
                              fuel.slice(1).toLowerCase()}
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
            ) : (
              <Field>
                <FieldLabel>Fuel Type</FieldLabel>
                <Input
                  value={
                    tripTicket.allocation_fuel_type
                      ? tripTicket.allocation_fuel_type
                          .charAt(0)
                          .toUpperCase() +
                        tripTicket.allocation_fuel_type.slice(1).toLowerCase()
                      : '—'
                  }
                  disabled
                  className="bg-muted"
                />
              </Field>
            )}
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
                <Field data-invalid={fieldState.invalid} className="col-span-2">
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
        </FieldGroup>

        {isEditing && (
          <Field className="mt-10 w-fit">
            <Button
              type="submit"
              className="w-fit px-11"
              form="edit-trip-ticket-form"
              disabled={updateTripTicket.isPending}
            >
              {updateTripTicket.isPending
                ? 'Updating...'
                : 'Update Trip Ticket'}
            </Button>
          </Field>
        )}
      </form>

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
