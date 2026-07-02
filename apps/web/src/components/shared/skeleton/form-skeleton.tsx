import { Skeleton } from '@/components/ui/skeleton';

export function FormSkeleton() {
  return (
    <div className="p-11 md:p-13">
      <div className="mb-11 flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-20" />
      </div>
      <div className="flex flex-col justify-center">
        <div className="grid grid-cols-2 gap-11">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="mt-5 space-y-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="mt-10 w-fit">
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    </div>
  );
}
