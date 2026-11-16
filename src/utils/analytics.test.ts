import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDealershipAnalytics,
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

test('isWithinTimeRange filters dates accurately for today, week, month, quarter, year, custom, all', () => {
  // Today (2026-11-10)
  assert.equal(isWithinTimeRange('2026-11-10', 'today', fixedNow), true);
  assert.equal(isWithinTimeRange('2026-11-09', 'today', fixedNow), false);

  // Week (last 7 days including today: 2026-11-04..2026-11-10)
  assert.equal(isWithinTimeRange('2026-11-05', 'week', fixedNow), true);
  assert.equal(isWithinTimeRange('2026-11-01', 'week', fixedNow), false);

  // Month (last 30 days)
  assert.equal(isWithinTimeRange('2026-11-01', 'month', fixedNow), true);
  assert.equal(isWithinTimeRange('2026-09-01', 'month', fixedNow), false);

  // Quarter & 3months
  assert.equal(isWithinTimeRange('2026-09-01', 'quarter', fixedNow), true);
  assert.equal(isWithinTimeRange('2026-09-01', '3months', fixedNow), true);
  assert.equal(isWithinTimeRange('2026-06-01', '6months', fixedNow), true);
  assert.equal(isWithinTimeRange('2025-12-01', 'year', fixedNow), true);
  assert.equal(isWithinTimeRange('2020-01-01', 'year', fixedNow), false);
  assert.equal(isWithinTimeRange('2020-01-01', 'all', fixedNow), true);

  // Custom inclusive range
  assert.equal(
    isWithinTimeRange('2026-10-25', 'custom', fixedNow, {
      startDate: '2026-10-20',
      endDate: '2026-10-30',
    }),
    true
  );
  assert.equal(
    isWithinTimeRange('2026-11-01', 'custom', fixedNow, {
      startDate: '2026-10-20',
      endDate: '2026-10-30',
    }),
    false
  );
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

test('computeDealershipAnalytics separates Revenue, Gross Profit, and Net Profit after tax + computes stock, cash flow, and rankings', () => {
  const soldRecent: Vehicle = {
    id: 'v3',
    userId: 'u1',
    make: 'Audi',
    model: 'A3',
    trim: 'S-Line',
    year: 2022,
    mileage: 30000,
    vin: 'WAUZZZ11111111111',
    registrationNumber: 'CC-333-CC',
    purchaseDate: '2026-10-15',
    purchasePrice: 18000,
    targetSalePrice: 23000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Marc Test',
      address: 'Paris',
      phone: '0600000000',
      email: 'marc@test.fr',
      salePrice: 22000,
      saleDate: '2026-11-05', // 21 days to sell
    },
    photos: [],
    documents: [],
    repairCostTotal: 500,
    generalExpensesTotal: 500,
    totalExpenses: 1000,
    totalInvested: 19000,
    netProfit: 3000,
    marginPercentage: 13.64,
    createdAt: '2026-10-15T10:00:00Z',
    updatedAt: '2026-11-05T10:00:00Z',
  };

  const soldOlder: Vehicle = {
    id: 'v4',
    userId: 'u1',
    make: 'BMW',
    model: '118i',
    trim: 'M Sport',
    year: 2020,
    mileage: 55000,
    vin: 'WBA11111111111111',
    registrationNumber: 'DD-444-DD',
    purchaseDate: '2026-07-01',
    purchasePrice: 14000,
    targetSalePrice: 17500,
    status: 'sold',
    buyerInfo: {
      fullName: 'Claire Older',
      address: 'Lyon',
      phone: '0611111111',
      email: 'claire@test.fr',
      salePrice: 17000,
      saleDate: '2026-08-10', // 40 days to sell
    },
    photos: [],
    documents: [],
    repairCostTotal: 600,
    generalExpensesTotal: 400,
    totalExpenses: 1000,
    totalInvested: 15000,
    netProfit: 2000,
    marginPercentage: 11.76,
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-08-10T10:00:00Z',
  };

  const unpricedActive: Vehicle = {
    id: 'v5',
    userId: 'u1',
    make: 'Dacia',
    model: 'Sandero',
    trim: '',
    year: 2021,
    mileage: 40000,
    vin: '',
    registrationNumber: 'EE-555-EE',
    purchaseDate: '2026-11-08',
    purchasePrice: 7000,
    targetSalePrice: 0,
    status: 'preparation',
    photos: [],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 7000,
    netProfit: 0,
    marginPercentage: 0,
    createdAt: '2026-11-08T10:00:00Z',
    updatedAt: '2026-11-08T10:00:00Z',
  };

  const repairs: RepairTask[] = [
    ...mockRepairs,
    {
      id: 'r3',
      vehicleId: 'v3',
      userId: 'u1',
      title: 'Pneus',
      status: 'done',
      partsCost: 400,
      laborCost: 100,
      totalCost: 500,
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
  ];

  const expenses: GeneralExpense[] = [
    ...mockExpenses,
    {
      id: 'e4',
      vehicleId: 'v3',
      userId: 'u1',
      category: 'admin',
      description: 'Formalités',
      amount: 500,
      date: '2026-10-22',
      createdAt: '2026-10-22T10:00:00Z',
      updatedAt: '2026-10-22T10:00:00Z',
    },
  ];

  const report = computeDealershipAnalytics({
    vehicles: [...mockVehicles, soldRecent, soldOlder, unpricedActive],
    repairs,
    expenses,
    timeRange: 'month', // 2026-10-11 .. 2026-11-10
    taxRegime: 'sarl',
    taxRatePercent: 15,
    now: fixedNow,
  });

  // Inventory (active: v1, v2, v5)
  // v1: invested 11800, target 14500 (potential +2700)
  // v2: invested 10200, target 12000 (potential +1800)
  // v5: invested 7000, target 0 (unpriced -> stockValue uses invested 7000, potential 0)
  assert.equal(report.inventory.activeCount, 3);
  assert.equal(report.inventory.totalInvestedInStock, 29000);
  assert.equal(report.inventory.totalStockValue, 33500); // 14500 + 12000 + 7000
  assert.equal(report.inventory.totalPotentialProfit, 4500); // 2700 + 1800
  assert.equal(report.inventory.unpricedCount, 1);

  // Sales Performance (month includes only v3 sold on 2026-11-05)
  // Revenue = 22000
  // Gross Profit = 22000 - (18000 + 500 + 500) = 3000
  // Tax (SARL 15% of 3000) = 450
  // Net Profit = 3000 - 450 = 2550
  assert.equal(report.salesPerformance.soldCount, 1);
  assert.equal(report.salesPerformance.revenue, 22000);
  assert.equal(report.salesPerformance.grossProfit, 3000);
  assert.equal(report.salesPerformance.taxAmount, 450);
  assert.equal(report.salesPerformance.netProfit, 2550);
  assert.notEqual(report.salesPerformance.revenue, report.salesPerformance.grossProfit);
  assert.notEqual(report.salesPerformance.grossProfit, report.salesPerformance.netProfit);
  assert.equal(report.salesPerformance.averageNetMarginEuro, 2550);
  assert.equal(report.salesPerformance.averageDaysToSell, 21);

  // Monthly Snapshot
  assert.equal(report.monthlySnapshot.monthlyRevenue, 22000);
  // Expenses in last 30 days: r1(500) + e1(80) + e2(220) + r3(500) + e4(500) = 1800
  assert.equal(report.monthlySnapshot.monthlyExpenses, 1800);

  // Cash Flow in month:
  // Inflow: 22000 (v3 sale)
  // Outflow: purchases in month (v3: 18000 on Oct 15 + v5: 7000 on Nov 08 = 25000) + repairs(1000) + expenses(800) + tax(450) = 27250
  assert.equal(report.cashFlow.inflow, 22000);
  assert.equal(report.cashFlow.vehiclePurchasesOutflow, 25000);
  assert.equal(report.cashFlow.repairsOutflow, 1000);
  assert.equal(report.cashFlow.generalExpensesOutflow, 800);
  assert.equal(report.cashFlow.taxesOutflow, 450);
  assert.equal(report.cashFlow.outflow, 27250);
  assert.equal(report.cashFlow.netCashFlow, -5250);
  assert.ok(report.cashFlow.series.length >= 1);

  // Aging Unsold Vehicles: v2 (May 15 -> 179 days), v1 (Oct 1 -> 40 days), v5 (Nov 8 -> 2 days)
  assert.equal(report.agingUnsoldVehicles[0].vehicleId, 'v2');
  assert.equal(report.agingUnsoldVehicles[0].ageTier, 'critical');
  assert.equal(report.agingUnsoldVehicles[1].vehicleId, 'v1');
  assert.equal(report.agingUnsoldVehicles[1].ageTier, 'watch');
  assert.equal(report.slowMovingCount, 2); // v2 and v1 >= 30 days

  // Check ALL time range includes both v3 and v4
  const allReport = computeDealershipAnalytics({
    vehicles: [...mockVehicles, soldRecent, soldOlder, unpricedActive],
    repairs,
    expenses,
    timeRange: 'all',
    taxRegime: 'sarl',
    taxRatePercent: 15,
    now: fixedNow,
  });
  assert.equal(allReport.salesPerformance.soldCount, 2);
  assert.equal(allReport.salesPerformance.revenue, 39000);
  assert.equal(allReport.salesPerformance.grossProfit, 5000);
  assert.equal(allReport.salesPerformance.taxAmount, 750);
  assert.equal(allReport.salesPerformance.netProfit, 4250);
  assert.equal(allReport.mostProfitableVehicles[0].vehicleId, 'v3');
  assert.equal(allReport.mostProfitableVehicles[1].vehicleId, 'v4');
});

test('computeDealershipAnalytics computes progressive SARL/SAS IS on €60,000 profit and Micro turnover taxes', () => {
  const bigSaleVehicle: Vehicle = {
    ...mockVehicles[0],
    id: 'v_big',
    purchasePrice: 40000,
    targetSalePrice: 100000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Client Corporate',
      address: 'Lyon',
      phone: '0600000000',
      email: 'corp@test.fr',
      salePrice: 100000,
      saleDate: '2026-11-05',
      vatRegime: 'tva_marge',
    },
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 40000,
    netProfit: 60000,
    marginPercentage: 60,
  };

  // SARL Progressive IS: 42,500 * 15% (6,375) + 17,500 * 25% (4,375) = 10,750 €
  const sarlReport = computeDealershipAnalytics({
    vehicles: [bigSaleVehicle],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'sarl',
    now: fixedNow,
  });
  assert.equal(sarlReport.salesPerformance.grossProfit, 60000);
  assert.equal(sarlReport.salesPerformance.corporateIsAmount, 10750);
  assert.equal(sarlReport.salesPerformance.taxAmount, 10750);
  assert.equal(sarlReport.salesPerformance.netProfit, 49250);
  assert.equal(sarlReport.salesPerformance.corporateIsBreakdown?.bracket15Tax, 6375);
  assert.equal(sarlReport.salesPerformance.corporateIsBreakdown?.bracket25Tax, 4375);

  // Micro-entreprise exact rule: Purchase 2,000, Repairs 5,000, Sale 5,000 -> Turnover 5,000
  const lossMicroVehicle: Vehicle = {
    ...mockVehicles[0],
    id: 'v_micro_loss',
    purchasePrice: 2000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Client Micro',
      address: 'Paris',
      phone: '0600000000',
      email: 'micro@test.fr',
      salePrice: 5000,
      saleDate: '2026-11-05',
      vatRegime: 'franchise_base',
    },
    repairCostTotal: 5000,
    generalExpensesTotal: 0,
    totalExpenses: 5000,
    totalInvested: 7000,
    netProfit: -2000,
    marginPercentage: -40,
  };

  const microVlYes = computeDealershipAnalytics({
    vehicles: [lossMicroVehicle],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'micro',
    frenchTaxConfig: {
      legalStatus: 'micro_entreprise',
      businessTaxRegime: 'micro',
      socialContributionRate: 12.3,
      versementLiberatoireEnabled: true,
      versementLiberatoireRate: 1,
      microBicAbattementPercent: 71,
      microBicIncomeTaxRate: 11,
      isRateMode: 'progressive_15_25',
      corporateTaxRateReduced: 15,
      corporateTaxRateStandard: 25,
      corporateTaxCustomRate: 25,
      reducedIsEligible: true,
      reducedIsThreshold: 42500,
      annualTaxableProfit: 0,
      financialYear: 2026,
      vatRegime: 'franchise_base',
      vatRatePercent: 20,
      effectiveDates: { urssaf: '2026-01-01', is: '2026-01-01', vat: '2026-01-01' },
    },
    now: fixedNow,
  });
  assert.equal(microVlYes.salesPerformance.revenue, 5000);
  assert.equal(microVlYes.salesPerformance.grossProfit, -2000);
  assert.equal(microVlYes.salesPerformance.urssafAmount, 615);
  assert.equal(microVlYes.salesPerformance.versementLiberatoireAmount, 50);
  assert.equal(microVlYes.salesPerformance.taxAmount, 665);
  assert.equal(microVlYes.salesPerformance.netProfit, -2665);

  const microVlNo = computeDealershipAnalytics({
    vehicles: [lossMicroVehicle],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'micro',
    frenchTaxConfig: {
      legalStatus: 'micro_entreprise',
      businessTaxRegime: 'micro',
      socialContributionRate: 12.3,
      versementLiberatoireEnabled: false,
      versementLiberatoireRate: 1,
      microBicAbattementPercent: 71,
      microBicIncomeTaxRate: 11,
      isRateMode: 'progressive_15_25',
      corporateTaxRateReduced: 15,
      corporateTaxRateStandard: 25,
      corporateTaxCustomRate: 25,
      reducedIsEligible: true,
      reducedIsThreshold: 42500,
      annualTaxableProfit: 0,
      financialYear: 2026,
      vatRegime: 'franchise_base',
      vatRatePercent: 20,
      effectiveDates: { urssaf: '2026-01-01', is: '2026-01-01', vat: '2026-01-01' },
    },
    now: fixedNow,
  });
  assert.equal(microVlNo.salesPerformance.urssafAmount, 615);
  assert.equal(microVlNo.salesPerformance.versementLiberatoireAmount, 0);
  assert.equal(microVlNo.salesPerformance.taxAmount, 615);
  assert.ok(microVlNo.salesPerformance.microBicEstimatedIrAmount > 0);
});

