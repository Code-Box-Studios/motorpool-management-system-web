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
import type { EmployeeRow } from '@/lib/api/shared';

interface GuidePickerProps {
  /** One entry per row, '' for an unfilled row. */
  guideIds: string[];
  /** This branch's roster — already filtered to the trip's branch by the
   *  caller, the same way branchEmployees is on the booking form. */
  employees: EmployeeRow[];
  employeesLoading: boolean;
  /** Drives the empty-state copy: "pick a branch first" vs. "no employees
   *  left in this branch". */
  tripBranchId: string | null | undefined;
  onChangeRow: (index: number, employeeId: string) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  /** Per-row validation message, if any — read from whatever form state the
   *  caller is tracking (react-hook-form or plain useState). */
  rowError?: (index: number) => string | undefined;
  addDisabled?: boolean;
}

// The repeating-Select guide picker: ordinary Selects, not
// components/ui/multi-select.tsx (a bare <div onClick> with no ARIA roles and
// raw bg-white — design §9.3), so the e2e suite's
// getByRole('combobox')/getByRole('option') can drive it. Shared by the
// booking form (add-trip-ticket/form.tsx) and the ticket detail's reassign
// control so there is exactly one place these rows are built — a second,
// divergent copy is how the trip-ticket edit form became the dead code the
// design's background documents.
export function GuidePicker({
  guideIds,
  employees,
  employeesLoading,
  tripBranchId,
  onChangeRow,
  onAddRow,
  onRemoveRow,
  rowError,
  addDisabled
}: GuidePickerProps) {
  // Two rows must never name the same person: the join's composite primary key
  // makes that unrepresentable in the database, so the picker never offers it.
  // The row's OWN current pick stays in its list — Radix needs the selected
  // item present to render its label.
  const optionsFor = (index: number) =>
    employees.filter(
      (e) => e.id === guideIds[index] || !guideIds.includes(e.id)
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
                disabled={employeesLoading}
              >
                <SelectTrigger
                  aria-label={`Guide ${index + 1}`}
                  aria-invalid={!!error}
                >
                  <SelectValue
                    placeholder={
                      employeesLoading ? 'Loading...' : 'Select an employee'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {optionsFor(index).length > 0 ? (
                    optionsFor(index).map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {/* The position is what tells two people with the
                            same name apart. */}
                        {employee.position
                          ? `${employee.name} — ${employee.position}`
                          : employee.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="text-muted-foreground p-2 text-sm">
                      {tripBranchId
                        ? 'No employees left in this branch'
                        : 'Pick a branch first'}
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
          disabled={addDisabled || guideIds.length >= employees.length}
          onClick={onAddRow}
        >
          <PlusIcon className="size-4" />
          Add guide
        </Button>
      </div>
    </div>
  );
}
