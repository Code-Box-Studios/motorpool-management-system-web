import type { ReactNode } from 'react';
import type { FieldError as FormFieldError } from 'react-hook-form';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type ParticipantEntry = 'names' | 'count';

const ENTRY_OPTIONS: { value: ParticipantEntry; label: string }[] = [
  { value: 'names', label: 'Type names' },
  { value: 'count', label: 'Enter number' }
];

// A student trip lists its party by name, or by headcount alone when the
// names aren't known yet (a class of 30). Native radios give arrow-key
// movement and the checked state for free; the labels just look like a
// segmented control.
export function ParticipantEntryToggle({
  name,
  value,
  onChange
}: {
  name: string;
  value: ParticipantEntry;
  onChange: (next: ParticipantEntry) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">List students by</legend>
      <div className="bg-muted inline-flex w-fit gap-1 rounded-full p-1">
        {ENTRY_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'text-muted-foreground hover:text-foreground relative cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors',
              'has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-sm',
              'has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]'
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// The headcount itself. Kept as typed text until submit (the schema coerces
// it), so clearing the box to retype doesn't snap back to a number.
export function StudentCountField({
  id,
  value,
  onChange,
  max,
  error,
  summary
}: {
  id: string;
  value: number | string;
  onChange: (next: string) => void;
  max?: number;
  error?: FormFieldError;
  summary?: ReactNode;
}) {
  return (
    <Field data-invalid={!!error}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>Number of students *</FieldLabel>
        {summary && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {summary}
          </span>
        )}
      </div>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
        className="sm:max-w-48"
      />
      <FieldError errors={[error]} />
    </Field>
  );
}
