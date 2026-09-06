import { readFileSync } from 'node:fs';
import type { RFModel } from './random-forest.js';
import { predictRandomForest } from './random-forest.js';

let cachedModel: RFModel | null | undefined;

// Loads the client's own decision tree (client_dt_model.json — see
// src/assets/README.md for provenance). Mirrors random-forest.ts's
// loadModel(): cached after the first call, null on any load/parse failure
// so a missing or corrupt file degrades to "no cross-check available"
// rather than crashing the predictive-maintenance endpoint.
export function loadClientModel(): RFModel | null {
  if (cachedModel !== undefined) return cachedModel;
  try {
    const url = new URL('../../assets/client_dt_model.json', import.meta.url);
    const parsed = JSON.parse(readFileSync(url, 'utf-8')) as RFModel;
    cachedModel =
      Array.isArray(parsed.trees) && parsed.trees.length > 0 ? parsed : null;
  } catch {
    cachedModel = null;
  }
  return cachedModel;
}

// The client's tree as an ADDITIONAL, informational cross-check — see
// client-dt-brief.md §4. It must never take down the endpoint it rides
// alongside: any failure (model absent, or a feature missing from
// `features` — which predictRandomForest's assertFeaturesPresent guard makes
// loud in tests/dev, precisely so this catch is never silently masking a
// real bug) is reported as `null`, the same signal as "model not loaded".
// `null` here means "unknown", never a wrong number.
export function clientCrossCheckScore(
  features: Record<string, number>
): number | null {
  const model = loadClientModel();
  if (!model) return null;
  try {
    return predictRandomForest(model, features);
  } catch (error) {
    console.error('[analytics] client cross-check prediction failed', error);
    return null;
  }
}
