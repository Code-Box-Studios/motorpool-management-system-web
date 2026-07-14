import { Button } from '@/components/ui/button';
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
import PageHeader from '@/components/shared/page-header';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';

export function AddSparePart() {
  const addSparePartAction = useAddSparePartAction();
  const form = useSparePartForm();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<SparePartFormData | null>(
    null
  );

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
      <PageHeader
        title="Add a Spare Part"
        description="Enter the spare part's details below."
      />

      <form id="add-spare-part-form" onSubmit={form.handleSubmit(onSubmit)}>
        <FormLayout>
          <FormSection title="The part">
            <div className="flex flex-col gap-5">
              <FormRow>
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
          </FormSection>

          <FormSection title="Stock and photo">
            <FormRow>
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
            </FormRow>
          </FormSection>

          <FormActions>
            <Button
              type="submit"
              form="add-spare-part-form"
              disabled={addSparePartAction.isLoading}
            >
              {addSparePartAction.isLoading ? 'Adding...' : 'Add Spare Part'}
            </Button>
          </FormActions>
        </FormLayout>
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
