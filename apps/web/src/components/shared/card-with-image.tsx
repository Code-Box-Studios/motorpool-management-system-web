import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type React from 'react';

export type CardWithImageProps = {
  imageSrc?: string;
  title: React.ReactNode;
  description: React.ReactNode;
  primaryAction?: () => void;
  primaryButtonText?: string;
};

const CardWithImage = ({
  imageSrc,
  title,
  description,
  primaryAction,
  primaryButtonText
}: CardWithImageProps) => {
  return (
    <Card className="flex flex-col pt-0">
      <CardContent className="flex items-center justify-center rounded-t-2xl bg-white p-3 px-0">
        <img
          src={imageSrc ?? '/logo/mms-logo.png'}
          alt="Banner"
          className={cn('aspect-video h-40 rounded-t-xl object-contain')}
        />
      </CardContent>
      <CardHeader className="grow">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter className="mt-auto flex gap-3 max-sm:flex-col max-sm:items-stretch">
        <Button className="w-full" onClick={primaryAction}>
          {primaryButtonText}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default CardWithImage;
