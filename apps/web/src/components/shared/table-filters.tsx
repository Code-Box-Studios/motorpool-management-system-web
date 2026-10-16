import { useId } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

export interface TableFilterDefinition {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface TableFiltersProps {
  filters: TableFilterDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

const ALL = '__all__';

export default function TableFilters({
  filters,
  values,
  onChange,
  onClear
}: TableFiltersProps) {
  const id = useId();
  const active = filters.filter((filter) => !!values[filter.key]);
  const summary = active
    .map(
      (filter) =>
        `${filter.label}: ${filter.options.find((option) => option.value === values[filter.key])?.label ?? 'Unavailable option'}`
    )
    .join('; ');

  return (
    <Popover>
      <div className="flex items-center gap-1">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 px-4"
            aria-label={`Filters: ${filters.map((filter) => filter.label).join(', ')}`}
            title={summary || 'Filter records'}
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            Filters
            {active.length > 0 && (
              <span
                aria-hidden="true"
                className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full text-xs tabular-nums"
              >
                {active.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        {active.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Clear filters"
            title="Clear filters"
            onClick={onClear}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>
      <PopoverContent aria-labelledby={`${id}-title`} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 id={`${id}-title`} className="text-sm font-semibold">
            Filters
          </h3>
          <PopoverClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Close filters"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </PopoverClose>
        </div>
        <div role="group" aria-label="Table filters" className="space-y-4">
          {filters.map((filter) => (
            <div key={filter.key} className="flex min-w-0 flex-col gap-1.5">
              <label
                htmlFor={`${id}-${filter.key}`}
                className="text-muted-foreground px-1 text-xs"
              >
                {filter.label}
              </label>
              <Select
                value={values[filter.key] || ALL}
                onValueChange={(value) =>
                  onChange(filter.key, value === ALL ? '' : value)
                }
              >
                <SelectTrigger
                  id={`${id}-${filter.key}`}
                  aria-label={`Filter by ${filter.label.toLowerCase()}`}
                  className={
                    values[filter.key] ? 'border-primary/40' : undefined
                  }
                >
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value={ALL}>All</SelectItem>
                  {filter.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                  {values[filter.key] &&
                    !filter.options.some(
                      (option) => option.value === values[filter.key]
                    ) && (
                      <SelectItem value={values[filter.key]} disabled>
                        Unavailable option
                      </SelectItem>
                    )}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <div className="border-border flex items-center justify-between gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={active.length === 0}
            onClick={onClear}
          >
            <X aria-hidden="true" className="size-3.5" />
            Clear filters
          </Button>
          <PopoverClose asChild>
            <Button type="button" size="sm">
              Done
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
