import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGarageUpdatePayload,
  canDeleteGarage,
  computeGarageCardStats,
  computeHeaderAnalyticsMetrics,
  DEFAULT_GARAGE_ID,
  filterVehiclesByGarage,
  hasOpenGarageWorkspace,
  removeGarageFromList,
  removeVehiclesForGarage,
  resolveNextActiveGarageId,
  upsertGarageInList,
} from './garageUtils';
import { GarageWorkspace, Vehicle } from '../types/garage';

const makeVehicle = (overrides: Partial<Vehicle>): Vehicle => ({
  id: 'v1',
  userId: 'u1',
  make: 'Peugeot',
  model: '208',
  trim: 'GT',
  year: 2021,
  mileage: 40000,
  vin: 'VF3UPHNK0MT129841',
  purchaseDate: '2026-10-01',
  purchasePrice: 10000,
  targetSalePrice: 13000,
  status: 'for_sale',
  photos: [],
  documents: [],
  repairCostTotal: 0,
  generalExpensesTotal: 0,
  totalExpenses: 0,
  totalInvested: 10000,
  netProfit: 3000,
  marginPercentage: 23,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

const makeGarage = (overrides: Partial<GarageWorkspace>): GarageWorkspace => ({
  id: DEFAULT_GARAGE_ID,
  userId: 'u1',
  name: 'AutoGarage Manager',
  profileType: 'micro_entrepreneur',
  entityType: 'physique',
  legalStatus: 'micro_entreprise',
  taxRegime: 'micro',
  taxRatePercent: 13.3,
  city: 'Paris',
  siret: '12345678901234',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

test('filterVehiclesByGarage strictly isolates vehicles by garageId and maps legacy vehicles to default garage', () => {
  const vehicles = [
    makeVehicle({ id: 'v_legacy' }), // no garageId -> belongs to DEFAULT_GARAGE_ID
    makeVehicle({ id: 'v_g1', garageId: DEFAULT_GARAGE_ID }),
    makeVehicle({ id: 'v_g2', garageId: 'garage_lyon' }),
  ];

  const defaultList = filterVehiclesByGarage(vehicles, DEFAULT_GARAGE_ID);
  assert.deepEqual(
    defaultList.map((v) => v.id),
    ['v_legacy', 'v_g1']
  );

  const lyonList = filterVehiclesByGarage(vehicles, 'garage_lyon');
  assert.deepEqual(
    lyonList.map((v) => v.id),
    ['v_g2']
  );
});

test('computeGarageCardStats aggregates operational stock counts (active, prep/repair, for_sale) per garage', () => {
  const vehicles = [
    makeVehicle({ id: 'v1', status: 'for_sale', totalInvested: 10500, netProfit: 2500 }),
    makeVehicle({ id: 'v2', status: 'sold', totalInvested: 15000, netProfit: 4000 }),
    makeVehicle({ id: 'v3', status: 'repair', totalInvested: 8000, netProfit: 1500 }),
    makeVehicle({ id: 'v4', status: 'preparation', totalInvested: 6000, netProfit: 1000 }),
  ];

  const stats = computeGarageCardStats(vehicles);
  assert.equal(stats.totalVehicles, 4);
  assert.equal(stats.activeStockCount, 3); // sold excluded from active stock
  assert.equal(stats.prepOrRepairCount, 2); // preparation + repair
  assert.equal(stats.forSaleCount, 1); // for_sale
});

test('computeHeaderAnalyticsMetrics excludes sold vehicles from in-stock count & invested capital and separates realizedProfit', () => {
  const vehicles = [
    makeVehicle({ id: 'v1', garageId: 'garage_sarl', status: 'for_sale', totalInvested: 10000, targetSalePrice: 13000, netProfit: 3000 }),
    makeVehicle({ id: 'v2', garageId: 'garage_sarl', status: 'sold', totalInvested: 15000, targetSalePrice: 0, buyerInfo: { fullName: 'Jean Dupont', address: '10 Rue de Paris', phone: '', email: '', salePrice: 19000, saleDate: '2026-10-10' }, netProfit: 4000 }),
    makeVehicle({ id: 'v3', garageId: 'garage_personal', status: 'repair', totalInvested: 8000, targetSalePrice: 0, netProfit: -8000 }),
    makeVehicle({ id: 'v4', garageId: 'garage_personal', status: 'preparation', totalInvested: 5000, targetSalePrice: 6500, netProfit: 1500 }),
  ];

  // Global view ("Все гаражи (Главная)" -> activeGarageId = null)
  // Active in-stock: v1 (for_sale) + v3 (repair) + v4 (preparation) = 3 cars (2 prep/repair, 1 for_sale)
  // Sold: v2 -> realizedProfit = 4000€
  const globalMetrics = computeHeaderAnalyticsMetrics(vehicles, null);
  assert.equal(globalMetrics.scope, 'all');
  assert.equal(globalMetrics.inStock, 3);
  assert.equal(globalMetrics.prepOrRepairCount, 2);
  assert.equal(globalMetrics.forSaleCount, 1);
  assert.equal(globalMetrics.soldCount, 1);
  assert.equal(globalMetrics.totalInvested, 23000);
  assert.equal(globalMetrics.realizedProfit, 4000);

  // Specific garage view (Garage SARL: v1 for_sale, v2 sold)
  const sarlMetrics = computeHeaderAnalyticsMetrics(vehicles, 'garage_sarl');
  assert.equal(sarlMetrics.scope, 'garage');
  assert.equal(sarlMetrics.inStock, 1);
  assert.equal(sarlMetrics.prepOrRepairCount, 0);
  assert.equal(sarlMetrics.forSaleCount, 1);
  assert.equal(sarlMetrics.soldCount, 1);
  assert.equal(sarlMetrics.totalInvested, 10000);
  assert.equal(sarlMetrics.realizedProfit, 4000);

  // Specific garage view (Personal: v3 repair + v4 preparation, 0 sold)
  const personalMetrics = computeHeaderAnalyticsMetrics(vehicles, 'garage_personal');
  assert.equal(personalMetrics.scope, 'garage');
  assert.equal(personalMetrics.inStock, 2);
  assert.equal(personalMetrics.prepOrRepairCount, 2);
  assert.equal(personalMetrics.forSaleCount, 0);
  assert.equal(personalMetrics.soldCount, 0);
  assert.equal(personalMetrics.totalInvested, 13000);
  assert.equal(personalMetrics.realizedProfit, 0);
});

test('canDeleteGarage permits deleting one of two garages and blocks deleting the last remaining garage', () => {
  const g1 = makeGarage({ id: DEFAULT_GARAGE_ID, name: 'Garage 1' });
  const g2 = makeGarage({ id: 'garage_2', name: 'Garage 2' });

  assert.deepEqual(canDeleteGarage([g1, g2], 'garage_2'), { allowed: true });
  assert.deepEqual(canDeleteGarage([g1, g2], DEFAULT_GARAGE_ID), { allowed: true });
  assert.deepEqual(canDeleteGarage([g1], DEFAULT_GARAGE_ID), {
    allowed: false,
    reason: 'last_garage',
  });
  assert.deepEqual(canDeleteGarage([g1, g2], 'missing_id'), {
    allowed: false,
    reason: 'not_found',
  });
});

test('buildGarageUpdatePayload switches cleanly between Micro-entrepreneur and Particulier and normalizes fields', () => {
  const initial = makeGarage({
    id: 'garage_2',
    name: 'Lyon Auto',
    profileType: 'micro_entrepreneur',
    siret: '91234567800019',
    city: 'Lyon',
  });

  const switchedToParticulier = buildGarageUpdatePayload(
    initial,
    {
      name: '  Jean Dupont  ',
      profileType: 'particulier',
      city: '  Nice  ',
      siret: '91234567800019',
    },
    '2026-11-17T12:00:00Z'
  );
  assert.equal(switchedToParticulier.name, 'Jean Dupont');
  assert.equal(switchedToParticulier.city, 'Nice');
  assert.equal(switchedToParticulier.profileType, 'particulier');
  assert.equal(switchedToParticulier.legalStatus, 'particulier');
  assert.equal(switchedToParticulier.taxRegime, 'none');
  assert.equal(switchedToParticulier.taxRatePercent, 0);
  assert.equal(switchedToParticulier.siret, '');

  const switchedBackToMicro = buildGarageUpdatePayload(
    switchedToParticulier,
    {
      name: 'Lyon Auto Pro',
      profileType: 'micro_entrepreneur',
      city: 'Lyon',
      siret: '91234567800019',
    },
    '2026-11-17T12:05:00Z'
  );
  assert.equal(switchedBackToMicro.profileType, 'micro_entrepreneur');
  assert.equal(switchedBackToMicro.legalStatus, 'micro_entreprise');
  assert.equal(switchedBackToMicro.taxRegime, 'micro');
  assert.equal(switchedBackToMicro.taxRatePercent, 13.3);
  assert.equal(switchedBackToMicro.siret, '91234567800019');
});

test('resolveNextActiveGarageId resets activeGarageId when active garage is deleted in multi-garage mode', () => {
  const g1 = makeGarage({ id: DEFAULT_GARAGE_ID });
  assert.equal(resolveNextActiveGarageId([g1], 'garage_2', 'garage_2', true), null);
  assert.equal(resolveNextActiveGarageId([g1], 'garage_2', DEFAULT_GARAGE_ID, true), DEFAULT_GARAGE_ID);
  assert.equal(resolveNextActiveGarageId([g1], 'garage_2', 'garage_2', false), DEFAULT_GARAGE_ID);
});

test('removeGarageFromList and upsertGarageInList update garage collections immediately', () => {
  const g1 = makeGarage({ id: DEFAULT_GARAGE_ID, name: 'Garage 1' });
  const g2 = makeGarage({ id: 'garage_2', name: 'Garage 2' });
  const g3 = makeGarage({ id: 'garage_3', name: 'Garage 3' });

  const afterRemove = removeGarageFromList([g1, g2], 'garage_2');
  assert.deepEqual(
    afterRemove.map((g) => g.id),
    [DEFAULT_GARAGE_ID]
  );

  const afterAppend = upsertGarageInList(afterRemove, g3);
  assert.deepEqual(
    afterAppend.map((g) => g.id),
    [DEFAULT_GARAGE_ID, 'garage_3']
  );

  const g3Renamed = makeGarage({ id: 'garage_3', name: 'Garage 3 Updated' });
  const afterUpdate = upsertGarageInList(afterAppend, g3Renamed);
  assert.equal(afterUpdate.length, 2);
  assert.equal(afterUpdate[1].name, 'Garage 3 Updated');
});

test('removeVehiclesForGarage purges deleted garage vehicles without touching other garages', () => {
  const vLegacy = makeVehicle({ id: 'v_legacy' });
  const vDefault = makeVehicle({ id: 'v_def', garageId: DEFAULT_GARAGE_ID });
  const vOther = makeVehicle({ id: 'v_other', garageId: 'garage_2' });

  const afterRemovingOther = removeVehiclesForGarage([vLegacy, vDefault, vOther], 'garage_2');
  assert.deepEqual(
    afterRemovingOther.map((v) => v.id),
    ['v_legacy', 'v_def']
  );

  const afterRemovingDefault = removeVehiclesForGarage([vLegacy, vDefault, vOther], DEFAULT_GARAGE_ID);
  assert.deepEqual(
    afterRemovingDefault.map((v) => v.id),
    ['v_other']
  );
});

test('hasOpenGarageWorkspace hides garage sections until a garage is opened in multi-garage mode', () => {
  assert.equal(hasOpenGarageWorkspace(true, null), false);
  assert.equal(hasOpenGarageWorkspace(true, undefined), false);
  assert.equal(hasOpenGarageWorkspace(true, ''), false);
  assert.equal(hasOpenGarageWorkspace(true, 'garage_1'), true);
  assert.equal(hasOpenGarageWorkspace(false, null), true);
});


