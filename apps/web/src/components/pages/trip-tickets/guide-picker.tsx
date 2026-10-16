import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { TrashIcon, PlusIcon } from 'lucide-react';
import type { TripGuideRow } from '@/lib/api/trip-tickets';

interface GuidePickerProps {
  /** One entry per row, '' for an unfilled row. */
  guideIds: string[];
  /** All active users with the driver or requester role, across branches. */
  guides: TripGuideRow[];
  guidesLoading: boolean;
  /** Keeps historical or inactive selections readable until explicitly replaced. */
  currentGuides?: TripGuideRow[];
  onChangeRow: (index: number, userId: string) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  /** Per-row validation message, if any — read from whatever form state the
   *  caller is tracking (react-hook-form or plain useState). */
  rowError?: (index: number) => string | undefined;
  addDisabled?: boolean;
}

export function GuidePicker({
  guideIds,
  guides,
  guidesLoading,
  currentGuides = [],
  onChangeRow,
  onAddRow,
  onRemoveRow,
  rowError,
  addDisabled
}: GuidePickerProps) {
  const options = [
    ...guides,
    ...currentGuides.filter(
      (guide) => !guides.some((option) => option.id === guide.id)
    )
  ];
  // Keep the current value present so historical guide names remain readable.
  const optionsFor = (index: number) =>
    options.filter(
      (guide) =>
        guide.id === guideIds[index] ||
        (!guideIds.includes(guide.id) &&
          guides.some((option) => option.id === guide.id))
    );

  return (
    <div className="flex flex-col gap-2">
      {guideIds.map((guideId, index) => {
        const error = rowError?.(index);
        return (
          <div key={index} className="flex items-center gap-2">
            <Field data-invalid={!!error}>
              <Select
                onValueChange={(value) => onChangeRow(index, value)}
                value={guideId || ''}
                disabled={guidesLoading}
              >
                <SelectTrigger
                  aria-label={`Guide ${index + 1}`}
                  aria-invalid={!!error}
                >
                  <SelectValue
                    placeholder={
                      guidesLoading
                        ? 'Loading...'
                        : 'Select a driver or requester'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {optionsFor(index).length > 0 ? (
                    optionsFor(index).map((guide) => (
                      <SelectItem
                        key={guide.id}
                        value={guide.id}
                        disabled={
                          !guides.some((option) => option.id === guide.id)
                        }
                      >
                        {/* The position is what tells two people with the
                            same name apart. */}
                        {guide.position
                          ? `${guide.name} — ${guide.position}`
                          : guide.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="text-muted-foreground p-2 text-sm">
                      No active drivers or requesters left
                    </div>
                  )}
                </SelectContent>
              </Select>
              {error && <FieldError errors={[{ message: error }]} />}
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove guide ${index + 1}`}
              // Never zero rows: every trip is guided by someone.
              disabled={guideIds.length === 1}
              onClick={() => onRemoveRow(index)}
            >
              <TrashIcon className="size-4" />
            </Button>
          </div>
        );
      })}

      {/* Wrapped for the same reason the participants button is: Field's
          vertical variant sets `*:w-full`, which would stretch the button. */}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          // The roster runs out too — a row nobody is left to fill is worse
          // than no row.
          disabled={
            addDisabled ||
            guidesLoading ||
            !guides.some((guide) => !guideIds.includes(guide.id))
          }
          onClick={onAddRow}
        >
          <PlusIcon className="size-4" />
          Add guide
        </Button>
      </div>
    </div>
  );
}
