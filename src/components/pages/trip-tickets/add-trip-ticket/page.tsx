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
import { useDepartmentOffices, useOfficeHeads } from '@/lib/query/offices';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useUserRole } from '@/hooks/use-user-role';

export function AddTripTicket() {
  const { data: drivers, isLoading: driversLoading } = useDrivers(1, 100);
  const { data: vehicles, isLoading: vehiclesLoading } = useVehicles(1, 100);
  const { data: branches, isLoading: branchesLoading } = useBranches();
  const { data: admins, isLoading: adminsLoading } = useAdmins();
  const { data: offices, isLoading: officesLoading } = useDepartmentOffices();
  const { data: officeHeads, isLoading: officeHeadsLoading } = useOfficeHeads();
  const addTripTicketAction = useAddTripTicketAction();
  const form = useTripTicketForm();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: userRole } = useUserRole();

  // Check if user is a requester
  const isRequester = userRole?.role?.toLowerCase() === 'requester';
  const userBranchId = userRole?.branch_id || user?.user_metadata?.branch_id;

  // Watch the selected branch to filter drivers and vehicles
  const selectedBranchId = form.watch('branch_id');

  useEffect(() => {
    console.log('Drivers:', drivers);
    console.log('Vehicles:', vehicles);
    console.log('Branches:', branches);
    console.log('Admins:', admins);
  }, [drivers, vehicles, branches, admins]);

  useEffect(() => {
    if (user) {
      // Set the requester to current user
      form.setValue('requested_by', user.id);
    }
    // Set date_requested to today's date
    const today = new Date().toISOString().split('T')[0];
    form.setValue('date_requested', today);
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
            <h1 className="text-2xl font-bold">Request Trip Ticket</h1>
            <p className="text-muted-foreground text-balance">
              Submit a trip ticket request for admin approval.
            </p>
          </div>

          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-11">
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

            <Controller
              name="office_head_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="office_head_id">Office Head</FieldLabel>
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
                          <SelectItem key={officeHead.id} value={officeHead.id}>
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

            <Controller
              name="vehicle_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="vehicle_id">Vehicle *</FieldLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={vehiclesLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          vehiclesLoading ? 'Loading...' : 'Select a vehicle'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles?.data && vehicles.data.length > 0 ? (
                        vehicles.data
                          .filter((vehicle) => {
                            // Filter by availability
                            if (vehicle.status !== 'available') return false;
                            // Filter by user's branch (for both requesters and admins)
                            if (userBranchId && vehicle.branch !== userBranchId) {
                              return false;
                            }
                            return true;
                          })
                          .map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id}>
                              {vehicle.make} {vehicle.model} -{' '}
                              {vehicle.license_plate}
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
                            if (driver.status !== 'Active') return false;
                            // Filter by user's branch (for both requesters and admins)
                            if (userBranchId && driver.branch_id !== userBranchId) {
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
          </div>

          {/* Purpose and Participants */}
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

          <div className="grid grid-cols-2 gap-11">
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
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter number of participants"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>

          <Controller
            name="participants"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="participants">Participants *</FieldLabel>
                <Textarea
                  {...field}
                  id="participants"
                  aria-invalid={fieldState.invalid}
                  placeholder="Enter participant names, separated by commas"
                  rows={3}
                />
                <p className="text-muted-foreground text-sm">
                  Separate names with commas (e.g., John Doe, Jane Smith)
                </p>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          {/* Trip Details */}
          <div className="grid grid-cols-2 gap-6">
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
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>

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
        </FieldGroup>

        <div className="mt-11 flex gap-4">
          <Button type="submit" disabled={addTripTicketAction.isLoading}>
            {addTripTicketAction.isLoading ? 'Submitting...' : 'Submit Request'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: '/trip-tickets' })}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

export default AddTripTicket;
