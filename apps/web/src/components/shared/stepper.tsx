import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// A long form asks for everything at once and leaves you to work out what it
// wants; a stepper asks one question at a time and tells you how much is left.
//
// Emphasis is the ink pill this app already uses for the primary button, the
// active sidebar item and the active tab — a step you are on, or have done,
// is ink; a step ahead of you is a quiet outline.
export interface Step {
  title: string;
}

interface StepperProps {
  steps: Step[];
  /** Zero-indexed. */
  current: number;
  /** The furthest step reached — anything up to it can be jumped back to. */
  furthest: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

const Stepper = ({
  steps,
  current,
  furthest,
  onStepClick,
  className
}: StepperProps) => (
  <nav aria-label="Progress" className={cn('mb-6', className)}>
    {/* On a phone the labels do not fit, so the count and the current step's
        name carry it instead. */}
    <p className="text-muted-foreground mb-3 text-sm sm:hidden">
      Step {current + 1} of {steps.length} —{' '}
      <span className="text-foreground font-medium">
        {steps[current]?.title}
      </span>
    </p>

    <ol className="flex items-center gap-2 sm:gap-3">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const reachable = index <= furthest;

        return (
          <li
            key={step.title}
            className="flex flex-1 items-center gap-2 sm:gap-3"
          >
            <button
              type="button"
              onClick={reachable ? () => onStepClick?.(index) : undefined}
              disabled={!reachable}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-full text-left transition-colors',
                reachable && !active && 'cursor-pointer',
                !reachable && 'cursor-default'
              )}
            >
              <span
                className={cn(
                  'flex size-8 flex-none items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors',
                  done || active
                    ? 'bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground border'
                )}
              >
                {done ? <Check className="size-4" /> : index + 1}
              </span>
              <span
                className={cn(
                  'hidden text-sm whitespace-nowrap sm:inline',
                  active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                )}
              >
                {step.title}
              </span>
            </button>

            {index < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'h-px flex-1 transition-colors',
                  done ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);

export default Stepper;
