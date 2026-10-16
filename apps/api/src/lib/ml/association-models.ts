import { readFileSync } from 'node:fs';
import {
  sparePartsModelResultSchema,
  type SparePartsModelAlgorithm,
  type SparePartsModelResult
} from '@mms/shared';
import { AppError } from '../errors.js';

const ASSETS: Record<SparePartsModelAlgorithm, string> = {
  fp_growth: 'association_fpgrowth_model.json',
  eclat: 'association_eclat_model.json'
};
const models = new Map<SparePartsModelAlgorithm, SparePartsModelResult>();

// The offline export preserves each rule's direction and full precision.
// Never substitute a live-data rule or another model if an asset is missing.
export function loadAssociationModel(
  algorithm: SparePartsModelAlgorithm
): SparePartsModelResult {
  const cached = models.get(algorithm);
  if (cached) return cached;
  try {
    const asset = new URL(`../../assets/${ASSETS[algorithm]}`, import.meta.url);
    const result = sparePartsModelResultSchema.parse(
      JSON.parse(readFileSync(asset, 'utf-8'))
    );
    if (
      result.algorithm !== algorithm ||
      result.count !== result.data.length ||
      result.data.some(
        (rule) =>
          Math.abs(
            rule.support * result.trainingTransactions - rule.coOccurrences
          ) > 1e-8
      )
    ) {
      throw new Error('Inconsistent association model');
    }
    models.set(algorithm, result);
    return result;
  } catch {
    throw new AppError(
      503,
      'MODEL_UNAVAILABLE',
      'The selected spare parts model is unavailable. Try again later.'
    );
  }
}
