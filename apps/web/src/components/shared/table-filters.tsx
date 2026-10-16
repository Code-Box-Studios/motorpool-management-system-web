import { useId } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const active = filters.some((filter) => !!values[filter.key]);

  return (
    <div
      role="group"
      aria-label="Table filters"
      className="mt-4 flex flex-wrap items-end gap-3"
    >
      <span className="text-muted-foreground flex h-9 items-center gap-2 text-xs">
        <SlidersHorizontal aria-hidden="true" className="size-3.5" />
        Filters
      </span>
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
              size="sm"
              aria-label={`Filter by ${filter.label.toLowerCase()}`}
              className={`w-40 max-w-full px-3 sm:w-44 ${values[filter.key] ? 'border-primary/40' : ''}`}
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
      {active && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <X aria-hidden="true" className="size-3.5" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
