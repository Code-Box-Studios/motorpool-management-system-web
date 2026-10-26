import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';

const PREVIEW_LIMIT = 3;

export function ParticipantsList({ names }: { names: string[] }) {
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const hasMore = names.length > PREVIEW_LIMIT;
  const query = search.trim().toLocaleLowerCase();
  const matches = names
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => name.toLocaleLowerCase().includes(query));

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-muted-foreground text-xs">
        {names.length} {names.length === 1 ? 'participant' : 'participants'}
      </p>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {names.slice(0, PREVIEW_LIMIT).map((name, index) => (
          <Badge
            key={index}
            variant="outline"
            className="max-w-full"
            title={name}
          >
            <span
              className={hasMore ? 'truncate' : 'break-words whitespace-normal'}
            >
              {name}
            </span>
          </Badge>
        ))}
      </div>
      {hasMore && (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setSearch('');
          }}
        >
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 sm:min-h-8"
            >
              View all {names.length} participants
            </Button>
          </DialogTrigger>
          <DialogContent className="h-[min(36rem,90dvh)] [&>[data-slot=dialog-close]]:top-2 [&>[data-slot=dialog-close]]:right-2 [&>[data-slot=dialog-close]]:p-3.5">
            <DialogHeader>
              <DialogTitle>Trip participants</DialogTitle>
              <DialogDescription>
                {names.length} participants on this trip. Search to find a name.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor={searchId} className="sr-only">
                Search participants
              </label>
              <Input
                id={searchId}
                type="search"
                placeholder="Search participants…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <p role="status" className="text-muted-foreground text-xs">
                {matches.length} of {names.length} participants
              </p>
            </div>
            <DialogBody>
              {matches.length > 0 ? (
                <ol
                  className="divide-border divide-y"
                  aria-label="Participants"
                >
                  {matches.map(({ name, index }) => (
                    <li key={index} className="flex gap-3 py-3 text-sm">
                      <span
                        className="text-muted-foreground w-8 shrink-0 tabular-nums"
                        aria-hidden
                      >
                        {index + 1}.
                      </span>
                      <span className="min-w-0 break-words">{name}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  No participants match your search.
                </p>
              )}
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
