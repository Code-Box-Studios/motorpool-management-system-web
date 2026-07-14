import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Forms used to be one long column of full-width fields on the bare canvas: a
// 950px-wide "Purpose" box, no grouping, and nothing telling you how much was
// left. A request has parts — who it's for, what's being asked, when — and the
// form should show those parts.
//
// FormLayout caps the measure (a field wider than ~70ch is harder to scan, not
// easier), and each FormSection is one titled card on the canvas.

export const FormLayout = ({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('flex max-w-4xl flex-col gap-5', className)}>
    {children}
  </div>
);

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export const FormSection = ({
  title,
  description,
  children,
  className
}: FormSectionProps) => (
  <section
    className={cn('bg-card border-border rounded-[20px] border p-6', className)}
  >
    <header className="mb-5">
      <h2 className="font-semibold tracking-tight">{title}</h2>
      {description && (
        <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
      )}
    </header>
    {children}
  </section>
);

/** Two-up on desktop, stacked on a phone — the default rhythm for fields. */
export const FormRow = ({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('grid gap-5 sm:grid-cols-2', className)}>{children}</div>
);

// The actions bar closes the form. It is deliberately NOT sticky: pinned to the
// viewport it floats over the fields it sits above — on a long form that means
// the bar physically covers the inputs you are trying to fill.
export const FormActions = ({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      'border-border bg-card flex flex-wrap items-center gap-3 rounded-[20px] border p-4',
      className
    )}
  >
    {children}
  </div>
);
