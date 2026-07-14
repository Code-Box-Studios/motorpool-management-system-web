import { useTools } from '@/lib/query/tools';
import { useAllDrivers } from '@/lib/query/drivers';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/shared/page-header';
import EntityCard from '@/components/shared/entity-card';
import EmptyState from '@/components/shared/empty-state';

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : undefined;

const Tools = () => {
  const { data } = useTools(1, 12);
  // `borrowed_by` is a driver id; a card must show the person, never the key.
  const { data: drivers } = useAllDrivers();
  const tools = data?.data ?? [];

  const borrowerName = (driverId: string | null) =>
    driverId
      ? drivers?.find((driver) => driver.id === driverId)?.full_name
      : undefined;

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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tools.map((tool) => (
            <EntityCard
              key={tool.id}
              to={`/tools/${tool.id}`}
              imageSrc={tool.image}
              status={tool.status || 'available'}
              title={tool.name}
              footnote={tool.description}
              // Every tool answers the same two questions — who has it and when
              // it is due back — so a tool that is on the shelf answers them
              // with an em dash rather than dropping the rows and going ragged.
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
      )}
    </div>
  );
};

export default Tools;
