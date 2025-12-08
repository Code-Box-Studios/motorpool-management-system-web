import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import { useAdmins } from '@/lib/query/user-management';

const UserManagement = () => {
  const { data: profiles, isLoading } = useAdmins();

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>User Profiles</CardTitle>
          <CardDescription>Manage and view user profiles.</CardDescription>
          <CardAction>
            <Link
              to="/user-management/add-user"
              className={cn(buttonVariants())}
            >
              Add User
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Avatar URL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles && profiles.length > 0 ? (
                  profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell>{profile.id}</TableCell>
                      <TableCell>{profile.full_name}</TableCell>
                      <TableCell>{profile.avatar_url}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No data found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserManagement;
