import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import {
  useJobOrderForm,
  useUpdateJobOrderAction,
  type JobOrderFormData
} from './actions';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useJobOrder } from '@/lib/query/job-orders';
import { useDrivers } from '@/lib/query/drivers';
import { useVehicles } from '@/lib/query/vehicles';
import { useAdmins } from '@/lib/query/user-management';
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

export function JobOrderInner() {
  const { id } = useParams({ strict: false });
  const { data: jobOrder, isLoading: isLoadingJobOrder } = useJobOrder(
    id as string
  );
  const { data: drivers, isLoading: isLoadingDrivers } = useDrivers(1, 100);
  const { data: vehicles, isLoading: isLoadingVehicles } = useVehicles(1, 100);
  const { data: admins, isLoading: isLoadingAdmins } = useAdmins();
  const updateJobOrderAction = useUpdateJobOrderAction(id as string);
  const form = useJobOrderForm();
  const navigate = useNavigate();

  useEffect(() => {
    if (jobOrder) {
      form.reset({
        vehicle_id: jobOrder.vehicle_id || '',
        submitted_by: jobOrder.submitted_by || '',
        incident_date: jobOrder.incident_date || '',
        incident_details: jobOrder.incident_details || '',
        damage_info: jobOrder.damage_info || '',
        date_of_request: jobOrder.date_of_request || '',
        requested_by: jobOrder.requested_by || '',
        noted_by: jobOrder.noted_by || '',
        approved_by: jobOrder.approved_by || '',
        date_approved: jobOrder.date_approved || '',
        assigned_mechanic: jobOrder.assigned_mechanic || '',
        repair_plan: jobOrder.repair_plan || '',
        target_date: jobOrder.target_date || '',
        repair_done: jobOrder.repair_done || 0,
        actual_date_of_release: jobOrder.actual_date_of_release || '',
        status: (jobOrder.status as JobOrderFormData['status']) || 'pending',
        remarks: jobOrder.remarks || '',
        job_descriptions: jobOrder.job_descriptions || [],
        images: jobOrder.images || []
      });
    }
  }, [jobOrder, form]);

  const onSubmit = (data: JobOrderFormData) => {
    updateJobOrderAction
      .updateJobOrderAction(data)
      .then(() => {
        navigate({ to: '/job-order' });
      })
      .catch((error) => {
        console.error('Error updating job order:', error);
      });
  };

  if (
    isLoadingJobOrder ||
    isLoadingDrivers ||
    isLoadingVehicles ||
    isLoadingAdmins
  ) {
    return <div>Loading...</div>;
  }

  if (!jobOrder) {
    return <div>Job order not found</div>;
  }

  return (
    <div>
      <form
        className="flex flex-col justify-center"
        id="update-job-order-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Edit Job Order</h1>
            <p className="text-muted-foreground text-balance">
              Update the job order details below.
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
              name="submitted_by"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="submitted_by">Submitted By *</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select submitter" />
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
              name="incident_date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="incident_date">
                    Incident Date *
                  </FieldLabel>
                  <Input
                    {...field}
                    id="incident_date"
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
              name="date_of_request"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="date_of_request">
                    Date of Request
                  </FieldLabel>
                  <Input
                    {...field}
                    id="date_of_request"
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
              name="requested_by"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="requested_by">Requested By</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select requester" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers?.data?.map((driver) => (
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
              name="noted_by"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="noted_by">Noted By</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select noter" />
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
              name="approved_by"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="approved_by">Approved By</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
              name="date_approved"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="date_approved">Date Approved</FieldLabel>
                  <Input
                    {...field}
                    id="date_approved"
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
              name="assigned_mechanic"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="assigned_mechanic">
                    Assigned Mechanic
                  </FieldLabel>
                  <Input
                    {...field}
                    id="assigned_mechanic"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter mechanic name"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="target_date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="target_date">Target Date</FieldLabel>
                  <Input
                    {...field}
                    id="target_date"
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
              name="actual_date_of_release"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="actual_date_of_release">
                    Actual Date of Release
                  </FieldLabel>
                  <Input
                    {...field}
                    id="actual_date_of_release"
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
              name="repair_done"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="repair_done">Repair Done (%)</FieldLabel>
                  <Input
                    {...field}
                    id="repair_done"
                    type="number"
                    min="0"
                    max="100"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter percentage"
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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(JOB_ORDER_STATUS).map((status) => (
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
                    placeholder="Describe the incident"
                    rows={3}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="damage_info"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="col-span-2">
                  <FieldLabel htmlFor="damage_info">Damage Info</FieldLabel>
                  <Textarea
                    {...field}
                    id="damage_info"
                    aria-invalid={fieldState.invalid}
                    placeholder="Describe the damage"
                    rows={3}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="repair_plan"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="col-span-2">
                  <FieldLabel htmlFor="repair_plan">Repair Plan</FieldLabel>
                  <Textarea
                    {...field}
                    id="repair_plan"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter repair plan"
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
        </FieldGroup>

        <Field className="mt-10 w-fit">
          <Button
            type="submit"
            className="w-fit px-11"
            form="update-job-order-form"
            disabled={updateJobOrderAction.isLoading}
          >
            {updateJobOrderAction.isLoading
              ? 'Updating...'
              : 'Update Job Order'}
          </Button>
        </Field>
      </form>
    </div>
  );
}

export default JobOrderInner;
