import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications
} from '@/lib/query/notifications';
import type { NotificationRow } from '@/lib/api/notifications';
import { relativeTime } from '@/lib/utils/relative-time';

/**
 * The bell. Lives in BOTH shells — the sidebar header and the focus header —
 * because the roles without a rail (guard, EVP, requester) are exactly the ones
 * with no other surface to be told anything on.
 *
 * Opening the panel does NOT mark everything read: people open it to see what
 * is there, and a count that empties itself on a glance is a count nobody
 * trusts. Reading happens per item, or explicitly via "Mark all read".
 */
const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.data ?? [];
  const unread = data?.unread ?? 0;

  const handleOpen = (nextOpen: boolean) => setOpen(nextOpen);

  // Reading one and going to it are the same gesture, so the click does both.
  const handleItemClick = (item: NotificationRow) => {
    if (!item.readAt) markRead.mutate([item.id]);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
          }
        >
          <Bell />
          {unread > 0 && (
            /* Sits on the icon rather than beside it so the header's spacing is
               identical whether or not anything is waiting. */
            <span className="bg-signal text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold tabular-nums">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <div className="border-border flex items-center justify-between gap-3 border-b px-3 py-2.5">
          <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
            Notifications
          </span>
          {unread > 0 && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              Mark all read
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-muted-foreground px-3 py-8 text-center text-sm">
            Nothing yet. Approvals and gate activity land here.
          </p>
        ) : (
          /* Capped and scrollable: the bell is recent activity, not an archive. */
          <ul className="max-h-[22rem] overflow-y-auto">
            {items.map((item) => {
              const row = (
                <>
                  <div className="flex items-start gap-2">
                    {/* The dot is the unread marker; a spacer keeps read rows
                        aligned with unread ones instead of shifting left. */}
                    <span
                      className={
                        item.readAt
                          ? 'mt-1.5 size-2 flex-none'
                          : 'bg-signal mt-1.5 size-2 flex-none rounded-full'
                      }
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={
                          item.readAt
                            ? 'text-sm leading-snug'
                            : 'text-sm leading-snug font-semibold'
                        }
                      >
                        {item.title}
                      </div>
                      {item.body && (
                        <div className="text-slate mt-0.5 line-clamp-2 text-xs">
                          {item.body}
                        </div>
                      )}
                      <div className="text-muted-foreground mt-1 text-xs">
                        {relativeTime(new Date(item.createdAt))}
                      </div>
                    </div>
                  </div>
                </>
              );

              return (
                <li
                  key={item.id}
                  className="border-border border-b last:border-b-0"
                >
                  {item.linkTo ? (
                    <Link
                      to={item.linkTo}
                      className="hover:bg-accent block px-3 py-2.5"
                      onClick={() => handleItemClick(item)}
                    >
                      {row}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="hover:bg-accent block w-full px-3 py-2.5 text-left"
                      onClick={() => handleItemClick(item)}
                    >
                      {row}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
