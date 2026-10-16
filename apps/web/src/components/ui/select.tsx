import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  XIcon
} from 'lucide-react';

import { cn } from '@/lib/utils';

const SelectSearchContext = React.createContext('');

function optionText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number')
        return String(child);
      if (React.isValidElement<{ children?: React.ReactNode }>(child))
        return optionText(child.props.children);
      return '';
    })
    .join('');
}

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  const query = React.useContext(SelectSearchContext);
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      data-searching={query ? 'true' : undefined}
      className={cn(
        'data-[searching=true]:not-has-[[data-slot=select-item]:not([hidden])]:hidden',
        className
      )}
      {...props}
    />
  );
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: 'sm' | 'default';
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      aria-haspopup="dialog"
      className={cn(
        // A dropdown IS a field, so it has to look like one. This used to paint
        // itself `bg-white` — a raw colour, not a token, so it ignored the theme
        // — and wore a different radius, height and padding from Input, which put
        // two visibly different field styles side by side in every form. It now
        // matches Input exactly: the same soft inset on the canvas, the same pill,
        // the same height.
        "border-input bg-background data-placeholder:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full items-center justify-between gap-2 rounded-full border px-5 py-1 text-base transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-11 data-[size=sm]:h-9 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 md:text-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = 'popper',
  align = 'center',
  onKeyDown,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        role="dialog"
        aria-label="Choose an option"
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-[min(24rem,var(--radix-select-content-available-height,24rem))] max-w-[calc(100vw-2rem)] min-w-[12rem] origin-(--radix-select-content-transform-origin) overflow-hidden rounded-[20px] border shadow-md',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className
        )}
        position={position}
        align={align}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key === 'Enter') event.stopPropagation();
        }}
        {...props}
      >
        <SelectSearchPanel position={position}>{children}</SelectSearchPanel>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectSearchPanel({
  children,
  position
}: {
  children: React.ReactNode;
  position: 'popper' | 'item-aligned';
}) {
  // Radix remounts content between its closed fragment and its open portal.
  // Keeping the query here resets each opening without a registry or effect.
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);
  const clearRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  function visibleOptions() {
    return Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        '[data-slot="select-item"]:not([hidden]):not([data-disabled])'
      ) ?? []
    );
  }

  function handleKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') return;
    const fromSearch = event.target === searchRef.current;
    const options = visibleOptions();

    if (fromSearch) {
      // The input owns typing; Radix's list typeahead must not steal focus.
      event.stopPropagation();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = event.key === 'ArrowUp' ? options.at(-1) : options[0];
        next?.focus();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const next = event.shiftKey
          ? (options.at(-1) ?? clearRef.current ?? searchRef.current)
          : (clearRef.current ?? options[0] ?? searchRef.current);
        next?.focus();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const first = options[0];
        first?.focus();
        // Use the item's keyboard selection path, including after mouse hover.
        first?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );
      }
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      const fromClear = event.target === clearRef.current;
      const next =
        fromClear && !event.shiftKey
          ? (options[0] ?? searchRef.current)
          : event.shiftKey && !fromClear
            ? (clearRef.current ?? searchRef.current)
            : searchRef.current;
      next?.focus();
      return;
    }

    const current = options.indexOf(event.target as HTMLElement);
    if (current < 0) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : current + (event.key === 'ArrowDown' ? 1 : -1);
      if (next < 0) searchRef.current?.focus();
      else options[Math.min(next, options.length - 1)]?.focus();
    } else if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      ((event.key.length === 1 && event.key !== ' ') ||
        event.key === 'Backspace')
    ) {
      event.preventDefault();
      event.stopPropagation();
      setQuery((previous) =>
        event.key === 'Backspace' ? previous.slice(0, -1) : previous + event.key
      );
      searchRef.current?.focus();
    }
  }

  return (
    <SelectSearchContext.Provider value={query.trim().toLocaleLowerCase()}>
      <div
        ref={panelRef}
        data-slot="select-search-panel"
        className="group/select-search flex min-h-0 flex-1 flex-col"
        onKeyDownCapture={handleKeys}
      >
        <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <SearchIcon
            aria-hidden="true"
            className="text-foreground size-4 shrink-0"
          />
          <input
            ref={searchRef}
            type="search"
            role="combobox"
            aria-label="Search options"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            autoComplete="off"
            placeholder="Search options..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            className="placeholder:text-muted-foreground h-9 min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              ref={clearRef}
              type="button"
              aria-label="Clear search"
              className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
            >
              <XIcon aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          id={listId}
          role="listbox"
          aria-label="Options"
          className={cn(
            'min-h-0 p-1',
            position === 'popper' &&
              'w-full min-w-(--radix-select-trigger-width) scroll-my-1'
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        {query.trim() && (
          <p
            role="status"
            className="text-muted-foreground px-4 py-6 text-center text-sm group-has-[[data-slot=select-item]:not([hidden])]/select-search:hidden"
          >
            No options found.
          </p>
        )}
        <SelectScrollDownButton />
      </div>
    </SelectSearchContext.Provider>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn('text-muted-foreground px-2 py-1.5 text-xs', className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  textValue,
  hidden,
  'aria-hidden': ariaHidden,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  const query = React.useContext(SelectSearchContext);
  const textRef = React.useRef<HTMLSpanElement>(null);
  const [renderedText, setRenderedText] = React.useState(() =>
    optionText(children)
  );
  React.useLayoutEffect(() => {
    // Read custom label components as rendered text, without registering items.
    const text = textRef.current?.textContent ?? optionText(children);
    setRenderedText((previous) => (previous === text ? previous : text));
  }, [children]);
  const filtered =
    !!query && !(textValue ?? renderedText).toLocaleLowerCase().includes(query);
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      hidden={hidden || filtered}
      aria-hidden={filtered ? true : ariaHidden}
      textValue={textValue}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
        (hidden || filtered) && 'hidden'
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText ref={textRef}>
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('bg-border pointer-events-none -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue
};
