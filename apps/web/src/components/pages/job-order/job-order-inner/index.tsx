import { useParams } from '@tanstack/react-router';
import { Check, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
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
// unparseable one resolves to undefined so the view can show its missing-value
// text rather than "Invalid Date".
const formatDateTime = (value: string | null | undefined) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
};

const titleCase = (value: string | null | undefined) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : undefined;

const repairStages = [
  {
    status: 'pending',
    label: 'Requested',
    nextStep: 'Next: assign a mechanic and set the repair plan.'
  },
  {
    status: 'assigned_mechanic',
    label: 'Mechanic assigned',
    nextStep: 'Next: approve the job order to begin repair.'
  },
  {
    status: 'ongoing_repair',
    label: 'In repair',
    nextStep: 'Next: record the completed repair and vehicle release.'
  },
  {
    status: 'repaired',
    label: 'Completed',
    nextStep: 'Repair completed. Review the repair outcome below.'
  }
];

const RepairProgress = ({ status }: { status: string | null }) => {
  const currentStage = repairStages.findIndex(
    (stage) => stage.status === status
  );
  if (currentStage < 0) return null;

  return (
    <section
      aria-label="Repair progress"
      className="bg-card border-border rounded-[20px] border p-5"
    >
      <ol className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {repairStages.map((stage, index) => (
          <li
            key={stage.status}
            aria-current={index === currentStage ? 'step' : undefined}
            className="flex min-w-0 items-center gap-2.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                index <= currentStage
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground bg-muted/40',
                index === currentStage && 'ring-primary/15 ring-4'
              )}
            >
              {index < currentStage ? (
                <Check className="size-3.5" />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn(
                'text-xs leading-snug sm:text-sm',
                index === currentStage
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground'
              )}
            >
              {stage.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground border-border mt-4 border-t pt-3 text-sm">
        {repairStages[currentStage].nextStep}
      </p>
    </section>
  );
};

const notRecorded = (
  <span className="text-muted-foreground font-normal">Not recorded</span>
);
const notAssigned = (
  <span className="text-muted-foreground font-normal">Not assigned</span>
);
const notSet = (
  <span className="text-muted-foreground font-normal">Not set</span>
);

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
        maintenanceType: data.maintenanceType || null,
        serviceLocation: data.serviceLocation || null,
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
  const hasRepairOutcome = Boolean(
    jobOrder.repair_done?.trim() || jobOrder.actual_date_of_release
  );

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
                currentMaintenanceType={jobOrder.maintenance_type}
                currentServiceLocation={jobOrder.service_location}
                onSubmit={handleCompleteRepair}
                isLoading={completeRepair.isPending}
                currentMileage={fleetVehicle?.mileage ?? 0}
              />
            )}
          </>
        }
      />

      <div className="grid items-stretch gap-5 xl:grid-cols-2">
        {repairStages.some((stage) => stage.status === jobOrder.status) && (
          <div className="xl:col-span-2">
            <RepairProgress status={jobOrder.status} />
          </div>
        )}

        <DetailSection
          title="Vehicle & incident"
          className="min-w-0 p-5 sm:p-6"
        >
          <DetailGrid className="lg:grid-cols-2">
            <DetailItem label="Vehicle" value={vehicleName || notRecorded} />
            <DetailItem label="Plate" value={plate || notRecorded} mono />
            <DetailItem label="Branch" value={branchName || notRecorded} />
            <DetailItem
              label="Incident date"
              value={formatDateTime(jobOrder.incident_date) || notRecorded}
            />
            <DetailItem
              label="Incident details"
              value={incident || notRecorded}
              className="sm:col-span-2"
            />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Repair plan" className="min-w-0 p-5 sm:p-6">
          <DetailGrid className="lg:grid-cols-2">
            <DetailItem
              label="Assigned mechanic"
              value={personName(jobOrder.assigned_mechanic) || notAssigned}
            />
            {/* `date_of_request` is the date the shop accepted the vehicle. */}
            <DetailItem
              label="Vehicle date accepted"
              value={formatDateTime(jobOrder.date_of_request) || notRecorded}
            />
            <DetailItem
              label="Target date"
              value={formatDateTime(jobOrder.target_date) || notSet}
            />
            <DetailItem
              label="Maintenance type"
              value={titleCase(jobOrder.maintenance_type) || notSet}
            />
            <DetailItem
              label="Service location"
              value={titleCase(jobOrder.service_location) || notSet}
            />
          </DetailGrid>
        </DetailSection>

        <DetailSection
          title="Request & approval"
          className="min-w-0 p-5 sm:p-6"
        >
          <DetailGrid className="lg:grid-cols-2">
            <DetailItem
              label="Requested by"
              value={personName(jobOrder.requested_by) || notRecorded}
            />
            <DetailItem
              label="Date of request"
              value={formatDateTime(jobOrder.created_at) || notRecorded}
            />
            <DetailItem
              label="Noted by"
              value={personName(jobOrder.noted_by) || notRecorded}
            />
            <DetailItem
              label="Approved by"
              value={personName(jobOrder.approved_by) || notRecorded}
            />
            <DetailItem
              label="Date approved"
              value={formatDateTime(jobOrder.date_approved) || notRecorded}
            />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Repair outcome" className="min-w-0 p-5 sm:p-6">
          {hasRepairOutcome ? (
            <DetailGrid className="lg:grid-cols-2">
              <DetailItem
                label="Repair done"
                value={titleCase(jobOrder.repair_done) || notRecorded}
              />
              <DetailItem
                label="Actual date of release"
                value={
                  formatDateTime(jobOrder.actual_date_of_release) || notRecorded
                }
              />
            </DetailGrid>
          ) : (
            <div className="bg-muted/40 flex items-start gap-3 rounded-xl p-4">
              <Wrench
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium">
                  No repair outcome recorded
                </p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  Repair details and the actual release date will appear here
                  once recorded.
                </p>
              </div>
            </div>
          )}
          <DetailGrid className="border-border mt-5 border-t pt-5 lg:grid-cols-2">
            <DetailItem
              label="Remarks"
              value={jobOrder.remarks || notRecorded}
              className="sm:col-span-2"
            />
          </DetailGrid>
        </DetailSection>

        <DetailSection
          title="Spare parts"
          description="Parts noted against this repair."
          className="min-w-0 p-5 sm:p-6 xl:col-span-2"
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
