import { useTools } from '@/lib/query/tools';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/shared/page-header';
import EntityCard from '@/components/shared/entity-card';
import EmptyState from '@/components/shared/empty-state';

const Tools = () => {
  const { data } = useTools(1, 12);
  const tools = data?.data ?? [];

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
              // The badge already carries the status; only add a row when the
              // tool is out, because then "who has it" is the useful fact.
              fields={
                tool.borrowed_by
                  ? [{ label: 'Signed out', value: 'Yes' }]
                  : undefined
              }
              footnote={tool.description}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Tools;
