import { useEffect, useRef, useState, type Ref } from 'react';
import { ImagePlus, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EntityImage from '@/components/shared/entity-image';
import { cn } from '@/lib/utils';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SelectedImage({
  file,
  disabled,
  onRemove
}: {
  file: File;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    setFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div
      data-slot="image-upload-preview"
      className="border-border bg-card relative min-w-0 overflow-hidden rounded-xl border"
    >
      <div className="bg-muted flex aspect-[4/3] items-center justify-center">
        {preview && !failed ? (
          <img
            src={preview}
            alt={`Preview of ${file.name}`}
            className="h-full w-full object-contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="text-foreground/70 flex flex-col items-center gap-2 p-3 text-center text-xs">
            <ImagePlus className="size-6" aria-hidden="true" />
            <span>{failed ? 'Preview unavailable' : 'Preparing preview…'}</span>
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        disabled={disabled}
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        className="border-border absolute top-2 right-2 border shadow-sm"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
      <div className="min-w-0 px-3 py-2.5">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-foreground/70 mt-0.5 text-xs">
          {fileSize(file.size)} · Ready to save
        </p>
      </div>
    </div>
  );
}

type ImageUploadProps = {
  id: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  multiple?: boolean;
  maxFiles?: number;
  currentImage?: string | null;
  currentImageAlt?: string;
  onRemoveCurrent?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  name?: string;
  form?: string;
  className?: string;
};

export function ImageUpload({
  id,
  files,
  onFilesChange,
  multiple = false,
  maxFiles = multiple ? 10 : 1,
  currentImage,
  currentImageAlt = 'Current photo',
  onRemoveCurrent,
  disabled = false,
  invalid = false,
  onBlur,
  inputRef,
  name,
  form,
  className
}: ImageUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const select = (incoming: File[]) => {
    if (disabled || !incoming.length) return;
    setDragging(false);
    dragDepth.current = 0;
    const nextErrors: string[] = [];
    if (!multiple && incoming.length > 1) {
      setErrors(['Choose one photo at a time.']);
      return;
    }
    const next = multiple ? [...files] : [];
    incoming.forEach((file) => {
      if (!IMAGE_TYPES.includes(file.type)) {
        nextErrors.push(`${file.name}: use JPG, PNG or WebP images.`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        nextErrors.push(`${file.name}: the maximum size is 5 MB per photo.`);
      } else if (!file.size) {
        nextErrors.push(`${file.name}: this file is empty.`);
      } else if (next.some((selected) => fileKey(selected) === fileKey(file))) {
        nextErrors.push(`${file.name} is already selected.`);
      } else if (next.length >= maxFiles) {
        nextErrors.push(`You can add up to ${maxFiles} photos at a time.`);
      } else {
        next.push(file);
      }
    });
    setErrors([...new Set(nextErrors)]);
    if (next.length && (multiple || !nextErrors.length)) onFilesChange(next);
    onBlur?.();
  };

  const descriptionId = `${id}-image-help`;
  const errorId = `${id}-image-errors`;
  return (
    <div
      data-slot="image-upload"
      role="group"
      aria-label="Photo upload"
      className={cn('min-w-0 space-y-3', className)}
    >
      <input
        id={id}
        name={name}
        form={form}
        ref={(node) => {
          input.current = node;
          if (typeof inputRef === 'function') inputRef(node);
          else if (inputRef) inputRef.current = node;
        }}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-invalid={invalid || !!errors.length}
        aria-describedby={`${descriptionId}${errors.length ? ` ${errorId}` : ''}`}
        onBlur={onBlur}
        onChange={(event) => {
          select(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = '';
        }}
      />
      <div
        className={cn(
          'border-input bg-background flex min-w-0 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-5 text-center transition-colors sm:flex-row sm:justify-start sm:gap-4 sm:text-left',
          dragging && !disabled && 'border-primary bg-accent',
          invalid && 'border-destructive',
          disabled && 'opacity-60'
        )}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          if (!disabled) {
            dragDepth.current++;
            setDragging(true);
          }
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = 0;
          setDragging(false);
          select(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
          <Upload className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {dragging
              ? 'Drop to add photos'
              : multiple
                ? 'Drag photos here'
                : 'Drag a photo here'}
          </p>
          <p className="text-foreground/70 mt-1 text-xs" id={descriptionId}>
            JPG, PNG or WebP · Up to 5 MB each
            {multiple ? ` · ${maxFiles} photos maximum` : ''}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          {multiple
            ? 'Add photos'
            : currentImage || files.length
              ? 'Change photo'
              : 'Choose photo'}
        </Button>
      </div>
      {!!errors.length && (
        <div
          id={errorId}
          role="alert"
          className="text-destructive space-y-1 text-sm"
        >
          {errors.map((error) => (
            <p className="break-words" key={error}>
              {error}
            </p>
          ))}
        </div>
      )}
      {!!files.length && (
        <>
          <div
            className={cn(
              'grid min-w-0 gap-3',
              multiple
                ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                : 'max-w-xs grid-cols-1'
            )}
          >
            {files.map((file, index) => (
              <SelectedImage
                key={fileKey(file)}
                file={file}
                disabled={disabled}
                onRemove={() => {
                  if (disabled) return;
                  setErrors([]);
                  onFilesChange(
                    files.filter((_, position) => position !== index)
                  );
                }}
              />
            ))}
          </div>
          <p className="text-foreground/70 text-xs" role="status">
            {files.length} {files.length === 1 ? 'photo' : 'photos'} selected.
            Saved with the form.
          </p>
        </>
      )}
      {!files.length && currentImage && (
        <div className="border-border bg-card relative w-full max-w-xs overflow-hidden rounded-xl border">
          <EntityImage
            src={currentImage}
            alt={currentImageAlt}
            className="bg-muted aspect-[4/3] w-full object-contain"
          />
          {onRemoveCurrent && (
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              disabled={disabled}
              aria-label="Remove current photo"
              className="border-border absolute top-2 right-2 border shadow-sm"
              onClick={() => {
                if (!disabled) onRemoveCurrent();
              }}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          )}
          <p className="text-foreground/70 px-3 py-2 text-xs">Current photo</p>
        </div>
      )}
    </div>
  );
}
