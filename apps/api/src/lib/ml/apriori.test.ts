import { describe, expect, it } from 'vitest';
import { computeAssociationRules } from './apriori.js';

const lookup = new Map([
  ['A', 'A'],
  ['B', 'B'],
  ['C', 'C']
]);

describe('apriori association rules (golden example)', () => {
  it('derives the expected deduped ruleset from T1..T4', () => {
    const txns = [
      { parts: ['A', 'B'] },
      { parts: ['A', 'B'] },
      { parts: ['A', 'C'] },
      { parts: ['B', 'C'] }
    ];
    const rules = computeAssociationRules(txns, lookup, 0.1, 0.3);
    // Deduped to one rule per unordered pair; A→B strongest.
    expect(rules).toHaveLength(3);
    const ab = rules.find((r) => r.partAId === 'A' && r.partBId === 'B')!;
    expect(ab).toMatchObject({
      support: 50,
      confidence: 67,
      frequency: 67,
      coOccurrences: 2
    });
    expect(ab.lift).toBeCloseTo(0.89, 2);
    // C→A kept over A→C (0.5 > 0.333); C→B kept over B→C.
    expect(
      rules.some(
        (r) => r.partAId === 'C' && r.partBId === 'A' && r.confidence === 50
      )
    ).toBe(true);
    expect(
      rules.some(
        (r) => r.partAId === 'C' && r.partBId === 'B' && r.confidence === 50
      )
    ).toBe(true);
  });

  it('returns [] with fewer than 2 valid (>=2-part) transactions', () => {
    expect(computeAssociationRules([{ parts: ['A', 'B'] }], lookup)).toEqual(
      []
    );
    expect(
      computeAssociationRules([{ parts: ['A'] }, { parts: ['B'] }], lookup)
    ).toEqual([]);
  });

  it('de-dupes parts within a transaction before counting', () => {
    const txns = [{ parts: ['A', 'A', 'B'] }, { parts: ['A', 'B'] }];
    const rules = computeAssociationRules(txns, lookup, 0.1, 0.3);
    const ab = rules.find(
      (r) =>
        (r.partAId === 'A' && r.partBId === 'B') ||
        (r.partAId === 'B' && r.partBId === 'A')
    )!;
    expect(ab.coOccurrences).toBe(2);
  });
});
