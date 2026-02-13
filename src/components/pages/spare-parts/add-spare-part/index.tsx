import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import {
  useSparePartForm,
  useAddSparePartAction,
  type SparePartFormData
} from './action';
import { useNavigate } from '@tanstack/react-router';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';

export function AddSparePart() {
  const addSparePartAction = useAddSparePartAction();
  const form = useSparePartForm();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<SparePartFormData | null>(null);

  const onSubmit = (data: SparePartFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmAdd = () => {
    if (!pendingData) return;
    addSparePartAction
      .addSparePart(pendingData)
      .then(() => {
        form.reset();
        setShowConfirm(false);
        setPendingData(null);
        navigate({ to: '/spare-parts' });
      })
      .catch((error) => {
        console.error('Error adding spare part:', error);
        setShowConfirm(false);
      });
  };

  return (
    <div>
      <form
        className="flex flex-col justify-center"
        id="add-spare-part-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Add a Spare Part</h1>
            <p className="text-muted-foreground text-balance">
              Enter the spare part's details below.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-11">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="name">Name *</FieldLabel>
                  <Input
                    {...field}
                    id="name"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter spare part name"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="brand"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="brand">Brand</FieldLabel>
                  <Input
                    {...field}
                    id="brand"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter brand"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="quantity"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="quantity">Quantity *</FieldLabel>
                  <Input
                    {...field}
                    id="quantity"
                    type="number"
                    min="0"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter quantity"
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value) || 0)
                    }
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="image"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="image">Image</FieldLabel>
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      field.onChange(file);
                    }}
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
                    placeholder="Enter description"
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
            form="add-spare-part-form"
            disabled={addSparePartAction.isLoading}
          >
            {addSparePartAction.isLoading ? 'Adding...' : 'Add Spare Part'}
          </Button>
        </Field>
      </form>

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Add Spare Part"
        description="Are you sure you want to add this spare part?"
        confirmLabel="Add Spare Part"
        loading={addSparePartAction.isLoading}
        onConfirm={handleConfirmAdd}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}

export default AddSparePart;
