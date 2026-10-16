import { useId, useState } from 'react';
import type { SparePartsModelAlgorithm } from '@mms/shared';
import { Info, LoaderCircle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import EmptyState from '@/components/shared/empty-state';
import TableFilters from '@/components/shared/table-filters';
import { useListControls } from '@/hooks/use-list-controls';
import { useSparePartsModel } from '@/lib/query/analytics';

const MODEL_NAMES: Record<SparePartsModelAlgorithm, string> = {
  fp_growth: 'FP-Growth',
  eclat: 'Eclat'
};
const percentage = (value: number) => `${Number((value * 100).toFixed(1))}%`;

export default function SparePartsModels() {
  const id = useId();
  const [selected, setSelected] =
    useState<SparePartsModelAlgorithm>('fp_growth');
  const [applied, setApplied] = useState<SparePartsModelAlgorithm>('fp_growth');
  const {
    data: result,
    isFetching,
    isError,
    refetch
  } = useSparePartsModel(applied);
  const { filters, setFilter, clearFilters, hasFilters } = useListControls([
    'partsConfidence'
  ]);
  const rules = (result?.data ?? []).filter((rule) => {
    switch (filters.partsConfidence) {
      case 'high':
        return rule.confidence >= 0.8;
      case 'medium':
        return rule.confidence >= 0.5 && rule.confidence < 0.8;
      case 'low':
        return rule.confidence < 0.5;
      default:
        return true;
    }
  });

  function runModel() {
    if (selected === applied) void refetch();
    else setApplied(selected);
  }

  return (
    <>
      <Card role="region" aria-label="Spare parts model selection">
        <CardHeader>
          <CardTitle>Model Selection (Spare Parts)</CardTitle>
          <CardDescription>
            Find parts commonly replaced together using a saved association
            model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid items-end gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.8fr)]">
            <div className="space-y-2">
              <Label htmlFor={id}>Algorithm</Label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-[1_1_14rem]">
                  <Select
                    value={selected}
                    onValueChange={(value) =>
                      setSelected(value as SparePartsModelAlgorithm)
                    }
                    disabled={isFetching}
                  >
                    <SelectTrigger
                      id={id}
                      aria-label="Algorithm"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fp_growth">
                        FP-Growth (Default)
                      </SelectItem>
                      <SelectItem value="eclat">Eclat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  onClick={runModel}
                  disabled={isFetching}
                  className="gap-2"
                >
                  {isFetching ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <Play aria-hidden="true" className="size-4" />
                  )}
                  {isFetching ? 'Running…' : 'Run Model'}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs" aria-live="polite">
                {selected !== applied
                  ? `Run the model to apply ${MODEL_NAMES[selected]}.`
                  : 'Default algorithm: FP-Growth'}
              </p>
            </div>
            <div className="bg-muted/60 text-muted-foreground flex items-start gap-3 rounded-xl p-4 text-sm">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>
                FP-Growth is the default. Choose Eclat to compare patterns from
                the saved training data.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card
        role="region"
        aria-label="Spare parts model results"
        aria-busy={isFetching}
      >
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[min(100%,16rem)] flex-1 space-y-2">
            <CardTitle>Frequently Co-Replaced Parts</CardTitle>
            <CardDescription aria-live="polite">
              <span className="text-foreground block font-medium">
                {MODEL_NAMES[applied]} results
              </span>
              {!isFetching && !isError && result && (
                <span>
                  {result.trainingTransactions} training transactions ·{' '}
                  {result.count} rules
                </span>
              )}
            </CardDescription>
          </div>
          <TableFilters
            filters={[
              {
                key: 'partsConfidence',
                label: 'Confidence',
                options: [
                  { value: 'high', label: '80% and above' },
                  { value: 'medium', label: '50% to below 80%' },
                  { value: 'low', label: 'Below 50%' }
                ]
              }
            ]}
            values={filters}
            onChange={setFilter}
            onClear={clearFilters}
          />
        </CardHeader>
        <CardContent>
          {isFetching ? (
            <div className="space-y-3" aria-label="Loading model results">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p role="alert" className="text-destructive text-sm">
              Could not load {MODEL_NAMES[applied]} results. Run the model again
              to retry.
            </p>
          ) : rules.length === 0 ? (
            <EmptyState
              message={
                hasFilters
                  ? 'No rules match your confidence filter.'
                  : 'This model has no saved association rules.'
              }
              hasFilters={hasFilters}
              onClearFilters={clearFilters}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>If replacing</TableHead>
                  <TableHead>Also check</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Support</TableHead>
                  <TableHead>Lift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={`${rule.antecedent}:${rule.consequent}`}>
                    <TableCell className="font-medium">
                      {rule.antecedent}
                    </TableCell>
                    <TableCell>{rule.consequent}</TableCell>
                    <TableCell className="tabular-nums">
                      {percentage(rule.confidence)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {percentage(rule.support)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {Number(rule.lift.toFixed(2))}×
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
            Confidence shows how often the suggested part appeared when the
            first part was replaced. Support shows how often both appeared
            across the training data; lift compares that link with chance. These
            are saved training patterns, so FP-Growth and Eclat may return the
            same rules.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
