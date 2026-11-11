/**
 * Pure financial calculation utilities for AutoGarage Manager.
 * Handles auto-aggregation of repair parts, outsourced labor, general expenses,
 * total capital invested, net profit / margin, and ROI percentages.
 */

export interface RepairItem {
  partsCost: number;
  laborCost: number;
}

export interface ExpenseItem {
  amount: number;
}

export interface FinancialSummary {
  repairPartsTotal: number;
  repairLaborTotal: number;
  repairCostTotal: number;
  generalExpensesTotal: number;
  totalExpenses: number;
  totalInvested: number;
  effectiveSalePrice: number;
  netProfit: number;
  marginPercentage: number;
  roiPercentage: number;
}

export function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  if (!year || !month || !day) return dateStr;
  return `${day}-${month}-${year}`;
}

export function calculateRepairTotals(repairs: RepairItem[] = []): {
  partsTotal: number;
  laborTotal: number;
  total: number;
} {
  const partsTotal = repairs.reduce((acc, r) => acc + (Number(r.partsCost) || 0), 0);
  const laborTotal = repairs.reduce((acc, r) => acc + (Number(r.laborCost) || 0), 0);
  return {
    partsTotal: roundToTwo(partsTotal),
    laborTotal: roundToTwo(laborTotal),
    total: roundToTwo(partsTotal + laborTotal),
  };
}

export function calculateExpenseTotals(expenses: ExpenseItem[] = []): number {
  const total = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  return roundToTwo(total);
}

export function calculateVehicleFinancials(params: {
  purchasePrice: number;
  targetSalePrice?: number;
  finalSalePrice?: number;
  repairs?: RepairItem[];
  expenses?: ExpenseItem[];
}): FinancialSummary {
  const purchasePrice = Number(params.purchasePrice) || 0;
  const repairs = params.repairs || [];
  const expenses = params.expenses || [];

  const repairTotals = calculateRepairTotals(repairs);
  const generalExpensesTotal = calculateExpenseTotals(expenses);
  const totalExpenses = roundToTwo(repairTotals.total + generalExpensesTotal);
  const totalInvested = roundToTwo(purchasePrice + totalExpenses);

  const effectiveSalePrice = params.finalSalePrice !== undefined && params.finalSalePrice > 0
    ? Number(params.finalSalePrice)
    : (Number(params.targetSalePrice) || 0);

  const netProfit = effectiveSalePrice > 0
    ? roundToTwo(effectiveSalePrice - totalInvested)
    : 0;

  const marginPercentage = effectiveSalePrice > 0
    ? roundToTwo((netProfit / effectiveSalePrice) * 100)
    : 0;

  const roiPercentage = totalInvested > 0 && effectiveSalePrice > 0
    ? roundToTwo((netProfit / totalInvested) * 100)
    : 0;

  return {
    repairPartsTotal: repairTotals.partsTotal,
    repairLaborTotal: repairTotals.laborTotal,
    repairCostTotal: repairTotals.total,
    generalExpensesTotal,
    totalExpenses,
    totalInvested,
    effectiveSalePrice,
    netProfit,
    marginPercentage,
    roiPercentage,
  };
}

export function getEffectiveSalePrice(vehicle: {
  status: string;
  targetSalePrice?: number;
  buyerInfo?: { salePrice?: number };
}): number {
  if (vehicle.status === 'sold' && vehicle.buyerInfo?.salePrice && Number(vehicle.buyerInfo.salePrice) > 0) {
    return Number(vehicle.buyerInfo.salePrice);
  }
  if (vehicle.targetSalePrice && Number(vehicle.targetSalePrice) > 0) {
    return Number(vehicle.targetSalePrice);
  }
  return 0;
}

export function hasDefinedSalePrice(vehicle: {
  status: string;
  targetSalePrice?: number;
  buyerInfo?: { salePrice?: number };
}): boolean {
  return getEffectiveSalePrice(vehicle) > 0;
}

export type TaxRegime = 'sarl' | 'micro' | 'custom' | 'none';

export interface SaleFinancialReport {
  salePrice: number;
  purchasePrice: number;
  repairCostTotal: number;
  generalExpensesTotal: number;
  totalExpenses: number;
  grossMargin: number;
  taxRegime: TaxRegime;
  taxRatePercent: number;
  taxLabel: string;
  taxAmount: number;
  netProfitAfterTax: number;
}

export function resolveTaxRatePercent(
  taxRegime?: TaxRegime,
  taxRatePercent?: number
): { regime: TaxRegime; rate: number; label: string } {
  const regime: TaxRegime = taxRegime || 'sarl';
  let rate: number;
  if (typeof taxRatePercent === 'number' && !Number.isNaN(taxRatePercent) && taxRatePercent >= 0) {
    rate = taxRatePercent;
  } else if (regime === 'micro') {
    rate = 12.3;
  } else if (regime === 'none') {
    rate = 0;
  } else {
    rate = 15;
  }

  const label =
    regime === 'sarl'
      ? `SARL ${rate}%`
      : regime === 'micro'
      ? `Micro ${rate}%`
      : regime === 'none'
      ? '0%'
      : `${rate}%`;

  return { regime, rate, label };
}

export function calculateSaleTaxReport(params: {
  salePrice: number;
  purchasePrice: number;
  repairCostTotal: number;
  generalExpensesTotal?: number;
  taxRegime?: TaxRegime;
  taxRatePercent?: number;
}): SaleFinancialReport {
  const salePrice = roundToTwo(Number(params.salePrice) || 0);
  const purchasePrice = roundToTwo(Number(params.purchasePrice) || 0);
  const repairCostTotal = roundToTwo(Number(params.repairCostTotal) || 0);
  const generalExpensesTotal = roundToTwo(Number(params.generalExpensesTotal) || 0);
  const totalExpenses = roundToTwo(repairCostTotal + generalExpensesTotal);
  const grossMargin = roundToTwo(salePrice - purchasePrice - totalExpenses);

  const { regime, rate, label } = resolveTaxRatePercent(
    params.taxRegime,
    params.taxRatePercent
  );

  const taxAmount =
    grossMargin > 0 && rate > 0
      ? roundToTwo(grossMargin * (rate / 100))
      : 0;
  const netProfitAfterTax = roundToTwo(grossMargin - taxAmount);

  return {
    salePrice,
    purchasePrice,
    repairCostTotal,
    generalExpensesTotal,
    totalExpenses,
    grossMargin,
    taxRegime: regime,
    taxRatePercent: rate,
    taxLabel: label,
    taxAmount,
    netProfitAfterTax,
  };
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}
