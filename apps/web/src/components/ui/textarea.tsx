import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // `bg-input` is the *line* colour (--input: #d6d0c7), not a surface —
        // filling a textarea with it made every one of them read as disabled
        // next to the white-on-canvas Inputs. A field is a soft inset on the
        // canvas, and a textarea is the same field with room to breathe.
        'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-background flex field-sizing-content min-h-20 w-full rounded-[20px] border px-5 py-3 text-base transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
