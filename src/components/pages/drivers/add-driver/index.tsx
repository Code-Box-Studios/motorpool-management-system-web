import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateDriver } from '@/lib/mutation/drivers';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import { useDriverForm, type DriverFormData } from './action';
import { useNavigate } from '@tanstack/react-router';

export function AddDriver() {
  const createDriver = useCreateDriver();
  const form = useDriverForm();
  const navigate = useNavigate();

  const onSubmit = (data: DriverFormData) => {
    createDriver.mutate(data, {
      onSuccess: () => {
        form.reset();
        navigate({ to: '/drivers' });
      }
    });
  };

  return (
    <div>
      <form
        className="flex flex-col justify-center p-11 md:p-13"
        id="add-driver-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Add a Driver</h1>
            <p className="text-muted-foreground text-balance">
              Enter the driver's details below.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-11">
            <Controller
              name="full_name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="full_name">Full Name *</FieldLabel>
                  <Input
                    {...field}
                    id="full_name"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter full name"
                    autoComplete="name"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="license_number"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="license_number">
                    License Number *
                  </FieldLabel>
                  <Input
                    {...field}
                    id="license_number"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter license number"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="phone"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="phone">Phone</FieldLabel>
                  <Input
                    {...field}
                    id="phone"
                    type="tel"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter phone number"
                    autoComplete="tel"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="email"
                    type="email"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter email"
                    autoComplete="email"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="date_of_birth"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="date_of_birth">Date of Birth</FieldLabel>
                  <Input
                    {...field}
                    id="date_of_birth"
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
              name="license_expiry"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="license_expiry">
                    License Expiry
                  </FieldLabel>
                  <Input
                    {...field}
                    id="license_expiry"
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
              name="hire_date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="hire_date">Hire Date</FieldLabel>
                  <Input
                    {...field}
                    id="hire_date"
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
              name="status"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="status">Status</FieldLabel>
                  <Input
                    {...field}
                    id="status"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Active"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
          <Controller
            name="address"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="address">Address</FieldLabel>
                <Textarea
                  {...field}
                  id="address"
                  aria-invalid={fieldState.invalid}
                  placeholder="Enter address"
                  rows={3}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="notes"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="notes">Notes</FieldLabel>
                <Textarea
                  {...field}
                  id="notes"
                  aria-invalid={fieldState.invalid}
                  placeholder="Additional notes"
                  rows={3}
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
            form="add-driver-form"
            disabled={createDriver.isPending}
          >
            {createDriver.isPending ? 'Adding...' : 'Add Driver'}
          </Button>
        </Field>
      </form>
    </div>
  );
}
