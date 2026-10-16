import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  TrashIcon
} from 'lucide-react';
import type { Vehicle } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import StatusBadge from '@/components/shared/status-badge';
import { DetailItem } from '@/components/shared/detail-view';
import { NO_PHOTO_SRC } from '@/components/shared/entity-image';

const VehiclePhotoPlaceholder = ({
  alt,
  className
}: {
  alt: string;
  className?: string;
}) => (
  <img
    src={NO_PHOTO_SRC}
    alt={`${alt} — no vehicle photo available. University of Mindanao logo.`}
    className={cn('bg-muted object-contain p-5', className)}
  />
);

const VehiclePhoto = ({
  src,
  alt,
  className,
  onUnavailable
}: {
  src: string;
  alt: string;
  className?: string;
  onUnavailable?: () => void;
}) => {
  const [failed, setFailed] = useState(false);

  return failed ? (
    <VehiclePhotoPlaceholder alt={alt} className={className} />
  ) : (
    <img
      src={src}
      alt={alt}
      onError={() => {
        setFailed(true);
        onUnavailable?.();
      }}
      className={cn('bg-muted object-cover', className)}
    />
  );
};

const VehiclePhotos = ({
  images,
  title,
  isEditing,
  onRemove
}: {
  images: string[];
  title: string;
  isEditing: boolean;
  onRemove: (url: string) => void;
}) => {
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const availablePhotos = images.filter((url) => !failedPhotos.includes(url));
  const activeIndex = Math.max(0, availablePhotos.indexOf(activePhoto ?? ''));
  const markUnavailable = (url: string) =>
    setFailedPhotos((previous) =>
      previous.includes(url) ? previous : [...previous, url]
    );

  return (
    <div className="flex min-w-0 flex-col md:w-56 md:shrink-0">
      <div className="relative h-44 md:h-auto md:min-h-36 md:flex-1">
        {failedPhotos.includes(images[0]) ? (
          <VehiclePhotoPlaceholder
            alt={`${title} photo 1`}
            className="border-border absolute inset-0 h-full w-full rounded-xl border"
          />
        ) : (
          <button
            type="button"
            aria-label="View vehicle photo 1"
            onClick={() => setActivePhoto(images[0])}
            className="border-border focus-visible:ring-ring absolute inset-0 block h-full w-full overflow-hidden rounded-xl border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <VehiclePhoto
              key={images[0]}
              src={images[0]}
              alt={`${title} photo 1`}
              className="h-full w-full"
              onUnavailable={() => markUnavailable(images[0])}
            />
          </button>
        )}
        {isEditing && !failedPhotos.includes(images[0]) && (
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            aria-label="Remove photo 1"
            className="absolute top-2 right-2"
            onClick={() => onRemove(images[0])}
          >
            <TrashIcon className="size-4" />
          </Button>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.slice(1).map((url, index) => (
            <div key={url} className="relative shrink-0">
              {failedPhotos.includes(url) ? (
                <VehiclePhotoPlaceholder
                  alt={`${title} photo ${index + 2}`}
                  className="border-border h-12 w-20 rounded-md border p-2"
                />
              ) : (
                <button
                  type="button"
                  aria-label={`View vehicle photo ${index + 2}`}
                  onClick={() => setActivePhoto(url)}
                  className="border-border focus-visible:ring-ring block overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:outline-none"
                >
                  <VehiclePhoto
                    src={url}
                    alt={`${title} photo ${index + 2}`}
                    className="h-12 w-20"
                    onUnavailable={() => markUnavailable(url)}
                  />
                </button>
              )}
              {isEditing && !failedPhotos.includes(url) && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Remove photo ${index + 2}`}
                  className="absolute top-1 right-1 size-6"
                  onClick={() => onRemove(url)}
                >
                  <TrashIcon className="size-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={activePhoto !== null && availablePhotos.includes(activePhoto)}
        onOpenChange={(open) => !open && setActivePhoto(null)}
      >
        <DialogContent className="sm:max-w-3xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Vehicle photos</DialogTitle>
          </DialogHeader>
          {activePhoto && (
            <VehiclePhoto
              key={activePhoto}
              src={activePhoto}
              alt={`${title} photo ${images.indexOf(activePhoto) + 1}`}
              className="max-h-[60dvh] min-h-36 w-full rounded-lg object-contain"
              onUnavailable={() => markUnavailable(activePhoto)}
            />
          )}
          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous photo"
              disabled={activeIndex === 0}
              onClick={() => setActivePhoto(availablePhotos[activeIndex - 1])}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {activeIndex + 1} of {availablePhotos.length}
            </p>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next photo"
              disabled={activeIndex === availablePhotos.length - 1}
              onClick={() => setActivePhoto(availablePhotos[activeIndex + 1])}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const VehicleOverview = ({
  vehicle,
  title,
  branchName,
  fuelType,
  images,
  isEditing,
  onEdit,
  onRemovePhoto
}: {
  vehicle: Vehicle;
  title: string;
  branchName?: string;
  fuelType?: string;
  images: string[];
  isEditing: boolean;
  onEdit: () => void;
  onRemovePhoto: (url: string) => void;
}) => (
  <section
    aria-label="Vehicle overview"
    className="bg-card border-border rounded-[20px] border p-5 sm:p-6"
  >
    <div className="flex min-w-0 flex-col gap-5 md:flex-row md:gap-6">
      {images.length > 0 ? (
        <VehiclePhotos
          images={images}
          title={title}
          isEditing={isEditing}
          onRemove={onRemovePhoto}
        />
      ) : (
        <div className="flex min-w-0 flex-col md:w-56 md:shrink-0">
          <div className="relative h-44 md:h-auto md:min-h-36 md:flex-1">
            <VehiclePhotoPlaceholder
              alt={title}
              className="border-border absolute inset-0 h-full w-full rounded-xl border"
            />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-48">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-muted border-border rounded-md border px-2 py-1 font-mono text-xs font-semibold tracking-wide">
                {vehicle.license_plate}
              </span>
              {vehicle.status && <StatusBadge status={vehicle.status} />}
            </div>
            <h1 className="mt-3 text-2xl leading-tight font-semibold tracking-tight break-words">
              {title}
            </h1>
            <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {branchName || 'No branch assigned'}
            </p>
          </div>
          <Button onClick={onEdit} variant={isEditing ? 'outline' : 'default'}>
            {!isEditing && <Pencil className="size-4" />}
            {isEditing ? 'Cancel' : 'Edit'}
          </Button>
        </header>
        <dl className="bg-muted/30 border-border divide-border grid grid-cols-3 divide-x overflow-hidden rounded-xl border">
          <DetailItem
            label="Mileage"
            value={`${vehicle.mileage.toLocaleString()} km`}
            className="px-3 py-3 sm:px-4"
          />
          <DetailItem
            label="Fuel Type"
            value={fuelType}
            className="px-3 py-3 sm:px-4"
          />
          <DetailItem
            label="Seats"
            value={vehicle.capacity}
            className="px-3 py-3 sm:px-4"
          />
        </dl>
      </div>
    </div>
  </section>
);
