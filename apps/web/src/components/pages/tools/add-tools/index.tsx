import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import { useToolForm, useAddToolAction, type ToolFormData } from './action';
import { useNavigate } from '@tanstack/react-router';
import { useDrivers } from '@/lib/query/drivers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { TOOL_STATUS } from '@/lib/enums';
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

export function AddTool() {
  const { data: drivers } = useDrivers(1, 100);
  const addToolAction = useAddToolAction();
  const form = useToolForm();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<ToolFormData | null>(null);

  const onSubmit = (data: ToolFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmAdd = () => {
    if (!pendingData) return;
    addToolAction
      .addTool(pendingData)
      .then(() => {
        form.reset();
        setShowConfirm(false);
        setPendingData(null);
        navigate({ to: '/tools' });
      })
      .catch((error) => {
        console.error('Error adding tool:', error);
        setShowConfirm(false);
      });
  };

  return (
    <div>
      <PageHeader
        title="Add a Tool"
        description="Enter the tool's details below."
      />

      <form id="add-tool-form" onSubmit={form.handleSubmit(onSubmit)}>
        <FormLayout>
          <FormSection title="The tool">
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
                        placeholder="Enter tool name"
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
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(TOOL_STATUS).map((status) => (
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
            </div>
          </FormSection>

          <FormSection
            title="Out on loan"
            description="Only fill these in if the tool is already with someone."
          >
            <div className="flex flex-col gap-5">
              <FormRow>
                <Controller
                  name="borrowed_by"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="borrowed_by">Borrowed By</FieldLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
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
                  name="borrowed_date"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="borrowed_date">
                        Borrowed Date
                      </FieldLabel>
                      <Input
                        {...field}
                        id="borrowed_date"
                        type="date"
                        aria-invalid={fieldState.invalid}
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
                  name="estimated_return_date"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="estimated_return_date">
                        Estimated Return Date
                      </FieldLabel>
                      <Input
                        {...field}
                        id="estimated_return_date"
                        type="date"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FormRow>
            </div>
          </FormSection>

          <FormActions>
            <Button
              type="submit"
              form="add-tool-form"
              disabled={addToolAction.isLoading}
            >
              {addToolAction.isLoading ? 'Adding...' : 'Add Tool'}
            </Button>
          </FormActions>
        </FormLayout>
      </form>

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Add Tool"
        description="Are you sure you want to add this tool?"
        confirmLabel="Add Tool"
        loading={addToolAction.isLoading}
        onConfirm={handleConfirmAdd}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}

export default AddTool;
