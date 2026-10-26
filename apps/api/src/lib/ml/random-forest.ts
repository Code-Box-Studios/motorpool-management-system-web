import { readFileSync } from 'node:fs';

interface TreeLeaf {
  probs: number[];
}
interface TreeNode {
  feature: string;
  threshold: number;
  left: TreeNode | TreeLeaf;
  right: TreeNode | TreeLeaf;
}
export interface RFModel {
  features: string[];
  n_estimators: number;
  classes: number[];
  trees: (TreeNode | TreeLeaf)[];
}

let cachedModel: RFModel | null | undefined;

// Loads the committed model once (or returns null if missing/invalid).
// Selected-model callers report unavailability. Resolved relative to this module so it
// works under both tsx (src/) and node (dist/, via the build asset copy).
export function loadModel(): RFModel | null {
  if (cachedModel !== undefined) return cachedModel;
  try {
    const url = new URL(
      '../../assets/rf_maintenance_model.json',
      import.meta.url
    );
    const parsed = JSON.parse(readFileSync(url, 'utf-8')) as RFModel;
    cachedModel =
      Array.isArray(parsed.trees) && parsed.trees.length > 0 ? parsed : null;
  } catch {
    cachedModel = null;
  }
  return cachedModel;
}

function predictTree(
  node: TreeNode | TreeLeaf,
  features: Record<string, number>
): number {
  if ('probs' in node) return node.probs[1] ?? 0;
  const value = features[node.feature] ?? 0;
  return value <= node.threshold
    ? predictTree(node.left, features)
    : predictTree(node.right, features);
}

/** Validate learned structure and binary class order before serving any score. */
export function assertValidModel(model: RFModel): void {
  const invalid = () => {
    throw new Error('Invalid predictive model');
  };
  if (
    !Array.isArray(model.features) ||
    model.features.length === 0 ||
    !model.features.every(
      (name) => typeof name === 'string' && name.length > 0
    ) ||
    !Array.isArray(model.classes) ||
    model.classes.length !== 2 ||
    model.classes[0] !== 0 ||
    model.classes[1] !== 1 ||
    !Array.isArray(model.trees) ||
    model.trees.length === 0 ||
    model.n_estimators !== model.trees.length
  )
    invalid();
  const visit = (node: TreeNode | TreeLeaf): void => {
    if (!node || typeof node !== 'object') return invalid();
    if ('probs' in node) {
      if (
        !Array.isArray(node.probs) ||
        node.probs.length !== 2 ||
        node.probs.some((p) => !Number.isFinite(p) || p < 0 || p > 1) ||
        Math.abs(node.probs[0]! + node.probs[1]! - 1) > 1e-8
      )
        invalid();
      return;
    }
    if (
      !model.features.includes(node.feature) ||
      !Number.isFinite(node.threshold)
    )
      invalid();
    visit(node.left);
    visit(node.right);
  };
  model.trees.forEach(visit);
}

// A missing feature must fail LOUDLY, not quietly become 0 inside
// predictTree's `?? 0`. Silent-0 is not a neutral default: a 0 can sit on
// either side of a node's threshold, so the tree can traverse to a
// perfectly plausible — and wrong — leaf with no error at all. This is
// exactly what would happen to the client's decision tree
// (client_dt_model.json) if `downtime_hours` were ever left off the feature
// record: 0 falls below that node's 0.8224 threshold, so it would silently
// always return 0.742 and never 1.0. Validate BEFORE traversal, for every
// model (incumbent RF included — its 3 declared features are exactly what
// extractFeatures already produces, so this cannot break it).
function assertFeaturesPresent(
  model: RFModel,
  features: Record<string, number>
): void {
  for (const name of model.features) {
    if (features[name] === undefined || !Number.isFinite(features[name])) {
      throw new Error(
        `predictRandomForest: model requires feature "${name}" but it was not supplied ` +
          `(model declares: ${model.features.join(', ')}; supplied: ${Object.keys(features).join(', ') || '(none)'})`
      );
    }
  }
}

// Soft voting: mean of P(fail) across all trees. Preserve raw feature units
// and sklearn's float32 input precision; keep learned thresholds at full
// precision. Scaling or rounding the thresholds changes tree branches.
export function predictRandomForest(
  model: RFModel,
  features: Record<string, number>
): number {
  assertFeaturesPresent(model, features);
  const inputs: Record<string, number> = {};
  for (const [name, value] of Object.entries(features)) {
    inputs[name] = Math.fround(value);
  }
  const probs = model.trees.map((t) => predictTree(t, inputs));
  return probs.reduce((sum, p) => sum + p, 0) / probs.length;
}
