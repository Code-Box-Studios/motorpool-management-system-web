import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useUserRole } from '@/hooks/use-user-role';
import {
  useMaintenanceStandards,
  useVehicleMaintenanceTracking
} from '@/lib/query/maintenance-plans';
import {
  useAssignMaintenanceStandard,
  useCompleteMaintenanceTask
} from '@/lib/mutation/maintenance-plans';
import type { MaintenanceTracking } from '@/lib/api/maintenance-plans';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

const statusLabels = {
  pending: 'Pending',
  completed: 'Completed',
  due_soon: 'Due soon',
  overdue: 'Overdue'
};
const day = (value: string) =>
  new Date(value).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

export function VehicleMaintenanceTracking({
  vehicleId,
  mileage,
  standardId
}: {
  vehicleId: string;
  mileage: number;
  standardId: string | null;
}) {
  const { data: role } = useUserRole();
  const admin = role?.roles?.name === 'admin';
  const standards = useMaintenanceStandards();
  const tracking = useVehicleMaintenanceTracking(vehicleId);
  const assign = useAssignMaintenanceStandard();
  const complete = useCompleteMaintenanceTask();
  const [selected, setSelected] = useState('');
  const [completing, setCompleting] = useState<MaintenanceTracking | null>(
    null
  );
  const [completedMileage, setCompletedMileage] = useState('');
  const [notes, setNotes] = useState('');
  const completionTrigger = useRef<HTMLElement | null>(null);
  const chosenId = selected || standardId || '';
  const chosen = standards.data?.find((standard) => standard.id === chosenId);
  const assigned = standards.data?.find(
    (standard) => standard.id === standardId
  );
  return (
    <section
      aria-label="Tracked maintenance"
      className="bg-card border-border mt-8 space-y-5 rounded-2xl border p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Tracked maintenance</h2>
          <p className="text-muted-foreground text-sm">
            Current standard:{' '}
            {assigned?.name ??
              (standardId ? 'Unavailable standard' : 'Not assigned')}
          </p>
        </div>
        {admin && (
          <Link
            to="/maintenance"
            search={{ tab: 'standards' }}
            className="text-foreground text-sm underline underline-offset-4"
          >
            Manage maintenance standards
          </Link>
        )}
      </div>
      {standards.error && (
        <div role="alert">
          <p>Unable to load standards. {standards.error.message}</p>
          <Button variant="outline" onClick={() => void standards.refetch()}>
            Retry standards
          </Button>
        </div>
      )}
      {admin && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (chosen?.scheduleItems.length)
              assign.mutate({ vehicleId, standardId: chosen.id });
          }}
        >
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor={`maintenance-standard-${vehicleId}`}>
                Maintenance standard
              </FieldLabel>
              <Select
                value={chosenId}
                disabled={standards.isLoading || assign.isPending}
                onValueChange={setSelected}
              >
                <SelectTrigger id={`maintenance-standard-${vehicleId}`}>
                  <SelectValue
                    placeholder={
                      standards.isLoading
                        ? 'Loading standards…'
                        : 'Choose standard'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {standards.data?.map((standard) => (
                    <SelectItem
                      key={standard.id}
                      value={standard.id}
                      disabled={standard.scheduleItems.length === 0}
                    >
                      {standard.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              type="submit"
              disabled={!chosen?.scheduleItems.length || assign.isPending}
            >
              {assign.isPending ? 'Assigning…' : 'Assign standard'}
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            Assignment adds untracked tasks. Existing tasks and completion
            history remain, including tasks from previous standards. Reassign
            after adding tasks to a standard.
          </p>
          {standards.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Create a maintenance standard with schedule items first.
            </p>
          )}
          {assign.error && (
            <p role="alert" className="text-destructive text-sm">
              {assign.error.message}
            </p>
          )}
        </form>
      )}
      {tracking.isLoading ? (
        <p role="status">Loading tracked tasks…</p>
      ) : tracking.error ? (
        <div role="alert">
          <p>Unable to load tracked tasks. {tracking.error.message}</p>
          <Button variant="outline" onClick={() => void tracking.refetch()}>
            Retry tracked tasks
          </Button>
        </div>
      ) : tracking.data?.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4">
          No tracked maintenance tasks.
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {tracking.data?.map((row) => (
            <li key={row.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold break-words">
                  {row.scheduleItem.taskName}
                </h3>
                <Badge
                  variant={
                    row.displayStatus === 'overdue'
                      ? 'stop'
                      : row.displayStatus === 'due_soon'
                        ? 'wait'
                        : 'neutral'
                  }
                >
                  {statusLabels[row.displayStatus]}
                </Badge>
              </div>
              {row.scheduleItem.maintenanceStandardId !== standardId && (
                <p className="text-muted-foreground text-xs">
                  Retained from a previous standard
                </p>
              )}
              {row.scheduleItem.taskDescription && (
                <p className="text-muted-foreground text-sm break-words">
                  {row.scheduleItem.taskDescription}
                </p>
              )}
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Next due</dt>
                  <dd>
                    {[
                      row.nextDueMileage !== null
                        ? `${row.nextDueMileage.toLocaleString()} km`
                        : null,
                      row.nextDueDate ? day(row.nextDueDate) : null
                    ]
                      .filter(Boolean)
                      .join(' or ') || 'No interval configured'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last completion</dt>
                  <dd>
                    {row.lastCompletedDate
                      ? `${day(row.lastCompletedDate)}${row.lastCompletedMileage !== null ? ` at ${row.lastCompletedMileage.toLocaleString()} km` : ''}`
                      : 'Not completed yet'}
                  </dd>
                </div>
              </dl>
              {admin && (
                <Button
                  variant="outline"
                  aria-label={`Complete ${row.scheduleItem.taskName}`}
                  onClick={() => {
                    completionTrigger.current =
                      document.activeElement as HTMLElement;
                    complete.reset();
                    setCompletedMileage(String(mileage));
                    setNotes('');
                    setCompleting(row);
                  }}
                >
                  Record completion
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={completing !== null}
        onOpenChange={(open) => {
          if (!open && !complete.isPending) setCompleting(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            completionTrigger.current?.focus();
          }}
          className="max-h-[90dvh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              Complete {completing?.scheduleItem.taskName}
            </DialogTitle>
            <DialogDescription>
              Record the service mileage and notes. Next due values and the
              vehicle's service history update together.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const value = Number(completedMileage);
              if (
                !completing ||
                !completedMileage ||
                !Number.isInteger(value) ||
                value < mileage
              )
                return;
              complete.mutate(
                {
                  id: completing.id,
                  body: { completedMileage: value, notes: notes.trim() || null }
                },
                { onSuccess: () => setCompleting(null) }
              );
            }}
          >
            <Field>
              <FieldLabel htmlFor="task-completed-mileage">
                Completed mileage (km)
              </FieldLabel>
              <Input
                id="task-completed-mileage"
                type="number"
                required
                min={mileage}
                step="1"
                disabled={complete.isPending}
                value={completedMileage}
                onChange={(event) => setCompletedMileage(event.target.value)}
              />
              <p className="text-muted-foreground text-sm">
                Current vehicle mileage: {mileage.toLocaleString()} km.
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-completion-notes">
                Completion notes
              </FieldLabel>
              <Textarea
                id="task-completion-notes"
                disabled={complete.isPending}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            {complete.error && (
              <p role="alert" className="text-destructive text-sm">
                {complete.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={complete.isPending}
                onClick={() => setCompleting(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={complete.isPending}>
                Record completion
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
