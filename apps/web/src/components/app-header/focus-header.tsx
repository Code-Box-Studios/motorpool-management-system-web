import { Link } from '@tanstack/react-router';
import NotificationBell from '@/components/shared/notification-bell';
import ThemeSwitcher from './theme-switcher';
import UserAvatar from './user-avatar';

interface FocusHeaderProps {
  title: string;
}

/**
 * The shell for roles whose whole job is one screen (Security Guard, EVP
 * Operations, Requester). They get no navigation rail — a rail with nothing in
 * it is just 250px of dead chrome — so this is a slim bar carrying the mark,
 * what the screen IS, and the person using it.
 */
const FocusHeader = ({ title }: FocusHeaderProps) => (
  <header className="border-border bg-card sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b px-4 md:px-6">
    {/* The mark is the way home. With no rail, the pages these roles CAN reach
        off their own screen — a ticket's details, the profile behind the avatar
        menu — otherwise strand them on the browser's back button. The link's
        accessible name is the title text; the mark itself stays decorative. */}
    <Link
      to="/dashboard"
      className="focus-visible:ring-ring flex min-w-0 items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:outline-none"
    >
      <img
        src="/logo/mms-logo.png"
        alt=""
        className="size-9 flex-none"
        aria-hidden="true"
      />
      <span className="truncate text-base font-semibold tracking-tight">
        {title}
      </span>
    </Link>
    <div className="flex flex-none items-center gap-2">
      <NotificationBell />
      <ThemeSwitcher />
      <UserAvatar />
    </div>
  </header>
);

export default FocusHeader;
