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
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        id={id}
        type="search"
        placeholder={`${label}…`}
        value={input.value}
        onChange={(event) => update(event.target.value)}
        className="pr-11 pl-10"
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
          className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
          onClick={() => update('', true)}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
