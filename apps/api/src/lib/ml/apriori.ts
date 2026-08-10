import type { AssociationRule } from '@mms/shared';

function makePairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Pairs-only "Apriori": 1-itemset + 2-itemset counts, support/confidence in both
// directions, then sort (confidence desc, support desc) + dedupe per unordered
// pair (stronger direction survives). No min-lift filter (§11).
export function computeAssociationRules(
  transactions: { parts: string[] }[],
  partLookup: Map<string, string>,
  minSupport = 0.1,
  minConfidence = 0.3
): AssociationRule[] {
  const valid = transactions.filter((t) => t.parts.length >= 2);
  const total = valid.length;
  if (total < 2) return [];

  const itemCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  for (const txn of valid) {
    const unique = [...new Set(txn.parts)];
    for (const part of unique)
      itemCounts.set(part, (itemCounts.get(part) ?? 0) + 1);
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = makePairKey(unique[i]!, unique[j]!);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const rules: AssociationRule[] = [];
  for (const [pairKey, coCount] of pairCounts) {
    const [aId, bId] = pairKey.split('|') as [string, string];
    const support = coCount / total;
    if (support < minSupport) continue;
    const countA = itemCounts.get(aId) ?? 0;
    const countB = itemCounts.get(bId) ?? 0;
    if (countA === 0 || countB === 0) continue;

    const push = (fromId: string, toId: string, conf: number, lift: number) => {
      rules.push({
        partAId: fromId,
        partBId: toId,
        partA: partLookup.get(fromId) ?? fromId,
        partB: partLookup.get(toId) ?? toId,
        support: Math.round(support * 100),
        confidence: Math.round(conf * 100),
        lift: Math.round(lift * 100) / 100,
        frequency: Math.round(conf * 100),
        coOccurrences: coCount
      });
    };

    const confAB = coCount / countA;
    const liftAB = countB / total > 0 ? confAB / (countB / total) : 0;
    if (confAB >= minConfidence) push(aId, bId, confAB, liftAB);

    const confBA = coCount / countB;
    const liftBA = countA / total > 0 ? confBA / (countA / total) : 0;
    if (confBA >= minConfidence) push(bId, aId, confBA, liftBA);
  }

  rules.sort((a, b) => b.confidence - a.confidence || b.support - a.support);
  const seen = new Set<string>();
  return rules.filter((r) => {
    const key = makePairKey(r.partAId, r.partBId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
