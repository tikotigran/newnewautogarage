/**
 * Pure financial calculation utilities for AutoGarage Manager.
 * Handles auto-aggregation of repair parts, outsourced labor, general expenses,
 * total capital invested, net profit / margin, and ROI percentages.
 */

import {
  FrenchTaxConfiguration,
  GeneralExpense,
  RepairTask,
  TaxRegime,
  TransactionTaxSnapshot,
  VatRegime,
} from '../types/garage';
import {
  buildTransactionTaxSnapshot,
  FRENCH_TAX_DEFAULTS,
  normalizeFrenchTaxConfig,
} from './frenchTaxEngine';

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

export function getRealizedSalePrice(vehicle: {
  status: string;
  buyerInfo?: { salePrice?: number };
}): number {
  if (
    vehicle.status === 'sold' &&
    vehicle.buyerInfo?.salePrice !== undefined &&
    Number(vehicle.buyerInfo.salePrice) > 0
  ) {
    return Number(vehicle.buyerInfo.salePrice);
  }
  return 0;
}

export function canDisplaySaleFinancialReport(vehicle: {
  status: string;
  buyerInfo?: { salePrice?: number };
}): boolean {
  return getRealizedSalePrice(vehicle) > 0;
}

export type { TaxRegime };

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
  // Separated French tax & VAT fields
  urssafAmount: number;
  versementLiberatoireEnabled: boolean;
  versementLiberatoireAmount: number;
  microBicEstimatedTax: number;
  corporateIsContextNote: string;
  vatRegime: VatRegime;
  vatRatePercent: number;
  vatAmount: number;
  htAmount: number;
  ttcAmount: number;
  vatLegalMention: string;
  isHistoricalSnapshot: boolean;
  disclaimerNote: string;
}

export function resolveTaxRatePercent(
  taxRegime?: TaxRegime,
  taxRatePercent?: number,
  frenchTaxConfig?: FrenchTaxConfiguration
): { regime: TaxRegime; rate: number; label: string } {
  const normalized = normalizeFrenchTaxConfig(
    {
      taxRegime,
      taxRatePercent,
      frenchTaxConfig,
    },
    frenchTaxConfig || undefined
  );

  const regime = normalized.businessTaxRegime;

  if (regime === 'micro') {
    const combined =
      normalized.socialContributionRate +
      (normalized.versementLiberatoireEnabled ? normalized.versementLiberatoireRate : 0);
    return {
      regime: 'micro',
      rate: roundToTwo(combined),
      label: normalized.versementLiberatoireEnabled
        ? `Micro ${roundToTwo(combined)}% CA (URSSAF ${normalized.socialContributionRate}% + VL ${normalized.versementLiberatoireRate}%)`
        : `Micro ${normalized.socialContributionRate}% CA (URSSAF seul)`,
    };
  }

  if (regime === 'sarl' || regime === 'sas') {
    const rate =
      normalized.isRateMode === 'custom'
        ? normalized.corporateTaxCustomRate
        : normalized.isRateMode === 'standard_25' || !normalized.reducedIsEligible
        ? normalized.corporateTaxRateStandard
        : normalized.corporateTaxRateReduced;
    return {
      regime,
      rate: roundToTwo(rate),
      label:
        normalized.isRateMode === 'progressive_15_25' && normalized.reducedIsEligible
          ? `${regime.toUpperCase()} IS (${normalized.corporateTaxRateReduced}% ≤ 42 500 € / ${normalized.corporateTaxRateStandard}%)`
          : `${regime.toUpperCase()} IS (${rate}%)`,
    };
  }

  if (regime === 'none') {
    return { regime: 'none', rate: 0, label: '0%' };
  }

  const customRate =
    typeof taxRatePercent === 'number' && !Number.isNaN(taxRatePercent) && taxRatePercent >= 0
      ? taxRatePercent
      : normalized.corporateTaxCustomRate;
  return { regime: 'custom', rate: roundToTwo(customRate), label: `${roundToTwo(customRate)}%` };
}

export function calculateSaleTaxReport(params: {
  salePrice: number;
  purchasePrice: number;
  repairCostTotal: number;
  generalExpensesTotal?: number;
  taxRegime?: TaxRegime;
  taxRatePercent?: number;
  frenchTaxConfig?: FrenchTaxConfiguration;
  vatRegime?: VatRegime;
  vatRatePercent?: number;
  taxSnapshot?: TransactionTaxSnapshot;
}): SaleFinancialReport {
  if (params.taxSnapshot?.isHistoricalSnapshot) {
    const snap = params.taxSnapshot;
    const isParticulierSnap = snap.taxRegime === 'none' || snap.legalStatus === 'particulier';
    const totalExpenses = roundToTwo(snap.repairCostTotal + snap.generalExpensesTotal);
    const rate = isParticulierSnap
      ? 0
      : snap.taxRegime === 'micro'
      ? roundToTwo(
          snap.urssafRate + (snap.versementLiberatoireEnabled ? snap.versementLiberatoireRate : 0)
        )
      : 0;
    return {
      salePrice: snap.salePrice,
      purchasePrice: snap.purchasePrice,
      repairCostTotal: snap.repairCostTotal,
      generalExpensesTotal: snap.generalExpensesTotal,
      totalExpenses,
      grossMargin: snap.profitBeforeTaxes,
      taxRegime: isParticulierSnap ? 'none' : snap.taxRegime,
      taxRatePercent: rate,
      taxLabel: snap.taxLabel,
      taxAmount: isParticulierSnap ? 0 : snap.totalTaxAmount,
      netProfitAfterTax: isParticulierSnap ? snap.profitBeforeTaxes : snap.netProfitAfterTax,
      urssafAmount: isParticulierSnap ? 0 : snap.urssafAmount,
      versementLiberatoireEnabled: isParticulierSnap ? false : snap.versementLiberatoireEnabled,
      versementLiberatoireAmount: isParticulierSnap ? 0 : snap.versementLiberatoireAmount,
      microBicEstimatedTax: isParticulierSnap ? 0 : snap.microBicEstimatedTax,
      corporateIsContextNote: isParticulierSnap ? '' : snap.corporateIsContextNote,
      vatRegime: isParticulierSnap ? 'franchise_base' : snap.vatRegime,
      vatRatePercent: isParticulierSnap ? 0 : snap.vatRatePercent,
      vatAmount: isParticulierSnap ? 0 : snap.vatAmount,
      htAmount: isParticulierSnap ? snap.salePrice : snap.htAmount,
      ttcAmount: snap.ttcAmount,
      vatLegalMention: isParticulierSnap ? '' : snap.vatLegalMention,
      isHistoricalSnapshot: true,
      disclaimerNote: isParticulierSnap
        ? ''
        : snap.disclaimerNote ?? FRENCH_TAX_DEFAULTS.DISCLAIMER_FR,
    };
  }

  const snap = buildTransactionTaxSnapshot({
    salePrice: params.salePrice,
    purchasePrice: params.purchasePrice,
    repairCostTotal: params.repairCostTotal,
    generalExpensesTotal: Number(params.generalExpensesTotal) || 0,
    settings: {
      taxRegime: params.taxRegime,
      taxRatePercent: params.taxRatePercent,
      frenchTaxConfig: params.frenchTaxConfig,
    },
    vatRegimeOverride: params.vatRegime,
    vatRateOverride: params.vatRatePercent,
  });

  const { rate } = resolveTaxRatePercent(
    params.taxRegime,
    params.taxRatePercent,
    params.frenchTaxConfig
  );

  return {
    salePrice: snap.salePrice,
    purchasePrice: snap.purchasePrice,
    repairCostTotal: snap.repairCostTotal,
    generalExpensesTotal: snap.generalExpensesTotal,
    totalExpenses: roundToTwo(snap.repairCostTotal + snap.generalExpensesTotal),
    grossMargin: snap.profitBeforeTaxes,
    taxRegime: snap.taxRegime,
    taxRatePercent: rate,
    taxLabel: snap.taxLabel,
    taxAmount: snap.totalTaxAmount,
    netProfitAfterTax: snap.netProfitAfterTax,
    urssafAmount: snap.urssafAmount,
    versementLiberatoireEnabled: snap.versementLiberatoireEnabled,
    versementLiberatoireAmount: snap.versementLiberatoireAmount,
    microBicEstimatedTax: snap.microBicEstimatedTax,
    corporateIsContextNote: snap.corporateIsContextNote,
    vatRegime: snap.vatRegime,
    vatRatePercent: snap.vatRatePercent,
    vatAmount: snap.vatAmount,
    htAmount: snap.htAmount,
    ttcAmount: snap.ttcAmount,
    vatLegalMention: snap.vatLegalMention,
    isHistoricalSnapshot: false,
    disclaimerNote: snap.disclaimerNote,
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
