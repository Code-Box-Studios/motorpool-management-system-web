import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import {
  useMaintenanceForm,
  useUpdateMaintenanceAction,
  type MaintenanceFormData
} from './actions';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useMaintenance } from '@/lib/query/maintenance';
import { useVehicles } from '@/lib/query/vehicles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { MAINTENANCE_TYPE } from '@/lib/enums';
import { Textarea } from '@/components/ui/textarea';
import { useEffect } from 'react';

export function MaintenanceInner() {
  const { id } = useParams({ from: '/_authenticated/maintenance/$id' });
  const { data: maintenance, isLoading: isLoadingMaintenance } = useMaintenance(
    id as string
  );
  const { data: vehicles, isLoading: isLoadingVehicles } = useVehicles(1, 100);
  const updateMaintenanceAction = useUpdateMaintenanceAction(id as string);
  const form = useMaintenanceForm();
  const navigate = useNavigate();

  useEffect(() => {
    if (maintenance) {
      form.reset({
        vehicle_id: maintenance.vehicle_id || '',
        date: maintenance.date || '',
        type: (maintenance.type as MaintenanceFormData['type']) || 'preventive',
        description: maintenance.description || '',
        cost: maintenance.cost !== null ? String(maintenance.cost) : '',
        mileage:
          maintenance.mileage !== null ? String(maintenance.mileage) : '',
        next_due: maintenance.next_due || ''
      });
    }
  }, [maintenance, form]);

  const onSubmit = (data: MaintenanceFormData) => {
    const transformedData = {
      ...data,
      cost: data.cost === '' ? null : Number(data.cost),
      mileage: data.mileage === '' ? null : Number(data.mileage),
      next_due: data.next_due === '' ? null : data.next_due
    };
    updateMaintenanceAction
      .updateMaintenanceAction(transformedData)
      .then(() => {
        navigate({ to: '/maintenance' });
      })
      .catch((error) => {
        console.error('Error updating maintenance:', error);
      });
  };

  if (isLoadingMaintenance || isLoadingVehicles) {
    return <div>Loading...</div>;
  }

  if (!id) {
    return <div>Invalid maintenance ID</div>;
  }

  if (!maintenance) {
    return <div>Maintenance record not found</div>;
  }

  return (
    <div>
      <form
        className="flex flex-col justify-center"
        id="update-maintenance-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Edit Maintenance Record</h1>
            <p className="text-muted-foreground text-balance">
              Update the maintenance details below.
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
              name="date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="date">Date *</FieldLabel>
                  <Input
                    {...field}
                    id="date"
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
              name="type"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="type">Type *</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(MAINTENANCE_TYPE).map((type) => (
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
              name="cost"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="cost">Cost</FieldLabel>
                  <Input
                    {...field}
                    id="cost"
                    type="number"
                    step="0.01"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter cost"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="mileage"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="mileage">Mileage</FieldLabel>
                  <Input
                    {...field}
                    id="mileage"
                    type="number"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter mileage"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="next_due"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="next_due">Next Due Date</FieldLabel>
                  <Input
                    {...field}
                    id="next_due"
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
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="col-span-2">
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <Textarea
                    {...field}
                    id="description"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter maintenance description"
                    rows={4}
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
            form="update-maintenance-form"
            disabled={updateMaintenanceAction.isLoading}
          >
            {updateMaintenanceAction.isLoading
              ? 'Updating...'
              : 'Update Maintenance'}
          </Button>
        </Field>
      </form>
    </div>
  );
}

export default MaintenanceInner;
