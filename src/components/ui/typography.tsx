/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const typographyVariants = cva('', {
  variants: {
    variant: {
      h1: 'scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl',
      h2: 'scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0',
      h3: 'scroll-m-20 text-2xl font-semibold tracking-tight',
      h4: 'scroll-m-20 text-xl font-semibold tracking-tight',
      h5: 'scroll-m-20 text-lg font-semibold tracking-tight',
      'p-xs': 'text-xs',
      'p-sm': 'text-sm',
      'p-md': 'text-base',
      'p-lg': 'text-lg',
      'p-xl': 'text-xl',
      'p-default': 'text-base'
    }
  },
  defaultVariants: {
    variant: 'p-default'
  }
});

export interface TypographyProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof typographyVariants> {}

type TypographyElement = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'p';

const Typography = React.forwardRef<
  React.ElementRef<TypographyElement>,
  TypographyProps
>(({ className, variant, ...props }, ref) => {
  const Comp = (variant?.startsWith('h') ? variant : 'p') as TypographyElement;
  return (
    <Comp
      className={cn(typographyVariants({ variant, className }))}
      ref={ref}
      {...props}
    />
  );
});
Typography.displayName = 'Typography';

export { Typography, typographyVariants };
