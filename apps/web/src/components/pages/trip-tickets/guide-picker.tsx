import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  UsersIcon,
  XIcon
} from 'lucide-react';
import type { TripGuideRow } from '@/lib/api/trip-tickets';

interface GuidePickerProps {
  guideIds: string[];
  /** All unarchived employees, across branches. */
  guides: TripGuideRow[];
  guidesLoading: boolean;
  /** Keeps historical or inactive selections readable until explicitly replaced. */
  currentGuides?: TripGuideRow[];
  onChange: (employeeIds: string[]) => void;
  rowError?: (index: number) => string | undefined;
  addDisabled?: boolean;
}

export function GuidePicker({
  guideIds,
  guides,
  guidesLoading,
  currentGuides = [],
  onChange,
  rowError,
  addDisabled
}: GuidePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const selectedIds = guideIds.filter(Boolean);
  const options = [
    ...guides,
    ...currentGuides.filter(
      (guide) => !guides.some((option) => option.id === guide.id)
    )
  ];
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = guides.filter((guide) => {
    const text = `${guide.name} ${guide.position ?? ''}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
  const errors = [
    ...new Set(guideIds.map((_, index) => rowError?.(index)).filter(Boolean))
  ];
  const toggle = (id: string) => {
    if (selectedIds.includes(id))
      onChange(selectedIds.filter((value) => value !== id));
    else if (!addDisabled) onChange([...selectedIds, id]);
  };

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
            type="button"
            variant="outline"
            aria-label="Select guides"
            aria-controls={open ? panelId : undefined}
            aria-invalid={errors.length > 0}
            disabled={guidesLoading}
            className="border-input bg-background h-11 w-full justify-start rounded-full border px-4 font-normal"
          >
            <UsersIcon className="text-muted-foreground size-4" />
            <span className="min-w-0 flex-1 truncate text-left">
              {guidesLoading
                ? 'Loading employees...'
                : selectedIds.length
                  ? 'Edit guides'
                  : 'Choose guides'}
            </span>
            {selectedIds.length > 0 && (
              <span className="text-muted-foreground hidden text-xs tabular-nums sm:inline">
                {selectedIds.length} selected
              </span>
            )}
            <ChevronDownIcon className="text-muted-foreground size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          id={panelId}
          aria-label="Choose guides"
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
              aria-label="Search employees"
              placeholder="Search by name or position..."
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  resultsRef.current
                    ?.querySelector<HTMLInputElement>('input:not(:disabled)')
                    ?.focus();
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  const first = matches.find(
                    (guide) => selectedIds.includes(guide.id) || !addDisabled
                  );
                  if (first) toggle(first.id);
                }
              }}
              className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Clear employee search"
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
              >
                <XIcon className="size-4" />
              </Button>
            )}
          </div>
          <div
            ref={resultsRef}
            className="max-h-72 min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {matches.length ? (
              matches.map((guide) => {
                const checked = selectedIds.includes(guide.id);
                const disabled = !checked && !!addDisabled;
                return (
                  <label
                    key={guide.id}
                    className="hover:bg-accent has-[:focus-visible]:bg-accent flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                  >
                    <input
                      type="checkbox"
                      aria-label={
                        guide.position
                          ? `${guide.name} — ${guide.position}`
                          : guide.name
                      }
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(guide.id)}
                      className="accent-primary size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {guide.name}
                      </span>
                      {guide.position && (
                        <span className="text-muted-foreground block truncate text-xs">
                          {guide.position}
                        </span>
                      )}
                    </span>
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
                {guides.length
                  ? 'No employees found.'
                  : 'No active employees available.'}
              </p>
            )}
          </div>
          <div className="border-border flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3">
            <div aria-live="polite" className="min-w-0 text-xs">
              <p className="font-medium tabular-nums">
                {selectedIds.length} selected
              </p>
              <p className="text-muted-foreground">
                {addDisabled
                  ? 'All passenger seats are filled.'
                  : 'Select one or more employees.'}
              </p>
            </div>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {selectedIds.length > 0 && (
        <ul
          aria-label="Selected guides"
          className="flex min-w-0 flex-col gap-2"
        >
          {selectedIds.map((id) => {
            const guide = options.find((option) => option.id === id);
            const name = guide?.name ?? 'Unavailable employee';
            return (
              <li
                key={id}
                className="border-border bg-background/50 flex min-w-0 items-center gap-3 rounded-xl border py-1.5 pr-1.5 pl-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {name}
                  </span>
                  {guide?.position && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {guide.position}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name}`}
                  onClick={() => {
                    onChange(selectedIds.filter((value) => value !== id));
                    triggerRef.current?.focus();
                  }}
                >
                  <XIcon className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <FieldError errors={errors.map((message) => ({ message }))} />
    </div>
  );
}
