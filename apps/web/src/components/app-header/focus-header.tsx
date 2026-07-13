import ThemeSwitcher from './theme-switcher';
import UserAvatar from './user-avatar';

interface FocusHeaderProps {
  title: string;
}

/**
 * The shell for roles whose whole job is one screen (Security Guard, EVP
 * Operations). They get no navigation rail — a rail with nothing in it is just
 * 250px of dead chrome — so this is a slim bar carrying the mark, what the
 * screen IS, and the person using it.
 */
const FocusHeader = ({ title }: FocusHeaderProps) => (
  <header className="border-border bg-card sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b px-4 md:px-6">
    <div className="flex min-w-0 items-center gap-3">
      <img
        src="/logo/mms-logo.png"
        alt=""
        className="size-9 flex-none"
        aria-hidden="true"
      />
      <span className="truncate text-base font-semibold tracking-tight">
        {title}
      </span>
    </div>
    <div className="flex flex-none items-center gap-2">
      <ThemeSwitcher />
      <UserAvatar />
    </div>
  </header>
);

export default FocusHeader;
