import { useEffect, useState } from 'react';
import { Controller, type FieldErrors } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useVehicles } from '@/lib/query/vehicles';
import { useBranches } from '@/lib/query/shared';
import { useAuth } from '@/hooks/use-auth';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import Stepper from '@/components/shared/stepper';
import { DetailGrid, DetailItem } from '@/components/shared/detail-view';
import StatusBadge from '@/components/shared/status-badge';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';
import {
  useJobOrderForm,
  useAddJobOrderAction,
  type JobOrderFormData
} from './actions';

// Raising a repair is two questions and a look before you send it: which van, and
// what happened to it. Everything else on this form belonged to the ADMIN's later
// steps and had no business being asked here.
const STEPS = [
  { title: 'The vehicle', fields: ['branch_id', 'vehicle_id'] },
  { title: 'What happened', fields: ['incident_date', 'incident_details'] },
  { title: 'Review', fields: [] }
] as const satisfies ReadonlyArray<{
  title: string;
  fields: ReadonlyArray<keyof JobOrderFormData>;
}>;

const LAST = STEPS.length - 1;

// An incident cannot have happened tomorrow, so the picker cannot offer it.
const nowLocal = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

const formatWhen = (value: string | undefined) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
};

interface JobOrderFormProps {
  onDone: () => void;
}

export function AddJobOrder({ onDone }: JobOrderFormProps) {
  const { data: vehicles } = useVehicles(1, 100);
  const { data: branches } = useBranches();
  const addJobOrderAction = useAddJobOrderAction();
  const form = useJobOrderForm();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<JobOrderFormData | null>(null);

  useEffect(() => {
    // The server takes the requester from the authenticated caller and only
    // honours this when an admin raises one on someone else's behalf. Sending it
    // keeps that door open; it is not what the request is trusted on.
    if (user) form.setValue('requested_by', user.id);
  }, [user, form]);

  const goNext = async () => {
    const fields = STEPS[step]?.fields ?? [];
    const ok = fields.length === 0 || (await form.trigger([...fields]));
    if (!ok) return;
    const next = Math.min(step + 1, LAST);
    setStep(next);
    setFurthest((f) => Math.max(f, next));
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  // A failed final submit may be about a field on a step that isn't showing.
  const onInvalid = (errors: FieldErrors<JobOrderFormData>) => {
    const bad = STEPS.findIndex((s) => s.fields.some((f) => f in errors));
    if (bad >= 0) setStep(bad);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    if (e.target instanceof HTMLTextAreaElement) return;
    if (step < LAST) {
      e.preventDefault();
      void goNext();
    }
  };

  const onSubmit = (data: JobOrderFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmAdd = () => {
    if (!pendingData) return;
    addJobOrderAction
      .addJobOrder(pendingData)
      .then(() => {
        form.reset();
        setShowConfirm(false);
        setPendingData(null);
        onDone();
      })
      .catch((error) => {
        console.error('Error adding job order:', error);
        setShowConfirm(false);
      });
  };

  const review = form.watch();
  const reviewVehicle = vehicles?.data?.find((v) => v.id === review.vehicle_id);

  return (
    <div>
      <form
        id="add-job-order-form"
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        onKeyDown={handleKeyDown}
      >
        <FormLayout>
          <Stepper
            steps={STEPS.map((s) => ({ title: s.title }))}
            current={step}
            furthest={furthest}
            onStepClick={setStep}
          />

          <FormSection
            title="The vehicle"
            description="Which van needs the workshop."
            className={step === 0 ? undefined : 'hidden'}
          >
            <FormRow>
              <Controller
                name="branch_id"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="branch_id">Branch *</FieldLabel>
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
                        {/* Every vehicle, not just the available ones: a van that
                            is already out of service is exactly the one you raise
                            a repair for. What the workshop cannot take is one
                            that is out on a trip — the API refuses to note it
                            (409 VEHICLE_ON_TRIP) until it is back — so carry the
                            status on the option rather than let someone raise a
                            repair that cannot be worked. */}
                        {vehicles?.data?.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            <span className="flex w-full items-center gap-2">
                              <span>
                                {vehicle.make} {vehicle.model} —{' '}
                                {vehicle.license_plate}
                              </span>
                              {vehicle.status && (
                                <span className="text-muted-foreground text-xs">
                                  ({vehicle.status.replace(/_/g, ' ')})
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {reviewVehicle?.status === 'on_trip' && (
                      <p className="text-muted-foreground text-xs">
                        This van is out on a trip. You can raise the repair now,
                        but the workshop cannot start it until the van is back.
                      </p>
                    )}
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FormRow>
          </FormSection>

          <FormSection
            title="What happened"
            description="When the fault occurred, and what the mechanic needs to know."
            className={step === 1 ? undefined : 'hidden'}
          >
            <div className="flex flex-col gap-5">
              <FormRow>
                <Controller
                  name="incident_date"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="incident_date">
                        Incident date and time *
                      </FieldLabel>
                      <Input
                        {...field}
                        id="incident_date"
                        type="datetime-local"
                        // The API refuses a future incident
                        // (400 INCIDENT_IN_THE_FUTURE); the picker should not
                        // offer one either.
                        max={nowLocal()}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FormRow>

              <Controller
                name="incident_details"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="incident_details">
                      What is wrong *
                    </FieldLabel>
                    <Textarea
                      {...field}
                      id="incident_details"
                      aria-invalid={fieldState.invalid}
                      placeholder="Describe the fault — the admin assigns a mechanic and notes the parts off the back of this."
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

          {step === LAST && (
            <FormSection
              title="Review"
              description="What the admin will see. Tap a step above to change anything."
            >
              <DetailGrid>
                <DetailItem
                  label="Branch"
                  value={branches?.find((b) => b.id === review.branch_id)?.name}
                />
                <DetailItem
                  label="Vehicle"
                  value={
                    reviewVehicle
                      ? `${reviewVehicle.make} ${reviewVehicle.model}`
                      : undefined
                  }
                />
                <DetailItem
                  label="Plate"
                  value={reviewVehicle?.license_plate}
                  mono
                />
                <DetailItem
                  label="Vehicle status"
                  value={
                    reviewVehicle?.status ? (
                      <StatusBadge status={reviewVehicle.status} />
                    ) : undefined
                  }
                />
                <DetailItem
                  label="Incident"
                  value={formatWhen(review.incident_date)}
                />
                <DetailItem
                  label="What is wrong"
                  value={review.incident_details}
                  wide
                />
              </DetailGrid>
            </FormSection>
          )}

          <FormSection
            title="Anything else"
            className={step === LAST ? undefined : 'hidden'}
          >
            <Controller
              name="remarks"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="remarks">Remarks (optional)</FieldLabel>
                  <Textarea
                    {...field}
                    id="remarks"
                    placeholder="Anything else the workshop should know"
                    rows={3}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FormSection>

          {/* Cancel away on the left; the way forward on the right. */}
          <FormActions>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={goBack}>
                  Back
                </Button>
              )}
              {/* The keys matter. Without them React reconciles these two as the
                  SAME <button> and just swaps type="button" -> type="submit" —
                  and because a click is a discrete event, React flushes that
                  re-render BEFORE the browser performs the click's default
                  action. So the very click that meant "next" arrived at the last
                  step as a form submit, and Continue threw the "are you sure you
                  want to submit?" confirmation in your face. Distinct keys mount
                  a fresh node; preventDefault is the belt to that braces. */}
              {step === LAST ? (
                <Button
                  key="submit"
                  type="submit"
                  disabled={addJobOrderAction.isLoading}
                >
                  {addJobOrderAction.isLoading
                    ? 'Submitting...'
                    : 'Submit Request'}
                </Button>
              ) : (
                <Button
                  key="next"
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    void goNext();
                  }}
                >
                  Continue
                </Button>
              )}
            </div>
          </FormActions>
        </FormLayout>
      </form>

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Submit Job Order"
        description="Are you sure you want to submit this job order request?"
        confirmLabel="Submit Request"
        loading={addJobOrderAction.isLoading}
        onConfirm={handleConfirmAdd}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}

export default AddJobOrder;
