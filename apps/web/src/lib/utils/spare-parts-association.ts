/**
 * Spare Parts Association Rule Mining
 *
 * Implements a simplified Apriori-like algorithm inspired by mms_association.py.
 * Analyzes job orders' spare_parts_used to find parts frequently replaced together.
 *
 * Metrics computed:
 * - Support: frequency of the pair across all transactions
 * - Confidence: P(B | A) — probability of B given A
 * - Lift: how much more likely B is given A vs. independently
 */

export interface AssociationRule {
  partA: string;
  partAId: string;
  partB: string;
  partBId: string;
  support: number;
  confidence: number;
  lift: number;
  frequency: number; // percentage for UI display
  coOccurrences: number;
}

export interface SparePartInfo {
  id: string;
  name: string;
}

interface Transaction {
  vehicleId: string;
  vehicleModel?: string;
  parts: string[]; // part IDs
}

/**
 * Compute association rules from job order transactions.
 *
 * @param transactions - Array of transactions (each being a list of spare part IDs used together)
 * @param partLookup - Map of part ID → part name
 * @param minSupport - Minimum support threshold (0-1)
 * @param minConfidence - Minimum confidence threshold (0-1)
 */
export function computeAssociationRules(
  transactions: Transaction[],
  partLookup: Map<string, string>,
  minSupport: number = 0.1,
  minConfidence: number = 0.3
): AssociationRule[] {
  // Filter transactions with at least 2 parts
  const validTransactions = transactions.filter((t) => t.parts.length >= 2);
  const totalTransactions = validTransactions.length;

  if (totalTransactions < 2) return [];

  // Count individual item frequencies
  const itemCounts = new Map<string, number>();
  // Count pair co-occurrences
  const pairCounts = new Map<string, number>();

  for (const txn of validTransactions) {
    const uniqueParts = [...new Set(txn.parts)];

    // Count individual items
    for (const part of uniqueParts) {
      itemCounts.set(part, (itemCounts.get(part) ?? 0) + 1);
    }

    // Count all pairs (order doesn't matter for support)
    for (let i = 0; i < uniqueParts.length; i++) {
      for (let j = i + 1; j < uniqueParts.length; j++) {
        const key = makePairKey(uniqueParts[i], uniqueParts[j]);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  // Generate rules
  const rules: AssociationRule[] = [];

  for (const [pairKey, coCount] of pairCounts) {
    const [partAId, partBId] = parsePairKey(pairKey);
    const support = coCount / totalTransactions;

    if (support < minSupport) continue;

    const countA = itemCounts.get(partAId) ?? 0;
    const countB = itemCounts.get(partBId) ?? 0;

    if (countA === 0 || countB === 0) continue;

    // A → B
    const confidenceAB = coCount / countA;
    const supportB = countB / totalTransactions;
    const liftAB = supportB > 0 ? confidenceAB / supportB : 0;

    if (confidenceAB >= minConfidence) {
      rules.push({
        partAId,
        partBId,
        partA: partLookup.get(partAId) ?? partAId,
        partB: partLookup.get(partBId) ?? partBId,
        support: Math.round(support * 100),
        confidence: Math.round(confidenceAB * 100),
        lift: Math.round(liftAB * 100) / 100,
        frequency: Math.round(confidenceAB * 100),
        coOccurrences: coCount
      });
    }

    // B → A (reverse rule)
    const confidenceBA = coCount / countB;
    const supportA = countA / totalTransactions;
    const liftBA = supportA > 0 ? confidenceBA / supportA : 0;

    if (confidenceBA >= minConfidence) {
      rules.push({
        partAId: partBId,
        partBId: partAId,
        partA: partLookup.get(partBId) ?? partBId,
        partB: partLookup.get(partAId) ?? partAId,
        support: Math.round(support * 100),
        confidence: Math.round(confidenceBA * 100),
        lift: Math.round(liftBA * 100) / 100,
        frequency: Math.round(confidenceBA * 100),
        coOccurrences: coCount
      });
    }
  }

  // Sort by confidence descending, then by support
  rules.sort((a, b) => b.confidence - a.confidence || b.support - a.support);

  // Deduplicate: keep the stronger direction of each pair
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = makePairKey(rule.partAId, rule.partBId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Compute association rules grouped by vehicle model.
 */
export function computeAssociationsByVehicleModel(
  transactions: Transaction[],
  partLookup: Map<string, string>,
  minSupport: number = 0.2,
  minConfidence: number = 0.5
): Map<string, AssociationRule[]> {
  const byModel = new Map<string, Transaction[]>();

  for (const txn of transactions) {
    const model = txn.vehicleModel ?? 'Unknown';
    if (!byModel.has(model)) byModel.set(model, []);
    byModel.get(model)!.push(txn);
  }

  const results = new Map<string, AssociationRule[]>();

  for (const [model, modelTxns] of byModel) {
    const rules = computeAssociationRules(
      modelTxns,
      partLookup,
      minSupport,
      minConfidence
    );
    if (rules.length > 0) {
      results.set(model, rules);
    }
  }

  return results;
}

/**
 * Build transactions from job orders data.
 */
export function buildTransactions(
  jobOrders: Array<{
    vehicle_id: string;
    spare_parts_used: string[] | null;
    vehicles?: { make: string; model: string } | null;
  }>
): Transaction[] {
  return jobOrders
    .filter((jo) => jo.spare_parts_used && jo.spare_parts_used.length > 0)
    .map((jo) => ({
      vehicleId: jo.vehicle_id,
      vehicleModel: jo.vehicles
        ? `${jo.vehicles.make} ${jo.vehicles.model}`
        : undefined,
      parts: jo.spare_parts_used!
    }));
}

// Helpers
function makePairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function parsePairKey(key: string): [string, string] {
  const parts = key.split('|');
  return [parts[0], parts[1]];
}
