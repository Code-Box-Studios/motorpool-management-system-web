import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
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
import { useAdmins } from '@/lib/query/user-management';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { TRIP_TICKET_STATUS, FUEL_TYPE } from '@/lib/enums';
import { Textarea } from '@/components/ui/textarea';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

export function AddTripTicket() {
  const { data: drivers } = useDrivers(1, 100);
  const { data: vehicles } = useVehicles(1, 100);
  const { data: branches } = useBranches();
  const { data: admins } = useAdmins();
  const addTripTicketAction = useAddTripTicketAction();
  const form = useTripTicketForm();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      form.setValue('approved_by', user.id);
      form.setValue('allocation_requested_by', user.id);
    }
  }, [user, form]);

  const onSubmit = (data: TripTicketFormData) => {
    addTripTicketAction
      .addTripTicket(data)
      .then(() => {
        form.reset();
        navigate({ to: '/trip-tickets' });
      })
      .catch((error) => {
        console.error('Error adding trip ticket:', error);
      });
  };

  return (
    <div>
      <form
        className="flex flex-col justify-center"
        id="add-trip-ticket-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Create Trip Ticket</h1>
            <p className="text-muted-foreground text-balance">
              Enter the trip ticket details below.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-11">
            <Controller
              name="vehicle_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="vehicle_id">Vehicle *</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles?.data
                        ?.filter((vehicle) => vehicle.status === 'available')
                        .map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.make} {vehicle.model} -{' '}
                            {vehicle.license_plate}
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
            <Controller
              name="driver_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="driver_id">Driver *</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a driver" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers?.data
                        ?.filter((driver) => driver.status === 'Active')
                        .map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.full_name}
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
            <Controller
              name="branch_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="branch_id">Branch *</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches?.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
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
            <Controller
              name="approved_by"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="approved_by">Approved By *</FieldLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select approver" />
                    </SelectTrigger>
                    <SelectContent>
                      {admins?.map((admin) => (
                        <SelectItem key={admin.id} value={admin.id}>
                          {admin.full_name}
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
            <Controller
              name="prepared_by"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="prepared_by">Prepared By *</FieldLabel>
                  <Input
                    {...field}
                    id="prepared_by"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter preparer name"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="status"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="status">Status</FieldLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(TRIP_TICKET_STATUS).map((status) => (
                        <SelectItem key={status} value={status}>
                          {status
                            .split('_')
                            .map(
                              (word) =>
                                word.charAt(0).toUpperCase() +
                                word.slice(1).toLowerCase()
                            )
                            .join(' ')}
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
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="pickup_date_time"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="pickup_date_time">
                    Pickup Date & Time *
                  </FieldLabel>
                  <Input
                    {...field}
                    id="pickup_date_time"
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="return_date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="return_date">Return Date *</FieldLabel>
                  <Input
                    {...field}
                    id="return_date"
                    type="date"
                    aria-invalid={fieldState.invalid}
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
                  <Input
                    {...field}
                    id="pre_trip_guard"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter guard name"
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
                  />
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
                    rows={3}
                  />
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
              Enter fuel allocation details for this trip ticket.
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
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="allocation_vehicle_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="allocation_vehicle_id">
                    Allocation Vehicle *
                  </FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles?.data
                        ?.filter((vehicle) => vehicle.status === 'available')
                        .map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.make} {vehicle.model} -{' '}
                            {vehicle.license_plate}
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
            <Controller
              name="allocation_fuel_type"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="allocation_fuel_type">
                    Fuel Type *
                  </FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
            <Controller
              name="allocation_km"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="allocation_km">Kilometers *</FieldLabel>
                  <Input
                    {...field}
                    id="allocation_km"
                    type="number"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter kilometers"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="allocation_liters"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="allocation_liters">Liters *</FieldLabel>
                  <Input
                    {...field}
                    id="allocation_liters"
                    type="number"
                    step="0.01"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter liters"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="allocation_requested_by"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="allocation_requested_by">
                    Requested By *
                  </FieldLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select requester" />
                    </SelectTrigger>
                    <SelectContent>
                      {admins?.map((admin) => (
                        <SelectItem key={admin.id} value={admin.id}>
                          {admin.full_name}
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
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
        </FieldGroup>

        <Field className="mt-10 w-fit">
          <Button
            type="submit"
            className="w-fit px-11"
            form="add-trip-ticket-form"
            disabled={addTripTicketAction.isLoading}
          >
            {addTripTicketAction.isLoading
              ? 'Creating...'
              : 'Create Trip Ticket'}
          </Button>
        </Field>
      </form>
    </div>
  );
}

export default AddTripTicket;
