import { useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Loading } from '@/components/ui/loader';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import EntityImage from '@/components/shared/entity-image';
import {
  RecordHeader,
  DetailSection,
  DetailGrid,
  DetailItem
} from '@/components/shared/detail-view';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';
import { useBreadcrumbLabel } from '@/hooks/use-breadcrumb';
import {
  useSparePartUpdateForm,
  type UpdateSparePartFormData
} from './actions';
import { useSparePart } from '@/lib/query/spare-parts';
import { useUpdateSparePart } from '@/lib/mutation/spare-parts';
import { cn } from '@/lib/utils';

const formatDateTime = (value?: string | null) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const SparePartsInner = ({ sparePartId }: { sparePartId: string }) => {
  const { data: sparePart } = useSparePart(sparePartId);
  const updateSparePart = useUpdateSparePart();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] =
    useState<UpdateSparePartFormData | null>(null);

  const form = useSparePartUpdateForm();

  useBreadcrumbLabel(sparePart?.name);

  useEffect(() => {
    if (sparePart) {
      form.reset({
        name: sparePart.name,
        brand: sparePart.brand || '',
        description: sparePart.description || '',
        quantity: sparePart.quantity || 0
      });
    }
  }, [sparePart, form]);

  const onSubmit = (data: UpdateSparePartFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmUpdate = () => {
    if (sparePart && pendingData) {
      const { newImage, ...updates } = pendingData;
      updateSparePart.mutate(
        {
          id: sparePart.id,
          updates,
          file: newImage,
          removeImage
        },
        {
          onSuccess: () => {
            setIsEditing(false);
            setRemoveImage(false);
            setShowConfirm(false);
            setPendingData(null);
            navigate({ to: '/spare-parts' });
          }
        }
      );
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setRemoveImage(false);
  };

  if (!sparePart) return <Loading />;

  const quantity = sparePart.quantity ?? 0;

  return (
    <div>
      <RecordHeader
        title={sparePart.name}
        meta={sparePart.brand || undefined}
        backTo="/spare-parts"
        backLabel="Spare Parts"
        actions={
          isEditing ? undefined : (
            <Button onClick={() => setIsEditing(true)}>Edit</Button>
          )
        }
      />

      {isEditing ? (
        <form id="edit-spare-part-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FormLayout>
            <FormSection title="Part">
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
                          placeholder="Enter name"
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

            <FormSection title="Photo">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                {sparePart.image && !removeImage && (
                  <div className="relative w-full max-w-[220px] shrink-0">
                    <img
                      src={sparePart.image}
                      alt={sparePart.name}
                      className="border-border bg-muted aspect-square w-full rounded-[20px] border object-contain"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 rounded-full p-1"
                      onClick={() => setRemoveImage(true)}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <Controller
                  name="newImage"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="flex-1">
                      <FieldLabel htmlFor="newImage">
                        {removeImage || !sparePart.image
                          ? 'Add Image'
                          : 'Replace Image'}
                      </FieldLabel>
                      <Input
                        id="newImage"
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
              </div>
            </FormSection>

            <FormActions>
              <Button
                type="submit"
                form="edit-spare-part-form"
                disabled={updateSparePart.isPending}
              >
                {updateSparePart.isPending ? 'Updating...' : 'Update Spare Part'}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEditing}>
                Cancel
              </Button>
            </FormActions>
          </FormLayout>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <DetailSection title="Part">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <EntityImage
                src={sparePart.image}
                alt={sparePart.name}
                className="border-border aspect-square w-full max-w-[220px] shrink-0 rounded-[20px] border"
              />
              <DetailGrid className="flex-1 lg:grid-cols-2">
                <DetailItem label="Brand" value={sparePart.brand} />
                <DetailItem
                  label="In Stock"
                  // Running out is the fact worth noticing on this record, and it
                  // is flagged the same way it is on the parts grid.
                  value={
                    <span className={cn(quantity === 0 && 'text-signal')}>
                      {quantity}
                    </span>
                  }
                />
                <DetailItem
                  label="Last Updated"
                  value={formatDateTime(sparePart.updated_at)}
                />
                <DetailItem
                  label="Description"
                  value={sparePart.description}
                  wide
                />
              </DetailGrid>
            </div>
          </DetailSection>
        </div>
      )}

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Update Spare Part"
        description="Are you sure you want to save these changes to the spare part?"
        confirmLabel="Update Spare Part"
        loading={updateSparePart.isPending}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
};

export default SparePartsInner;
