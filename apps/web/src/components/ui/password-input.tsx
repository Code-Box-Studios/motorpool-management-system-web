import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  // Required: the toggle points at the field through aria-controls.
  id: string;
  // Completes the toggle's accessible name ("Show new password"), so a form
  // with two password fields doesn't end up with two identical buttons.
  toggleLabel?: string;
};

// A password field with an eye button that switches between masked and plain
// text. It works the same way as the login form's toggle, and the button sits
// inside the pill-shaped Input.
function PasswordInput({
  id,
  className,
  toggleLabel = 'password',
  disabled,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        id={id}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pr-12', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={`${visible ? 'Hide' : 'Show'} ${toggleLabel}`}
        aria-pressed={visible}
        aria-controls={id}
        disabled={disabled}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}

export { PasswordInput };
