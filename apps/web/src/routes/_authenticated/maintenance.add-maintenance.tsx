import AddMaintenance from '@/components/pages/maintenance/add-maintenance/page';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/maintenance/add-maintenance'
)({
  validateSearch: (
    search: Record<string, unknown>
  ): Record<string, unknown> & { date?: string } => {
    const selected = typeof search.date === 'string' ? search.date : '';
    // FullCalendar week/day slots include a time and offset; retain the
    // selected local calendar day rather than converting it to a UTC day.
    const date = selected.split('T')[0];
    const validTime =
      !selected.includes('T') || !Number.isNaN(new Date(selected).getTime());
    const parsed = new Date(`${date}T00:00:00Z`);
    return validTime &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
      ? { ...search, date }
      : { ...search, date: undefined };
  },
  component: AddMaintenance
});
