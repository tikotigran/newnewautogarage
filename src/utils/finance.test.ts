import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRepairTotals,
  calculateExpenseTotals,
  calculateSaleTaxReport,
  calculateVehicleFinancials,
  getEffectiveSalePrice,
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

test('calculateSaleTaxReport computes gross margin, tax from settings, and net profit after tax (Peugeot 207 case)', () => {
  // Exact Peugeot 207 scenario: 5000 sale - 3000 purchase - 500 repairs = 1500 gross; SARL 15% = 225; net = 1275
  const sarlReport = calculateSaleTaxReport({
    salePrice: 5000,
    purchasePrice: 3000,
    repairCostTotal: 500,
    taxRegime: 'sarl',
    taxRatePercent: 15,
  });
  assert.equal(sarlReport.grossMargin, 1500);
  assert.equal(sarlReport.taxLabel, 'SARL 15%');
  assert.equal(sarlReport.taxAmount, 225);
  assert.equal(sarlReport.netProfitAfterTax, 1275);

  // Micro-entreprise default rate (12.3%)
  const microReport = calculateSaleTaxReport({
    salePrice: 5000,
    purchasePrice: 3000,
    repairCostTotal: 500,
    taxRegime: 'micro',
  });
  assert.equal(microReport.taxLabel, 'Micro 12.3%');
  assert.equal(microReport.taxAmount, 184.5);
  assert.equal(microReport.netProfitAfterTax, 1315.5);

  // Zero tax when gross margin is <= 0
  const lossReport = calculateSaleTaxReport({
    salePrice: 3000,
    purchasePrice: 3200,
    repairCostTotal: 500,
    taxRegime: 'sarl',
    taxRatePercent: 15,
  });
  assert.equal(lossReport.grossMargin, -700);
  assert.equal(lossReport.taxAmount, 0);
  assert.equal(lossReport.netProfitAfterTax, -700);
});
