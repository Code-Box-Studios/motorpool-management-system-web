import { useRef, useState } from 'react';
import { useUserRole } from '@/hooks/use-user-role';
import { useMaintenanceStandards } from '@/lib/query/maintenance-plans';
import {
  useSaveMaintenanceStandard,
  useDeleteMaintenanceStandard,
  useAddMaintenanceScheduleItem,
  useRemoveMaintenanceScheduleItem
} from '@/lib/mutation/maintenance-plans';
import type { MaintenanceStandard } from '@/lib/api/maintenance-plans';
import { Button } from '@/components/ui/button';
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
import { ConfirmationModal } from '@/components/shared/confirmation-modal';

export function MaintenanceStandardsManager() {
  const { data: role } = useUserRole();
  const admin = role?.roles?.name === 'admin';
  const trigger = useRef<HTMLElement | null>(null);
  const rememberTrigger = () => {
    trigger.current = document.activeElement as HTMLElement;
  };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    trigger.current?.focus();
  };
  const standards = useMaintenanceStandards();
  const save = useSaveMaintenanceStandard();
  const addTask = useAddMaintenanceScheduleItem();
  const deleteStandard = useDeleteMaintenanceStandard();
  const removeTask = useRemoveMaintenanceScheduleItem();
  const [editing, setEditing] = useState<MaintenanceStandard | 'new' | null>(
    null
  );
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [taskStandard, setTaskStandard] = useState<MaintenanceStandard | null>(
    null
  );
  const [taskName, setTaskName] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [intervalType, setIntervalType] = useState<'mileage' | 'time' | 'both'>(
    'mileage'
  );
  const [mileage, setMileage] = useState('');
  const [months, setMonths] = useState('');
  const [deleting, setDeleting] = useState<{
    kind: 'standard' | 'task';
    id: string;
    name: string;
  } | null>(null);
  const deleteMutation =
    deleting?.kind === 'task' ? removeTask : deleteStandard;

  return (
    <section aria-label="Maintenance standards" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Maintenance standards</h2>
          <p className="text-muted-foreground text-sm">
            Reusable task intervals. Assign a standard from a vehicle's detail
            page.
          </p>
        </div>
        {admin && (
          <Button
            onClick={() => {
              rememberTrigger();
              save.reset();
              setName('');
              setDescription('');
              setEditing('new');
            }}
          >
            New standard
          </Button>
        )}
      </div>
      {standards.isLoading ? (
        <p role="status">Loading maintenance standards…</p>
      ) : standards.error ? (
        <div role="alert" className="space-y-2">
          <p>Unable to load standards. {standards.error.message}</p>
          <Button variant="outline" onClick={() => void standards.refetch()}>
            Retry standards
          </Button>
        </div>
      ) : standards.data?.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-5">
          No maintenance standards yet.
        </p>
      ) : (
        standards.data?.map((standard) => (
          <section
            key={standard.id}
            aria-label={standard.name}
            className="bg-card border-border space-y-4 rounded-2xl border p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold break-words">{standard.name}</h3>
                <p className="text-muted-foreground text-sm break-words">
                  {standard.description}
                </p>
              </div>
              {admin && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      rememberTrigger();
                      save.reset();
                      setName(standard.name);
                      setDescription(standard.description ?? '');
                      setEditing(standard);
                    }}
                  >
                    Edit standard
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      deleteStandard.reset();
                      setDeleting({
                        kind: 'standard',
                        id: standard.id,
                        name: standard.name
                      });
                    }}
                  >
                    Delete standard
                  </Button>
                </div>
              )}
            </div>
            {standard.scheduleItems.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No schedule items. Add tasks before assigning this standard.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {standard.scheduleItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium break-words">{item.taskName}</p>
                      <p className="text-muted-foreground text-sm break-words">
                        {item.taskDescription}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {[
                          item.intervalMileage
                            ? `${item.intervalMileage.toLocaleString()} km`
                            : null,
                          item.intervalMonths
                            ? `${item.intervalMonths} months`
                            : null
                        ]
                          .filter(Boolean)
                          .join(' or ') || 'No interval configured'}
                      </p>
                    </div>
                    {admin && (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Remove ${item.taskName}`}
                        onClick={() => {
                          removeTask.reset();
                          setDeleting({
                            kind: 'task',
                            id: item.id,
                            name: item.taskName
                          });
                        }}
                      >
                        Remove task
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {admin && (
              <Button
                variant="outline"
                onClick={() => {
                  rememberTrigger();
                  addTask.reset();
                  setTaskName('');
                  setTaskDescription('');
                  setIntervalType('mileage');
                  setMileage('');
                  setMonths('');
                  setTaskStandard(standard);
                }}
              >
                Add schedule item
              </Button>
            )}
          </section>
        ))
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setEditing(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={restoreFocus}
          className="max-h-[90dvh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {editing === 'new' ? 'New standard' : 'Edit standard'}
            </DialogTitle>
            <DialogDescription>
              Name the standard and describe when the fleet should use it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              save.mutate(
                {
                  id: editing && editing !== 'new' ? editing.id : undefined,
                  body: {
                    name: name.trim(),
                    description: description.trim() || null
                  }
                },
                { onSuccess: () => setEditing(null) }
              );
            }}
          >
            <Field>
              <FieldLabel htmlFor="standard-name">Standard name</FieldLabel>
              <Input
                id="standard-name"
                required
                value={name}
                disabled={save.isPending}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="standard-description">
                Description
              </FieldLabel>
              <Textarea
                id="standard-description"
                value={description}
                disabled={save.isPending}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            {save.error && (
              <p role="alert" className="text-destructive text-sm">
                {save.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Save standard
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={taskStandard !== null}
        onOpenChange={(open) => {
          if (!open && !addTask.isPending) setTaskStandard(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={restoreFocus}
          className="max-h-[90dvh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Add schedule item</DialogTitle>
            <DialogDescription>
              Add a task to {taskStandard?.name}. Intervals must be positive
              whole numbers.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!taskStandard || !taskName.trim()) return;
              const needsMileage = intervalType !== 'time';
              const needsMonths = intervalType !== 'mileage';
              const km = Number(mileage);
              const monthCount = Number(months);
              if (
                (needsMileage && (!Number.isInteger(km) || km <= 0)) ||
                (needsMonths &&
                  (!Number.isInteger(monthCount) || monthCount <= 0))
              )
                return;
              addTask.mutate(
                {
                  standardId: taskStandard.id,
                  body: {
                    taskName: taskName.trim(),
                    taskDescription: taskDescription.trim() || null,
                    intervalType,
                    intervalMileage: needsMileage ? km : null,
                    intervalMonths: needsMonths ? monthCount : null
                  }
                },
                { onSuccess: () => setTaskStandard(null) }
              );
            }}
          >
            <Field>
              <FieldLabel htmlFor="schedule-task-name">Task name</FieldLabel>
              <Input
                id="schedule-task-name"
                required
                disabled={addTask.isPending}
                value={taskName}
                onChange={(event) => setTaskName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="schedule-task-description">
                Task description
              </FieldLabel>
              <Textarea
                id="schedule-task-description"
                disabled={addTask.isPending}
                value={taskDescription}
                onChange={(event) => setTaskDescription(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="schedule-interval-type">
                Interval type
              </FieldLabel>
              <Select
                value={intervalType}
                onValueChange={(value: typeof intervalType) =>
                  setIntervalType(value)
                }
                disabled={addTask.isPending}
              >
                <SelectTrigger id="schedule-interval-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mileage">Mileage</SelectItem>
                  <SelectItem value="time">Time</SelectItem>
                  <SelectItem value="both">Mileage or time</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {intervalType !== 'time' && (
              <Field>
                <FieldLabel htmlFor="schedule-mileage">
                  Mileage interval (km)
                </FieldLabel>
                <Input
                  id="schedule-mileage"
                  type="number"
                  min="1"
                  step="1"
                  required
                  disabled={addTask.isPending}
                  value={mileage}
                  onChange={(event) => setMileage(event.target.value)}
                />
              </Field>
            )}
            {intervalType !== 'mileage' && (
              <Field>
                <FieldLabel htmlFor="schedule-months">
                  Time interval (months)
                </FieldLabel>
                <Input
                  id="schedule-months"
                  type="number"
                  min="1"
                  step="1"
                  required
                  disabled={addTask.isPending}
                  value={months}
                  onChange={(event) => setMonths(event.target.value)}
                />
              </Field>
            )}
            {addTask.error && (
              <p role="alert" className="text-destructive text-sm">
                {addTask.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={addTask.isPending}
                onClick={() => setTaskStandard(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addTask.isPending}>
                Save task
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmationModal
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleting(null);
        }}
        title={
          deleting?.kind === 'task' ? 'Remove schedule item' : 'Delete standard'
        }
        description={
          deleteMutation.error?.message ??
          `Remove ${deleting?.name}? Tasks referenced by vehicle tracking cannot be deleted.`
        }
        confirmLabel={
          deleting?.kind === 'task' ? 'Remove schedule item' : 'Delete standard'
        }
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting)
            deleteMutation.mutate(deleting.id, {
              onSuccess: () => setDeleting(null)
            });
        }}
      />
    </section>
  );
}
