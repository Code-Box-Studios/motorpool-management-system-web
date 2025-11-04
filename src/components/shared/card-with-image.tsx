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
import StatusBadge from './status-badge';

export type CardWithImageProps = {
  imageSrc?: string;
  title: string;
  description: string;
  primaryAction?: () => void;
  status: string;
};

const CardWithImage = ({
  imageSrc,
  title,
  description,
  status,
  primaryAction
}: CardWithImageProps) => {
  return (
    <Card className="pt-0">
      <CardContent className="rounded-t-2xl bg-white px-0">
        <img
          src={imageSrc ?? '/logo/mms-logo.png'}
          alt="Banner"
          className={cn('aspect-video h-52 rounded-t-xl object-contain')}
        />
      </CardContent>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {status && <StatusBadge status={status} />}
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter className="flex gap-3 max-sm:flex-col max-sm:items-stretch">
        <Button className="w-full" onClick={primaryAction}>
          View Vehicle
        </Button>
      </CardFooter>
    </Card>
  );
};

export default CardWithImage;
