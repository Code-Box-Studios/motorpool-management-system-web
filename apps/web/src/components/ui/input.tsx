import * as React from 'react';

import { cn } from '@/lib/utils';

// A native date field lets its year run past four digits ("202611") unless
// `max` caps it. Every date-type field gets a four-digit-year cap; a caller's
// own (stricter) max still wins.
const FOUR_DIGIT_YEAR_MAX: Partial<Record<string, string>> = {
  date: '9999-12-31',
  'datetime-local': '9999-12-31T23:59',
  month: '9999-12'
};

function Input({
  className,
  type,
  max,
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      max={max ?? (type ? FOUR_DIGIT_YEAR_MAX[type] : undefined)}
      data-slot="input"
      className={cn(
        // Pill-shaped, sitting on the canvas rather than pure white — the
        // design treats a field as a soft inset, not a raised box.
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input bg-background h-11 w-full min-w-0 rounded-full border px-5 py-1 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  );
}

export { Input };
