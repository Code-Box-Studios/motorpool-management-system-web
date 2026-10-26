import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as forest from '../../lib/ml/random-forest.js';
import * as decisionTree from '../../lib/ml/client-dt.js';
import * as repo from './repository.js';
import { computeVehicleRisk } from '../../lib/ml/risk.js';
import { associationModel, predictiveMaintenance } from './service.js';

// The repository opens Prisma connections. Keep inference and artifact loading real;
// replace only the database boundary with the records those queries return.
vi.mock('./repository.js', () => ({
  vehiclesWithMaintenance: vi.fn(),
  downtimeHoursByVehicle: vi.fn(),
  jobOrdersWithSpareParts: vi.fn(),
  allSpareParts: vi.fn()
}));

const now = new Date('2026-10-25T00:00:00Z');
type VehicleWithMaintenance = Awaited<
  ReturnType<typeof repo.vehiclesWithMaintenance>
>[number];
const vehicle = (id: string): VehicleWithMaintenance => ({
  id,
  make: 'Toyota',
  model: 'Hiace',
  year: 2021,
  vin: `VIN-${id}`,
  licensePlate: id,
  capacity: 12,
  fuelType: 'diesel',
  mileage: 10000,
  status: 'available',
  images: [],
  insuranceExpiry: new Date('2027-01-01'),
  registrationExpiry: new Date('2027-01-01'),
  branchId: null,
  maintenanceStandardId: null,
  latitude: null,
  longitude: null,
  lastLocationUpdate: null,
  createdAt: now,
  updatedAt: now,
  maintenances: [
    {
      id: `maintenance-${id}`,
      vehicleId: id,
      type: 'service',
      date: new Date('2026-10-01'),
      cost: null,
      mileage: 0,
      nextDue: null,
      description: null,
      createdAt: now,
      updatedAt: now
    }
  ]
});

describe('selected maintenance models', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(repo.vehiclesWithMaintenance).mockResolvedValue([
      vehicle('below'),
      vehicle('above')
    ]);
    vi.mocked(repo.downtimeHoursByVehicle).mockResolvedValue(
      new Map([
        ['below', 0.5],
        ['above', 1]
      ])
    );
    vi.mocked(repo.jobOrdersWithSpareParts).mockResolvedValue([]);
    vi.mocked(repo.allSpareParts).mockResolvedValue([]);
  });

  it('uses Decision Tree probabilities as the main score and keeps descending order', async () => {
    const result = await predictiveMaintenance(now, 'decision_tree');
    // Golden leaf values from the supplied decision tree, straddling downtime's split.
    expect(
      result.data.map(
        ({ vehicleId, riskScore, priority, scoringMethod, usedFallback }) => ({
          vehicleId,
          riskScore,
          priority,
          scoringMethod,
          usedFallback
        })
      )
    ).toEqual([
      {
        vehicleId: 'above',
        riskScore: 100,
        priority: 'high',
        scoringMethod: 'decision_tree',
        usedFallback: false
      },
      {
        vehicleId: 'below',
        riskScore: 74,
        priority: 'high',
        scoringMethod: 'decision_tree',
        usedFallback: false
      }
    ]);
    const rf = await predictiveMaintenance(now, 'random_forest');
    expect(
      rf.data.every(
        (row) => row.scoringMethod === 'random_forest' && !row.usedFallback
      )
    ).toBe(true);
    expect(
      rf.data.find((row) => row.vehicleId === 'above')?.riskScore
    ).not.toBe(100);
  });

  it('changes the main priority with the selected model on the same vehicle', async () => {
    vi.mocked(repo.vehiclesWithMaintenance).mockResolvedValue([
      { ...vehicle('unserviced'), mileage: 5000, maintenances: [] }
    ]);
    const tree = await predictiveMaintenance(now, 'decision_tree');
    const forest = await predictiveMaintenance(now, 'random_forest');
    // DT's no-services branch above 1920.22998046875 km has probability 0.6.
    expect(tree.data[0]).toMatchObject({
      riskScore: 60,
      priority: 'medium',
      scoringMethod: 'decision_tree'
    });
    expect(forest.data[0]).toMatchObject({
      riskScore: 7,
      priority: 'low',
      scoringMethod: 'random_forest'
    });
  });

  it.each(['random_forest', 'decision_tree'] as const)(
    'returns unavailable for a missing %s artifact without substituting rules',
    async (algorithm) => {
      if (algorithm === 'random_forest')
        vi.spyOn(forest, 'loadModel').mockReturnValue(null);
      else vi.spyOn(decisionTree, 'loadClientModel').mockReturnValue(null);
      await expect(predictiveMaintenance(now, algorithm)).rejects.toMatchObject(
        { statusCode: 503, code: 'MODEL_UNAVAILABLE' }
      );
    }
  );

  it('rejects invalid model probabilities instead of returning a score', async () => {
    vi.spyOn(forest, 'loadModel').mockReturnValue({
      features: [],
      n_estimators: 1,
      classes: [0, 1],
      trees: [{ probs: [0, Number.NaN] }]
    });
    await expect(
      predictiveMaintenance(now, 'random_forest')
    ).rejects.toMatchObject({ statusCode: 503, code: 'MODEL_UNAVAILABLE' });
  });

  it('reports an invalid artifact even when the fleet is empty', async () => {
    vi.mocked(repo.vehiclesWithMaintenance).mockResolvedValue([]);
    vi.spyOn(forest, 'loadModel').mockReturnValue({
      features: [],
      n_estimators: 0,
      classes: [],
      trees: []
    });
    await expect(
      predictiveMaintenance(now, 'random_forest')
    ).rejects.toMatchObject({ statusCode: 503, code: 'MODEL_UNAVAILABLE' });
  });

  it('never uses rule scoring when the inference helper receives no model', () => {
    expect(() =>
      computeVehicleRisk(null, {
        kmSinceLastMaint: 5000,
        avgDailyKm: 50,
        maintFreq12m: 1
      })
    ).toThrow(/unavailable/i);
  });

  it.each([
    { features: [], n_estimators: 1, classes: [0, 1], trees: [{ probs: [1] }] },
    {
      features: [],
      n_estimators: 1,
      classes: [1, 0],
      trees: [{ probs: [0.2, 0.8] }]
    },
    {
      features: ['unknown'],
      n_estimators: 1,
      classes: [0, 1],
      trees: [
        {
          feature: 'undeclared',
          threshold: 1,
          left: { probs: [1, 0] },
          right: { probs: [0, 1] }
        }
      ]
    }
  ])(
    'rejects malformed model structure without plausible substituted probabilities',
    async (model) => {
      vi.spyOn(forest, 'loadModel').mockReturnValue(model);
      await expect(
        predictiveMaintenance(now, 'random_forest')
      ).rejects.toMatchObject({ statusCode: 503, code: 'MODEL_UNAVAILABLE' });
    }
  );

  it('does not substitute scores for Logistic Regression missing its scaler and feature order', async () => {
    await expect(
      predictiveMaintenance(now, 'logistic_regression')
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'MODEL_UNAVAILABLE',
      message: expect.stringMatching(/scaler|pipeline/i)
    });
  });

  it('returns live Apriori metadata and an honest empty dataset', async () => {
    const result = await associationModel('apriori');
    expect(result).toMatchObject({
      algorithm: 'apriori',
      source: 'live_job_orders',
      transactionCount: 0,
      trainingTransactions: null,
      sourceFile: null,
      sourceSha256: null,
      count: 0,
      data: []
    });
  });

  it('normalizes qualifying live Apriori metrics without inventing an artifact hash', async () => {
    vi.mocked(repo.jobOrdersWithSpareParts).mockResolvedValue([
      { spareParts: [{ sparePartId: 'a' }, { sparePartId: 'b' }] },
      { spareParts: [{ sparePartId: 'a' }, { sparePartId: 'b' }] },
      { spareParts: [{ sparePartId: 'a' }] }
    ] as Awaited<ReturnType<typeof repo.jobOrdersWithSpareParts>>);
    vi.mocked(repo.allSpareParts).mockResolvedValue([
      { id: 'a', name: 'Filter' },
      { id: 'b', name: 'Oil' }
    ] as Awaited<ReturnType<typeof repo.allSpareParts>>);
    const result = await associationModel('apriori');
    expect(result).toMatchObject({
      source: 'live_job_orders',
      transactionCount: 2,
      count: 1,
      sourceSha256: null
    });
    expect(result.data).toEqual([
      {
        antecedent: 'Filter',
        consequent: 'Oil',
        support: 1,
        confidence: 1,
        lift: 1,
        coOccurrences: 2
      }
    ]);
  });

  it('preserves identical supplied FP-Growth/Eclat rules and real provenance', async () => {
    const fp = await associationModel('fp_growth');
    const eclat = await associationModel('eclat');
    expect(fp.data).toEqual(eclat.data);
    expect(fp).toMatchObject({
      source: 'trained_artifact',
      trainingTransactions: 21,
      transactionCount: 21,
      count: 4
    });
    expect(fp.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fp.data).toContainEqual({
      antecedent: 'Fuel Filter',
      consequent: 'Oil Filter',
      support: 4 / 21,
      confidence: 1,
      lift: 3,
      coOccurrences: 4
    });
  });
});
