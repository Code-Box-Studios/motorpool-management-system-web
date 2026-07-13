// src/components/ui/badge.tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// The five semantic states of the design system. Every status in the product
// resolves to exactly one of these, so a badge is readable at a glance without
// learning a vocabulary:
//   wait    — blocked on a human (approve, assign, sign off)
//   move    — in motion right now (on the road, active)
//   done    — finished successfully
//   stop    — halted or refused (cancelled, disapproved, out of service)
//   neutral — a resting state that needs nothing (approved, scheduled, idle)
// Each renders as a pill with a leading dot inheriting the text colour.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-[color,box-shadow] before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        wait: 'bg-status-wait-bg text-status-wait-fg',
        move: 'bg-status-move-bg text-status-move-fg',
        done: 'bg-status-done-bg text-status-done-fg',
        stop: 'bg-status-stop-bg text-status-stop-fg',
        neutral: 'bg-status-neut-bg text-status-neut-fg',
        // Non-status badges (counts, labels) carry no dot.
        default: 'bg-primary text-primary-foreground before:hidden',
        outline: 'border border-border text-foreground before:hidden',
        signal: 'bg-signal text-signal-foreground before:hidden'
      }
    },
    defaultVariants: {
      variant: 'neutral'
    }
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge };
