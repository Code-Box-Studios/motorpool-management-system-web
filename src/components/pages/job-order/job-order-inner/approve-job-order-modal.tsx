import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';

interface ApproveJobOrderModalProps {
  onSubmit: (data: ApproveJobOrderData) => void;
  isLoading: boolean;
}

export interface ApproveJobOrderData {
  approved_by: string;
  date_approved: string;
  status: 'ongoing_repair';
}

export function ApproveJobOrderModal({
  onSubmit,
  isLoading
}: ApproveJobOrderModalProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    onSubmit({
      approved_by: user?.id || '',
      date_approved: new Date().toISOString(),
      status: 'ongoing_repair'
    });
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
