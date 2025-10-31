import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Typography } from '../ui/typography';

type MetricCardProps = {
  title: string;
  value: string | number;
};

const MetricCard = ({ title, value }: MetricCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription></CardDescription>
        <CardAction></CardAction>
      </CardHeader>
      <CardContent>
        <Typography variant={'h1'}>{value}</Typography>
      </CardContent>
      <CardFooter></CardFooter>
    </Card>
  );
};

export default MetricCard;
