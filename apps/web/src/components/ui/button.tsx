/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Actions are ink, not brand-coloured: a solid near-black pill for the primary
// action, the same shape outlined for the secondary. Both carry the design's
// 1.5px ink edge, and press down slightly when tapped.
const buttonVariants = cva(
  "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap outline-none transition-all duration-150 active:translate-y-px active:scale-[0.99] focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border-[1.5px] border-primary bg-primary text-primary-foreground hover:brightness-125',
        destructive:
          'border-[1.5px] border-destructive bg-destructive text-destructive-foreground hover:brightness-110 focus-visible:ring-destructive/20',
        outline:
          'border-[1.5px] border-foreground bg-card text-foreground hover:bg-accent',
        secondary:
          'border-[1.5px] border-transparent bg-secondary text-secondary-foreground hover:brightness-95',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-signal underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-10 px-5 py-2 has-[>svg]:px-4',
        sm: 'h-8 gap-1.5 px-4 text-[13px] has-[>svg]:px-3',
        lg: 'h-12 px-7 text-base has-[>svg]:px-5',
        icon: 'size-10 rounded-full',
        'icon-sm': 'size-8 rounded-full',
        'icon-lg': 'size-11 rounded-full'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
