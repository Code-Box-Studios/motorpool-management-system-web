import { useId, useRef, useState, type Ref } from 'react';
import {
  CarFrontIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  SearchIcon,
  UserRoundIcon,
  XIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type TripResourceOption = {
  id: string;
  name: string;
  detail?: string;
  branchName: string;
  otherBranch: boolean;
};

const PAGE_SIZE = 10;
type Scope = 'all' | 'own' | 'other';

/** A bounded roster picker: search the full roster, render only one page. */
export function TripResourcePicker({
  kind,
  id,
  options,
  value,
  onChange,
  onBlur,
  triggerRef,
  disabled,
  invalid
}: {
  kind: 'vehicle' | 'driver';
  id: string;
  options: TripResourceOption[];
  value?: string;
  onChange: (id: string) => void;
  onBlur?: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [page, setPage] = useState(1);
  const searchId = useId();
  const resultsId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.find((option) => option.id === value);
  const Icon = kind === 'vehicle' ? CarFrontIcon : UserRoundIcon;
  const plural = `${kind}s`;
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const ownCount = options.filter((option) => !option.otherBranch).length;
  const scopes: { value: Scope; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: options.length },
    { value: 'own', label: 'This branch', count: ownCount },
    {
      value: 'other',
      label: 'Other branches',
      count: options.length - ownCount
    }
  ];
  const matches = options.filter((option) => {
    if (scope === 'own' && option.otherBranch) return false;
    if (scope === 'other' && !option.otherBranch) return false;
    const text =
      `${option.name} ${option.detail ?? ''} ${option.branchName}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const visible = matches.slice(offset, offset + PAGE_SIZE);

  const resetPosition = () => {
    setPage(1);
    resultsRef.current?.scrollTo({ top: 0 });
  };
  const changePage = (next: number) => {
    setPage(next);
    resultsRef.current?.scrollTo({ top: 0 });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          setScope('all');
          setPage(1);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          onBlur={onBlur}
          onKeyDown={(event) => {
            // The booking form uses Enter to advance steps. Opening a picker
            // must leave the user on the current step.
            if (event.key === 'Enter' || event.key === ' ')
              event.stopPropagation();
          }}
          variant="outline"
          className="border-input bg-background h-16 w-full min-w-0 justify-start rounded-xl border px-3 text-left font-normal whitespace-normal"
        >
          <Icon className="text-muted-foreground size-5" aria-hidden />
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block truncate text-sm',
                !selected && 'text-muted-foreground'
              )}
            >
              {disabled ? 'Loading...' : (selected?.name ?? `Select a ${kind}`)}
            </span>
            {selected && (
              <span className="text-muted-foreground block truncate text-xs">
                {selected.detail ? `${selected.detail} · ` : ''}
                {selected.branchName}
              </span>
            )}
          </span>
          <ChevronsUpDownIcon
            className="text-muted-foreground size-4"
            aria-hidden
          />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="h-[min(44rem,90dvh)] gap-4 p-4 sm:max-w-2xl sm:p-6 [&>[data-slot=dialog-close]]:top-2 [&>[data-slot=dialog-close]]:right-2 [&>[data-slot=dialog-close]]:p-3.5 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:p-3"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') event.stopPropagation();
        }}
      >
        <DialogHeader>
          <DialogTitle>Choose a {kind}</DialogTitle>
          <DialogDescription className="[@media(max-height:500px)]:hidden">
            {kind === 'vehicle'
              ? 'Available vehicles, with your branch first. Check the plate and seats before choosing.'
              : 'Active drivers, with your branch first. Check the branch before choosing.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <SearchIcon
              className="text-muted-foreground pointer-events-none absolute top-3.5 left-3 size-4"
              aria-hidden
            />
            <label htmlFor={searchId} className="sr-only">
              Search {plural}
            </label>
            <Input
              ref={searchRef}
              id={searchId}
              type="search"
              aria-controls={resultsId}
              autoComplete="off"
              placeholder={
                kind === 'vehicle'
                  ? 'Search model, plate or branch…'
                  : 'Search name or branch…'
              }
              className="h-11 pr-12 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPosition();
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' && visible.length) {
                  event.preventDefault();
                  optionRefs.current[0]?.focus();
                }
              }}
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="absolute top-0 right-0"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  resetPosition();
                  searchRef.current?.focus();
                }}
              >
                <XIcon aria-hidden />
              </Button>
            )}
          </div>
          <div
            className="flex gap-1"
            role="group"
            aria-label="Filter by branch"
          >
            {scopes.map((item) => (
              <Button
                key={item.value}
                type="button"
                size="sm"
                variant={scope === item.value ? 'secondary' : 'ghost'}
                aria-pressed={scope === item.value}
                className="h-11 min-w-0 flex-1 gap-1 px-1 text-xs sm:flex-none sm:px-3 sm:text-sm"
                onClick={() => {
                  setScope(item.value);
                  resetPosition();
                }}
              >
                {item.label}{' '}
                <span className="text-muted-foreground tabular-nums">
                  {item.count}
                </span>
              </Button>
            ))}
          </div>
          <p
            role="status"
            className="text-muted-foreground text-xs"
            aria-live="polite"
          >
            {matches.length} {plural}
            {matches.length > 0 &&
              ` · Showing ${offset + 1}–${offset + visible.length}`}
          </p>
        </div>
        <DialogBody
          ref={resultsRef}
          id={resultsId}
          role="listbox"
          aria-label={`Available ${plural}`}
          className="space-y-2"
          onKeyDown={(event) => {
            const index = optionRefs.current.indexOf(
              event.target as HTMLButtonElement
            );
            if (index < 0) return;
            const next =
              event.key === 'ArrowDown'
                ? Math.min(index + 1, visible.length - 1)
                : event.key === 'ArrowUp'
                  ? Math.max(index - 1, 0)
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? visible.length - 1
                      : null;
            if (next !== null) {
              event.preventDefault();
              optionRefs.current[next]?.focus();
            }
          }}
        >
          {visible.map((option, index) => (
            <button
              key={option.id}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={option.id === value}
              tabIndex={index === 0 ? 0 : -1}
              className={cn(
                'border-border bg-card hover:bg-accent focus-visible:ring-ring flex min-h-20 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset',
                option.id === value && 'border-foreground bg-accent'
              )}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
            >
              <span className="bg-muted text-muted-foreground hidden size-10 shrink-0 items-center justify-center rounded-lg sm:flex">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-medium break-words">
                  {option.name}
                </span>
                {option.detail && (
                  <span className="text-muted-foreground block text-xs break-words">
                    {option.detail}
                  </span>
                )}
                <span className="text-muted-foreground block text-xs break-words">
                  {option.branchName}
                  {option.otherBranch && (
                    <span className="text-foreground ml-2 font-medium">
                      {kind === 'vehicle' ? 'Borrow' : 'Other branch'}
                    </span>
                  )}
                </span>
              </span>
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full border"
                aria-hidden
              >
                {option.id === value && <CheckIcon className="size-4" />}
              </span>
            </button>
          ))}
          {!visible.length && (
            <div className="text-muted-foreground flex min-h-32 flex-col items-center justify-center gap-2 px-3 text-center text-sm">
              <SearchIcon className="size-6" aria-hidden />
              <p>
                {options.length
                  ? `No ${plural} match your search.`
                  : kind === 'vehicle'
                    ? 'No vehicles are free.'
                    : 'No active drivers.'}
              </p>
              {options.length > 0 && (
                <p className="text-xs">Try another search or branch filter.</p>
              )}
            </div>
          )}
        </DialogBody>
        <div className="border-border flex shrink-0 items-center justify-between gap-2 border-t pt-3">
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="h-11 px-3">
              Cancel
            </Button>
          </DialogClose>
          <div className="flex items-center gap-1 sm:gap-3">
            <span className="text-muted-foreground text-xs tabular-nums">
              Page {currentPage} of {pages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => changePage(currentPage - 1)}
            >
              <ChevronLeftIcon aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Next page"
              disabled={currentPage === pages}
              onClick={() => changePage(currentPage + 1)}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
