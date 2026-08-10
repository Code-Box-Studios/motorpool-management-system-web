import { useTools } from '@/lib/query/tools';
import { useAllDrivers } from '@/lib/query/drivers';
import { Link, useNavigate } from '@tanstack/react-router';
import { useListControls } from '@/hooks/use-list-controls';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/shared/page-header';
import SortableTableHead from '@/components/shared/sortable-table-head';
import EntityCard from '@/components/shared/entity-card';
import EntityImage from '@/components/shared/entity-image';
import EmptyState from '@/components/shared/empty-state';
import StatusBadge from '@/components/shared/status-badge';
import TablePagination from '@/components/shared/table-pagination';
import ViewTabs from '@/components/shared/view-tabs';

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : undefined;

// sortKey values come from the API's TOOL_SORT_COLUMNS allowlist.
const COLUMNS = [
  { label: 'Tool', sortKey: 'name' },
  { label: 'Status', sortKey: 'status' },
  { label: 'Signed out to', sortKey: 'borrowedBy' },
  { label: 'Due back', sortKey: 'estimatedReturnDate' },
  { label: 'Description', sortKey: 'description' }
];

const Tools = () => {
  const { page, sort, setPage, handleSort } = useListControls();
  const limit = 10;
  const { data } = useTools(page, limit, sort ?? undefined);
  // `borrowed_by` is a driver id; a row must show the person, never the key.
  const { data: drivers } = useAllDrivers();
  const navigate = useNavigate();
  const tools = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  const borrowerName = (driverId: string | null) =>
    driverId
      ? drivers?.find((driver) => driver.id === driverId)?.full_name
      : undefined;

  // Both views page through the same server slice, so the pager sits under
  // each of them and the page survives a table/grid toggle.
  const grid = (
    <>
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
              {
                label: 'Signed out to',
                value: borrowerName(tool.borrowed_by)
              },
              {
                label: 'Due back',
                value: formatDate(tool.estimated_return_date)
              }
            ]}
          />
        ))}
      </div>

      <TablePagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </>
  );

  const table = (
    <Card>
      <CardContent className="pt-6">
        {/* No fixed column widths: pinning them left every spare pixel to the
            last column, so the data bunched left behind a wide empty
            Description. Auto-layout spreads the slack in proportion to content. */}
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <SortableTableHead
                  key={column.label}
                  label={column.label}
                  sortKey={column.sortKey}
                  sort={sort}
                  onSort={handleSort}
                />
              ))}
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
                <TableCell className="text-sm whitespace-nowrap">
                  {borrowerName(tool.borrowed_by) ?? '—'}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatDate(tool.estimated_return_date) ?? '—'}
                </TableCell>
                {/* TableCell is whitespace-nowrap, so an unconstrained
                    description makes its own column as wide as the longest
                    string on the page and scrolls the table sideways at every
                    viewport. Cap it and ellipsize, like Purpose elsewhere. */}
                <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                  {tool.description || '—'}
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

      {/* Keyed to the dataset count, not the page slice, so a mid page that
          happens to be empty never reads as "no tools". */}
      {totalCount === 0 ? (
        <EmptyState message="No tools yet." />
      ) : (
        <ViewTabs grid={grid} table={table} />
      )}
    </div>
  );
};

export default Tools;
