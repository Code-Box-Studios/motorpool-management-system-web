import { useTools } from '@/lib/query/tools';
import CardWithImage from '@/components/shared/card-with-image';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { Typography } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/shared/status-badge';

const Tools = () => {
  const { data } = useTools(1, 10);
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <Typography variant={'h2'}>Tools</Typography>
        <Link to="/tools/add-tools" className={cn(buttonVariants())}>
          Add Tool
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">
        {data?.data && data.data.length > 0 ? (
          data.data.map((tool) => (
            <CardWithImage
              key={tool.id}
              imageSrc={tool.image ?? '/logo/mms-logo.png'}
              title={
                <div className="space-y-3">
                  <StatusBadge status={tool.status || 'available'} />
                  <Typography variant="h5" className="line-clamp-1">
                    {tool.name}
                  </Typography>
                </div>
              }
              description={
                <div>
                  <Typography variant="p-sm" className="line-clamp-2">
                    {tool.description || 'No description'}
                  </Typography>
                  {tool.borrowed_by && (
                    <Typography
                      variant="p-sm"
                      className="text-muted-foreground mt-1"
                    >
                      Borrowed
                    </Typography>
                  )}
                </div>
              }
              primaryAction={() => navigate({ to: `/tools/${tool.id}` })}
              primaryButtonText="View Tool"
            />
          ))
        ) : (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            No data found
          </div>
        )}
      </div>
      {data?.count && data.count > 10 && (
        <div className="mt-6 flex justify-center">
          <Button onClick={() => navigate({ to: '/tools' })}>Load More</Button>
        </div>
      )}
    </div>
  );
};

export default Tools;
