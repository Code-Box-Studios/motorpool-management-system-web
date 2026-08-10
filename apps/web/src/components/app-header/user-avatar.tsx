import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { useOwnProfile } from '@/lib/query/profile';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Typography } from '../ui/typography';

// Two letters for the fallback: a person's initials read as them, so prefer
// the name and only fall back to the email when there is no name to use.
const initialsFrom = (fullName: string | undefined, email: string) => {
  const fromName = (fullName ?? '')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  if (fromName) return fromName.toUpperCase();
  return email.split('@')[0].slice(0, 2).toUpperCase();
};

const UserAvatar = () => {
  const { user, logout } = useAuth();
  // Read the profile rather than the auth context: auth state is written once
  // at login and has no setter, so a freshly uploaded photo would not appear
  // here until the next sign-in. This shares the profile page's cache key, so
  // react-query serves it from cache and the save invalidation repaints the
  // header at the same moment the page updates.
  const { data: profile } = useOwnProfile();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      toast.error('Logout failed');
    }
  };

  if (!user) return null;

  const displayName = profile?.fullName ?? user.user_metadata?.full_name;
  const initials = initialsFrom(displayName, user.email ?? '');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="cursor-pointer">
          {/* Radix renders the fallback until the image actually loads, and
              keeps it if the file 404s — so a broken path degrades to
              initials rather than an empty circle. */}
          {profile?.avatarUrl && (
            <AvatarImage
              src={profile.avatarUrl}
              alt={displayName ?? 'Your profile photo'}
            />
          )}
          <AvatarFallback>
            <Typography
              variant={'p-xs'}
              className="text-primary-foreground font-semibold"
            >
              {initials}
            </Typography>
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled className="flex-col items-start gap-0">
          {displayName && <span className="font-medium">{displayName}</span>}
          <span className="text-muted-foreground text-xs">{user.email}</span>
        </DropdownMenuItem>
        {/* This menu is the only entry point to the profile, and it is the one
            piece of chrome BOTH shells render — the sidebar header and the
            focus header for guard/EVP — so every role can reach their own
            details and password from here. */}
        <DropdownMenuItem asChild>
          <Link to="/profile">Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserAvatar;
