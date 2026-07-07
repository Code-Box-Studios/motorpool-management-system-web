import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';

interface ApproveJobOrderModalProps {
  onSubmit: () => void;
  isLoading: boolean;
}

// evp_operations: POST /job-orders/:id/approve takes no body — the server
// records the approver + timestamp, so this modal is a pure confirmation.
export function ApproveJobOrderModal({
  onSubmit,
  isLoading
}: ApproveJobOrderModalProps) {
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    onSubmit();
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Approve
      </Button>
      <ConfirmationModal
        open={open}
        onOpenChange={setOpen}
        title="Approve Job Order"
        description='Are you sure you want to approve this job order? The status will be changed to "Ongoing Repair".'
        confirmLabel="Approve"
        loading={isLoading}
        onConfirm={handleConfirm}
      />
    </>
  );
}
