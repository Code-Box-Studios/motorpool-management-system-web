import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  readFileSync: vi.fn()
}));

describe('saved association model failures', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(readFileSync).mockReset();
  });

  it('returns an explicit unavailable error instead of substituting another model', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('Missing file');
    });
    const { loadAssociationModel } = await import('./association-models.js');
    expect(() => loadAssociationModel('eclat')).toThrowError(
      expect.objectContaining({ statusCode: 503, code: 'MODEL_UNAVAILABLE' })
    );
  });

  it.each([
    'wrong-algorithm',
    'wrong-count',
    'wrong-support',
    'invalid-confidence'
  ])('rejects a %s asset', async (corruption) => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const asset = JSON.parse(
      actualFs.readFileSync(
        new URL(
          '../../assets/association_fpgrowth_model.json',
          import.meta.url
        ),
        'utf-8'
      )
    );
    if (corruption === 'wrong-algorithm') asset.algorithm = 'eclat';
    if (corruption === 'wrong-count') asset.count = 99;
    if (corruption === 'wrong-support') asset.data[0].coOccurrences = 99;
    if (corruption === 'invalid-confidence') asset.data[0].confidence = 1.5;
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(asset));
    const { loadAssociationModel } = await import('./association-models.js');
    expect(() => loadAssociationModel('fp_growth')).toThrowError(
      /selected spare parts model is unavailable/
    );
  });
});
