import { cn } from '@/lib/utils';

export interface Metric {
  label: string;
  value: string | number;
}

// A metric is a glance, not the headline. These used to be one Card each,
// carrying an h1 and three empty slots (description, action, footer), so four
// numbers cost four cards' worth of vertical space and pushed the actual work
// below the fold. One hairline-divided strip carries them all.
//
// The grid is driven by how many there are: an empty cell in a `gap-px` strip
// shows the divider colour through it and reads as a broken tile.
const COLUMNS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5'
};

export const MetricStrip = ({
  metrics,
  className
}: {
  metrics: Metric[];
  className?: string;
}) => (
  <section
    className={cn(
      'border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border',
      COLUMNS[metrics.length] ?? 'md:grid-cols-4',
      className
    )}
  >
    {metrics.map((metric) => (
      <div key={metric.label} className="bg-card px-5 py-4">
        <div className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
          {metric.label}
        </div>
        <div className="text-foreground mt-1.5 text-2xl leading-none font-semibold tabular-nums">
          {metric.value}
        </div>
      </div>
    ))}
  </section>
);

export default MetricStrip;
