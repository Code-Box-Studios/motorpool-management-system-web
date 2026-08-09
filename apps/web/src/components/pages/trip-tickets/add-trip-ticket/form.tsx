import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller, type FieldErrors } from 'react-hook-form';
import { TrashIcon, PlusIcon } from 'lucide-react';
import {
  useTripTicketForm,
  useAddTripTicketAction,
  type TripTicketFormData
} from './actions';
import { useDrivers } from '@/lib/query/drivers';
import { useVehicles } from '@/lib/query/vehicles';
import { useBranches } from '@/lib/query/shared';
import { useDepartmentOffices, useOfficeHeads } from '@/lib/query/offices';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useUserRole } from '@/hooks/use-user-role';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import Stepper from '@/components/shared/stepper';
import DestinationPicker from '@/components/shared/destination-picker';
import { DetailGrid, DetailItem } from '@/components/shared/detail-view';
import { BorrowedBadge } from '@/components/shared/borrowed-badge';
import { isBorrowed } from '@/lib/borrowed';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';

// One question at a time. Each step owns the fields it validates, so you cannot
// walk past a step you have not finished — and you never see an error about a
// field two steps away that you have not been shown yet.
const STEPS = [
  {
    title: "Who it's for",
    fields: ['branch_id', 'office_id', 'office_head_id']
  },
  {
    title: 'The trip',
    fields: [
      'vehicle_id',
      'driver_id',
      'destination',
      'participants_count',
      'purpose',
      'participants'
    ]
  },
  { title: 'When', fields: ['start_ts', 'end_ts'] },
  { title: 'Review', fields: [] }
] as const satisfies ReadonlyArray<{
  title: string;
  fields: ReadonlyArray<keyof TripTicketFormData>;
}>;

const LAST = STEPS.length - 1;

// The review reads back what was chosen, so an id has to become the name that was
// picked — the approver never sees a key and neither should the person reviewing.
const nameOf = (
  list: { id: string; name: string }[] | undefined,
  id: string | undefined
) => (id ? list?.find((item) => item.id === id)?.name : undefined);

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

interface TripTicketFormProps {
  /** Prefilled departure date — the calendar opens this by clicking a day. */
  initialDate?: string;
  /** Close the dialog: called on cancel AND after a successful submit. */
  onDone: () => void;
}

export function AddTripTicket({ initialDate, onDone }: TripTicketFormProps) {
  const { data: drivers, isLoading: driversLoading } = useDrivers(1, 100);
  const { data: vehicles, isLoading: vehiclesLoading } = useVehicles(1, 100);
  const { data: branches, isLoading: branchesLoading } = useBranches();
  const { data: offices, isLoading: officesLoading } = useDepartmentOffices();
  const { data: officeHeads, isLoading: officeHeadsLoading } = useOfficeHeads();
  const addTripTicketAction = useAddTripTicketAction();
  const form = useTripTicketForm();
  const { user } = useAuth();
  const { data: userRole } = useUserRole();

  // State for managing participants list
  const [participants, setParticipants] = useState<string[]>(['']);
  const [showConfirm, setShowConfirm] = useState(false);

  // A trip cannot carry more people than the van has seats — the API refuses it
  // (409 OVER_CAPACITY), so the form says so while the vehicle is being chosen
  // rather than after the request has been written out in full.
  const selectedVehicleId = form.watch('vehicle_id');
  const seats =
    vehicles?.data?.find((v) => v.id === selectedVehicleId)?.capacity ?? null;

  const [step, setStep] = useState(0);
  // The furthest step reached: everything up to it can be jumped back to from the
  // stepper, but you cannot skip ahead past a step you have not completed.
  const [furthest, setFurthest] = useState(0);

  const goNext = async () => {
    const fields = STEPS[step]?.fields ?? [];
    // Validate only THIS step's fields. Validating the whole form here would
    // light up errors on fields the person has not been shown yet.
    const ok = fields.length === 0 || (await form.trigger([...fields]));
    if (!ok) return;
    const next = Math.min(step + 1, LAST);
    setStep(next);
    setFurthest((f) => Math.max(f, next));
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  // The participant list is the source of truth; the COUNT is derived from it.
  // It used to be the other way round — you typed a number and the form conjured
  // that many boxes, so you had to know the headcount before you knew the names,
  // retyping the number rebuilt the boxes, and the count could drift from the
  // names it was supposed to describe (the API rejects that: PARTICIPANTS_MISMATCH).
  const syncParticipants = (next: string[]) => {
    setParticipants(next);
    const named = next.map((n) => n.trim()).filter(Boolean);
    form.setValue('participants', named.join(', '), {
      shouldValidate: form.formState.isSubmitted
    });
    form.setValue('participants_count', Math.max(named.length, 1));
  };

  const namedCount = participants.filter((p) => p.trim()).length;
  const full = seats !== null && participants.length >= seats;

  // If the final submit fails validation, the offending field may be on a step
  // that isn't showing — so land on it rather than failing silently.
  const onInvalid = (errors: FieldErrors<TripTicketFormData>) => {
    const bad = STEPS.findIndex((s) => s.fields.some((f) => f in errors));
    if (bad >= 0) setStep(bad);
  };

  // What the review step reads back.
  const review = form.watch();
  const reviewVehicle = vehicles?.data?.find((v) => v.id === review.vehicle_id);

  const [pendingData, setPendingData] = useState<TripTicketFormData | null>(
    null
  );

  const userBranchId = userRole?.branch_id || user?.user_metadata?.branch_id;

  // The branch the TRIP is for — not the branch the person filling the form
  // happens to belong to. Both lists below used to key off the user's branch, so
  // an admin booking on Kidapawan's behalf was offered head office's vans and
  // head office's drivers. Fall back to the user's branch only until a branch is
  // picked.
  const tripBranchId: string | null | undefined =
    review.branch_id || userBranchId;
  const tripBranchName = branches?.find((b) => b.id === tripBranchId)?.name;

  // Every branch runs its own vans and borrows another branch's when it needs to.
  // The vans it owns are the default and come first; another branch's are
  // reachable, but under their own heading and tagged with whose they are — a
  // borrow should be a decision, not something you do by not noticing.
  const freeVehicles = (vehicles?.data ?? []).filter(
    (v) => v.status === 'available'
  );
  const ownVehicles = freeVehicles.filter(
    (v) => !isBorrowed(tripBranchId, v.branch)
  );
  const borrowableVehicles = freeVehicles.filter((v) =>
    isBorrowed(tripBranchId, v.branch)
  );

  // Drivers get the same shape for the same reason — and because keying them to
  // the trip's branch WITHOUT a fallback group would hand an admin an empty
  // dropdown the moment they booked for a branch whose drivers they cannot see.
  const activeDrivers = (drivers?.data ?? []).filter(
    (d) => d.status === 'active'
  );
  const ownDrivers = activeDrivers.filter(
    (d) => !isBorrowed(tripBranchId, d.branch_id)
  );
  const otherDrivers = activeDrivers.filter((d) =>
    isBorrowed(tripBranchId, d.branch_id)
  );

  // Whose van this is, when it is not ours. Drives the note under the picker, the
  // review, and (via the same helper) the badge the approver sees.
  const borrowedFrom = isBorrowed(tripBranchId, reviewVehicle?.branch)
    ? (reviewVehicle?.branch_name ?? 'another branch')
    : null;

  // A VAN can be borrowed. An OFFICE cannot — it is the chain the request is
  // filed under, not a resource: branch -> office -> head. Neither list was
  // filtered, so a Main Branch trip could be filed under North Branch's office,
  // signed off by North Branch's office head, and nothing anywhere objected.
  const branchOffices = (offices ?? []).filter(
    (o) => !tripBranchId || o.branch_id === tripBranchId
  );
  const officeHeadsForOffice = (officeHeads ?? []).filter((h) =>
    review.office_id
      ? h.office_id === review.office_id
      : !tripBranchId || h.branch_id === tripBranchId
  );

  // Changing the branch can strand an office (and a head) that belongs to the
  // branch you just left. Drop them rather than submit a trip whose office is
  // somebody else's.
  useEffect(() => {
    if (
      review.office_id &&
      !branchOffices.some((o) => o.id === review.office_id)
    ) {
      form.setValue('office_id', '');
      form.setValue('office_head_id', '');
    }
  }, [review.office_id, branchOffices, form]);

  useEffect(() => {
    if (
      review.office_head_id &&
      !officeHeadsForOffice.some((h) => h.id === review.office_head_id)
    ) {
      form.setValue('office_head_id', '');
    }
  }, [review.office_head_id, officeHeadsForOffice, form]);

  useEffect(() => {
    if (user) {
      form.setValue('requested_by', user.id);
    }
    const today = new Date().toISOString().split('T')[0];
    form.setValue('date_requested', today);
    // Opened by clicking a day on the calendar: start the trip on that day.
    if (initialDate) {
      form.setValue('start_ts', `${initialDate}T08:00`);
    }
  }, [user, form, initialDate]);

  const onSubmit = (data: TripTicketFormData) => {
    // The last word on the headcount. The count field is capped and re-clamped
    // when the vehicle changes, so this should be unreachable — but the API
    // refuses an over-capacity trip (409 OVER_CAPACITY) and a form that can send
    // one is a form that can waste someone's time filling it in.
    if (seats !== null && data.participants_count > seats) {
      form.setError('participants_count', {
        message: `That vehicle seats ${seats}`
      });
      setStep(1); // the step that owns participants_count
      return;
    }
    setPendingData(data);
    setShowConfirm(true);
  };

  // Enter inside a field submits a form by default. On a stepper that would fire
  // the whole submit from step one — validating fields nobody has been shown yet
  // — so up to the last step, Enter means "next" instead.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    if (e.target instanceof HTMLTextAreaElement) return; // a newline is a newline
    if (step < LAST) {
      e.preventDefault();
      void goNext();
    }
  };

  const handleConfirmAdd = () => {
    if (!pendingData) return;
    addTripTicketAction
      .addTripTicket(pendingData)
      .then(() => {
        form.reset();
        setShowConfirm(false);
        setPendingData(null);
        onDone();
      })
      .catch((error) => {
        console.error('Error adding trip ticket:', error);
        setShowConfirm(false);
      });
  };

  return (
    <div>
      <form
        id="add-trip-ticket-form"
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
            title="Who it's for"
            description="The office making the request, and the head who signs it off."
            className={step === 0 ? undefined : 'hidden'}
          >
            <div className="flex flex-col gap-5">
              <FormRow>
                <Controller
                  name="branch_id"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="branch_id">Branch *</FieldLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ''}
                        disabled={branchesLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              branchesLoading ? 'Loading...' : 'Select a branch'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {branches && branches.length > 0 ? (
                            branches.map((branch) => (
                              <SelectItem key={branch.id} value={branch.id}>
                                {branch.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="text-muted-foreground p-2 text-sm">
                              No branches available
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="office_id"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="office_id">
                        Department/Office/College *
                      </FieldLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={officesLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              officesLoading
                                ? 'Loading...'
                                : 'Select department/office'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {branchOffices.length > 0 ? (
                            branchOffices.map((office) => (
                              <SelectItem key={office.id} value={office.id}>
                                {office.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="text-muted-foreground p-2 text-sm">
                              {tripBranchId
                                ? 'This branch has no offices'
                                : 'Pick a branch first'}
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FormRow>

              <FormRow>
                <Controller
                  name="office_head_id"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="office_head_id">
                        Office Head
                      </FieldLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={officeHeadsLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              officeHeadsLoading
                                ? 'Loading...'
                                : 'Select office head'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {officeHeadsForOffice.length > 0 ? (
                            officeHeadsForOffice.map((officeHead) => (
                              <SelectItem
                                key={officeHead.id}
                                value={officeHead.id}
                              >
                                {officeHead.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="text-muted-foreground p-2 text-sm">
                              {review.office_id
                                ? 'This office has no head'
                                : 'Pick an office first'}
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FormRow>
            </div>
          </FormSection>

          <FormSection
            title="The trip"
            description="Free vehicles and active drivers. The branch's own come first; another branch's can be borrowed."
            className={step === 1 ? undefined : 'hidden'}
          >
            <div className="flex flex-col gap-5">
              <FormRow>
                <Controller
                  name="vehicle_id"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="vehicle_id">Vehicle *</FieldLabel>
                      <Select
                        onValueChange={(vehicleId) => {
                          field.onChange(vehicleId);
                          // Changing the van changes how many people fit. Without
                          // this, picking a 9-seater, entering 9, then switching
                          // to a 4-seater left the count at 9 and the trip only
                          // failed on submit.
                          const nextSeats = vehicles?.data?.find(
                            (v) => v.id === vehicleId
                          )?.capacity;
                          if (!nextSeats) return;
                          if (participants.length > nextSeats) {
                            syncParticipants(participants.slice(0, nextSeats));
                          }
                        }}
                        value={field.value}
                        disabled={vehiclesLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              vehiclesLoading
                                ? 'Loading...'
                                : 'Select a vehicle'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {ownVehicles.length === 0 &&
                          borrowableVehicles.length === 0 ? (
                            <div className="text-muted-foreground p-2 text-sm">
                              No vehicles are free
                            </div>
                          ) : (
                            <>
                              {ownVehicles.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>
                                    {tripBranchName
                                      ? `${tripBranchName} vehicles`
                                      : 'Vehicles'}
                                  </SelectLabel>
                                  {ownVehicles.map((vehicle) => (
                                    <SelectItem
                                      key={vehicle.id}
                                      value={vehicle.id}
                                    >
                                      {/* The seat count decides how many people
                                          can come, so it belongs on the choice
                                          itself. */}
                                      {vehicle.make} {vehicle.model} —{' '}
                                      {vehicle.license_plate} ·{' '}
                                      {vehicle.capacity}{' '}
                                      {vehicle.capacity === 1
                                        ? 'seat'
                                        : 'seats'}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              {borrowableVehicles.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>
                                    Borrow from another branch
                                  </SelectLabel>
                                  {borrowableVehicles.map((vehicle) => (
                                    <SelectItem
                                      key={vehicle.id}
                                      value={vehicle.id}
                                    >
                                      <span className="flex w-full items-center gap-2">
                                        <span>
                                          {vehicle.make} {vehicle.model} —{' '}
                                          {vehicle.license_plate} ·{' '}
                                          {vehicle.capacity}{' '}
                                          {vehicle.capacity === 1
                                            ? 'seat'
                                            : 'seats'}
                                        </span>
                                        {vehicle.branch_name && (
                                          <span className="text-muted-foreground text-xs">
                                            ({vehicle.branch_name})
                                          </span>
                                        )}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      {borrowedFrom && (
                        <p className="text-muted-foreground text-xs">
                          This borrows {borrowedFrom}&rsquo;s vehicle. Whoever
                          approves the trip will see that.
                        </p>
                      )}
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="driver_id"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="driver_id">Driver *</FieldLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={driversLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              driversLoading ? 'Loading...' : 'Select a driver'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {ownDrivers.length === 0 &&
                          otherDrivers.length === 0 ? (
                            <div className="text-muted-foreground p-2 text-sm">
                              No active drivers
                            </div>
                          ) : (
                            <>
                              {ownDrivers.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>
                                    {tripBranchName
                                      ? `${tripBranchName} drivers`
                                      : 'Drivers'}
                                  </SelectLabel>
                                  {ownDrivers.map((driver) => (
                                    <SelectItem
                                      key={driver.id}
                                      value={driver.id}
                                    >
                                      {driver.full_name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              {otherDrivers.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>Other branches</SelectLabel>
                                  {otherDrivers.map((driver) => (
                                    <SelectItem
                                      key={driver.id}
                                      value={driver.id}
                                    >
                                      {driver.full_name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FormRow>

              <FormRow>
                <Controller
                  name="destination"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="destination">
                        Destination *
                      </FieldLabel>
                      {/* Searchable, and bounded to Mindanao. Still free text:
                          not every barangay hall is on the map, and the search
                          being down must never block a request. */}
                      <DestinationPicker
                        id="destination"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FormRow>

              <Controller
                name="purpose"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="purpose">Purpose *</FieldLabel>
                    <Textarea
                      {...field}
                      id="purpose"
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter the purpose of the trip"
                      rows={3}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="participants"
                control={form.control}
                render={({ fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <FieldLabel htmlFor="participants">
                        Participants *
                      </FieldLabel>
                      {/* The seat budget, spent and remaining. */}
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {seats === null
                          ? 'Pick a vehicle to see the seats'
                          : `${namedCount} of ${seats} seat${seats === 1 ? '' : 's'}`}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {participants.map((participant, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={participant}
                            onChange={(e) =>
                              syncParticipants(
                                participants.map((p, i) =>
                                  i === index ? e.target.value : p
                                )
                              )
                            }
                            placeholder={`Participant ${index + 1}`}
                            aria-invalid={fieldState.invalid}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove participant ${index + 1}`}
                            // Never zero rows: a trip has to carry someone.
                            disabled={participants.length === 1}
                            onClick={() =>
                              syncParticipants(
                                participants.filter((_, i) => i !== index)
                              )
                            }
                          >
                            <TrashIcon className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Wrapped: Field's vertical variant sets `*:w-full`, which
                        stretches every direct child — so the button has to sit
                        inside something else to keep its own size. */}
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        // The van fills up; the button stops rather than letting
                        // someone name a headcount the vehicle cannot carry.
                        disabled={full}
                        onClick={() => syncParticipants([...participants, ''])}
                      >
                        <PlusIcon className="size-4" />
                        Add participant
                      </Button>
                    </div>
                    {full && (
                      <p className="text-muted-foreground text-xs">
                        That vehicle is full.
                      </p>
                    )}

                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>
          </FormSection>

          <FormSection
            title="When"
            className={step === 2 ? undefined : 'hidden'}
          >
            <FormRow>
              <Controller
                name="start_ts"
                control={form.control}
                render={({ field, fieldState }) => {
                  // Get today's date and time in local timezone as minimum
                  const now = new Date();
                  const minDateTime = new Date(
                    now.getTime() - now.getTimezoneOffset() * 60000
                  )
                    .toISOString()
                    .slice(0, 16);

                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="start_ts">
                        Start Date & Time *
                      </FieldLabel>
                      <Input
                        {...field}
                        id="start_ts"
                        type="datetime-local"
                        min={minDateTime}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  );
                }}
              />

              <Controller
                name="end_ts"
                control={form.control}
                render={({ field, fieldState }) => {
                  // Get the start_ts value to set as minimum for end_ts
                  const startTs = form.watch('start_ts');

                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="end_ts">
                        End Date & Time *
                      </FieldLabel>
                      <Input
                        {...field}
                        id="end_ts"
                        type="datetime-local"
                        min={startTs || undefined}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  );
                }}
              />
            </FormRow>
          </FormSection>

          {step === LAST && (
            <FormSection
              title="Review"
              description="Everything the approver will see. Tap a step above to change anything."
            >
              <DetailGrid>
                <DetailItem
                  label="Branch"
                  value={nameOf(branches, review.branch_id)}
                />
                <DetailItem
                  label="Office"
                  value={nameOf(offices, review.office_id)}
                />
                <DetailItem
                  label="Office head"
                  value={nameOf(officeHeads, review.office_head_id)}
                />
                <DetailItem
                  label="Vehicle"
                  value={
                    reviewVehicle ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {reviewVehicle.make} {reviewVehicle.model}
                        {/* Borrowing is allowed, but it is the exception. Say so
                            in the last place the requester looks before sending
                            it, not only in the place the approver reads it. */}
                        {borrowedFrom && <BorrowedBadge from={borrowedFrom} />}
                      </span>
                    ) : undefined
                  }
                />
                <DetailItem
                  label="Plate"
                  value={reviewVehicle?.license_plate}
                  mono
                />
                <DetailItem
                  label="Driver"
                  value={
                    drivers?.data?.find((d) => d.id === review.driver_id)
                      ?.full_name
                  }
                />
                <DetailItem label="Destination" value={review.destination} />
                <DetailItem
                  label="Depart"
                  value={formatWhen(review.start_ts)}
                />
                <DetailItem label="Return" value={formatWhen(review.end_ts)} />
                <DetailItem
                  label="Participants"
                  value={
                    participants.filter(Boolean).length > 0
                      ? `${participants.filter(Boolean).length} — ${participants
                          .filter(Boolean)
                          .join(', ')}`
                      : undefined
                  }
                  wide
                />
                <DetailItem label="Purpose" value={review.purpose} wide />
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
                  <FieldLabel htmlFor="remarks">Remarks (Optional)</FieldLabel>
                  <Textarea
                    {...field}
                    id="remarks"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter any additional remarks"
                    rows={3}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FormSection>

          {/* Cancel sits away on the left; the way FORWARD is on the right, where
              the eye ends up and the thumb already is. */}
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
                  disabled={addTripTicketAction.isLoading}
                >
                  {addTripTicketAction.isLoading
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
        title="Submit Trip Ticket"
        description="Are you sure you want to submit this trip ticket request?"
        confirmLabel="Submit Request"
        loading={addTripTicketAction.isLoading}
        onConfirm={handleConfirmAdd}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}

export default AddTripTicket;
