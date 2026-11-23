import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateCorporateIsToBuckets,
  computeDealershipAnalytics,
  computeFleetExpenseAnalytics,
  formatCustomExpenseCategoryLabel,
  isWithinTimeRange,
  mapGeneralExpenseCategory,
  resolveRepairExpenseDate,
} from './analytics';
import { DynamicExpenseCategory, GeneralExpense, RepairTask, Vehicle } from '../types/garage';

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

  // Aging Unsold Vehicles: strictly status === 'for_sale' && daysInStock > 30 (only v1: Oct 1 -> 40 days; v2 is 'repair', v5 is 'preparation')
  assert.equal(report.agingUnsoldVehicles.length, 1);
  assert.equal(report.agingUnsoldVehicles[0].vehicleId, 'v1');
  assert.equal(report.agingUnsoldVehicles[0].ageTier, 'watch');
  assert.equal(report.slowMovingCount, 1); // only v1 is 'for_sale' > 30 days

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

test('computeDealershipAnalytics enforces 0€ URSSAF, VL, and taxes in Particulier mode even with prior micro taxSnapshot', () => {
  const clioWithPriorMicroSnap: Vehicle = {
    ...mockVehicles[1],
    id: 'v_clio_particulier',
    purchasePrice: 8900,
    targetSalePrice: 12200,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 8900,
    status: 'sold',
    buyerInfo: {
      fullName: 'Particulier Buyer',
      address: 'Paris',
      phone: '0600000000',
      email: 'buyer@test.fr',
      salePrice: 12200,
      saleDate: '2026-11-05',
      vatRegime: 'franchise_base',
      taxSnapshot: {
        legalStatus: 'micro_entreprise',
        taxRegime: 'micro',
        taxLabel: 'Micro-entreprise',
        vatRegime: 'franchise_base',
        vatRatePercent: 0,
        vatBaseAmount: 0,
        vatAmount: 0,
        htAmount: 12200,
        ttcAmount: 12200,
        vatLegalMention: '',
        salePrice: 12200,
        purchasePrice: 8900,
        repairCostTotal: 0,
        generalExpensesTotal: 0,
        profitBeforeTaxes: 3300,
        urssafRate: 12.3,
        urssafAmount: 1500.6,
        versementLiberatoireEnabled: true,
        versementLiberatoireRate: 1,
        versementLiberatoireAmount: 122,
        microBicEstimatedTax: 0,
        corporateIsContextNote: '',
        corporateTaxEstimatedAmount: 0,
        totalTaxAmount: 1622.6,
        netProfitAfterTax: 1677.4,
        effectiveDate: '2026-01-01',
        capturedAt: '2026-11-05T10:00:00Z',
        isHistoricalSnapshot: true,
        disclaimerNote: '',
      },
    },
  };

  const partReport = computeDealershipAnalytics({
    vehicles: [clioWithPriorMicroSnap],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'none',
    taxRatePercent: 0,
    now: fixedNow,
  });

  assert.equal(partReport.salesPerformance.revenue, 12200);
  assert.equal(partReport.salesPerformance.grossProfit, 3300);
  assert.equal(partReport.salesPerformance.urssafAmount, 0);
  assert.equal(partReport.salesPerformance.versementLiberatoireAmount, 0);
  assert.equal(partReport.salesPerformance.microBicEstimatedIrAmount, 0);
  assert.equal(partReport.salesPerformance.vatAmount, 0);
  assert.equal(partReport.salesPerformance.taxAmount, 0);
  assert.equal(partReport.salesPerformance.netProfit, 3300);
  assert.equal(partReport.mostProfitableVehicles[0].taxAmount, 0);
  assert.equal(partReport.mostProfitableVehicles[0].netProfit, 3300);
});

test('computeDealershipAnalytics handles mixed fleet where Car 1 is Particulier (0 € tax) and Car 2 is Micro-entrepreneur', () => {
  const car1Particulier: Vehicle = {
    ...mockVehicles[1],
    id: 'v_mixed_part',
    purchasePrice: 8000,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 8000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Buyer 1',
      sellerProfileType: 'particulier',
      address: 'Paris',
      phone: '0600000001',
      email: 'b1@test.fr',
      salePrice: 10000,
      saleDate: '2026-11-05',
      vatRegime: 'franchise_base',
    },
  };

  const car2Micro: Vehicle = {
    ...mockVehicles[0],
    id: 'v_mixed_micro',
    purchasePrice: 8000,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 8000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Buyer 2',
      sellerProfileType: 'micro_entrepreneur',
      address: 'Lyon',
      phone: '0600000002',
      email: 'b2@test.fr',
      salePrice: 10000,
      saleDate: '2026-11-06',
      vatRegime: 'franchise_base',
    },
  };

  // Even when global setting is 'none' (Particulier), Car 2 pays 12.3% URSSAF (1230) + 1% VL (100) = 1330, while Car 1 pays 0 €
  const mixedUnderParticulierGlobal = computeDealershipAnalytics({
    vehicles: [car1Particulier, car2Micro],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'none',
    taxRatePercent: 0,
    now: fixedNow,
  });

  assert.equal(mixedUnderParticulierGlobal.salesPerformance.revenue, 20000);
  assert.equal(mixedUnderParticulierGlobal.salesPerformance.grossProfit, 4000);
  assert.equal(mixedUnderParticulierGlobal.salesPerformance.urssafAmount, 1230);
  assert.equal(mixedUnderParticulierGlobal.salesPerformance.versementLiberatoireAmount, 100);
  assert.equal(mixedUnderParticulierGlobal.salesPerformance.taxAmount, 1330);
  assert.equal(mixedUnderParticulierGlobal.salesPerformance.netProfit, 2670);

  const partRow = mixedUnderParticulierGlobal.mostProfitableVehicles.find((r) => r.vehicleId === 'v_mixed_part')!;
  const microRow = mixedUnderParticulierGlobal.mostProfitableVehicles.find((r) => r.vehicleId === 'v_mixed_micro')!;
  assert.equal(partRow.taxAmount, 0);
  assert.equal(partRow.netProfit, 2000);
  assert.equal(microRow.taxAmount, 1330);
  assert.equal(microRow.netProfit, 670);
});

test('mapGeneralExpenseCategory and formatCustomExpenseCategoryLabel handle built-in and custom categories', () => {
  const dynamicCats: DynamicExpenseCategory[] = [
    {
      id: 'transport',
      labelFr: 'Transport / Rapatriement',
      labelRu: 'Доставка / Эвакуатор',
      icon: 'Truck',
      order: 1,
    },
    {
      id: 'marketing_ads_4821',
      labelFr: 'Publicité LeBonCoin',
      labelRu: 'Реклама LeBonCoin',
      labelHy: 'Գովազդ LeBonCoin',
      labelKa: 'რეკლამა LeBonCoin',
      icon: 'Tag',
      order: 8,
    },
  ];

  // Built-in categories keep exact existing behavior even when dynamicCategories includes them
  assert.equal(mapGeneralExpenseCategory('transport', dynamicCats), 'transport');
  assert.equal(mapGeneralExpenseCategory('fuel', dynamicCats), 'fuel');
  assert.equal(mapGeneralExpenseCategory('controle_technique', dynamicCats), 'registration');
  assert.equal(mapGeneralExpenseCategory('admin', dynamicCats), 'registration');
  assert.equal(mapGeneralExpenseCategory('detailing', dynamicCats), 'detailing');
  assert.equal(mapGeneralExpenseCategory('insurance', dynamicCats), 'other');
  assert.equal(mapGeneralExpenseCategory('other', dynamicCats), 'other');

  // Configured and unconfigured custom keys preserve their ID instead of falling back to 'other'
  assert.equal(mapGeneralExpenseCategory('marketing_ads_4821', dynamicCats), 'marketing_ads_4821');
  assert.equal(mapGeneralExpenseCategory('vip-concierge_fee', dynamicCats), 'vip-concierge_fee');
  assert.equal(mapGeneralExpenseCategory('vip-concierge_fee'), 'vip-concierge_fee');
  assert.equal(mapGeneralExpenseCategory(''), 'other');

  // Clean formatting for unknown custom category keys
  assert.equal(formatCustomExpenseCategoryLabel('marketing_ads'), 'Marketing ads');
  assert.equal(formatCustomExpenseCategoryLabel('vip-concierge_fee'), 'Vip concierge fee');
  assert.equal(formatCustomExpenseCategoryLabel('  garantie_moteur  '), 'Garantie moteur');
});

test('computeFleetExpenseAnalytics and computeDealershipAnalytics resolve configured and fallback custom expense categories', () => {
  const dynamicCats: DynamicExpenseCategory[] = [
    {
      id: 'marketing_ads_4821',
      labelFr: 'Publicité & Annonces',
      labelRu: 'Реклама и объявления',
      labelHy: 'Գովազդ',
      labelKa: 'რეკლამა',
      icon: 'Sparkles',
      order: 8,
    },
  ];

  const customExpenses: GeneralExpense[] = [
    ...mockExpenses,
    {
      id: 'e_custom_cfg',
      vehicleId: 'v1',
      userId: 'u1',
      category: 'marketing_ads_4821',
      description: 'Boost annonce LaCentrale',
      amount: 150,
      date: '2026-11-06',
      createdAt: '2026-11-06T10:00:00Z',
      updatedAt: '2026-11-06T10:00:00Z',
    },
    {
      id: 'e_custom_unknown',
      vehicleId: 'v2',
      userId: 'u1',
      category: 'parking-stock_extern',
      description: 'Gardiennage mensuel',
      amount: 250,
      date: '2026-11-07',
      createdAt: '2026-11-07T10:00:00Z',
      updatedAt: '2026-11-07T10:00:00Z',
    },
  ];

  const fleetReport = computeFleetExpenseAnalytics({
    vehicles: mockVehicles,
    repairs: mockRepairs,
    expenses: customExpenses,
    timeRange: 'all',
    dynamicCategories: dynamicCats,
    now: fixedNow,
  });

  // Total = 2000 (mock) + 150 + 250 = 2400
  assert.equal(fleetReport.totalSpent, 2400);

  const configuredCat = fleetReport.categories.find((c) => c.id === 'marketing_ads_4821');
  assert.ok(configuredCat);
  assert.equal(configuredCat.labelFr, 'Publicité & Annonces');
  assert.equal(configuredCat.labelRu, 'Реклама и объявления');
  assert.equal(configuredCat.labelHy, 'Գովազդ');
  assert.equal(configuredCat.labelKa, 'რეკლამა');
  assert.equal(configuredCat.icon, 'Sparkles');
  assert.equal(configuredCat.amount, 150);
  assert.equal(configuredCat.entryCount, 1);
  assert.equal(configuredCat.topVehicle?.vehicleId, 'v1');

  const unconfiguredCat = fleetReport.categories.find((c) => c.id === 'parking-stock_extern');
  assert.ok(unconfiguredCat);
  assert.equal(unconfiguredCat.labelFr, 'Parking stock extern');
  assert.equal(unconfiguredCat.labelRu, 'Parking stock extern');
  assert.equal(unconfiguredCat.amount, 250);
  assert.equal(unconfiguredCat.topVehicle?.vehicleId, 'v2');

  // Built-in 'other' should remain 0 (custom categories did NOT collapse into 'other')
  const otherCat = fleetReport.categories.find((c) => c.id === 'other');
  assert.equal(otherCat?.amount, 0);

  // Also verify computeDealershipAnalytics forwards dynamicCategories cleanly
  const dealershipReport = computeDealershipAnalytics({
    vehicles: mockVehicles,
    repairs: mockRepairs,
    expenses: customExpenses,
    timeRange: 'all',
    dynamicCategories: dynamicCats,
    now: fixedNow,
  });
  assert.equal(
    dealershipReport.expenseBreakdown.categories.find((c) => c.id === 'marketing_ads_4821')?.labelRu,
    'Реклама и объявления'
  );
  assert.equal(
    dealershipReport.expenseBreakdown.categories.find((c) => c.id === 'parking-stock_extern')?.labelFr,
    'Parking stock extern'
  );
});

test('resolveRepairExpenseDate resolves explicit date with clean fallback chain and plots Cash Flow in the proper period', () => {
  const vehicle = {
    ...mockVehicles[0],
    id: 'v_rep_dates',
    purchaseDate: '2026-08-01',
    createdAt: '2026-08-01T10:00:00Z',
  };

  // Explicit repair.date takes precedence over createdAt/updatedAt/vehicle dates
  assert.equal(
    resolveRepairExpenseDate(
      {
        date: '2026-10-12',
        createdAt: '2026-11-05T10:00:00Z',
        updatedAt: '2026-11-06T10:00:00Z',
      },
      vehicle
    ),
    '2026-10-12'
  );

  // Blank or invalid date skips cleanly to createdAt -> updatedAt -> vehicle.purchaseDate
  assert.equal(
    resolveRepairExpenseDate(
      {
        date: 'not-a-date',
        createdAt: '2026-09-18T10:00:00Z',
        updatedAt: '2026-09-20T10:00:00Z',
      },
      vehicle
    ),
    '2026-09-18T10:00:00Z'
  );

  assert.equal(
    resolveRepairExpenseDate(
      {
        date: '',
        createdAt: '',
        updatedAt: '',
      },
      vehicle
    ),
    '2026-08-01'
  );

  // Cash Flow places repair with explicit date in August (vs createdAt in November)
  const augustRepair: RepairTask = {
    id: 'r_aug',
    vehicleId: 'v_rep_dates',
    userId: 'u1',
    title: 'Carrosserie',
    status: 'done',
    partsCost: 600,
    laborCost: 400,
    totalCost: 1000,
    date: '2026-08-14',
    createdAt: '2026-11-08T10:00:00Z',
    updatedAt: '2026-11-08T10:00:00Z',
  };
  const missingDateRepair: RepairTask = {
    id: 'r_fallback',
    vehicleId: 'v_rep_dates',
    userId: 'u1',
    title: 'Diagnostic',
    status: 'done',
    partsCost: 100,
    laborCost: 150,
    totalCost: 250,
    createdAt: '',
    updatedAt: '',
  };

  const report = computeDealershipAnalytics({
    vehicles: [vehicle],
    repairs: [augustRepair, missingDateRepair],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'none',
    now: fixedNow,
  });

  // 1000 (August repair) + 250 (fallback to purchaseDate 2026-08-01) = 1250 repairs outflow
  assert.equal(report.cashFlow.repairsOutflow, 1250);
  const augBucket = report.cashFlow.series.find((b) => b.key === '2026-08');
  assert.ok(augBucket);
  // 2026-08 bucket includes purchase 11000 + repairs 1250 = 12250
  assert.equal(augBucket.outflow, 12250);
  // Should NOT create a November bucket from createdAt when repair.date is August
  assert.equal(report.cashFlow.series.find((b) => b.key === '2026-11'), undefined);
});

test('allocateCorporateIsToBuckets and Cash Flow distribute progressive corporate IS across profitable periods', () => {
  // Unit test largest-remainder rounding for 3-way split (e.g. 1000 / 3)
  const split = allocateCorporateIsToBuckets({
    corporateIsAmount: 1000,
    corporateSales: [
      { saleDate: '2026-06-10', profitBeforeTax: 10000 },
      { saleDate: '2026-07-10', profitBeforeTax: 10000 },
      { saleDate: '2026-08-10', profitBeforeTax: 10000 },
    ],
    useMonthly: true,
  });
  assert.equal(split.length, 3);
  const splitSum = Math.round(split.reduce((s, b) => s + b.amount, 0) * 100) / 100;
  assert.equal(splitSum, 1000);
  assert.equal(split[0].amount, 333.34);
  assert.equal(split[1].amount, 333.33);
  assert.equal(split[2].amount, 333.33);

  // Loss period must not absorb IS when profitable periods exist
  const lossSkipped = allocateCorporateIsToBuckets({
    corporateIsAmount: 900,
    corporateSales: [
      { saleDate: '2026-06-10', profitBeforeTax: -2000 },
      { saleDate: '2026-07-10', profitBeforeTax: 3000 },
      { saleDate: '2026-08-10', profitBeforeTax: 6000 },
    ],
    useMonthly: true,
  });
  assert.equal(lossSkipped.find((b) => b.bucketKey === '2026-06'), undefined);
  assert.equal(lossSkipped.find((b) => b.bucketKey === '2026-07')?.amount, 300);
  assert.equal(lossSkipped.find((b) => b.bucketKey === '2026-08')?.amount, 600);

  // Full computeDealershipAnalytics verification across June, July (loss), and August under SARL progressive 15%/25% IS
  const saleJune: Vehicle = {
    ...mockVehicles[0],
    id: 'v_is_june',
    purchaseDate: '2026-05-01',
    purchasePrice: 20000,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 20000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Corp Buyer 1',
      address: 'Paris',
      phone: '0600000001',
      email: 'c1@test.fr',
      salePrice: 40000, // +20,000 gross profit (1/3 of +60k positive profit)
      saleDate: '2026-06-15',
      vatRegime: 'tva_marge',
    },
  };
  const saleJulyLoss: Vehicle = {
    ...mockVehicles[0],
    id: 'v_is_july_loss',
    purchaseDate: '2026-05-01',
    purchasePrice: 15000,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 15000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Corp Buyer 2',
      address: 'Lyon',
      phone: '0600000002',
      email: 'c2@test.fr',
      salePrice: 10000, // -5,000 loss
      saleDate: '2026-07-15',
      vatRegime: 'tva_marge',
    },
  };
  const saleAug: Vehicle = {
    ...mockVehicles[0],
    id: 'v_is_aug',
    purchaseDate: '2026-05-01',
    purchasePrice: 30000,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 30000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Corp Buyer 3',
      address: 'Nice',
      phone: '0600000003',
      email: 'c3@test.fr',
      salePrice: 70000, // +40,000 gross profit (2/3 of +60k positive profit)
      saleDate: '2026-08-15',
      vatRegime: 'tva_marge',
    },
  };

  const report = computeDealershipAnalytics({
    vehicles: [saleJune, saleJulyLoss, saleAug],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'sarl',
    now: fixedNow,
  });

  // Net taxable profit = 20000 - 5000 + 40000 = 55000
  // IS progressive: 42500*0.15 (6375) + 12500*0.25 (3125) = 9500
  assert.equal(report.salesPerformance.corporateIsAmount, 9500);
  assert.equal(report.cashFlow.taxesOutflow, 9500);

  const juneBucket = report.cashFlow.series.find((b) => b.key === '2026-06');
  const julyBucket = report.cashFlow.series.find((b) => b.key === '2026-07');
  const augBucket = report.cashFlow.series.find((b) => b.key === '2026-08');
  assert.ok(juneBucket && julyBucket && augBucket);

  // June gets 1/3 of 9500 = 3166.67; July gets 0; August gets 2/3 of 9500 = 6333.33
  assert.equal(juneBucket.outflow, 3166.67);
  assert.equal(julyBucket.outflow, 0);
  assert.equal(augBucket.outflow, 6333.33);

  const seriesOutflowSum = Math.round(report.cashFlow.series.reduce((s, b) => s + b.outflow, 0) * 100) / 100;
  assert.equal(seriesOutflowSum, report.cashFlow.outflow);
});

test('computeDealershipAnalytics filters by transactionTypeFilter (all/micro/particulier) and excludes Particulier deals via purchaseStatus from Micro taxes', () => {
  const proSold: Vehicle = {
    ...mockVehicles[0],
    id: 'v_tx_pro',
    purchaseStatus: 'micro',
    purchaseDate: '2026-10-10',
    purchasePrice: 10000,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 10000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Pro Buyer',
      address: 'Paris',
      phone: '0600000001',
      email: 'pro@test.fr',
      salePrice: 15000,
      saleDate: '2026-11-05',
      vatRegime: 'franchise_base',
    },
  };
  const partSoldByPurchaseStatus: Vehicle = {
    ...mockVehicles[1],
    id: 'v_tx_part',
    purchaseStatus: 'particulier',
    purchaseDate: '2026-10-12',
    purchasePrice: 8000,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 8000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Perso Buyer',
      address: 'Lyon',
      phone: '0600000002',
      email: 'perso@test.fr',
      salePrice: 10000,
      saleDate: '2026-11-06',
      vatRegime: 'franchise_base',
    },
  };
  const proExpense: GeneralExpense = {
    id: 'exp_tx_pro',
    vehicleId: 'v_tx_pro',
    userId: 'u1',
    category: 'fuel',
    description: 'Essence Pro',
    amount: 100,
    date: '2026-11-01',
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  };
  const partExpense: GeneralExpense = {
    id: 'exp_tx_part',
    vehicleId: 'v_tx_part',
    userId: 'u1',
    category: 'admin',
    description: 'Carte Grise Perso',
    amount: 200,
    date: '2026-11-02',
    createdAt: '2026-11-02T10:00:00Z',
    updatedAt: '2026-11-02T10:00:00Z',
  };

  // All: Pro (15000 sale, 10000 buy, 100 fuel -> 4900 gross, 1995 tax (13.3% of 15000)) + Particulier (10000 sale, 8000 buy, 200 admin -> 1800 gross, 0 tax)
  const allReport = computeDealershipAnalytics({
    vehicles: [proSold, partSoldByPurchaseStatus],
    repairs: [],
    expenses: [proExpense, partExpense],
    timeRange: 'all',
    taxRegime: 'micro',
    transactionTypeFilter: 'all',
    now: fixedNow,
  });
  assert.equal(allReport.filteredFleetCount, 2);
  assert.equal(allReport.salesPerformance.soldCount, 2);
  assert.equal(allReport.salesPerformance.revenue, 25000);
  assert.equal(allReport.salesPerformance.grossProfit, 6700);
  assert.equal(allReport.salesPerformance.taxAmount, 1995);
  assert.equal(allReport.salesPerformance.netProfit, 4705);
  assert.equal(allReport.cashFlow.generalExpensesOutflow, 300);

  // Micro filter: only v_tx_pro
  const microOnly = computeDealershipAnalytics({
    vehicles: [proSold, partSoldByPurchaseStatus],
    repairs: [],
    expenses: [proExpense, partExpense],
    timeRange: 'all',
    taxRegime: 'micro',
    transactionTypeFilter: 'micro',
    now: fixedNow,
  });
  assert.equal(microOnly.filteredFleetCount, 1);
  assert.equal(microOnly.salesPerformance.soldCount, 1);
  assert.equal(microOnly.salesPerformance.revenue, 15000);
  assert.equal(microOnly.salesPerformance.grossProfit, 4900);
  assert.equal(microOnly.salesPerformance.taxAmount, 1995);
  assert.equal(microOnly.salesPerformance.netProfit, 2905);
  assert.equal(microOnly.cashFlow.generalExpensesOutflow, 100);

  // Particulier filter: only v_tx_part, 0€ taxes
  const partOnly = computeDealershipAnalytics({
    vehicles: [proSold, partSoldByPurchaseStatus],
    repairs: [],
    expenses: [proExpense, partExpense],
    timeRange: 'all',
    taxRegime: 'micro',
    transactionTypeFilter: 'particulier',
    now: fixedNow,
  });
  assert.equal(partOnly.filteredFleetCount, 1);
  assert.equal(partOnly.salesPerformance.soldCount, 1);
  assert.equal(partOnly.salesPerformance.revenue, 10000);
  assert.equal(partOnly.salesPerformance.grossProfit, 1800);
  assert.equal(partOnly.salesPerformance.taxAmount, 0);
  assert.equal(partOnly.salesPerformance.netProfit, 1800);
  assert.equal(partOnly.cashFlow.taxesOutflow, 0);
  assert.equal(partOnly.cashFlow.generalExpensesOutflow, 200);
});

test('Cash Flow separates Atelier & Pieces (repairsOutflow) from Frais generaux (generalExpensesOutflow) across repairs and workshop expenses', () => {
  const repairRow: RepairTask = {
    id: 'r_split',
    vehicleId: 'v1',
    userId: 'u1',
    title: 'Embrayage',
    status: 'done',
    partsCost: 400,
    laborCost: 300,
    totalCost: 700,
    date: '2026-11-02',
    createdAt: '2026-11-02T10:00:00Z',
    updatedAt: '2026-11-02T10:00:00Z',
  };
  const workshopQuickExpense: GeneralExpense = {
    id: 'e_parts',
    vehicleId: 'v1',
    userId: 'u1',
    category: 'parts_labor',
    description: 'Pneus & montage',
    amount: 220,
    date: '2026-11-03',
    createdAt: '2026-11-03T10:00:00Z',
    updatedAt: '2026-11-03T10:00:00Z',
  };
  const tireQuickExpense: GeneralExpense = {
    id: 'e_tires',
    vehicleId: 'v1',
    userId: 'u1',
    category: 'tires',
    description: 'Pneus hiver',
    amount: 180,
    date: '2026-11-04',
    createdAt: '2026-11-04T10:00:00Z',
    updatedAt: '2026-11-04T10:00:00Z',
  };
  const adminExpense: GeneralExpense = {
    id: 'e_admin',
    vehicleId: 'v1',
    userId: 'u1',
    category: 'controle_technique',
    description: 'CT',
    amount: 85,
    date: '2026-11-05',
    createdAt: '2026-11-05T10:00:00Z',
    updatedAt: '2026-11-05T10:00:00Z',
  };
  const fuelExpense: GeneralExpense = {
    id: 'e_fuel',
    vehicleId: 'v1',
    userId: 'u1',
    category: 'fuel',
    description: 'Carburant',
    amount: 65,
    date: '2026-11-06',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
  };

  const report = computeDealershipAnalytics({
    vehicles: [mockVehicles[0]],
    repairs: [repairRow],
    expenses: [workshopQuickExpense, tireQuickExpense, adminExpense, fuelExpense],
    timeRange: 'month',
    taxRegime: 'micro',
    now: fixedNow,
  });

  // Atelier & Pièces = 700 + 220 + 180 = 1100; Frais généraux = 85 + 65 = 150
  assert.equal(report.cashFlow.repairsOutflow, 1100);
  assert.equal(report.cashFlow.generalExpensesOutflow, 150);
  assert.equal(report.cashFlow.outflow, 1250);
  assert.equal(report.expenseBreakdown.totalSpent, 1250);
});

test('agingUnsoldVehicles strictly includes only status === for_sale with daysInStock > 30', () => {
  const prepOld: Vehicle = {
    ...mockVehicles[0],
    id: 'v_prep_old',
    status: 'preparation',
    purchaseDate: '2026-08-01', // 101 days, but still in preparation
  };
  const repairOld: Vehicle = {
    ...mockVehicles[0],
    id: 'v_rep_old',
    status: 'repair',
    purchaseDate: '2026-08-01', // 101 days, but in repair
  };
  const forSaleExactly30: Vehicle = {
    ...mockVehicles[0],
    id: 'v_sale_30',
    status: 'for_sale',
    purchaseDate: '2026-10-11', // exactly 30 days from 2026-11-10 -> NOT > 30
  };
  const forSale31: Vehicle = {
    ...mockVehicles[0],
    id: 'v_sale_31',
    status: 'for_sale',
    purchaseDate: '2026-10-10', // 31 days -> INCLUDED
  };

  const report = computeDealershipAnalytics({
    vehicles: [prepOld, repairOld, forSaleExactly30, forSale31],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'micro',
    now: fixedNow,
  });

  assert.equal(report.agingUnsoldVehicles.length, 1);
  assert.equal(report.agingUnsoldVehicles[0].vehicleId, 'v_sale_31');
  assert.equal(report.agingUnsoldVehicles[0].daysInStock, 31);
  assert.equal(report.slowMovingCount, 1);
});

test('stockAgeDistribution categorizes active vehicles and invested capital across 4 age brackets', () => {
  const v0_30: Vehicle = {
    ...mockVehicles[0],
    id: 'age_1',
    status: 'preparation',
    purchaseDate: '2026-10-25', // 16 days
    purchasePrice: 5000,
    repairCostTotal: 200,
    generalExpensesTotal: 0,
  };
  const v31_60: Vehicle = {
    ...mockVehicles[0],
    id: 'age_2',
    status: 'repair',
    purchaseDate: '2026-09-25', // 46 days
    purchasePrice: 8000,
    repairCostTotal: 500,
    generalExpensesTotal: 100,
  };
  const v61_90: Vehicle = {
    ...mockVehicles[0],
    id: 'age_3',
    status: 'for_sale',
    purchaseDate: '2026-08-25', // 77 days
    purchasePrice: 10000,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
  };
  const v90_plus: Vehicle = {
    ...mockVehicles[0],
    id: 'age_4',
    status: 'for_sale',
    purchaseDate: '2026-07-01', // 132 days
    purchasePrice: 12000,
    repairCostTotal: 1000,
    generalExpensesTotal: 0,
  };
  const vSoldExcluded: Vehicle = {
    ...mockVehicles[2],
    id: 'age_sold',
    status: 'sold',
    purchaseDate: '2026-06-01',
    purchasePrice: 99999,
  };

  const report = computeDealershipAnalytics({
    vehicles: [v0_30, v31_60, v61_90, v90_plus, vSoldExcluded],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'micro',
    now: fixedNow,
  });

  const byId = new Map(report.stockAgeDistribution.map((b) => [b.id, b]));
  assert.equal(byId.get('0_30')?.vehicleCount, 1);
  assert.equal(byId.get('0_30')?.totalInvested, 5200);
  assert.equal(byId.get('0_30')?.sharePercent, 25);
  assert.equal(byId.get('31_60')?.vehicleCount, 1);
  assert.equal(byId.get('31_60')?.totalInvested, 8600);
  assert.equal(byId.get('61_90')?.vehicleCount, 1);
  assert.equal(byId.get('61_90')?.totalInvested, 10000);
  assert.equal(byId.get('90_plus')?.vehicleCount, 1);
  assert.equal(byId.get('90_plus')?.totalInvested, 13000);
});

test('salesEconomics and salesChannels compute period averages and channel breakdown respecting transactionTypeFilter', () => {
  const sLbcPro: Vehicle = {
    ...mockVehicles[2],
    id: 's_lbc_pro',
    status: 'sold',
    purchaseStatus: 'micro',
    purchaseDate: '2026-10-01',
    purchasePrice: 10000,
    repairCostTotal: 1000,
    generalExpensesTotal: 500,
    buyerInfo: {
      fullName: 'Client LBC',
      sellerProfileType: 'micro_entrepreneur',
      address: 'Lyon',
      phone: '0600000001',
      email: 'a@b.fr',
      salePrice: 15000,
      saleDate: '2026-10-21', // 20 days
      saleChannel: 'leboncoin',
    },
  };
  const sDirectPro: Vehicle = {
    ...mockVehicles[2],
    id: 's_direct_pro',
    status: 'sold',
    purchaseStatus: 'micro',
    purchaseDate: '2026-10-01',
    purchasePrice: 8000,
    repairCostTotal: 500,
    generalExpensesTotal: 0,
    buyerInfo: {
      fullName: 'Client Direct',
      sellerProfileType: 'micro_entrepreneur',
      address: 'Paris',
      phone: '0600000002',
      email: 'c@d.fr',
      salePrice: 12000,
      saleDate: '2026-10-11', // 10 days
      saleChannel: 'direct',
    },
  };
  const sReferralParticulier: Vehicle = {
    ...mockVehicles[2],
    id: 's_ref_part',
    status: 'sold',
    purchaseStatus: 'particulier',
    purchaseDate: '2026-10-01',
    purchasePrice: 6000,
    repairCostTotal: 500,
    generalExpensesTotal: 0,
    buyerInfo: {
      fullName: 'Ami Particulier',
      sellerProfileType: 'particulier',
      address: 'Nice',
      phone: '0600000003',
      email: 'e@f.fr',
      salePrice: 9000,
      saleDate: '2026-10-31', // 30 days
      saleChannel: 'referral',
    },
  };

  const microCfg = {
    legalStatus: 'micro_entreprise' as const,
    businessTaxRegime: 'micro' as const,
    socialContributionRate: 12.3,
    versementLiberatoireEnabled: true,
    versementLiberatoireRate: 1,
    microBicAbattementPercent: 71,
    microBicIncomeTaxRate: 11,
    isRateMode: 'progressive_15_25' as const,
    corporateTaxRateReduced: 15,
    corporateTaxRateStandard: 25,
    corporateTaxCustomRate: 25,
    reducedIsEligible: true,
    reducedIsThreshold: 42500,
    annualTaxableProfit: 0,
    financialYear: 2026,
    vatRegime: 'franchise_base' as const,
    vatRatePercent: 0,
    effectiveDates: { urssaf: '2026-01-01', is: '2026-01-01', vat: '2026-01-01' },
  };

  const allReport = computeDealershipAnalytics({
    vehicles: [sLbcPro, sDirectPro, sReferralParticulier],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'micro',
    frenchTaxConfig: microCfg,
    now: fixedNow,
  });

  // Avg purchase = (10000 + 8000 + 6000)/3 = 8000
  // Avg sale = (15000 + 12000 + 9000)/3 = 12000
  // Avg expenses = (1500 + 500 + 500)/3 = 833.33
  assert.equal(allReport.salesEconomics.averagePurchasePrice, 8000);
  assert.equal(allReport.salesEconomics.averageSalePrice, 12000);
  assert.equal(allReport.salesEconomics.averageExpensesPerVehicle, 833.33);

  const lbc = allReport.salesChannels.find((c) => c.channelId === 'leboncoin')!;
  const direct = allReport.salesChannels.find((c) => c.channelId === 'direct')!;
  const ref = allReport.salesChannels.find((c) => c.channelId === 'referral')!;
  assert.equal(lbc.salesCount, 1);
  assert.equal(lbc.revenue, 15000);
  // Gross 3500 - 13.3% * 15000 (1995) = 1505
  assert.equal(lbc.netProfit, 1505);
  assert.equal(lbc.averageDaysToSell, 20);
  assert.equal(direct.salesCount, 1);
  assert.equal(direct.averageDaysToSell, 10);
  assert.equal(ref.salesCount, 1);
  // Particulier: 0% tax -> gross 2500 = net 2500
  assert.equal(ref.netProfit, 2500);

  // Scoped to Pro only -> referral (Particulier) drops to 0
  const proOnly = computeDealershipAnalytics({
    vehicles: [sLbcPro, sDirectPro, sReferralParticulier],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'micro',
    frenchTaxConfig: microCfg,
    transactionTypeFilter: 'micro',
    now: fixedNow,
  });
  assert.equal(proOnly.salesPerformance.soldCount, 2);
  assert.equal(proOnly.salesChannels.find((c) => c.channelId === 'referral')?.salesCount, 0);
  assert.equal(proOnly.salesEconomics.averagePurchasePrice, 9000);
});

test('computeDealershipAnalytics always applies Business URSSAF/VL per micro vehicle even if profileType is particulier', () => {
  const fixedNow = new Date('2026-10-25T12:00:00Z');
  const microCfg = {
    legalStatus: 'micro_entreprise' as const,
    businessTaxRegime: 'micro' as const,
    socialContributionRate: 12.3,
    versementLiberatoireEnabled: true,
    versementLiberatoireRate: 1,
    microBicAbattementPercent: 71,
    microBicIncomeTaxRate: 11,
    isRateMode: 'progressive_15_25' as const,
    corporateTaxRateReduced: 15,
    corporateTaxRateStandard: 25,
    corporateTaxCustomRate: 25,
    reducedIsEligible: true,
    reducedIsThreshold: 42500,
    annualTaxableProfit: 0,
    financialYear: 2026,
    vatRegime: 'franchise_base' as const,
    vatRatePercent: 0,
    effectiveDates: { urssaf: '2026-01-01', is: '2026-01-01', vat: '2026-01-01' },
  };

  const proCar: Vehicle = {
    ...mockVehicles[0],
    id: 'pro_car_1',
    status: 'sold',
    purchaseStatus: 'micro',
    purchaseDate: '2026-10-01',
    purchasePrice: 7000,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    buyerInfo: {
      fullName: 'Client Pro Deal',
      address: '10 Rue Pro, 69001 Lyon',
      phone: '0600000001',
      email: 'client1@test.fr',
      salePrice: 10000,
      saleDate: '2026-10-15',
      sellerProfileType: 'micro_entrepreneur',
    },
  };

  const personalCar: Vehicle = {
    ...mockVehicles[1],
    id: 'pers_car_1',
    status: 'sold',
    purchaseStatus: 'particulier',
    purchaseDate: '2026-10-01',
    purchasePrice: 4000,
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    buyerInfo: {
      fullName: 'Client Perso Deal',
      address: '20 Rue Perso, 69002 Lyon',
      phone: '0600000002',
      email: 'client2@test.fr',
      salePrice: 6000,
      saleDate: '2026-10-18',
      sellerProfileType: 'particulier',
    },
  };

  // Even if caller passes profileType='particulier', per-vehicle purchaseStatus='micro' takes precedence
  const report = computeDealershipAnalytics({
    vehicles: [proCar, personalCar],
    repairs: [],
    expenses: [],
    timeRange: 'all',
    taxRegime: 'micro',
    frenchTaxConfig: microCfg,
    profileType: 'particulier',
    now: fixedNow,
  });

  assert.equal(report.salesPerformance.soldCount, 2);
  assert.equal(report.salesPerformance.taxedDealsCount, 1);
  assert.equal(report.salesPerformance.particulierDealsCount, 1);
  // Gross profit = (10000 - 7000) + (6000 - 4000) = 5000
  assert.equal(report.salesPerformance.grossProfit, 5000);
  // Commercial tax applies ONLY to proCar (10000 * 13.3% = 1330), personalCar pays 0
  assert.equal(report.salesPerformance.urssafAmount, 1230);
  assert.equal(report.salesPerformance.versementLiberatoireAmount, 100);
  assert.equal(report.salesPerformance.taxAmount, 1330);
  assert.equal(report.salesPerformance.netProfit, 3670);
});






