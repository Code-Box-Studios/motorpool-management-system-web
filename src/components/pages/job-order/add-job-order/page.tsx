import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import {
  useJobOrderForm,
  useAddJobOrderAction,
  type JobOrderFormData
} from './actions';
import { useNavigate } from '@tanstack/react-router';
import { useVehicles } from '@/lib/query/vehicles';
import { useAllUsers } from '@/lib/query/user-management';
import { useBranches } from '@/lib/query/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

import { JOB_ORDER_STATUS } from '@/lib/enums';
import { Textarea } from '@/components/ui/textarea';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

export function AddJobOrder() {
  const { data: vehicles } = useVehicles(1, 100);
  const { data: branches } = useBranches();
  const { data: allUsers } = useAllUsers();
  const addJobOrderAction = useAddJobOrderAction();
  const form = useJobOrderForm();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      form.setValue('requested_by', user.id);
      form.setValue('status', 'pending');
    }
  }, [user, form]);

  const onSubmit = (data: JobOrderFormData) => {
    addJobOrderAction
      .addJobOrder(data)
      .then(() => {
        form.reset();
        navigate({ to: '/job-order' });
      })
      .catch((error) => {
        console.error('Error adding job order:', error);
      });
  };

  return (
    <div>
      <form
        className="flex flex-col justify-center"
        id="add-job-order-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Create Job Order</h1>
            <p className="text-muted-foreground text-balance">
              Submit a job order request for vehicle repair or maintenance.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-11">
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
                      {vehicles?.data?.map((vehicle) => (
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
              name="incident_date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="incident_date">
                    Incident Date and Time *
                  </FieldLabel>
                  <Input
                    {...field}
                    id="incident_date"
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Incident Details */}
            <Controller
              name="incident_details"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="col-span-2">
                  <FieldLabel htmlFor="incident_details">
                    Incident Details
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="incident_details"
                    aria-invalid={fieldState.invalid}
                    placeholder="Describe what happened..."
                    rows={4}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Remarks */}
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
                    placeholder="Additional notes..."
                    rows={3}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Status (disabled, defaults to pending) */}
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
                      {Object.entries(JOB_ORDER_STATUS).map(([key, value]) => (
                        <SelectItem key={value} value={value}>
                          {key
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

            {/* Requested By (auto-filled with current user) */}
            <Controller
              name="requested_by"
              control={form.control}
              render={({ fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="requested_by">Requested By</FieldLabel>
                  <Input
                    id="requested_by"
                    value={
                      allUsers?.find((u) => u.id === user?.id)?.full_name ||
                      'Current User'
                    }
                    disabled
                    className="bg-muted"
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
          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: '/job-order' })}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-fit px-11"
              disabled={addJobOrderAction.isLoading}
            >
              {addJobOrderAction.isLoading ? 'Creating...' : 'Create Job Order'}
            </Button>
          </div>
        </Field>
      </form>
    </div>
  );
}

export default AddJobOrder;
