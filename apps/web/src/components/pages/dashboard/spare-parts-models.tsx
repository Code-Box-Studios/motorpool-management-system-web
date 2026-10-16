import { useScopedListSearch } from '@/hooks/use-scoped-list-search';
import {
  matchesSearch,
  type SparePartsModelAlgorithm,
  type SparePartsModelResult
} from '@mms/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
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
import ListSearchInput from '@/components/shared/list-search-input';
import ListToolbar from '@/components/shared/list-toolbar';

const MODEL_NAMES: Record<SparePartsModelAlgorithm, string> = {
  fp_growth: 'FP-Growth',
  eclat: 'Eclat'
};
const percentage = (value: number) => `${Number((value * 100).toFixed(1))}%`;

export default function SparePartsModels({
  algorithm,
  result,
  isFetching,
  isError
}: {
  algorithm: SparePartsModelAlgorithm;
  result: SparePartsModelResult | undefined;
  isFetching: boolean;
  isError: boolean;
}) {
  const { filters, setFilter, clearFilters, hasFilters } = useListControls([
    'partsConfidence'
  ]);
  const { search, setSearch } = useScopedListSearch('partsSearch');
  const clearSearch = () => setSearch('');
  const rules = (result?.data ?? []).filter((rule) => {
    if (!matchesSearch(search, [rule.antecedent, rule.consequent]))
      return false;
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

  return (
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
              {MODEL_NAMES[algorithm]} results
            </span>
            {!isFetching && !isError && result && (
              <span>
                {result.trainingTransactions} training transactions ·{' '}
                {result.count} rules
              </span>
            )}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ListToolbar
          searchControl={
            <ListSearchInput
              value={search}
              onChange={setSearch}
              label="Search parts recommendations"
            />
          }
          filterControl={
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
          }
        />
        {isFetching ? (
          <div className="space-y-3" aria-label="Loading model results">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p role="alert" className="text-destructive text-sm">
            Could not load {MODEL_NAMES[algorithm]} results. Run the model again
            to retry.
          </p>
        ) : rules.length === 0 ? (
          <EmptyState
            message={
              hasFilters
                ? 'No rules match your confidence filter.'
                : 'This model has no saved association rules.'
            }
            search={search}
            onClearSearch={clearSearch}
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
          Confidence shows how often the suggested part appeared when the first
          part was replaced. Support shows how often both appeared across the
          training data; lift compares that link with chance. These are saved
          training patterns, so FP-Growth and Eclat may return the same rules.
        </p>
      </CardContent>
    </Card>
  );
}
