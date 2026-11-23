import test from 'node:test';
import assert from 'node:assert/strict';
import { GeneralExpense, RepairTask, Vehicle } from '../types/garage';
import {
  computeActiveInventoryStatusCounts,
  computeInventoryStatusCounts,
  computeInventorySummaryTotals,
  computeVehicleInventoryFinancials,
  filterVehiclesByInventoryScope,
  formatListTrimSubtitle,
  formatMileageKm,
  getVehicleTransactionBadgeInfo,
  matchesVehicleSearch,
  matchesVehicleTransactionType,
  partitionInventoryVehicles,
  sortInventoryVehicles,
  sortInventoryVehiclesByColumn,
  toggleTableSortState,
} from './inventoryUtils';

function createVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'veh_1',
    userId: 'user_1',
    make: 'Volkswagen',
    model: 'Golf VII',
    trim: '1.6 TDI Confortline',
    year: 2019,
    mileage: 94000,
    vin: 'WVWZZZAUZKP512984',
    registrationNumber: 'EV-719-VW',
    purchaseDate: '2026-08-10',
    purchasePrice: 10400,
    targetSalePrice: 13990,
    status: 'for_sale',
    photos: [],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 10400,
    netProfit: 0,
    marginPercentage: 0,
    createdAt: '2026-08-10T10:00:00Z',
    updatedAt: '2026-08-10T10:00:00Z',
    ...overrides,
  };
}

test('computeVehicleInventoryFinancials sums repairs, parts, labor and general expenses without duplicates', () => {
  const vehicle = createVehicle({ purchasePrice: 10400, totalExpenses: 9999 });
  const repairs: RepairTask[] = [
    {
      id: 'rep_1',
      vehicleId: 'veh_1',
      userId: 'user_1',
      title: 'Freins + MO',
      status: 'done',
      partsCost: 180,
      laborCost: 120,
      totalCost: 300,
      createdAt: '2026-08-12T10:00:00Z',
      updatedAt: '2026-08-12T10:00:00Z',
    },
    // Duplicate ID must not double-count
    {
      id: 'rep_1',
      vehicleId: 'veh_1',
      userId: 'user_1',
      title: 'Freins + MO',
      status: 'done',
      partsCost: 180,
      laborCost: 120,
      totalCost: 300,
      createdAt: '2026-08-12T10:00:00Z',
      updatedAt: '2026-08-12T10:00:00Z',
    },
  ];
  const expenses: GeneralExpense[] = [
    {
      id: 'exp_1',
      vehicleId: 'veh_1',
      userId: 'user_1',
      category: 'transport',
      description: 'Plateau',
      amount: 115,
      date: '2026-08-11',
      createdAt: '2026-08-11T10:00:00Z',
      updatedAt: '2026-08-11T10:00:00Z',
    },
    {
      id: 'exp_2',
      vehicleId: 'veh_1',
      userId: 'user_1',
      category: 'controle_technique',
      description: 'CT Dekra',
      amount: 85,
      date: '2026-08-13',
      createdAt: '2026-08-13T10:00:00Z',
      updatedAt: '2026-08-13T10:00:00Z',
    },
  ];

  const result = computeVehicleInventoryFinancials(vehicle, repairs, expenses);
  assert.equal(result.purchasePrice, 10400);
  assert.equal(result.repairCostTotal, 300);
  assert.equal(result.generalExpensesTotal, 200);
  assert.equal(result.totalExpenses, 500);
  assert.equal(result.totalInvested, 10900);
});

test('computeVehicleInventoryFinancials falls back cleanly to stored totals when subcollection arrays are not provided', () => {
  const vehicle = createVehicle({
    purchasePrice: 8900,
    repairCostTotal: 750,
    generalExpensesTotal: 450,
    totalExpenses: 1200,
  });

  const result = computeVehicleInventoryFinancials(vehicle);
  assert.equal(result.purchasePrice, 8900);
  assert.equal(result.totalExpenses, 1200);
  assert.equal(result.totalInvested, 10100);
});

test('computeInventorySummaryTotals sums purchase price, expenses, and total invested across fleet', () => {
  const totals = computeInventorySummaryTotals([
    { purchasePrice: 10400, repairCostTotal: 300, generalExpensesTotal: 200, totalExpenses: 500, totalInvested: 10900 },
    { purchasePrice: 8900, repairCostTotal: 900, generalExpensesTotal: 300, totalExpenses: 1200, totalInvested: 10100 },
    { purchasePrice: 11200, repairCostTotal: 200, generalExpensesTotal: 100, totalExpenses: 300, totalInvested: 11500 },
  ]);

  assert.equal(totals.vehicleCount, 3);
  assert.equal(totals.totalPurchasePrice, 30500);
  assert.equal(totals.totalExpenses, 2000);
  assert.equal(totals.totalInvested, 32500);
});

test('matchesVehicleSearch matches registration number (with or without hyphens) and mileage', () => {
  const vehicle = createVehicle({
    make: 'Renault',
    model: 'Clio V',
    registrationNumber: 'AB-123-CD',
    mileage: 62500,
  });

  assert.equal(matchesVehicleSearch(vehicle, 'AB-123-CD'), true);
  assert.equal(matchesVehicleSearch(vehicle, 'ab123cd'), true);
  assert.equal(matchesVehicleSearch(vehicle, '62500'), true);
  assert.equal(matchesVehicleSearch(vehicle, '62 500 km'), true);
  assert.equal(matchesVehicleSearch(vehicle, 'renault clio'), true);
  assert.equal(matchesVehicleSearch(vehicle, 'ZZ-999-ZZ'), false);
  assert.equal(matchesVehicleSearch(vehicle, '99999'), false);
});

test('formatMileageKm always includes km suffix and handles missing values', () => {
  assert.match(formatMileageKm(62500, 'fr'), /62.*500 km$/);
  assert.equal(formatMileageKm(undefined, 'ru'), '0 km');
});

test('sortInventoryVehicles sorts by totalInvested descending when requested', () => {
  const v1 = createVehicle({ id: 'v1', purchasePrice: 8000 });
  const v2 = createVehicle({ id: 'v2', purchasePrice: 12000 });
  const finMap = new Map([
    ['v1', computeVehicleInventoryFinancials(v1, [], [{ id: 'e1', vehicleId: 'v1', userId: 'u', category: 'other', description: 'x', amount: 5000, date: '2026-01-01', createdAt: '', updatedAt: '' }])],
    ['v2', computeVehicleInventoryFinancials(v2)],
  ]);

  const sorted = sortInventoryVehicles([v1, v2], 'invested', finMap);
  assert.equal(sorted[0].id, 'v1');
  assert.equal(sorted[1].id, 'v2');
});

test('matchesVehicleTransactionType filters micro vs particulier vehicles using purchaseStatus and profile fallback', () => {
  const microVehicle = createVehicle({ id: 'v_micro', purchaseStatus: 'micro' });
  const particulierVehicle = createVehicle({ id: 'v_part', purchaseStatus: 'particulier' });
  const legacyVehicle = createVehicle({ id: 'v_legacy', purchaseStatus: undefined });

  assert.equal(matchesVehicleTransactionType(microVehicle, 'all'), true);
  assert.equal(matchesVehicleTransactionType(microVehicle, 'micro'), true);
  assert.equal(matchesVehicleTransactionType(microVehicle, 'particulier'), false);

  assert.equal(matchesVehicleTransactionType(particulierVehicle, 'micro'), false);
  assert.equal(matchesVehicleTransactionType(particulierVehicle, 'particulier'), true);

  assert.equal(
    matchesVehicleTransactionType(legacyVehicle, 'micro', 'micro_entrepreneur'),
    true
  );
  assert.equal(
    matchesVehicleTransactionType(legacyVehicle, 'particulier', 'particulier'),
    true
  );
});

test('computeInventoryStatusCounts accurately tallies statuses for filtered fleet slices', () => {
  const fleet = [
    createVehicle({ id: '1', status: 'preparation', purchaseStatus: 'micro' }),
    createVehicle({ id: '2', status: 'repair', purchaseStatus: 'particulier' }),
    createVehicle({ id: '3', status: 'for_sale', purchaseStatus: 'micro' }),
    createVehicle({ id: '4', status: 'sold', purchaseStatus: 'micro' }),
  ];

  assert.deepEqual(computeInventoryStatusCounts(fleet), {
    all: 4,
    preparation: 1,
    repair: 1,
    for_sale: 1,
    sold: 1,
  });

  const microOnly = fleet.filter((v) => matchesVehicleTransactionType(v, 'micro'));
  assert.deepEqual(computeInventoryStatusCounts(microOnly), {
    all: 3,
    preparation: 1,
    repair: 0,
    for_sale: 1,
    sold: 1,
  });
});

test('formatListTrimSubtitle truncates subtitles over 15 chars with ellipsis and preserves full string', () => {
  assert.deepEqual(formatListTrimSubtitle('1.2 PureTech 130ch GT Line EAT8'), {
    display: '1.2 PureTech 13...',
    full: '1.2 PureTech 130ch GT Line EAT8',
  });
  assert.deepEqual(formatListTrimSubtitle('TCe 90 Intens'), {
    display: 'TCe 90 Intens',
    full: 'TCe 90 Intens',
  });
  assert.deepEqual(formatListTrimSubtitle(''), {
    display: 'Standard',
    full: 'Standard',
  });
});

test('toggleTableSortState toggles direction on same column and selects sensible defaults for new columns', () => {
  const first = toggleTableSortState(null, 'vehicle');
  assert.deepEqual(first, { column: 'vehicle', direction: 'asc' });

  const second = toggleTableSortState(first, 'vehicle');
  assert.deepEqual(second, { column: 'vehicle', direction: 'desc' });

  const numeric = toggleTableSortState(second, 'totalInvested');
  assert.deepEqual(numeric, { column: 'totalInvested', direction: 'desc' });

  const numericFlipped = toggleTableSortState(numeric, 'totalInvested');
  assert.deepEqual(numericFlipped, { column: 'totalInvested', direction: 'asc' });
});

test('sortInventoryVehiclesByColumn sorts cleanly across all inventory table columns', () => {
  const vA = createVehicle({
    id: 'a',
    make: 'Audi',
    model: 'A3',
    mileage: 50000,
    status: 'sold',
    ctPassed: true,
    docsCompleted: false,
    purchasePrice: 18000,
    totalExpenses: 500,
    totalInvested: 18500,
  });
  const vB = createVehicle({
    id: 'b',
    make: 'Peugeot',
    model: '208',
    mileage: 90000,
    status: 'preparation',
    ctPassed: false,
    docsCompleted: true,
    purchasePrice: 10000,
    totalExpenses: 1200,
    totalInvested: 11200,
  });

  const byVehicleAsc = sortInventoryVehiclesByColumn([vB, vA], { column: 'vehicle', direction: 'asc' });
  assert.deepEqual(byVehicleAsc.map((v) => v.id), ['a', 'b']);

  const byMileageDesc = sortInventoryVehiclesByColumn([vA, vB], { column: 'mileage', direction: 'desc' });
  assert.deepEqual(byMileageDesc.map((v) => v.id), ['b', 'a']);

  const byStatusAsc = sortInventoryVehiclesByColumn([vA, vB], { column: 'status', direction: 'asc' });
  assert.deepEqual(byStatusAsc.map((v) => v.id), ['b', 'a']);

  const byCtDesc = sortInventoryVehiclesByColumn([vB, vA], { column: 'ct', direction: 'desc' });
  assert.deepEqual(byCtDesc.map((v) => v.id), ['a', 'b']);

  const byDocsDesc = sortInventoryVehiclesByColumn([vA, vB], { column: 'docs', direction: 'desc' });
  assert.deepEqual(byDocsDesc.map((v) => v.id), ['b', 'a']);

  const byExpensesDesc = sortInventoryVehiclesByColumn([vA, vB], { column: 'expenses', direction: 'desc' });
  assert.deepEqual(byExpensesDesc.map((v) => v.id), ['b', 'a']);

  const byInvestedAsc = sortInventoryVehiclesByColumn([vA, vB], { column: 'totalInvested', direction: 'asc' });
  assert.deepEqual(byInvestedAsc.map((v) => v.id), ['b', 'a']);
});

test('getVehicleTransactionBadgeInfo returns concise localized PRO/PERSO badges', () => {
  const pro = createVehicle({ purchaseStatus: 'micro' });
  const perso = createVehicle({ purchaseStatus: 'particulier' });
  const unset = createVehicle({ purchaseStatus: undefined });

  assert.deepEqual(getVehicleTransactionBadgeInfo(pro, 'fr'), { mode: 'micro', label: 'PRO' });
  assert.deepEqual(getVehicleTransactionBadgeInfo(pro, 'ru'), { mode: 'micro', label: 'ФИРМА' });
  assert.deepEqual(getVehicleTransactionBadgeInfo(perso, 'fr'), { mode: 'particulier', label: 'PERSO' });
  assert.deepEqual(getVehicleTransactionBadgeInfo(perso, 'ru'), { mode: 'particulier', label: 'ЧАСТ.' });
  assert.deepEqual(getVehicleTransactionBadgeInfo(unset, 'fr', 'particulier'), {
    mode: 'particulier',
    label: 'PERSO',
  });
});

test('partitionInventoryVehicles and filterVehiclesByInventoryScope separate active and sold vehicles cleanly', () => {
  const fleet = [
    createVehicle({ id: 'a1', status: 'preparation' }),
    createVehicle({ id: 'a2', status: 'repair' }),
    createVehicle({ id: 'a3', status: 'for_sale' }),
    createVehicle({ id: 's1', status: 'sold' }),
  ];

  const { activeVehicles, soldVehicles } = partitionInventoryVehicles(fleet);
  assert.deepEqual(activeVehicles.map((v) => v.id), ['a1', 'a2', 'a3']);
  assert.deepEqual(soldVehicles.map((v) => v.id), ['s1']);

  assert.deepEqual(
    filterVehiclesByInventoryScope(fleet, 'active').map((v) => v.id),
    ['a1', 'a2', 'a3']
  );
  assert.deepEqual(
    filterVehiclesByInventoryScope(fleet, 'sold').map((v) => v.id),
    ['s1']
  );
});

test('computeActiveInventoryStatusCounts excludes sold vehicles from all and category tallies', () => {
  const fleet = [
    createVehicle({ id: '1', status: 'preparation' }),
    createVehicle({ id: '2', status: 'repair' }),
    createVehicle({ id: '3', status: 'for_sale' }),
    createVehicle({ id: '4', status: 'sold' }),
    createVehicle({ id: '5', status: 'sold' }),
  ];

  assert.deepEqual(computeActiveInventoryStatusCounts(fleet), {
    all: 3,
    preparation: 1,
    repair: 1,
    for_sale: 1,
  });
});





