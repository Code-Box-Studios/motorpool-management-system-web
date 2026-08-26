import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  blockersFrom,
  describeBlockers,
  type OrgRecord,
  type OrgResource
} from '@/lib/api/organization';
import { useArchiveOrgRecord } from '@/lib/mutation/organization';

interface ArchiveDialogProps {
  resource: OrgResource;
  record: OrgRecord | null;
  onClose: () => void;
}

export function ArchiveDialog({
  resource,
  record,
  onClose
}: ArchiveDialogProps) {
  const [blockers, setBlockers] = useState<string[]>([]);
  const archive = useArchiveOrgRecord(resource);

  function close() {
    setBlockers([]);
    onClose();
  }

  function confirm() {
    if (!record) return;
    archive.mutate(record.id, {
      onSuccess: close,
      // A blocked archive is not a failure to report and dismiss — it is a
      // list of work the admin has to do first, so it stays on screen.
      onError: (error) => setBlockers(describeBlockers(blockersFrom(error)))
    });
  }

  const blocked = blockers.length > 0;

  return (
    <AlertDialog open={!!record} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blocked
              ? `Cannot archive "${record?.name}"`
              : `Archive "${record?.name}"?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            {blocked ? (
              <div>
                <p>Still in use:</p>
                <ul className="mt-2 list-disc pl-5">
                  {blockers.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-2">Reassign or archive these first.</p>
              </div>
            ) : (
              <span>
                It will stop being offered anywhere in the app. Existing records
                keep showing it, and you can restore it later.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>
            {blocked ? 'Close' : 'Cancel'}
          </AlertDialogCancel>
          {!blocked && (
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open so a blocked archive can render inline.
                e.preventDefault();
                confirm();
              }}
              disabled={archive.isPending}
            >
              Archive
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
