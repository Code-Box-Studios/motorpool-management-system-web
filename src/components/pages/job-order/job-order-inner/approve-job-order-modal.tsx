import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogCancel
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';

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

  const handleSubmit = () => {
    onSubmit({
      approved_by: user?.id || '',
      date_approved: new Date().toISOString(),
      status: 'ongoing_repair'
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="default" size="sm">
          Approve
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve Job Order</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to approve this job order? The status will be
            changed to "Ongoing Repair".
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Approving...' : 'Approve'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
