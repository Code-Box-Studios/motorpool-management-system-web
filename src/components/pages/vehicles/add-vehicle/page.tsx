import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import {
  useVehicleForm,
  useAddVehicleAction,
  type VehicleFormData
} from './actions';
import { useNavigate } from '@tanstack/react-router';
import { useDrivers } from '@/lib/query/drivers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { FUEL_TYPE, VEHICLE_STATUS } from '@/lib/enums';
import { useBranches } from '@/lib/query/shared';

export function AddVehicle() {
  const { data: drivers } = useDrivers(1, 100);
  const { data: branches } = useBranches();
  const addVehicleAction = useAddVehicleAction();
  const form = useVehicleForm();
  const navigate = useNavigate();

  const onSubmit = (data: VehicleFormData) => {
    addVehicleAction
      .addVehicle(data)
      .then(() => {
        form.reset();
        navigate({ to: '/vehicles' });
      })
      .catch((error) => {
        console.error('Error adding vehicle:', error);
      });
  };

  return (
    <div>
      <form
        className="flex flex-col justify-center"
        id="add-vehicle-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Add a Vehicle</h1>
            <p className="text-muted-foreground text-balance">
              Enter the vehicle's details below.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-11">
            <Controller
              name="make"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="make">Make *</FieldLabel>
                  <Input
                    {...field}
                    id="make"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter make"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="model"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="model">Model *</FieldLabel>
                  <Input
                    {...field}
                    id="model"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter model"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="year"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="year">Year *</FieldLabel>
                  <Input
                    {...field}
                    id="year"
                    type="number"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter year"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="license_plate"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="license_plate">
                    License Plate *
                  </FieldLabel>
                  <Input
                    {...field}
                    id="license_plate"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter license plate"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="vin"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="vin">VIN *</FieldLabel>
                  <Input
                    {...field}
                    id="vin"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter VIN"
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
                      {Object.values(VEHICLE_STATUS).map((status) => (
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
              name="assigned_driver"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="assigned_driver">
                    Assigned Driver
                  </FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a driver" />
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
              name="branch"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="branch">Branch *</FieldLabel>
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
              name="fuel_type"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="fuel_type">Fuel Type *</FieldLabel>
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
              name="mileage"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="mileage">Mileage *</FieldLabel>
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
              name="insurance_expiry"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="insurance_expiry">
                    Insurance Expiry *
                  </FieldLabel>
                  <Input
                    {...field}
                    id="insurance_expiry"
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
              name="registration_expiry"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="registration_expiry">
                    Registration Expiry *
                  </FieldLabel>
                  <Input
                    {...field}
                    id="registration_expiry"
                    type="date"
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
            name="images"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="images">Images</FieldLabel>
                <Input
                  id="images"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) =>
                    field.onChange(Array.from(e.target.files || []))
                  }
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>

        <Field className="mt-10 w-fit">
          <Button
            type="submit"
            className="w-fit px-11"
            form="add-vehicle-form"
            disabled={addVehicleAction.isLoading}
          >
            {addVehicleAction.isLoading ? 'Adding...' : 'Add Vehicle'}
          </Button>
        </Field>
      </form>
    </div>
  );
}

export default AddVehicle;
