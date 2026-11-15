import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { useUpdateTripTicket } from '@/lib/mutation/trip-tickets';
import type { TripDateRow } from '@/lib/api/trip-tickets';

const wallTime = (instant: string) =>
  new Date(new Date(instant).getTime() + 8 * 3_600_000)
    .toISOString()
    .slice(0, 16);

type Draft = {
  key: string;
  start: string;
  end: string;
  original?: TripDateRow;
};

/** Pending date replacements have no gate stamps. Unchanged rows keep their exact instants. */
export function OutingEditor({
  ticketId,
  dates,
  onSaved
}: {
  ticketId: string;
  dates: TripDateRow[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [rows, setRows] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const update = useUpdateTripTicket();

  const edit = (index: number, key: 'start' | 'end', value: string) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
    setError('');
  };
  const save = () => {
    if (rows.length === 0) {
      setError('Keep at least one outing.');
      return;
    }
    if (
      rows.some(
        (row) =>
          !Number.isFinite(Date.parse(`${row.start}+08:00`)) ||
          !Number.isFinite(Date.parse(`${row.end}+08:00`))
      )
    ) {
      setError('Enter a valid start and end for each outing.');
      return;
    }
    const proposed = rows.map((row) => ({
      start_ts:
        row.original && row.start === wallTime(row.original.start_ts)
          ? row.original.start_ts
          : new Date(`${row.start}+08:00`).toISOString(),
      end_ts:
        row.original && row.end === wallTime(row.original.end_ts)
          ? row.original.end_ts
          : new Date(`${row.end}+08:00`).toISOString()
    }));
    const sorted = [...proposed].sort(
      (a, b) => Date.parse(a.start_ts) - Date.parse(b.start_ts)
    );
    for (let i = 0; i < sorted.length; i++) {
      if (Date.parse(sorted[i].end_ts) <= Date.parse(sorted[i].start_ts)) {
        setError('Each outing end must be after its start.');
        return;
      }
      if (
        i > 0 &&
        Date.parse(sorted[i].start_ts) < Date.parse(sorted[i - 1].end_ts)
      ) {
        setError('Outings must not overlap.');
        return;
      }
    }
    const unchanged =
      proposed.length === dates.length &&
      proposed.every(
        (row, i) =>
          row.start_ts === dates[i].start_ts && row.end_ts === dates[i].end_ts
      );
    if (unchanged) {
      setOpen(false);
      return;
    }
    update.mutate(
      { id: ticketId, updates: { dates: proposed } },
      {
        onSuccess: () => {
          setOpen(false);
          onSaved();
        },
        onError: (cause) => setError(cause.message)
      }
    );
  };

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        onClick={() => {
          setRows(
            dates.map((date) => ({
              key: date.id,
              start: wallTime(date.start_ts),
              end: wallTime(date.end_ts),
              original: date
            }))
          );
          setError('');
          update.reset();
          setOpen(true);
        }}
      >
        Edit outings
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!update.isPending) setOpen(value);
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit outings</DialogTitle>
            <DialogDescription>
              Each outing reserves its own interval. Times use Philippine time.
              Changes are available while this request is pending.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            {rows.map((row, index) => (
              <fieldset
                key={row.key}
                className="border-border space-y-3 rounded-xl border p-4"
                disabled={update.isPending}
              >
                <legend className="px-1 text-sm font-medium">
                  Outing {index + 1}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`outing-${row.key}-start`}>
                      Outing {index + 1} start
                    </FieldLabel>
                    <Input
                      id={`outing-${row.key}-start`}
                      type="datetime-local"
                      required
                      value={row.start}
                      onChange={(event) =>
                        edit(index, 'start', event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`outing-${row.key}-end`}>
                      Outing {index + 1} end
                    </FieldLabel>
                    <Input
                      id={`outing-${row.key}-end`}
                      type="datetime-local"
                      required
                      value={row.end}
                      onChange={(event) =>
                        edit(index, 'end', event.target.value)
                      }
                    />
                  </Field>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Remove outing ${index + 1}`}
                  disabled={rows.length <= 1}
                  onClick={() => {
                    setRows((current) => current.filter((_, i) => i !== index));
                    setError('');
                  }}
                >
                  Remove outing
                </Button>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={update.isPending}
              onClick={() => {
                setRows((current) => [
                  ...current,
                  { key: crypto.randomUUID(), start: '', end: '' }
                ]);
                setError('');
              }}
            >
              Add outing
            </Button>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={update.isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save outings'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
