import { useTools } from '@/lib/query/tools';
import { useAllDrivers } from '@/lib/query/drivers';
import { Link, useNavigate } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/shared/page-header';
import EntityCard from '@/components/shared/entity-card';
import EntityImage from '@/components/shared/entity-image';
import EmptyState from '@/components/shared/empty-state';
import StatusBadge from '@/components/shared/status-badge';
import ViewTabs from '@/components/shared/view-tabs';

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : undefined;

const Tools = () => {
  const { data } = useTools(1, 12);
  // `borrowed_by` is a driver id; a row must show the person, never the key.
  const { data: drivers } = useAllDrivers();
  const navigate = useNavigate();
  const tools = data?.data ?? [];

  const borrowerName = (driverId: string | null) =>
    driverId
      ? drivers?.find((driver) => driver.id === driverId)?.full_name
      : undefined;

  const grid = (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tools.map((tool) => (
        <EntityCard
          key={tool.id}
          to={`/tools/${tool.id}`}
          imageSrc={tool.image}
          status={tool.status || 'available'}
          title={tool.name}
          footnote={tool.description}
          // Every tool answers the same two questions — who has it and when it
          // is due back — so a tool that is on the shelf answers them with an em
          // dash rather than dropping the rows and going ragged.
          fields={[
            { label: 'Signed out to', value: borrowerName(tool.borrowed_by) },
            { label: 'Due back', value: formatDate(tool.estimated_return_date) }
          ]}
        />
      ))}
    </div>
  );

  const table = (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[280px]">Tool</TableHead>
              <TableHead className="w-[130px]">Status</TableHead>
              <TableHead className="w-[180px]">Signed out to</TableHead>
              <TableHead className="w-[130px]">Due back</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.map((tool) => (
              <TableRow
                key={tool.id}
                className="hover:bg-muted cursor-pointer"
                onClick={() =>
                  navigate({
                    to: '/tools/$toolsId',
                    params: { toolsId: tool.id }
                  })
                }
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <EntityImage
                      src={tool.image}
                      alt=""
                      className="border-border size-10 shrink-0 rounded-md border"
                    />
                    <span className="font-medium">{tool.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={tool.status || 'available'} />
                </TableCell>
                <TableCell className="text-sm">
                  {borrowerName(tool.borrowed_by) ?? '—'}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatDate(tool.estimated_return_date) ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[320px] truncate text-sm">
                  {tool.description || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="Tools"
        description="Workshop tools, and which ones are currently signed out."
        action={
          <Link to="/tools/add-tools" className={cn(buttonVariants())}>
            Add Tool
          </Link>
        }
      />

      {tools.length === 0 ? (
        <EmptyState message="No tools yet." />
      ) : (
        <ViewTabs grid={grid} table={table} />
      )}
    </div>
  );
};

export default Tools;
