import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import {
  useTripTicketForm,
  useAddTripTicketAction,
  type TripTicketFormData
} from './actions';
import { useNavigate } from '@tanstack/react-router';
import { useDrivers } from '@/lib/query/drivers';
import { useVehicles } from '@/lib/query/vehicles';
import { useBranches } from '@/lib/query/shared';
import { useDepartmentOffices, useOfficeHeads } from '@/lib/query/offices';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useUserRole } from '@/hooks/use-user-role';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import PageHeader from '@/components/shared/page-header';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';

export function AddTripTicket() {
  const { data: drivers, isLoading: driversLoading } = useDrivers(1, 100);
  const { data: vehicles, isLoading: vehiclesLoading } = useVehicles(1, 100);
  const { data: branches, isLoading: branchesLoading } = useBranches();
  const { data: offices, isLoading: officesLoading } = useDepartmentOffices();
  const { data: officeHeads, isLoading: officeHeadsLoading } = useOfficeHeads();
  const addTripTicketAction = useAddTripTicketAction();
  const form = useTripTicketForm();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: userRole } = useUserRole();

  // State for managing participants list
  const [participants, setParticipants] = useState<string[]>(['']);
  const [showConfirm, setShowConfirm] = useState(false);

  // A trip cannot carry more people than the van has seats — the API refuses it
  // (409 OVER_CAPACITY), so the form says so while the vehicle is being chosen
  // rather than after the request has been written out in full.
  const selectedVehicleId = form.watch('vehicle_id');
  const seats =
    vehicles?.data?.find((v) => v.id === selectedVehicleId)?.capacity ?? null;
  const [pendingData, setPendingData] = useState<TripTicketFormData | null>(
    null
  );

  // Get user's branch for filtering
  const userBranchId = userRole?.branch_id || user?.user_metadata?.branch_id;

  useEffect(() => {
    console.log('Drivers:', drivers);
    console.log('Vehicles:', vehicles);
    console.log('Branches:', branches);
  }, [drivers, vehicles, branches]);

  useEffect(() => {
    if (user) {
      form.setValue('requested_by', user.id);
    }
    const today = new Date().toISOString().split('T')[0];
    form.setValue('date_requested', today);
  }, [user, form]);

  const onSubmit = (data: TripTicketFormData) => {
    // The last word on the headcount. The count field is capped and re-clamped
    // when the vehicle changes, so this should be unreachable — but the API
    // refuses an over-capacity trip (409 OVER_CAPACITY) and a form that can send
    // one is a form that can waste someone's time filling it in.
    if (seats !== null && data.participants_count > seats) {
      form.setError('participants_count', {
        message: `That vehicle seats ${seats}`
      });
      return;
    }
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmAdd = () => {
    if (!pendingData) return;
    addTripTicketAction
      .addTripTicket(pendingData)
      .then(() => {
        form.reset();
        setShowConfirm(false);
        setPendingData(null);
        navigate({ to: '/trip-tickets' });
      })
      .catch((error) => {
        console.error('Error adding trip ticket:', error);
        setShowConfirm(false);
      });
  };

  return (
    <div>
      <PageHeader
        title="Request Trip Ticket"
        description="Submit a trip ticket request for admin approval."
      />

      <form id="add-trip-ticket-form" onSubmit={form.handleSubmit(onSubmit)}>
        <FormLayout>
          <FormSection
            title="Who it's for"
            description="The office making the request, and the head who signs it off."
          >
            <div className="flex flex-col gap-5">
              <FormRow>
                <Controller
                  name="branch_id"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="branch_id">Branch *</FieldLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ''}
                        disabled={branchesLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              branchesLoading ? 'Loading...' : 'Select a branch'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {branches && branches.length > 0 ? (
                            branches.map((branch) => (
                              <SelectItem key={branch.id} value={branch.id}>
                                {branch.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="text-muted-foreground p-2 text-sm">
                              No branches available
                            </div>
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
                  name="office_id"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="office_id">
                        Department/Office/College *
                      </FieldLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={officesLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              officesLoading
                                ? 'Loading...'
                                : 'Select department/office'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {offices && offices.length > 0 ? (
                            offices.map((office) => (
                              <SelectItem key={office.id} value={office.id}>
                                {office.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="text-muted-foreground p-2 text-sm">
                              No offices available
                            </div>
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
                  name="office_head_id"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="office_head_id">
                        Office Head
                      </FieldLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={officeHeadsLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              officeHeadsLoading
                                ? 'Loading...'
                                : 'Select office head'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {officeHeads && officeHeads.length > 0 ? (
                            officeHeads.map((officeHead) => (
                              <SelectItem
                                key={officeHead.id}
                                value={officeHead.id}
                              >
                                {officeHead.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="text-muted-foreground p-2 text-sm">
                              No office heads available
                            </div>
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
            </div>
          </FormSection>

          <FormSection
            title="The trip"
            description="Only available vehicles and active drivers from your branch are listed."
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
                        onValueChange={(vehicleId) => {
                          field.onChange(vehicleId);
                          // Changing the van changes how many people fit. Without
                          // this, picking a 9-seater, entering 9, then switching
                          // to a 4-seater left the count at 9 and the trip only
                          // failed on submit.
                          const nextSeats = vehicles?.data?.find(
                            (v) => v.id === vehicleId
                          )?.capacity;
                          if (!nextSeats) return;
                          const count = form.getValues('participants_count');
                          if (count > nextSeats) {
                            form.setValue('participants_count', nextSeats, {
                              shouldValidate: true
                            });
                            setParticipants((prev) =>
                              Array.from(
                                { length: nextSeats },
                                (_, i) => prev[i] || ''
                              )
                            );
                          }
                        }}
                        value={field.value}
                        disabled={vehiclesLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              vehiclesLoading
                                ? 'Loading...'
                                : 'Select a vehicle'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {vehicles?.data && vehicles.data.length > 0 ? (
                            vehicles.data
                              .filter((vehicle) => {
                                // Filter by availability
                                if (vehicle.status !== 'available')
                                  return false;
                                // Filter by user's branch (for both requesters and admins)
                                if (
                                  userBranchId &&
                                  vehicle.branch !== userBranchId
                                ) {
                                  return false;
                                }
                                return true;
                              })
                              .map((vehicle) => (
                                <SelectItem key={vehicle.id} value={vehicle.id}>
                                  {/* The seat count decides how many people can
                                      come, so it belongs on the choice itself. */}
                                  {vehicle.make} {vehicle.model} -{' '}
                                  {vehicle.license_plate} · {vehicle.capacity}{' '}
                                  {vehicle.capacity === 1 ? 'seat' : 'seats'}
                                </SelectItem>
                              ))
                          ) : (
                            <div className="text-muted-foreground p-2 text-sm">
                              No available vehicles in your branch
                            </div>
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
                        disabled={driversLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              driversLoading ? 'Loading...' : 'Select a driver'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {drivers?.data && drivers.data.length > 0 ? (
                            drivers.data
                              .filter((driver) => {
                                // Filter by active status
                                if (driver.status !== 'active') return false;
                                // Filter by user's branch (for both requesters and admins)
                                if (
                                  userBranchId &&
                                  driver.branch_id !== userBranchId
                                ) {
                                  return false;
                                }
                                return true;
                              })
                              .map((driver) => (
                                <SelectItem key={driver.id} value={driver.id}>
                                  {driver.full_name}
                                </SelectItem>
                              ))
                          ) : (
                            <div className="text-muted-foreground p-2 text-sm">
                              No active drivers in your branch
                            </div>
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
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="participants_count"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="participants_count">
                        Number of Participants *
                      </FieldLabel>
                      <Input
                        {...field}
                        id="participants_count"
                        type="number"
                        min="1"
                        max={seats ?? undefined}
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter number of participants"
                        onChange={(e) => {
                          const raw = parseInt(e.target.value) || 1;
                          // Clamp to the seats: the server refuses more, and a
                          // silently-too-big number would only fail on submit.
                          const count = seats ? Math.min(raw, seats) : raw;
                          field.onChange(count);
                          // Adjust participants array to match count
                          const newParticipants = Array.from(
                            { length: count },
                            (_, i) => participants[i] || ''
                          );
                          setParticipants(newParticipants);
                        }}
                      />
                      {seats === null ? (
                        <p className="text-muted-foreground text-xs">
                          Pick a vehicle to see how many it seats
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          This vehicle seats {seats}
                        </p>
                      )}
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FormRow>

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
                      placeholder="Enter the purpose of the trip"
                      rows={3}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="participants"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="participants">
                      Participants *
                    </FieldLabel>
                    <p className="text-muted-foreground mb-2 text-sm">
                      Number of fields matches the participant count above
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
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
                            aria-invalid={fieldState.invalid}
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
          </FormSection>

          <FormSection title="When">
            <FormRow>
              <Controller
                name="start_ts"
                control={form.control}
                render={({ field, fieldState }) => {
                  // Get today's date and time in local timezone as minimum
                  const now = new Date();
                  const minDateTime = new Date(
                    now.getTime() - now.getTimezoneOffset() * 60000
                  )
                    .toISOString()
                    .slice(0, 16);

                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="start_ts">
                        Start Date & Time *
                      </FieldLabel>
                      <Input
                        {...field}
                        id="start_ts"
                        type="datetime-local"
                        min={minDateTime}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  );
                }}
              />

              <Controller
                name="end_ts"
                control={form.control}
                render={({ field, fieldState }) => {
                  // Get the start_ts value to set as minimum for end_ts
                  const startTs = form.watch('start_ts');

                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="end_ts">
                        End Date & Time *
                      </FieldLabel>
                      <Input
                        {...field}
                        id="end_ts"
                        type="datetime-local"
                        min={startTs || undefined}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  );
                }}
              />
            </FormRow>
          </FormSection>

          <FormSection title="Anything else">
            <Controller
              name="remarks"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="remarks">Remarks (Optional)</FieldLabel>
                  <Textarea
                    {...field}
                    id="remarks"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter any additional remarks"
                    rows={3}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FormSection>

          <FormActions>
            <Button type="submit" disabled={addTripTicketAction.isLoading}>
              {addTripTicketAction.isLoading
                ? 'Submitting...'
                : 'Submit Request'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: '/trip-tickets' })}
            >
              Cancel
            </Button>
          </FormActions>
        </FormLayout>
      </form>

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Submit Trip Ticket"
        description="Are you sure you want to submit this trip ticket request?"
        confirmLabel="Submit Request"
        loading={addTripTicketAction.isLoading}
        onConfirm={handleConfirmAdd}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}

export default AddTripTicket;
