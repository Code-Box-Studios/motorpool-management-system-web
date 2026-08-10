import { useSpareParts } from '@/lib/query/spare-parts';
import { Link, useNavigate } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import TablePagination from '@/components/shared/table-pagination';
import SortableTableHead from '@/components/shared/sortable-table-head';
import ViewTabs from '@/components/shared/view-tabs';
import { useListControls } from '@/hooks/use-list-controls';

// The shelf is the point of this screen, so every part carries a stock pill in
// the same slot the other grids give a status: what is gone, what is nearly
// gone, what is fine. Tones are the shared semantic five — no new colours.
const LOW_STOCK_THRESHOLD = 5;

const stockBadge = (quantity: number) => {
  if (quantity === 0) return <Badge variant="stop">Out of stock</Badge>;
  if (quantity <= LOW_STOCK_THRESHOLD)
    return <Badge variant="wait">Low stock</Badge>;
  return <Badge variant="done">In stock</Badge>;
};

const SpareParts = () => {
  const { page, sort, setPage, handleSort } = useListControls();
  const limit = 10;
  const { data } = useSpareParts(page, limit, sort ?? undefined);
  const navigate = useNavigate();
  const spareParts = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  // Both views page through the same server slice, so the pager sits under
  // whichever one is showing.
  const pager = (
    <TablePagination
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );

  const grid = (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {spareParts.map((sparePart) => {
          const quantity = sparePart.quantity ?? 0;
          return (
            <EntityCard
              key={sparePart.id}
              to={`/spare-parts/${sparePart.id}`}
              imageSrc={sparePart.image}
              title={sparePart.name}
              badge={stockBadge(quantity)}
              footnote={sparePart.description}
              fields={[
                { label: 'Brand', value: sparePart.brand },
                { label: 'On hand', value: quantity }
              ]}
            />
          );
        })}
      </div>
      {pager}
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
              {/* sortKey values come from the API's SPARE_PART_SORT_COLUMNS
                  allowlist. Stock is derived client-side from quantity, so it
                  stays a plain head. */}
              <SortableTableHead
                label="Part"
                sortKey="name"
                sort={sort}
                onSort={handleSort}
              />
              <SortableTableHead
                label="Brand"
                sortKey="brand"
                sort={sort}
                onSort={handleSort}
              />
              <SortableTableHead
                label="On hand"
                sortKey="quantity"
                sort={sort}
                onSort={handleSort}
                className="text-right"
              />
              <TableHead>Stock</TableHead>
              <SortableTableHead
                label="Description"
                sortKey="description"
                sort={sort}
                onSort={handleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {spareParts.map((sparePart) => {
              const quantity = sparePart.quantity ?? 0;
              return (
                <TableRow
                  key={sparePart.id}
                  className="hover:bg-muted cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: '/spare-parts/$sparePartId',
                      params: { sparePartId: sparePart.id }
                    })
                  }
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <EntityImage
                        src={sparePart.image}
                        alt=""
                        className="border-border size-10 shrink-0 rounded-md border"
                      />
                      <span className="font-medium">{sparePart.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {sparePart.brand || '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {quantity}
                  </TableCell>
                  <TableCell>{stockBadge(quantity)}</TableCell>
                  {/* TableCell is whitespace-nowrap, so an unconstrained
                      description makes its own column as wide as the longest
                      string on the page and scrolls the table sideways at every
                      viewport. Cap it and ellipsize, like Purpose elsewhere. */}
                  <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                    {sparePart.description || '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {pager}
      </CardContent>
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="Spare Parts"
        description="What is on the shelf, and how much of it is left."
        action={
          <Link
            to="/spare-parts/add-spare-part"
            className={cn(buttonVariants())}
          >
            Add Spare Part
          </Link>
        }
      />

      {/* Count, not the page slice: a mid page can come back empty while the
          shelf itself is not. */}
      {totalCount === 0 ? (
        <EmptyState message="No spare parts yet." />
      ) : (
        <ViewTabs grid={grid} table={table} />
      )}
    </div>
  );
};

export default SpareParts;
