import { useTripTickets } from '@/lib/query/trip-tickets';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/shared/status-badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';

const TripTicketsPage = () => {
  const { data, isLoading } = useTripTickets(1, 100);
  const navigate = useNavigate();

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Trip Tickets</CardTitle>
          <CardDescription>Manage and view trip tickets.</CardDescription>
          <CardAction>
            <Link
              to="/trip-tickets/add-trip-ticket"
              className={cn(buttonVariants())}
            >
              Create Trip Ticket
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
                  <TableHead>Status</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Pickup Date</TableHead>
                  <TableHead>Return Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data?.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell>
                      <StatusBadge status={ticket.status || 'pending'} />
                    </TableCell>
                    <TableCell>{ticket.destination}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {ticket.purpose}
                    </TableCell>
                    <TableCell>
                      {new Date(ticket.pickup_date_time).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Date(ticket.return_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigate({ to: `/trip-tickets/${ticket.id}` })
                        }
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TripTicketsPage;
