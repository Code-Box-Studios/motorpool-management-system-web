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
import { useAdmins, useAllUsers } from '@/lib/query/user-management';
import { useBranches } from '@/lib/query/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { JOB_ORDER_STATUS, REPAIR_DONE_TYPE } from '@/lib/enums';
import { Textarea } from '@/components/ui/textarea';
import { useEffect } from 'react';
import { MultiSelect } from '@/components/ui/multi-select';
import { useSpareParts } from '@/lib/query/spare-parts';

export function JobOrderInner() {
  const { id } = useParams({ strict: false });
  const { data: jobOrder, isLoading: isLoadingJobOrder } = useJobOrder(
    id as string
  );
  const { data: drivers, isLoading: isLoadingDrivers } = useDrivers(1, 1000);
  const { data: vehicles, isLoading: isLoadingVehicles } = useVehicles(1, 100);
  const { data: branches } = useBranches();
  const { data: admins, isLoading: isLoadingAdmins } = useAdmins();
  const { data: allUsers, isLoading: isLoadingUsers } = useAllUsers();
  const { data: spareParts } = useSpareParts(1, 1000);
  const updateJobOrderAction = useUpdateJobOrderAction(id as string);
  const form = useJobOrderForm();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('Data check:', {
      hasJobOrder: !!jobOrder,
      jobOrder: jobOrder,
      hasDriversData: !!drivers?.data,
      driversCount: drivers?.data?.length,
      hasVehiclesData: !!vehicles?.data,
      vehiclesCount: vehicles?.data?.length,
      hasAdmins: !!admins,
      adminsCount: admins?.length,
      hasAllUsers: !!allUsers,
      allUsersCount: allUsers?.length,
      isLoadingJobOrder,
      isLoadingDrivers,
      isLoadingVehicles,
      isLoadingAdmins,
      isLoadingUsers
    });

    if (jobOrder && drivers?.data && vehicles?.data && admins && allUsers) {
      console.log('Resetting form with values');

      const formatDate = (dateString: string | null) => {
        if (!dateString) return '';
        try {
          const date = new Date(dateString);
          if (dateString.includes('T')) {
            return date.toISOString().slice(0, 16);
          } else {
            return dateString + 'T00:00';
          }
        } catch {
          return '';
        }
      };

      const formData = {
        vehicle_id: jobOrder.vehicle_id || '',
        branch_id: jobOrder.branch_id || '',
        incident_date: formatDate(jobOrder.incident_date),
        incident_details: jobOrder.incident_details || '',
        date_of_request: formatDate(jobOrder.created_at),
        requested_by: jobOrder.requested_by || '',
        noted_by: jobOrder.noted_by || '',
        approved_by: jobOrder.approved_by || '',
        date_approved: formatDate(jobOrder.date_approved),
        assigned_mechanic: jobOrder.assigned_mechanic || '',
        target_date: formatDate(jobOrder.target_date),
        repair_done: jobOrder.repair_done || '',
        actual_date_of_release: formatDate(jobOrder.actual_date_of_release),
        status: (jobOrder.status as JobOrderFormData['status']) || 'pending',
        remarks: jobOrder.remarks || '',
        spare_parts_used: Array.isArray(jobOrder.spare_parts_used)
          ? jobOrder.spare_parts_used
          : []
      };

      console.log('Form data being set:', formData);
      form.reset(formData);
    }
  }, [
    jobOrder,
    drivers,
    vehicles,
    admins,
    allUsers,
    form,
    isLoadingJobOrder,
    isLoadingDrivers,
    isLoadingVehicles,
    isLoadingAdmins,
    isLoadingUsers
  ]);

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
    isLoadingAdmins ||
    isLoadingUsers
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
            <h1 className="text-2xl font-bold">View Job Order</h1>
            <p className="text-muted-foreground text-balance">
              Job order details are read-only.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-11">
            <Controller
              name="branch_id"
              control={form.control}
              render={({ field, fieldState }) => {
                const branch = branches?.find((b) => b.id === field.value);
                const displayValue = branch?.name || field.value || '';
                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="branch_id">Branch *</FieldLabel>
                    <Input value={displayValue} disabled readOnly />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
            />
            <Controller
              name="vehicle_id"
              control={form.control}
              render={({ field, fieldState }) => {
                const vehicle = vehicles?.data?.find(
                  (v) => v.id === field.value
                );
                const displayValue = vehicle
                  ? `${vehicle.make} ${vehicle.model} - ${vehicle.license_plate}`
                  : field.value || '';
                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="vehicle_id">Vehicle *</FieldLabel>
                    <Input value={displayValue} disabled readOnly />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
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
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                    disabled
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
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                    disabled
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="spare_parts_used"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="col-span-2">
                  <FieldLabel htmlFor="spare_parts_used">
                    Spare Parts Used
                  </FieldLabel>
                  <MultiSelect
                    options={
                      spareParts?.data?.map((part) => ({
                        value: part.id,
                        label: `${part.name}${part.brand ? ` - ${part.brand}` : ''}`
                      })) || []
                    }
                    selected={field.value || []}
                    onChange={field.onChange}
                    placeholder="Select spare parts..."
                    disabled
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
              render={({ field, fieldState }) => {
                const driver = drivers?.data?.find((d) => d.id === field.value);
                const admin = admins?.find((a) => a.id === field.value);
                const displayValue =
                  driver?.full_name || admin?.full_name || field.value || '';
                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="requested_by">Requested By</FieldLabel>
                    <Input value={displayValue} disabled readOnly />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
            />
            <Controller
              name="noted_by"
              control={form.control}
              render={({ field, fieldState }) => {
                const admin = admins?.find((a) => a.id === field.value);
                const displayValue = admin?.full_name || field.value || '';
                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="noted_by">Noted By</FieldLabel>
                    <Input value={displayValue} disabled readOnly />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
            />
            <Controller
              name="approved_by"
              control={form.control}
              render={({ field, fieldState }) => {
                const user = allUsers?.find((u) => u.id === field.value);
                const displayValue = user?.full_name || field.value || '';
                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="approved_by">Approved By</FieldLabel>
                    <Input value={displayValue} disabled readOnly />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
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
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                    disabled
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
              render={({ field, fieldState }) => {
                const driver = drivers?.data?.find((d) => d.id === field.value);
                const displayValue = driver?.full_name || field.value || '';
                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="assigned_mechanic">
                      Assigned Mechanic
                    </FieldLabel>
                    <Input value={displayValue} disabled readOnly />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
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
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                    disabled
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
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                    disabled
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
                  <FieldLabel htmlFor="repair_done">Repair Done</FieldLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                    disabled
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select repair type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(REPAIR_DONE_TYPE).map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
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
              name="status"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="status">Status</FieldLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                    disabled
                  >
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
                    disabled
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
                    disabled
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}

export default JobOrderInner;
