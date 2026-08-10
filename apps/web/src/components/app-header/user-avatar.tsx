import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Typography } from '../ui/typography';

const UserAvatar = () => {
  const { user, logout } = useAuth();

  const getInitials = (email: string) => {
    return email.split('@')[0].slice(0, 2).toUpperCase();
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      toast.error('Logout failed');
    }
  };

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="cursor-pointer">
          <AvatarFallback>
            <Typography
              variant={'p-xs'}
              className="text-primary-foreground font-semibold"
            >
              {getInitials(user.email || '')}
            </Typography>
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled>{user.email}</DropdownMenuItem>
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
