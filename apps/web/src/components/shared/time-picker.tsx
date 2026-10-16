import * as React from 'react';
import { Clock3Icon } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type TimePickerProps = {
  id?: string;
  name?: string;
  value?: string;
  onChange: (value: string) => void;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  ref?: React.Ref<HTMLButtonElement>;
  label?: string;
  min?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  'aria-invalid'?: React.AriaAttributes['aria-invalid'];
  'aria-describedby'?: string;
};

const hours = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, '0')
);
const minutes = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, '0')
);

function parseTime(value?: string) {
  return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? { hour: Number(value.slice(0, 2)), minute: value.slice(3, 5) }
    : undefined;
}

/** Presents a 12-hour clock while keeping the form value in 24-hour HH:mm. */
export function TimePicker({
  id,
  name,
  value = '',
  onChange,
  onBlur,
  ref,
  label = 'Time',
  min,
  disabled,
  invalid,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': describedBy
}: TimePickerProps) {
  const selected = parseTime(value);
  const minimum = parseTime(min);
  const hour = selected?.hour ?? 0;
  const minute = selected?.minute ?? '00';
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = String(hour % 12 || 12).padStart(2, '0');
  const minimumHour = minimum?.hour ?? 0;

  function changeTime(nextHour: number, nextMinute = minute) {
    // A new hour or period must not strand the selected minute below min.
    const allowedMinute =
      minimum && nextHour === minimumHour && nextMinute < minimum.minute
        ? minimum.minute
        : nextMinute;
    onChange(`${String(nextHour).padStart(2, '0')}:${allowedMinute}`);
  }

  const triggerClass =
    'h-9 min-w-0 justify-center gap-1 rounded-lg border-0 bg-transparent px-1 text-sm focus-visible:ring-0 data-[size=default]:h-9 [&>svg]:size-3 [&>svg]:text-foreground [&>svg]:opacity-100';

  return (
    <div
      role="group"
      aria-label={label}
      aria-invalid={ariaInvalid ?? invalid}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.stopPropagation();
      }}
      className={cn(
        'border-input bg-background focus-within:border-ring focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex h-11 w-full min-w-0 items-center gap-1 rounded-full border px-3 transition-[color,box-shadow] focus-within:ring-[3px]',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
      <Clock3Icon
        aria-hidden="true"
        className="text-foreground mr-1 size-4 shrink-0"
      />
      <Select
        value={selected ? displayHour : ''}
        disabled={disabled}
        onValueChange={(next) =>
          changeTime((Number(next) % 12) + (period === 'PM' ? 12 : 0))
        }
      >
        <SelectTrigger
          ref={ref}
          id={id}
          aria-label={`${label} hour`}
          aria-describedby={describedBy}
          aria-invalid={ariaInvalid ?? invalid}
          className={cn(triggerClass, 'flex-1')}
          onBlur={onBlur}
        >
          <SelectValue placeholder="hh" />
        </SelectTrigger>
        <SelectContent className="rounded-[20px]" position="popper">
          {hours.map((option) => (
            <SelectItem
              key={option}
              value={option}
              disabled={
                (Number(option) % 12) + (period === 'PM' ? 12 : 0) < minimumHour
              }
            >
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span aria-hidden="true" className="text-muted-foreground">
        :
      </span>
      <Select
        value={selected ? minute : ''}
        disabled={disabled}
        onValueChange={(next) => changeTime(hour, next)}
      >
        <SelectTrigger
          aria-label={`${label} minute`}
          aria-invalid={ariaInvalid ?? invalid}
          className={cn(triggerClass, 'flex-1')}
          onBlur={onBlur}
        >
          <SelectValue placeholder="mm" />
        </SelectTrigger>
        <SelectContent className="rounded-[20px]" position="popper">
          {minutes.map((option) => (
            <SelectItem
              key={option}
              value={option}
              disabled={
                !!minimum && hour === minimumHour && option < minimum.minute
              }
            >
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={selected ? period : ''}
        disabled={disabled}
        onValueChange={(next) => {
          const nextHour = (hour % 12) + (next === 'PM' ? 12 : 0);
          // Switching period can require a later hour as well as a later minute.
          changeTime(Math.max(nextHour, minimumHour));
        }}
      >
        <SelectTrigger
          aria-label={`${label} period`}
          aria-invalid={ariaInvalid ?? invalid}
          className={cn(triggerClass, 'flex-[1.2]')}
          onBlur={onBlur}
        >
          <SelectValue placeholder="AM" />
        </SelectTrigger>
        <SelectContent className="rounded-[20px]" position="popper">
          <SelectItem value="AM" disabled={minimumHour >= 12}>
            AM
          </SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
