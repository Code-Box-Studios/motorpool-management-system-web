import { matchesSearch } from '@mms/shared';
import type { ApprovalHistoryQuery, DecisionRecord } from '@mms/shared';
import * as repo from './repository.js';

// Matches the web's formatRef so a screen and this list name the same row the
// same way.
const ref = (prefix: string, n: number | null | undefined) =>
  n == null ? prefix : `${prefix}-${n}`;

const plate = (
  v: {
    make: string;
    model: string;
    licensePlate: string;
  } | null
) => (v ? `${v.make} ${v.model} · ${v.licensePlate}` : null);

/**
 * Merged in memory, which is honest at this fleet's volumes (hundreds of rows)
 * and wrong at tens of thousands. At that point this becomes a single SQL
 * `UNION ALL` with one ORDER BY and one LIMIT — the shape below is deliberately
 * the same so the swap is local to this function.
 */
export async function history(
  query: ApprovalHistoryQuery
): Promise<{ data: DecisionRecord[]; count: number }> {
  const wantsFuel = query.kind !== 'repair';
  // Repairs record approvals only; their later workflow status is unrelated
  // to the outcome of that historical decision.
  const wantsRepair = query.kind !== 'fuel' && query.outcome !== 'declined';

  const limit = query.limit ?? (query.page === undefined ? undefined : 10);
  const page = query.page ?? 1;
  // Read enough from EACH source that the merged slice is complete: the whole
  // requested window could come from one side.
  const take =
    query.search || limit === undefined
      ? undefined
      : (page - 1) * limit + limit;

  const [allocations, jobOrders, fuelCount, repairCount] = await Promise.all([
    wantsFuel
      ? repo.decidedAllocations(take, query.outcome)
      : Promise.resolve([]),
    wantsRepair ? repo.approvedJobOrders(take) : Promise.resolve([]),
    wantsFuel
      ? repo.countDecidedAllocations(query.outcome)
      : Promise.resolve(0),
    wantsRepair ? repo.countApprovedJobOrders() : Promise.resolve(0)
  ]);

  const fuel: DecisionRecord[] = allocations.map((a) => ({
    kind: 'fuel',
    id: a.id,
    ref: ref('TT', a.tripTicket.ticketNo),
    linkTo: `/trip-tickets/${a.tripTicket.id}`,
    outcome: a.status === 'approved' ? 'approved' : 'declined',
    decidedAt: a.decidedAt?.toISOString() ?? null,
    decidedByName: a.decidedBy?.fullName ?? null,
    decidedByRole: a.decidedBy?.userRole?.role.name ?? null,
    reason: a.disapprovedReason,
    title: a.tripTicket.destination,
    subtitle: plate(a.vehicle),
    liters: a.liters,
    fuelType: a.fuelType
  }));

  const repair: DecisionRecord[] = jobOrders.map((o) => ({
    kind: 'repair',
    id: o.id,
    ref: ref('JO', o.orderNo),
    linkTo: `/job-order/${o.id}`,
    // Job orders have no decline path — the EVP screen offers approve only.
    outcome: 'approved',
    decidedAt: o.dateApproved?.toISOString() ?? null,
    decidedByName: o.approvedBy?.fullName ?? null,
    decidedByRole: o.approvedBy?.userRole?.role.name ?? null,
    reason: null,
    title: o.incidentDetails ?? 'Repair',
    subtitle: plate(o.vehicle),
    liters: null,
    fuelType: null
  }));

  const merged = [...fuel, ...repair].sort((a, b) => {
    // Nulls last in BOTH directions — Array.sort has no nulls option, so the
    // repository's `nulls: 'last'` has to be re-applied across the merge.
    if (a.decidedAt === null && b.decidedAt === null) return 0;
    if (a.decidedAt === null) return 1;
    if (b.decidedAt === null) return -1;
    return b.decidedAt.localeCompare(a.decidedAt);
  });

  // Search the complete merged history before slicing. The existing merge
  // already runs in memory at fleet scale; never filter just the fetched page.
  const filtered = query.search
    ? merged.filter((record) =>
        matchesSearch(query.search!, [
          record.ref,
          record.kind,
          record.kind === 'fuel' ? 'Trip ticket' : 'Job order',
          record.title,
          record.subtitle,
          record.outcome,
          record.decidedByName,
          record.decidedByRole,
          record.reason,
          record.fuelType
        ])
      )
    : merged;
  const count = query.search ? filtered.length : fuelCount + repairCount;
  if (limit === undefined) return { data: filtered, count };
  return { data: filtered.slice((page - 1) * limit, page * limit), count };
}
