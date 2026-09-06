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

// Loads the committed model once (or returns null if missing/invalid → the
// caller uses the rule-based fallback). Resolved relative to this module so it
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
    if (features[name] === undefined) {
      throw new Error(
        `predictRandomForest: model requires feature "${name}" but it was not supplied ` +
          `(model declares: ${model.features.join(', ')}; supplied: ${Object.keys(features).join(', ') || '(none)'})`
      );
    }
  }
}

// Soft voting: mean of P(fail) across all trees. RAW feature values (do NOT
// scale — the model thresholds are baked to expect raw inputs; §11).
export function predictRandomForest(
  model: RFModel,
  features: Record<string, number>
): number {
  assertFeaturesPresent(model, features);
  const probs = model.trees.map((t) => predictTree(t, features));
  return probs.reduce((sum, p) => sum + p, 0) / probs.length;
}
