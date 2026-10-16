import * as React from 'react';
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type DatePickerProps = Omit<
  React.ComponentProps<'button'>,
  'value' | 'onChange' | 'defaultValue' | 'type'
> & {
  value?: string;
  onChange: (value: string) => void;
  min?: string;
  invalid?: boolean;
  placeholder?: string;
};

const dayLabel = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric'
});
const fieldLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});
const monthLabel = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric'
});
const weekDays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  // Noon keeps calendar arithmetic away from daylight-saving clock changes.
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) || dateValue(date) !== value
    ? undefined
    : date;
}

function shiftMonth(date: Date, offset: number) {
  const last = new Date(
    date.getFullYear(),
    date.getMonth() + offset + 1,
    0,
    12
  );
  return new Date(
    last.getFullYear(),
    last.getMonth(),
    Math.min(date.getDate(), last.getDate()),
    12
  );
}

/** A local calendar-day field. Its controlled value never passes through UTC. */
export function DatePicker({
  value = '',
  onChange,
  min,
  invalid,
  placeholder = 'Choose date',
  className,
  name,
  disabled,
  onBlur,
  onKeyDown,
  'aria-invalid': ariaInvalid,
  ...props
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const today = dateValue(new Date());
  const minimum = parseDate(min) ? min! : undefined;
  const selected = parseDate(value);
  const initial =
    selected && (!minimum || value >= minimum)
      ? value
      : minimum && today < minimum
        ? minimum
        : today;
  const [focusedDate, setFocusedDate] = React.useState(initial);
  const [viewDate, setViewDate] = React.useState(initial);
  const focusRef = React.useRef<HTMLButtonElement>(null);
  const headingId = React.useId();
  const hintId = React.useId();
  const month = parseDate(viewDate)!;
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
    12
  ).getDate();
  const cells = Array.from(
    { length: Math.ceil((firstDay.getDay() + daysInMonth) / 7) * 7 },
    (_, index) => {
      const day = index - firstDay.getDay() + 1;
      return day > 0 && day <= daysInMonth
        ? new Date(month.getFullYear(), month.getMonth(), day, 12)
        : null;
    }
  );
  const previousMonthEnd = dateValue(
    new Date(month.getFullYear(), month.getMonth(), 0, 12)
  );

  React.useEffect(() => {
    if (open) focusRef.current?.focus();
  }, [open, focusedDate, viewDate]);

  function focusDate(date: Date) {
    const nextValue = dateValue(date);
    const allowed = minimum && nextValue < minimum ? minimum : nextValue;
    setFocusedDate(allowed);
    setViewDate(allowed);
  }

  function chooseDate(date: Date) {
    onChange(dateValue(date));
    setOpen(false);
  }

  function moveFocus(
    event: React.KeyboardEvent<HTMLButtonElement>,
    date: Date
  ) {
    const next = new Date(date);
    switch (event.key) {
      case 'ArrowLeft':
        next.setDate(next.getDate() - 1);
        break;
      case 'ArrowRight':
        next.setDate(next.getDate() + 1);
        break;
      case 'ArrowUp':
        next.setDate(next.getDate() - 7);
        break;
      case 'ArrowDown':
        next.setDate(next.getDate() + 7);
        break;
      case 'Home':
        next.setDate(next.getDate() - next.getDay());
        break;
      case 'End':
        next.setDate(next.getDate() + 6 - next.getDay());
        break;
      case 'PageUp':
      case 'PageDown': {
        const direction = event.key === 'PageUp' ? -1 : 1;
        event.preventDefault();
        focusDate(shiftMonth(date, direction * (event.shiftKey ? 12 : 1)));
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    focusDate(next);
  }

  return (
    <>
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setFocusedDate(initial);
            setViewDate(initial);
          }
          setOpen(nextOpen);
        }}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-invalid={ariaInvalid ?? invalid}
            onBlur={onBlur}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.stopPropagation();
              onKeyDown?.(event);
            }}
            className={cn(
              'border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-full border px-5 text-left text-base transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 md:text-sm',
              !selected && 'text-muted-foreground',
              className
            )}
            {...props}
          >
            <span className="truncate">
              {selected ? fieldLabel.format(selected) : placeholder}
            </span>
            <CalendarDaysIcon
              aria-hidden="true"
              className="text-foreground size-4 shrink-0"
            />
          </button>
        </DialogTrigger>
        <DialogContent
          className="bg-popover text-popover-foreground gap-4 p-5 sm:max-w-[23rem]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            focusRef.current?.focus();
          }}
          onKeyDown={(event) => {
            // Portal events still bubble through the booking form in React.
            if (event.key === 'Enter') event.stopPropagation();
          }}
        >
          <div className="space-y-1 pr-8">
            <DialogTitle>Choose date</DialogTitle>
            <DialogDescription>
              {selected
                ? `Selected: ${dayLabel.format(selected)}`
                : 'Choose a day for this trip.'}
            </DialogDescription>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              disabled={!!minimum && previousMonthEnd < minimum}
              onClick={() => focusDate(shiftMonth(parseDate(focusedDate)!, -1))}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <h3
              id={headingId}
              aria-live="polite"
              className="text-base font-semibold"
            >
              {monthLabel.format(month)}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next month"
              onClick={() => focusDate(shiftMonth(parseDate(focusedDate)!, 1))}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
          <table
            role="grid"
            aria-labelledby={headingId}
            aria-describedby={hintId}
            className="w-full table-fixed border-separate border-spacing-1"
          >
            <thead>
              <tr>
                {weekDays.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    className="text-muted-foreground pb-2 text-xs font-medium"
                  >
                    <abbr title={day} className="no-underline">
                      {day.slice(0, 2)}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: cells.length / 7 }, (_, week) => (
                <tr key={week}>
                  {cells.slice(week * 7, week * 7 + 7).map((date, index) => {
                    if (!date) return <td key={`empty-${index}`} />;
                    const dayValue = dateValue(date);
                    const isSelected = dayValue === value;
                    return (
                      <td
                        key={dayValue}
                        aria-selected={isSelected}
                        className="p-0 text-center"
                      >
                        <button
                          ref={dayValue === focusedDate ? focusRef : undefined}
                          type="button"
                          tabIndex={dayValue === focusedDate ? 0 : -1}
                          disabled={!!minimum && dayValue < minimum}
                          aria-label={dayLabel.format(date)}
                          aria-current={dayValue === today ? 'date' : undefined}
                          className={cn(
                            'text-foreground hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-popover flex aspect-square max-h-11 w-full items-center justify-center rounded-full text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-30',
                            dayValue === today &&
                              'border-border border font-semibold',
                            isSelected &&
                              'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground font-semibold'
                          )}
                          onKeyDown={(event) => moveFocus(event, date)}
                          onClick={() => chooseDate(date)}
                        >
                          {date.getDate()}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p id={hintId} className="text-muted-foreground text-xs">
            Use arrow keys to move. Press Enter to choose.
          </p>
          <div className="border-border flex items-center justify-between gap-3 border-t pt-4">
            <Button
              type="button"
              variant="secondary"
              className="rounded-full"
              disabled={!!minimum && today < minimum}
              onClick={() => chooseDate(parseDate(today)!)}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
