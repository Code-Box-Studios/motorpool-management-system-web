import { RecordError } from '@/components/shared/record-error';
import { useCallback, useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Loading } from '@/components/ui/loader';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import EntityImage from '@/components/shared/entity-image';
import { ImageUpload } from '@/components/shared/image-upload';
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
import { useUserRole } from '@/hooks/use-user-role';
import {
  useSparePartUpdateForm,
  type UpdateSparePartFormData
} from './actions';
import { useSparePart } from '@/lib/query/spare-parts';
import {
  useUpdateSparePart,
  useDeleteSparePart
} from '@/lib/mutation/spare-parts';
import { USER_ROLES } from '@/lib/enums';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api/client';
import type { UpdateSparePart } from '@/lib/types';

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
  const {
    data: sparePart,
    isLoading: recordLoading,
    error: recordError,
    isFetching,
    refetch
  } = useSparePart(sparePartId);
  const { data: userRole } = useUserRole();
  const updateSparePart = useUpdateSparePart();
  const deleteSparePart = useDeleteSparePart();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editRevision, setEditRevision] = useState<string>();
  const [stockConflict, setStockConflict] = useState(false);
  const [refreshedStock, setRefreshedStock] = useState<number | null>(null);
  const [pendingData, setPendingData] =
    useState<UpdateSparePartFormData | null>(null);

  // Removing a part is an admin capability, matching the API's admin-only
  // DELETE — everyone else never sees the action offered.
  const isAdmin = userRole?.roles?.name === USER_ROLES.admin;

  const form = useSparePartUpdateForm();
  const { dirtyFields } = form.formState;

  useBreadcrumbLabel(sparePart?.name);

  const resetFromRecord = useCallback(() => {
    if (sparePart) {
      form.reset({
        name: sparePart.name,
        brand: sparePart.brand || '',
        description: sparePart.description || '',
        quantity: sparePart.quantity || 0
      });
    }
  }, [sparePart, form]);

  useEffect(() => {
    if (!isEditing) resetFromRecord();
  }, [resetFromRecord, isEditing]);

  const onSubmit = (data: UpdateSparePartFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmUpdate = () => {
    if (sparePart && pendingData) {
      const { newImage } = pendingData;
      const updates: UpdateSparePart = {
        ...(dirtyFields.name ? { name: pendingData.name } : {}),
        ...(dirtyFields.brand ? { brand: pendingData.brand } : {}),
        ...(dirtyFields.description
          ? { description: pendingData.description }
          : {}),
        ...(dirtyFields.quantity
          ? { quantity: pendingData.quantity, expectedUpdatedAt: editRevision }
          : {})
      };
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
          },
          onError: (error) => {
            setShowConfirm(false);
            setPendingData(null);
            if (
              error instanceof ApiError &&
              error.code === 'STOCK_REVISION_CONFLICT'
            ) {
              setStockConflict(true);
              setRefreshedStock(null);
            }
          }
        }
      );
    }
  };

  // A part still listed on a job order is refused with a 409; the mutation
  // toasts the server's message, so the dialog just closes and the record stays
  // put.
  const handleConfirmDelete = () => {
    if (!sparePart) return;
    deleteSparePart.mutate(sparePart.id, {
      onSuccess: () => navigate({ to: '/spare-parts' }),
      onSettled: () => setShowDelete(false)
    });
  };

  const cancelEditing = () => {
    resetFromRecord();
    setIsEditing(false);
    setRemoveImage(false);
    setPendingData(null);
    setShowConfirm(false);
    setStockConflict(false);
    setRefreshedStock(null);
  };

  const refreshStock = async () => {
    const result = await refetch();
    if (!result.isSuccess) return;
    setEditRevision(result.data.updated_at ?? undefined);
    setRefreshedStock(result.data.quantity);
    setStockConflict(false);
  };

  if (recordError || (!recordLoading && !sparePart))
    return (
      <RecordError
        error={recordError}
        backTo="/spare-parts"
        onRetry={() => void refetch()}
      />
    );
  if (recordLoading || !sparePart) return <Loading />;

  const quantity = sparePart.quantity ?? 0;

  return (
    // A part carries only a handful of facts; letting the record stretch the
    // full 1600px shell left the values marooned with dead canvas between them.
    // Cap it to a comfortable, centred reading column so the card reads as one
    // record, not a sparse band. The same width holds in view and edit mode.
    <div className="mx-auto w-full max-w-4xl">
      <RecordHeader
        title={sparePart.name}
        meta={sparePart.brand || undefined}
        backTo="/spare-parts"
        backLabel="Spare Parts"
        actions={
          isEditing ? undefined : (
            <Button
              onClick={() => {
                resetFromRecord();
                setEditRevision(sparePart.updated_at ?? undefined);
                setIsEditing(true);
              }}
            >
              Edit
            </Button>
          )
        }
      />

      {isEditing ? (
        <form id="edit-spare-part-form" onSubmit={form.handleSubmit(onSubmit)}>
          {stockConflict && (
            <div
              role="alert"
              className="border-destructive text-destructive mb-5 rounded-lg border p-4"
            >
              <p>
                Stock changed. Refresh the current stock, review your draft
                quantity, then save again.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={isFetching}
                onClick={() => void refreshStock()}
              >
                Refresh stock and keep draft
              </Button>
            </div>
          )}
          {refreshedStock !== null && (
            <p role="status" className="text-muted-foreground mb-5 text-sm">
              Current stock: {refreshedStock}. Your draft is preserved. Review
              the quantity before saving again.
            </p>
          )}
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
                      <ImageUpload
                        id="newImage"
                        files={field.value ? [field.value] : []}
                        onFilesChange={(files) => field.onChange(files[0])}
                        currentImage={removeImage ? null : sparePart.image}
                        currentImageAlt={sparePart.name}
                        onRemoveCurrent={() => setRemoveImage(true)}
                        onBlur={field.onBlur}
                        inputRef={field.ref}
                        name={field.name}
                        disabled={updateSparePart.isPending}
                        invalid={fieldState.invalid}
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
                {updateSparePart.isPending
                  ? 'Updating...'
                  : 'Update Spare Part'}
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

          {isAdmin && (
            <DetailSection
              title="Danger zone"
              description="Deleting a part is permanent. If it appears on an existing job order, set its quantity to 0 instead."
            >
              <Button variant="destructive" onClick={() => setShowDelete(true)}>
                Delete spare part
              </Button>
            </DetailSection>
          )}
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

      <ConfirmationModal
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete Spare Part"
        description={`This permanently removes ${sparePart.name} from the parts catalogue. This action cannot be undone.`}
        confirmLabel="Delete permanently"
        variant="destructive"
        loading={deleteSparePart.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default SparePartsInner;
