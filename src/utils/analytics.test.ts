import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFleetExpenseAnalytics,
  isWithinTimeRange,
  mapGeneralExpenseCategory,
} from './analytics';
import { Vehicle, RepairTask, GeneralExpense } from '../types/garage';

const mockVehicles: Vehicle[] = [
  {
    id: 'v1',
    userId: 'u1',
    make: 'Peugeot',
    model: '208',
    trim: 'GT',
    year: 2021,
    mileage: 45000,
    vin: 'VF3UPHNK0MT129841',
    registrationNumber: 'AA-111-AA',
    purchaseDate: '2026-10-01',
    purchasePrice: 11000,
    targetSalePrice: 14500,
    status: 'for_sale',
    photos: [],
    documents: [],
    repairCostTotal: 500,
    generalExpensesTotal: 300,
    totalExpenses: 800,
    totalInvested: 11800,
    netProfit: 2700,
    marginPercentage: 18.6,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  },
  {
    id: 'v2',
    userId: 'u1',
    make: 'Renault',
    model: 'Clio V',
    trim: 'Intens',
    year: 2020,
    mileage: 60000,
    vin: 'VF1RJA00365891234',
    purchaseDate: '2026-05-15',
    purchasePrice: 9000,
    targetSalePrice: 12000,
    status: 'repair',
    photos: [],
    documents: [],
    repairCostTotal: 1000,
    generalExpensesTotal: 200,
    totalExpenses: 1200,
    totalInvested: 10200,
    netProfit: 1800,
    marginPercentage: 15,
    createdAt: '2026-05-15T10:00:00Z',
    updatedAt: '2026-05-15T10:00:00Z',
  },
];

const mockRepairs: RepairTask[] = [
  {
    id: 'r1',
    vehicleId: 'v1',
    userId: 'u1',
    title: 'Freins',
    status: 'done',
    partsCost: 300,
    laborCost: 200,
    totalCost: 500,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 'r2',
    vehicleId: 'v2',
    userId: 'u1',
    title: 'Distribution',
    status: 'done',
    partsCost: 600,
    laborCost: 400,
    totalCost: 1000,
    createdAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-01T10:00:00Z',
  },
];

const mockExpenses: GeneralExpense[] = [
  {
    id: 'e1',
    vehicleId: 'v1',
    userId: 'u1',
    category: 'fuel',
    description: 'Plein SP95',
    amount: 80,
    date: '2026-11-05',
    createdAt: '2026-11-05T10:00:00Z',
    updatedAt: '2026-11-05T10:00:00Z',
  },
  {
    id: 'e2',
    vehicleId: 'v1',
    userId: 'u1',
    category: 'transport',
    description: 'Plateau',
    amount: 220,
    date: '2026-10-25',
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
  },
  {
    id: 'e3',
    vehicleId: 'v2',
    userId: 'u1',
    category: 'admin',
    description: 'Carte Grise',
    amount: 200,
    date: '2026-05-20',
    createdAt: '2026-05-20T10:00:00Z',
    updatedAt: '2026-05-20T10:00:00Z',
  },
];

const fixedNow = new Date('2026-11-10T12:00:00Z');

test('mapGeneralExpenseCategory routes all categories into 6 analytics buckets', () => {
  assert.equal(mapGeneralExpenseCategory('fuel'), 'fuel');
  assert.equal(mapGeneralExpenseCategory('detailing'), 'detailing');
  assert.equal(mapGeneralExpenseCategory('admin'), 'registration');
  assert.equal(mapGeneralExpenseCategory('controle_technique'), 'registration');
  assert.equal(mapGeneralExpenseCategory('transport'), 'transport');
  assert.equal(mapGeneralExpenseCategory('insurance'), 'other');
  assert.equal(mapGeneralExpenseCategory('other'), 'other');
});

test('isWithinTimeRange filters dates accurately for month, 3months, 6months, year, all', () => {
  assert.equal(isWithinTimeRange('2026-11-01', 'month', fixedNow), true);
  assert.equal(isWithinTimeRange('2026-09-01', 'month', fixedNow), false);
  assert.equal(isWithinTimeRange('2026-09-01', '3months', fixedNow), true);
  assert.equal(isWithinTimeRange('2026-06-01', '6months', fixedNow), true);
  assert.equal(isWithinTimeRange('2025-12-01', 'year', fixedNow), true);
  assert.equal(isWithinTimeRange('2020-01-01', 'year', fixedNow), false);
  assert.equal(isWithinTimeRange('2020-01-01', 'all', fixedNow), true);
});

test('computeFleetExpenseAnalytics computes totals, percentages, and top vehicle for all time', () => {
  const result = computeFleetExpenseAnalytics({
    vehicles: mockVehicles,
    repairs: mockRepairs,
    expenses: mockExpenses,
    timeRange: 'all',
    now: fixedNow,
  });

  // Total = 500 + 1000 + 80 + 220 + 200 = 2000
  assert.equal(result.totalSpent, 2000);
  assert.equal(result.impactedVehiclesCount, 2);
  assert.equal(result.topCategory?.id, 'parts_labor');
  assert.equal(result.topCategory?.amount, 1500);
  assert.equal(result.topCategory?.percentage, 75);
  assert.equal(result.topCategory?.topVehicle?.vehicleId, 'v2');
  assert.equal(result.topCategory?.topVehicle?.amount, 1000);

  const fuelCat = result.categories.find((c) => c.id === 'fuel');
  assert.equal(fuelCat?.amount, 80);
  assert.equal(fuelCat?.percentage, 4);
});

test('computeFleetExpenseAnalytics respects last 30 days filter', () => {
  const result = computeFleetExpenseAnalytics({
    vehicles: mockVehicles,
    repairs: mockRepairs,
    expenses: mockExpenses,
    timeRange: 'month',
    now: fixedNow,
  });

  // Only r1 (500), e1 (80), e2 (220) are within 30 days of 2026-11-10
  assert.equal(result.totalSpent, 800);
  assert.equal(result.impactedVehiclesCount, 1);
  assert.equal(result.categories.find((c) => c.id === 'registration')?.amount, 0);
});
