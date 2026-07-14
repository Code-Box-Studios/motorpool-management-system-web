import { cn } from '@/lib/utils';

// A record with no photo falls back to the MMS mark rather than an empty slot,
// so a card or a detail page never reads as broken or half-built.
//
// The two cases want different fits: a real photo should fill its frame
// (object-cover), while the mark is a logo on a plate and must not be cropped
// (object-contain, with room around it).
export const NO_PHOTO_SRC = '/logo/mms-logo.png';

interface EntityImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
}

const EntityImage = ({ src, alt = '', className }: EntityImageProps) => {
  const hasPhoto = Boolean(src);
  return (
    <img
      src={src || NO_PHOTO_SRC}
      alt={alt}
      className={cn(
        'bg-muted',
        // No padding on the fallback. Percentage padding resolves against the
        // PARENT's width, not the image's, so `p-[14%]` in a table row computed
        // to 43px and burst a 40px avatar out to 88px with nothing left to draw
        // the mark in. object-contain already letterboxes the mark inside the
        // frame, whatever size the caller gives it.
        hasPhoto ? 'object-cover' : 'object-contain opacity-80',
        className
      )}
    />
  );
};

export default EntityImage;
