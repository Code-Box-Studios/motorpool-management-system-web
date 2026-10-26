import { WorkflowProgress } from '@/components/shared/workflow-progress';
import type { WorkflowStep } from '@/components/shared/workflow-progress';
import type { TripTicket } from '@/lib/types';

const STAGES = [
  {
    id: 'requested',
    title: 'Requested',
    description: 'Trip request submitted'
  },
  {
    id: 'admin',
    title: 'Admin review',
    description: 'Review trip & allocate fuel'
  },
  {
    id: 'fuel',
    title: 'Fuel sign-off',
    description: 'EVP Operations approval'
  },
  {
    id: 'gate',
    title: 'Ready at gate',
    description: 'Driver presents the QR code'
  },
  { id: 'out', title: 'On the road', description: 'Guard scans QR out' },
  { id: 'returned', title: 'Completed', description: 'Guard scans QR in' }
] as const;

const CURRENT_STAGE: Record<string, number> = {
  pending_admin_approval: 1,
  pending_fuel_allocation_approval: 2,
  approved: 3,
  in_progress: 4,
  completed: 5
};

export function TripProgress({ ticket }: { ticket: TripTicket }) {
  const status = ticket.status ?? 'pending_admin_approval';
  const cancelled = status === 'cancelled';
  const declined = status === 'disapproved';
  const stopped = cancelled || declined;
  const finished = status === 'completed';
  const current = CURRENT_STAGE[status];
  const returned = ticket.dates.filter(
    (date) => date.status === 'completed'
  ).length;
  const excluded = ticket.dates.filter(
    (date) => date.status === 'cancelled'
  ).length;
  const outingCount = ticket.dates.length - excluded;
  const hadDeparture = ticket.dates.some(
    (date) =>
      date.pre_trip_checked_at ||
      date.status === 'completed' ||
      date.status === 'in_progress'
  );
  // A terminal status does not record which approval stopped the request. Only
  // check off stages supported by recorded approvals or actual gate activity.
  const confirmed = new Set<string>(['requested']);
  if (
    ticket.approved_by_admin ||
    ticket.fuel_allocation_id ||
    ticket.allocation_approved_by_evp_operations ||
    hadDeparture
  )
    confirmed.add('admin');
  if (ticket.allocation_approved_by_evp_operations || hadDeparture)
    confirmed.add('fuel');
  if (hadDeparture) confirmed.add('gate');
  if (returned > 0) confirmed.add('out');

  const steps: WorkflowStep[] = STAGES.map((stage, index) => ({
    ...stage,
    state:
      stopped || current === undefined
        ? confirmed.has(stage.id)
          ? 'complete'
          : 'unknown'
        : finished || index < current
          ? 'complete'
          : index === current
            ? 'current'
            : 'upcoming'
  }));
  let next: string;
  switch (status) {
    case 'pending_admin_approval':
      next =
        'Next: an admin reviews the request and allocates the fuel budget.';
      break;
    case 'pending_fuel_allocation_approval':
      next = 'Next: EVP Operations reviews and signs off the fuel budget.';
      break;
    case 'approved':
      next =
        'Next: the driver adds the starting odometer and shows the QR for guard check-out. A missing reading does not block scanning.';
      break;
    case 'in_progress':
      next =
        'Next: the driver adds the ending odometer; the guard scans the QR at return. A missing reading does not block scanning.';
      break;
    case 'completed':
      next = 'Trip completed. All non-cancelled outings have returned.';
      break;
    case 'cancelled':
      next = `This trip was cancelled. No further steps will run.${ticket.cancellation_reason ? ` Reason: ${ticket.cancellation_reason}` : ''}`;
      break;
    case 'disapproved':
      next = `This request was declined. No further steps will run.${ticket.disapproved_reason ? ` Reason: ${ticket.disapproved_reason}` : ''}`;
      break;
    default:
      next = 'Review the recorded trip status and gate activity below.';
  }
  if (ticket.dates.length > 1) {
    next += ` ${returned} of ${outingCount} outings completed${excluded ? `; ${excluded} cancelled` : ''}. Each outing repeats gate check-out and check-in.`;
  }

  return (
    <WorkflowProgress
      label="Trip progress"
      steps={steps}
      summary={next}
      outcome={
        cancelled
          ? 'Cancelled'
          : declined
            ? 'Declined'
            : finished
              ? 'Completed'
              : undefined
      }
    />
  );
}
