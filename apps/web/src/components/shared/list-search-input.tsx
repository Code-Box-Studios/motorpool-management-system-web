import { useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ListSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export default function ListSearchInput({
  value,
  onChange,
  label = 'Search records'
}: ListSearchInputProps) {
  const id = useId();
  const [input, setInput] = useState({ value, source: value });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep browser back/forward and external clear actions in sync without
  // removing a trailing space the person is still using to type another word.
  if (input.source !== value) {
    setInput({
      value: input.value.trim() === value ? input.value : value,
      source: value
    });
  }

  useEffect(() => () => clearTimeout(timer.current), [value]);

  const update = (next: string, immediate = false) => {
    clearTimeout(timer.current);
    setInput({ value: next, source: value });
    if (immediate) onChange(next);
    else timer.current = setTimeout(() => onChange(next.trim()), 300);
  };

  return (
    <div className="relative w-full max-w-md">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="text-foreground/70 pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2"
      />
      <Input
        id={id}
        type="search"
        placeholder={`${label}…`}
        value={input.value}
        onChange={(event) => update(event.target.value)}
        className="border-foreground/25 bg-card placeholder:text-foreground/65 hover:border-foreground/40 h-12 pr-12 pl-11 shadow-xs"
        onKeyDown={(event) => {
          if (event.key === 'Escape') update('', true);
          if (event.key === 'Enter') update(input.value.trim(), true);
        }}
      />
      {input.value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          className="absolute top-1/2 right-0.5 size-11 -translate-y-1/2"
          onClick={() => update('', true)}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
