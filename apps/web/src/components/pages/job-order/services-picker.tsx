import { useId, useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  WrenchIcon,
  XIcon
} from 'lucide-react';
import { JOB_ORDER_SERVICES } from '@mms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';

interface ServicesPickerProps {
  id: string;
  value: string[];
  onChange: (services: string[]) => void;
  invalid?: boolean;
}

// A searchable checklist of the standard job-order services, built the same
// way as the trip guide picker: a pill trigger, a popover of checkboxes, and
// the picks listed underneath with their own remove buttons.
export function ServicesPicker({
  id,
  value,
  onChange,
  invalid
}: ServicesPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = JOB_ORDER_SERVICES.filter((service) =>
    words.every((word) => service.toLocaleLowerCase().includes(word))
  );
  const toggle = (service: string) =>
    onChange(
      value.includes(service)
        ? value.filter((picked) => picked !== service)
        : // Kept in list order, so the review reads the same way every time.
          JOB_ORDER_SERVICES.filter(
            (option) => option === service || value.includes(option)
          )
    );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            aria-controls={open ? panelId : undefined}
            aria-invalid={invalid}
            className="border-input bg-background h-11 w-full justify-start rounded-full border px-4 font-normal"
          >
            <WrenchIcon className="text-muted-foreground size-4" />
            <span className="min-w-0 flex-1 truncate text-left">
              {value.length ? 'Edit services' : 'Choose services'}
            </span>
            {value.length > 0 && (
              <span className="text-muted-foreground hidden text-xs tabular-nums sm:inline">
                {value.length} selected
              </span>
            )}
            <ChevronDownIcon className="text-muted-foreground size-4" />
          </Button>
        </PopoverTrigger>
        {/* Unmount on close so reopening during the exit animation restores focus. */}
        {open && (
          <PopoverContent
            id={panelId}
            aria-label="Choose services"
            align="start"
            className="flex min-h-0 w-[var(--radix-popover-trigger-width)] min-w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchRef.current?.focus();
            }}
          >
            <div className="border-border flex shrink-0 items-center gap-2 border-b px-4 py-2">
              <SearchIcon
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
              />
              <Input
                ref={searchRef}
                aria-label="Search services"
                placeholder="Search services..."
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (matches[0]) toggle(matches[0]);
                  }
                }}
                className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
              {query && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Clear service search"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                >
                  <XIcon className="size-4" />
                </Button>
              )}
            </div>
            <div className="max-h-72 min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {matches.length ? (
                matches.map((service) => {
                  const checked = value.includes(service);
                  return (
                    <label
                      key={service}
                      className="hover:bg-accent has-[:focus-visible]:bg-accent flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(service)}
                        className="accent-primary size-4 shrink-0"
                      />
                      <span className="min-w-0 flex-1 text-sm">{service}</span>
                      {checked && (
                        <CheckIcon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                      )}
                    </label>
                  );
                })
              ) : (
                <p
                  role="status"
                  className="text-muted-foreground px-3 py-6 text-center text-sm"
                >
                  No services found.
                </p>
              )}
            </div>
            <div className="border-border flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3">
              <p
                aria-live="polite"
                className="text-xs font-medium tabular-nums"
              >
                {value.length} selected
              </p>
              <Button type="button" size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </PopoverContent>
        )}
      </Popover>
      {value.length > 0 && (
        <ul
          aria-label="Selected services"
          className="flex min-w-0 flex-col gap-2"
        >
          {value.map((service) => (
            <li
              key={service}
              className="border-border bg-background/50 flex min-w-0 items-center gap-3 rounded-xl border py-1.5 pr-1.5 pl-3"
            >
              <span className="min-w-0 flex-1 text-sm font-medium">
                {service}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${service}`}
                onClick={() => {
                  onChange(value.filter((picked) => picked !== service));
                  triggerRef.current?.focus();
                }}
              >
                <XIcon className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
