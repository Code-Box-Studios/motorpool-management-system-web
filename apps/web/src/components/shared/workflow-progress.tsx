import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WorkflowStep {
  id: string;
  title: string;
  description?: string;
  state: 'complete' | 'current' | 'upcoming' | 'unknown';
}

/** Read-only record status. These stages never perform workflow actions. */
export function WorkflowProgress({
  label,
  steps,
  summary,
  outcome
}: {
  label: string;
  steps: readonly WorkflowStep[];
  summary: string;
  outcome?: 'Completed' | 'Cancelled' | 'Declined';
}) {
  const current = steps.findIndex((step) => step.state === 'current');
  return (
    <section
      aria-label={label}
      className="bg-card border-border min-w-0 rounded-[20px] border p-5 sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{label}</h2>
        <p
          className={cn(
            'text-xs font-medium',
            outcome === 'Cancelled' || outcome === 'Declined'
              ? 'text-destructive'
              : 'text-muted-foreground'
          )}
        >
          {outcome ??
            (current >= 0
              ? `Step ${current + 1} of ${steps.length}`
              : 'Progress unavailable')}
        </p>
      </div>
      <ol className="grid lg:auto-cols-fr lg:grid-flow-col">
        {steps.map((step, index) => (
          <li
            key={step.id}
            data-state={step.state}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="relative flex min-w-0 gap-3 pb-5 last:pb-0 lg:block lg:pr-4 lg:pb-0 lg:last:pr-0"
          >
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                data-slot="workflow-connector"
                className={cn(
                  'absolute top-8 bottom-0 left-4 w-px lg:top-4 lg:right-0 lg:bottom-auto lg:left-8 lg:h-px lg:w-auto',
                  step.state === 'complete' ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                step.state === 'complete' || step.state === 'current'
                  ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-foreground/20 bg-card text-foreground/65',
                step.state === 'current' && 'ring-primary/15 ring-4'
              )}
            >
              {step.state === 'complete' ? (
                <Check className="size-4" />
              ) : (
                index + 1
              )}
            </span>
            <div className="min-w-0 lg:mt-3">
              <p
                className={cn(
                  'text-sm leading-snug break-words',
                  step.state === 'current'
                    ? 'text-foreground font-semibold'
                    : step.state === 'complete'
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground'
                )}
              >
                {step.title}
                <span className="sr-only">
                  {' '}
                  —{' '}
                  {step.state === 'complete'
                    ? 'Completed'
                    : step.state === 'current'
                      ? 'Current step'
                      : step.state === 'unknown'
                        ? 'Not confirmed'
                        : 'Upcoming'}
                </span>
              </p>
              {step.description && (
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed break-words">
                  {step.description}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground border-border mt-5 border-t pt-3 text-sm leading-relaxed break-words">
        {summary}
      </p>
    </section>
  );
}
