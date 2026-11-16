import test from 'node:test';
import assert from 'node:assert/strict';
import { GeneralExpense, RepairTask, Vehicle } from '../types/garage';
import {
  computeInventorySummaryTotals,
  computeVehicleInventoryFinancials,
  formatMileageKm,
  matchesVehicleSearch,
  sortInventoryVehicles,
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
