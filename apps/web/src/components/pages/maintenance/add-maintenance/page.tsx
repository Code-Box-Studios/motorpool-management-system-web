import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import {
  useMaintenanceForm,
  useAddMaintenanceAction,
  type MaintenanceFormData
} from './actions';
import { useNavigate } from '@tanstack/react-router';
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
import { useState } from 'react';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import PageHeader from '@/components/shared/page-header';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';

export function AddMaintenance() {
  const { data: vehicles } = useVehicles(1, 100);
  const addMaintenanceAction = useAddMaintenanceAction();
  const form = useMaintenanceForm();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<MaintenanceFormData | null>(
    null
  );

  const onSubmit = (data: MaintenanceFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmAdd = () => {
    if (!pendingData) return;
    addMaintenanceAction
      .addMaintenance(pendingData)
      .then(() => {
        form.reset();
        setShowConfirm(false);
        setPendingData(null);
        navigate({ to: '/maintenance' });
      })
      .catch((error) => {
        console.error('Error adding maintenance:', error);
        setShowConfirm(false);
      });
  };

  return (
    <div>
      <PageHeader
        title="Create Maintenance Record"
        description="Enter the maintenance details below."
      />

      <form id="add-maintenance-form" onSubmit={form.handleSubmit(onSubmit)}>
        <FormLayout>
          <FormSection title="What was done">
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
                      >
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
                  name="type"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="type">Type *</FieldLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
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
              </FormRow>

              <Controller
                name="description"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
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
          </FormSection>

          <FormSection title="When">
            <FormRow>
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
                name="next_due"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="next_due">Next Due Date</FieldLabel>
                    <Input
                      {...field}
                      id="next_due"
                      type="date"
                      min={form.watch('date') || undefined}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FormRow>
          </FormSection>

          <FormSection title="Cost and mileage">
            <FormRow>
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
            </FormRow>
          </FormSection>

          <FormActions>
            <Button
              type="submit"
              form="add-maintenance-form"
              disabled={addMaintenanceAction.isLoading}
            >
              {addMaintenanceAction.isLoading
                ? 'Creating...'
                : 'Create Maintenance'}
            </Button>
          </FormActions>
        </FormLayout>
      </form>

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Create Maintenance Record"
        description="Are you sure you want to create this maintenance record?"
        confirmLabel="Create Maintenance"
        loading={addMaintenanceAction.isLoading}
        onConfirm={handleConfirmAdd}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}

export default AddMaintenance;
