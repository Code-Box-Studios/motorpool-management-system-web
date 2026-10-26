import { useId } from 'react';
import type {
  PredictiveMaintenanceAlgorithm,
  SparePartsModelAlgorithm
} from '@mms/shared';
import { LoaderCircle, Play } from 'lucide-react';
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
import {
  type MaintenanceModels,
  PARTS_MODEL_NAMES,
  RISK_MODEL_NAMES
} from '@/lib/maintenance-models';

export default function MaintenanceModelControls({
  selected,
  applied,
  onChange,
  onRun,
  busy
}: {
  selected: MaintenanceModels;
  applied: MaintenanceModels;
  onChange: (models: MaintenanceModels) => void;
  onRun: () => void;
  busy: boolean;
}) {
  const id = useId();
  const changed =
    selected.risk !== applied.risk || selected.parts !== applied.parts;
  return (
    <Card role="region" aria-label="Maintenance model selection">
      <CardHeader>
        <CardTitle>Model Selection</CardTitle>
        <CardDescription>
          Choose how to assess vehicle risk and recommend related parts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`${id}-risk`}>Vehicle risk</Label>
            <Select
              value={selected.risk}
              disabled={busy}
              onValueChange={(risk) =>
                onChange({
                  ...selected,
                  risk: risk as PredictiveMaintenanceAlgorithm
                })
              }
            >
              <SelectTrigger
                id={`${id}-risk`}
                aria-label="Vehicle risk algorithm"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="random_forest">
                  Random Forest (Default)
                </SelectItem>
                <SelectItem value="decision_tree">Decision Tree</SelectItem>
                <SelectItem value="logistic_regression" disabled>
                  Logistic Regression (Unavailable)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Updates vehicle risk scores and priorities.
            </p>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`${id}-parts`}>Parts recommendations</Label>
            <Select
              value={selected.parts}
              disabled={busy}
              onValueChange={(parts) =>
                onChange({
                  ...selected,
                  parts: parts as SparePartsModelAlgorithm
                })
              }
            >
              <SelectTrigger
                id={`${id}-parts`}
                aria-label="Parts algorithm"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apriori">Apriori (Default)</SelectItem>
                <SelectItem value="fp_growth">FP-Growth</SelectItem>
                <SelectItem value="eclat">Eclat</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Finds parts commonly replaced together.
            </p>
          </div>
          <Button
            type="button"
            onClick={onRun}
            disabled={busy}
            className="gap-2 xl:mb-6"
          >
            {busy ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <Play aria-hidden="true" className="size-4" />
            )}
            {busy ? 'Running…' : 'Run Model'}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Logistic Regression unavailable: Missing fitted pipeline, scaler, and
          feature order.
        </p>
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {changed
            ? 'Run the model to apply your selections.'
            : `Applied: ${RISK_MODEL_NAMES[applied.risk]} · ${PARTS_MODEL_NAMES[applied.parts]}`}
        </p>
      </CardContent>
    </Card>
  );
}
