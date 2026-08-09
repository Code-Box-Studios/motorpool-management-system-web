import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { UserProfileData } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/page-header';
import EmptyState from '@/components/shared/empty-state';
import StatusBadge from '@/components/shared/status-badge';
import TablePagination from '@/components/shared/table-pagination';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUsers } from '@/lib/query/user-management';
import { present, roleLabel } from '@/lib/role-label';

const getInitials = (user: UserProfileData): string => {
  if (user.full_name) {
    return user.full_name
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  if (user.email) return user.email.split('@')[0].slice(0, 2).toUpperCase();
  return 'U';
};

const COLUMNS = ['User', 'Role', 'Branch', 'Status', 'Created'];

const UserManagement = () => {
  const [page, setPage] = useState(1);
  const limit = 10;
  const { data: usersData, isLoading, error } = useUsers(page, limit);
  const navigate = useNavigate();
  const users = usersData?.data;
  const totalCount = usersData?.count ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Accounts that can sign in, and what each one is allowed to do."
        action={
          <Link to="/user-management/add-user" className={cn(buttonVariants())}>
            Add User
          </Link>
        }
      />

      {error ? (
        <Card>
          <CardContent className="text-destructive pt-6 text-sm">
            Error loading users: {error.message}
          </CardContent>
        </Card>
      ) : !isLoading && totalCount === 0 ? (
        <EmptyState message="No users yet." />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, row) => (
                      <TableRow key={row}>
                        {COLUMNS.map((column) => (
                          <TableCell key={column}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : users?.map((user: UserProfileData) => (
                      <TableRow
                        key={user.id}
                        className="hover:bg-muted cursor-pointer"
                        onClick={() =>
                          navigate({
                            to: '/user-management/$userId',
                            params: { userId: user.id }
                          })
                        }
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage
                                src={user.avatar_url || undefined}
                                alt=""
                                className="object-cover"
                              />
                              {/* AvatarFallback paints bg-primary, so the initials
                                  need the matching foreground or they vanish into it. */}
                              <AvatarFallback>
                                <span className="text-primary-foreground text-xs font-semibold">
                                  {getInitials(user)}
                                </span>
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {user.full_name || '—'}
                              </div>
                              <div className="text-muted-foreground truncate text-sm">
                                {user.email || '—'}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{roleLabel(user.role) ?? '—'}</TableCell>
                        <TableCell>
                          {present(user.branch_name) ?? '—'}
                        </TableCell>
                        <TableCell>
                          {user.status ? (
                            <StatusBadge status={user.status} />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.created_at
                            ? new Date(user.created_at).toLocaleDateString()
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>

            <TablePagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default UserManagement;
