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

// Soft voting: mean of P(fail) across all trees. RAW feature values (do NOT
// scale — the model thresholds are baked to expect raw inputs; §11).
export function predictRandomForest(
  model: RFModel,
  features: Record<string, number>
): number {
  const probs = model.trees.map((t) => predictTree(t, features));
  return probs.reduce((sum, p) => sum + p, 0) / probs.length;
}
