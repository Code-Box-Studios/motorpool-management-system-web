import { useParams } from '@tanstack/react-router';
import { useJobOrder } from '@/lib/query/job-orders';
import { useAllDrivers } from '@/lib/query/drivers';
import { useAllVehicles } from '@/lib/query/vehicles';
import { useAdmins, useAllUsers } from '@/lib/query/user-management';
import { useBranchesForDisplay } from '@/lib/query/shared';
import { useAllSpareParts } from '@/lib/query/spare-parts';
import {
  RecordHeader,
  DetailSection,
  DetailGrid,
  DetailItem
} from '@/components/shared/detail-view';
import EmptyState from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useBreadcrumbLabel } from '@/hooks/use-breadcrumb';
import { formatRef } from '@/lib/utils/reference';
import { NoteJobOrderModal } from './note-job-order-modal';
import { ApproveJobOrderModal } from './approve-job-order-modal';
import { CompleteRepairModal } from './complete-repair-modal';
import type { NoteJobOrderData } from './note-job-order-modal';
import type { CompleteRepairData } from './complete-repair-modal';
import {
  useNoteJobOrder,
  useApproveJobOrder,
  useCompleteRepair
} from '@/lib/mutation/job-orders';
import { useUserRole } from '@/hooks/use-user-role';

// Dates arrive as ISO strings (some columns are `@db.Date`). A missing or
// unparseable one resolves to undefined so DetailItem prints an em dash
// rather than "Invalid Date".
const formatDateTime = (value: string | null | undefined) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
};

const titleCase = (value: string | null | undefined) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : undefined;

const DetailSkeleton = () => (
  <div>
    <div className="mb-6 space-y-3">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-56" />
    </div>
    <div className="space-y-6">
      {[0, 1].map((section) => (
        <div
          key={section}
          className="bg-card border-border rounded-[20px] border p-6"
        >
          <Skeleton className="mb-5 h-5 w-40" />
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((field) => (
              <div key={field} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const JobOrderInner = () => {
  const { id } = useParams({ strict: false });
  const jobOrderId = id as string;
  const { data: jobOrder, isLoading: isLoadingJobOrder } =
    useJobOrder(jobOrderId);
  const { data: drivers, isLoading: isLoadingDrivers } = useAllDrivers();
  // The whole fleet, not a page of it: this is both the fallback for a payload
  // served without its embedded vehicle AND where the odometer comes from — the
  // embedded summary carries make/model/plate but no mileage, and
  // complete-repair has to record a reading against it.
  const { data: vehicles, isLoading: isLoadingVehicles } = useAllVehicles();
  // Display-only, so archived-inclusive: this page shows the branch a job
  // order was raised under and offers no branch picker. A repaired job order
  // whose branch has since been archived must still name it.
  const { data: branches, isLoading: isLoadingBranches } =
    useBranchesForDisplay();
  const { data: admins, isLoading: isLoadingAdmins } = useAdmins();
  const { data: allUsers, isLoading: isLoadingUsers } = useAllUsers();
  const { data: spareParts, isLoading: isLoadingSpareParts } =
    useAllSpareParts();

  const { data: userRole } = useUserRole();
  const noteJobOrder = useNoteJobOrder();
  const approveJobOrder = useApproveJobOrder();
  const completeRepair = useCompleteRepair();

  useBreadcrumbLabel(jobOrder ? formatRef('JO', jobOrder.order_no) : undefined);

  // The API stores people as ids and embeds no user object, so a name has to be
  // found in one of the three directories. An id we cannot name is NOT shown —
  // a UUID is a database key, never a fact about a person.
  const personName = (personId: string | null | undefined) => {
    if (!personId) return undefined;
    return (
      drivers?.find((driver) => driver.id === personId)?.full_name ||
      admins?.find((admin) => admin.id === personId)?.full_name ||
      allUsers?.find((user) => user.id === personId)?.full_name ||
      undefined
    );
  };

  const isAdmin = userRole?.roles?.name === 'admin';
  const isEVP = userRole?.roles?.name === 'evp_operations';

  // Same handlers the list page uses — the transition is the same transition
  // whether it is fired from a row or from the record itself.
  const handleNoteJobOrder = (data: NoteJobOrderData) => {
    noteJobOrder.mutateAsync({ id: jobOrderId, ...data }).catch((error) => {
      console.error('Error noting job order:', error);
    });
  };

  const handleApproveJobOrder = () => {
    approveJobOrder.mutateAsync({ id: jobOrderId }).catch((error) => {
      console.error('Error approving job order:', error);
    });
  };

  const handleCompleteRepair = (data: CompleteRepairData) => {
    completeRepair
      .mutateAsync({
        id: jobOrderId,
        repairDone: data.repairDone,
        completedMileage: Number(data.completedMileage),
        remarks: data.remarks || undefined,
        actualDateOfRelease: data.actualDateOfRelease || undefined
      })
      .catch((error) => {
        console.error('Error completing repair:', error);
      });
  };

  if (
    isLoadingJobOrder ||
    isLoadingDrivers ||
    isLoadingVehicles ||
    isLoadingBranches ||
    isLoadingAdmins ||
    isLoadingUsers ||
    isLoadingSpareParts
  ) {
    return <DetailSkeleton />;
  }

  if (!jobOrder) {
    return <EmptyState message="Job order not found." />;
  }

  // The read endpoint embeds the vehicle; the fleet row is the fallback for a
  // payload served without it, and the only place the odometer lives.
  const fleetVehicle = vehicles?.find((v) => v.id === jobOrder.vehicle_id);
  const vehicle = jobOrder.vehicles ?? fleetVehicle;
  const vehicleName = vehicle ? `${vehicle.make} ${vehicle.model}` : undefined;
  const plate = vehicle?.license_plate;

  const branchName = branches?.find(
    (branch) => branch.id === jobOrder.branch_id
  )?.name;

  const partsUsed = (
    Array.isArray(jobOrder.spare_parts_used) ? jobOrder.spare_parts_used : []
  ).map((sparePartId) => {
    const part = spareParts?.find((p) => p.id === sparePartId);
    return {
      id: sparePartId,
      name: part?.name ?? 'Unknown part',
      brand: part?.brand ?? undefined
    };
  });

  const incident = jobOrder.incident_details?.trim();

  return (
    <div>
      {/* The record has to offer the same transition its row does — an admin who
          opens a job order from the dashboard, the calendar or a link would
          otherwise have to go back to the list to act on it. Same modals, same
          status rules; RecordHeader lays the actions out. */}
      <RecordHeader
        reference={formatRef('JO', jobOrder.order_no)}
        title={incident || 'Job order'}
        status={jobOrder.status ?? undefined}
        meta={
          vehicleName && (
            <>
              {vehicleName}
              {plate && (
                <>
                  {' · '}
                  <span className="font-mono">{plate}</span>
                </>
              )}
            </>
          )
        }
        backTo="/job-order"
        backLabel="Job Orders"
        actions={
          <>
            {isAdmin && jobOrder.status === 'pending' && (
              <NoteJobOrderModal
                drivers={drivers}
                onSubmit={handleNoteJobOrder}
                isLoading={noteJobOrder.isPending}
                currentSparePartsUsed={
                  Array.isArray(jobOrder.spare_parts_used)
                    ? jobOrder.spare_parts_used
                    : []
                }
              />
            )}
            {/* Admin as well as EVP: the approve endpoint takes both, and the
                admin is the superuser. */}
            {(isAdmin || isEVP) && jobOrder.status === 'assigned_mechanic' && (
              <ApproveJobOrderModal
                onSubmit={handleApproveJobOrder}
                isLoading={approveJobOrder.isPending}
              />
            )}
            {isAdmin && jobOrder.status === 'ongoing_repair' && (
              <CompleteRepairModal
                onSubmit={handleCompleteRepair}
                isLoading={completeRepair.isPending}
                currentMileage={fleetVehicle?.mileage ?? 0}
              />
            )}
          </>
        }
      />

      <div className="space-y-6">
        <DetailSection title="Vehicle & request">
          <DetailGrid>
            <DetailItem label="Vehicle" value={vehicleName} />
            <DetailItem label="Plate" value={plate} mono />
            <DetailItem label="Branch" value={branchName} />
            <DetailItem
              label="Incident Date"
              value={formatDateTime(jobOrder.incident_date)}
            />
            <DetailItem
              label="Requested By"
              value={personName(jobOrder.requested_by)}
            />
            <DetailItem
              label="Date of Request"
              value={formatDateTime(jobOrder.created_at)}
            />
            <DetailItem label="Incident Details" value={incident} wide />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Repair">
          <DetailGrid>
            <DetailItem
              label="Assigned Mechanic"
              value={personName(jobOrder.assigned_mechanic)}
            />
            {/* `date_of_request` is what the note flow calls "Vehicle Date
                Accepted" — the day the shop took the vehicle in. */}
            <DetailItem
              label="Vehicle Date Accepted"
              value={formatDateTime(jobOrder.date_of_request)}
            />
            <DetailItem
              label="Target Date"
              value={formatDateTime(jobOrder.target_date)}
            />
            <DetailItem
              label="Actual Date of Release"
              value={formatDateTime(jobOrder.actual_date_of_release)}
            />
            <DetailItem
              label="Repair Done"
              value={titleCase(jobOrder.repair_done)}
            />
            <DetailItem
              label="Noted By"
              value={personName(jobOrder.noted_by)}
            />
            <DetailItem
              label="Approved By"
              value={personName(jobOrder.approved_by)}
            />
            <DetailItem
              label="Date Approved"
              value={formatDateTime(jobOrder.date_approved)}
            />
            <DetailItem label="Remarks" value={jobOrder.remarks} wide />
          </DetailGrid>
        </DetailSection>

        <DetailSection
          title="Spare parts"
          description="Parts noted against this repair."
        >
          {partsUsed.length > 0 ? (
            <ul className="divide-border divide-y">
              {partsUsed.map((part) => (
                <li
                  key={part.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
                >
                  <span className="text-sm font-medium">{part.name}</span>
                  {part.brand && (
                    <span className="text-muted-foreground text-sm">
                      {part.brand}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No spare parts noted.
            </p>
          )}
        </DetailSection>
      </div>
    </div>
  );
};

export default JobOrderInner;
