import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRepairTotals,
  calculateExpenseTotals,
  calculateSaleTaxReport,
  calculateVehicleFinancials,
  canDisplaySaleFinancialReport,
  getEffectiveSalePrice,
  getRealizedSalePrice,
  hasDefinedSalePrice,
  roundToTwo,
} from './finance';

test('roundToTwo rounds values accurately', () => {
  assert.equal(roundToTwo(10.556), 10.56);
  assert.equal(roundToTwo(10.551), 10.55);
});

test('calculateRepairTotals sums parts and labor separately and combined', () => {
  const repairs = [
    { partsCost: 120.5, laborCost: 80 },
    { partsCost: 45, laborCost: 55.5 },
  ];
  const totals = calculateRepairTotals(repairs);
  assert.equal(totals.partsTotal, 165.5);
  assert.equal(totals.laborTotal, 135.5);
  assert.equal(totals.total, 301);
});

test('calculateExpenseTotals sums non-repair general expenses', () => {
  const expenses = [
    { amount: 150 },
    { amount: 85 },
    { amount: 40.5 },
  ];
  assert.equal(calculateExpenseTotals(expenses), 275.5);
});

test('calculateVehicleFinancials calculates total capital invested, net profit, margin & ROI', () => {
  // Vehicle bought for 7500€
  // Repairs: 140€ parts + 90€ labor = 230€
  // Expenses: 150€ transport + 85€ CT = 235€
  // Total expenses = 465€
  // Total invested = 7500 + 465 = 7965€
  // Sold for 9800€
  // Net profit = 9800 - 7965 = 1835€
  // Margin % = (1835 / 9800) * 100 = 18.72%
  // ROI % = (1835 / 7965) * 100 = 23.04%
  const summary = calculateVehicleFinancials({
    purchasePrice: 7500,
    finalSalePrice: 9800,
    repairs: [
      { partsCost: 80, laborCost: 50 },
      { partsCost: 60, laborCost: 40 },
    ],
    expenses: [
      { amount: 150 },
      { amount: 85 },
    ],
  });

  assert.equal(summary.repairPartsTotal, 140);
  assert.equal(summary.repairLaborTotal, 90);
  assert.equal(summary.repairCostTotal, 230);
  assert.equal(summary.generalExpensesTotal, 235);
  assert.equal(summary.totalExpenses, 465);
  assert.equal(summary.totalInvested, 7965);
  assert.equal(summary.netProfit, 1835);
  assert.equal(summary.marginPercentage, 18.72);
  assert.equal(summary.roiPercentage, 23.04);
});

test('calculateVehicleFinancials falls back to targetSalePrice if not yet sold', () => {
  const summary = calculateVehicleFinancials({
    purchasePrice: 5000,
    targetSalePrice: 7000,
    repairs: [{ partsCost: 200, laborCost: 100 }],
    expenses: [{ amount: 100 }],
  });

  assert.equal(summary.totalExpenses, 400);
  assert.equal(summary.totalInvested, 5400);
  assert.equal(summary.netProfit, 1600);
  assert.equal(summary.marginPercentage, 22.86);
});

test('calculateVehicleFinancials and hasDefinedSalePrice return 0/false when sellingPrice is unset', () => {
  const summary = calculateVehicleFinancials({
    purchasePrice: 1200,
    targetSalePrice: 0,
  });

  assert.equal(summary.effectiveSalePrice, 0);
  assert.equal(summary.netProfit, 0);
  assert.equal(summary.marginPercentage, 0);
  assert.equal(summary.roiPercentage, 0);
  assert.equal(hasDefinedSalePrice({ status: 'preparation', targetSalePrice: 0 }), false);
  assert.equal(getEffectiveSalePrice({ status: 'sold', targetSalePrice: 0, buyerInfo: { salePrice: 3000 } }), 3000);
});

test('calculateSaleTaxReport computes Profit Before Taxes, Micro turnover taxes, SARL annual IS separation, and VAT breakdown', () => {
  // SARL / SAS: corporate IS is annual (not blind flat 15% per car), so single-vehicle report isolates Profit Before Taxes
  const sarlReport = calculateSaleTaxReport({
    salePrice: 5000,
    purchasePrice: 3000,
    repairCostTotal: 500,
    taxRegime: 'sarl',
  });
  assert.equal(sarlReport.grossMargin, 1500);
  assert.equal(sarlReport.taxAmount, 0);
  assert.equal(sarlReport.netProfitAfterTax, 1500);
  assert.match(sarlReport.corporateIsContextNote, /42 500/);

  // Micro-entreprise default (12.3% URSSAF + 1% VL = 13.3% strictly on Turnover 5000 = 665€)
  const microReport = calculateSaleTaxReport({
    salePrice: 5000,
    purchasePrice: 2000,
    repairCostTotal: 5000,
    taxRegime: 'micro',
  });
  assert.equal(microReport.grossMargin, -2000);
  assert.equal(microReport.urssafAmount, 615);
  assert.equal(microReport.versementLiberatoireAmount, 50);
  assert.equal(microReport.taxAmount, 665);
  assert.equal(microReport.netProfitAfterTax, -2665);

  // Micro-entreprise without VL (only 12.3% URSSAF on Turnover)
  const microNoVlReport = calculateSaleTaxReport({
    salePrice: 5000,
    purchasePrice: 3000,
    repairCostTotal: 500,
    taxRegime: 'micro',
    taxRatePercent: 12.3,
  });
  assert.equal(microNoVlReport.urssafAmount, 615);
  assert.equal(microNoVlReport.versementLiberatoireAmount, 0);
  assert.equal(microNoVlReport.taxAmount, 615);
});

test('canDisplaySaleFinancialReport and getRealizedSalePrice strictly require status === sold and salePrice > 0', () => {
  assert.equal(
    canDisplaySaleFinancialReport({ status: 'preparation', buyerInfo: { salePrice: 5000 } }),
    false
  );
  assert.equal(
    canDisplaySaleFinancialReport({ status: 'repair', buyerInfo: { salePrice: 5000 } }),
    false
  );
  assert.equal(
    canDisplaySaleFinancialReport({ status: 'for_sale', buyerInfo: { salePrice: 5000 } }),
    false
  );
  assert.equal(
    canDisplaySaleFinancialReport({ status: 'sold', buyerInfo: { salePrice: 0 } }),
    false
  );
  assert.equal(
    canDisplaySaleFinancialReport({ status: 'sold' }),
    false
  );
  assert.equal(
    getRealizedSalePrice({ status: 'for_sale', buyerInfo: { salePrice: 5000 } }),
    0
  );
  assert.equal(
    canDisplaySaleFinancialReport({ status: 'sold', buyerInfo: { salePrice: 5000 } }),
    true
  );
  assert.equal(
    getRealizedSalePrice({ status: 'sold', buyerInfo: { salePrice: 5000 } }),
    5000
  );
});

test('calculateSaleTaxReport guarantees 0€ taxes and empty disclaimer on historical Particulier snapshots', () => {
  const report = calculateSaleTaxReport({
    salePrice: 13990,
    purchasePrice: 10400,
    repairCostTotal: 310,
    generalExpensesTotal: 180,
    taxSnapshot: {
      legalStatus: 'particulier',
      taxRegime: 'none',
      taxLabel: 'Particulier (Sans fiscalité professionnelle)',
      vatRegime: 'franchise_base',
      vatRatePercent: 0,
      vatBaseAmount: 0,
      vatAmount: 0,
      htAmount: 13990,
      ttcAmount: 13990,
      vatLegalMention: '',
      salePrice: 13990,
      purchasePrice: 10400,
      repairCostTotal: 310,
      generalExpensesTotal: 180,
      profitBeforeTaxes: 3100,
      urssafRate: 12.3,
      urssafAmount: 999,
      versementLiberatoireEnabled: true,
      versementLiberatoireRate: 1,
      versementLiberatoireAmount: 99,
      microBicEstimatedTax: 50,
      corporateIsContextNote: '',
      corporateTaxEstimatedAmount: 0,
      totalTaxAmount: 1098,
      netProfitAfterTax: 2002,
      effectiveDate: '2026-10-01',
      capturedAt: '2026-10-01T10:00:00Z',
      isHistoricalSnapshot: true,
      disclaimerNote: 'stale',
    },
  });

  assert.equal(report.taxRegime, 'none');
  assert.equal(report.taxAmount, 0);
  assert.equal(report.urssafAmount, 0);
  assert.equal(report.versementLiberatoireAmount, 0);
  assert.equal(report.vatAmount, 0);
  assert.equal(report.grossMargin, 3100);
  assert.equal(report.netProfitAfterTax, 3100);
  assert.equal(report.disclaimerNote, '');
});

