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
  // useArchiveOrgRecord deliberately skips the toast every other org mutation
  // gets, on the assumption that a failure here is always a blocker list this
  // dialog renders instead. That assumption only holds for IN_USE — a stale
  // row (ALREADY_ARCHIVED), an expired session, or a 500 all fail with no
  // blockers, and without this the admin sees the button re-enable with
  // absolutely no explanation. The blocker list stays the special case;
  // everything else falls back to a plain message.
  const [error, setError] = useState<string | null>(null);
  const archive = useArchiveOrgRecord(resource);

  function close() {
    setBlockers([]);
    setError(null);
    onClose();
  }

  function confirm() {
    if (!record) return;
    setError(null);
    archive.mutate(record.id, {
      onSuccess: close,
      // A blocked archive is not a failure to report and dismiss — it is a
      // list of work the admin has to do first, so it stays on screen.
      onError: (err) => {
        const list = describeBlockers(blockersFrom(err));
        if (list.length > 0) {
          setBlockers(list);
        } else {
          setError(err instanceof Error ? err.message : 'Archive failed.');
        }
      }
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
            <div>
              {blocked ? (
                <>
                  <p>Still in use:</p>
                  <ul className="mt-2 list-disc pl-5">
                    {blockers.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="mt-2">Reassign or archive these first.</p>
                </>
              ) : (
                <span>
                  It will stop being offered anywhere in the app. Existing
                  records keep showing it, and you can restore it later.
                </span>
              )}
              {error && <p className="text-destructive mt-2">{error}</p>}
            </div>
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
