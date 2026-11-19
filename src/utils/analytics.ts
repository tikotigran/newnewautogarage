import {
  Vehicle,
  RepairTask,
  GeneralExpense,
  GeneralExpenseCategory,
  VehicleStatus,
  DynamicExpenseCategory,
  FrenchTaxConfiguration,
} from '../types/garage';
import {
  calculateSaleTaxReport,
  getRealizedSalePrice,
  resolveTaxRatePercent,
  roundToTwo,
  SaleFinancialReport,
  TaxRegime,
} from './finance';
import {
  buildProfileSettingsPatch,
  calculateCorporateIS,
  CorporateIsResult,
  normalizeFrenchTaxConfig,
} from './frenchTaxEngine';

export type BuiltInAnalyticsExpenseCategoryId =
  | 'parts_labor'
  | 'fuel'
  | 'detailing'
  | 'registration'
  | 'transport'
  | 'other';

export type AnalyticsExpenseCategoryId =
  | BuiltInAnalyticsExpenseCategoryId
  | (string & {});

export type AnalyticsTimeRange =
  | 'today'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom'
  | 'all'
  | '3months'
  | '6months';

export interface CustomDateRange {
  startDate?: string;
  endDate?: string;
}

export interface AnalyticsCategoryMeta {
  id: AnalyticsExpenseCategoryId;
  labelFr: string;
  labelRu: string;
  labelHy: string;
  labelKa: string;
  colorClass: string;
  barColorHex: string;
  icon?: string;
}

export const ANALYTICS_CATEGORIES: AnalyticsCategoryMeta[] = [
  {
    id: 'parts_labor',
    labelFr: 'Pièces & Main d’œuvre',
    labelRu: 'Запчасти и ремонт',
    labelHy: 'Պահեստամասեր և աշխատանք',
    labelKa: 'ნაწილები და ხელობა',
    colorClass: 'bg-amber-500',
    barColorHex: '#f59e0b',
  },
  {
    id: 'fuel',
    labelFr: 'Carburant',
    labelRu: 'Топливо',
    labelHy: 'Վառելիք',
    labelKa: 'საწვავი',
    colorClass: 'bg-sky-500',
    barColorHex: '#0ea5e9',
  },
  {
    id: 'detailing',
    labelFr: 'Lavage / Detailing',
    labelRu: 'Мойка / Детейлинг',
    labelHy: 'Լվացում / Դեթեյլինգ',
    labelKa: 'რეცხვა / დეტეილინგი',
    colorClass: 'bg-emerald-500',
    barColorHex: '#10b981',
  },
  {
    id: 'registration',
    labelFr: 'Immatriculation & Carte Grise',
    labelRu: 'Оформление и Carte Grise',
    labelHy: 'Գրանցում և Carte Grise',
    labelKa: 'რეგისტრაცია და Carte Grise',
    colorClass: 'bg-indigo-500',
    barColorHex: '#6366f1',
  },
  {
    id: 'transport',
    labelFr: 'Dépannage / Logistique',
    labelRu: 'Эвакуатор / Логистика',
    labelHy: 'Էվակուատոր / Լոգիստիկա',
    labelKa: 'ევაკუატორი / ლოგისტიკა',
    colorClass: 'bg-orange-500',
    barColorHex: '#f97316',
  },
  {
    id: 'other',
    labelFr: 'Autres frais généraux',
    labelRu: 'Прочие накладные расходы',
    labelHy: 'Այլ ընդհանուր ծախսեր',
    labelKa: 'სხვა ზოგადი ხარჯები',
    colorClass: 'bg-slate-500',
    barColorHex: '#64748b',
  },
];

export interface NormalizedExpenseEntry {
  id: string;
  vehicleId: string;
  categoryId: AnalyticsExpenseCategoryId;
  amount: number;
  date: string;
  description: string;
}

export interface VehicleContribution {
  vehicleId: string;
  vehicleName: string;
  year: number;
  registrationNumber?: string;
  vin: string;
  amount: number;
  percentageOfCategory: number;
  entryCount: number;
}

export interface CategoryBreakdown {
  id: AnalyticsExpenseCategoryId;
  labelFr: string;
  labelRu: string;
  labelHy: string;
  labelKa: string;
  colorClass: string;
  barColorHex: string;
  icon?: string;
  amount: number;
  percentage: number;
  entryCount: number;
  topVehicle: VehicleContribution | null;
  vehicleContributions: VehicleContribution[];
}

export interface FleetExpenseAnalytics {
  totalSpent: number;
  totalEntries: number;
  impactedVehiclesCount: number;
  topCategory: CategoryBreakdown | null;
  categories: CategoryBreakdown[];
  entries: NormalizedExpenseEntry[];
}

export interface InventoryValuationMetrics {
  activeCount: number;
  totalStockValue: number;
  totalTargetListingValue: number;
  totalInvestedInStock: number;
  totalPotentialProfit: number;
  pricedCount: number;
  unpricedCount: number;
}

export interface SalesPerformanceMetrics {
  soldCount: number;
  /** 1. Revenue — Total gross sales proceeds (never mixed with Gross or Net Profit) */
  revenue: number;
  /** 2. Gross Profit — Profit Before Taxes: Sale proceeds minus purchase price, repairs, and expenses */
  grossProfit: number;
  /** Total estimated tax deducted (Micro URSSAF/VL + Corporate IS + Custom) */
  taxAmount: number;
  /** 3. Net Profit — Gross Profit after taxes */
  netProfit: number;
  taxLabel: string;
  grossMarginPercent: number;
  netMarginPercent: number;
  averageGrossMarginEuro: number;
  averageNetMarginEuro: number;
  averageDaysToSell: number | null;
  // Strictly separated tax & VAT buckets
  urssafAmount: number;
  versementLiberatoireAmount: number;
  microBicEstimatedIrAmount: number;
  corporateIsAmount: number;
  vatAmount: number;
  corporateIsBreakdown?: CorporateIsResult;
  particulierDealsCount?: number;
  taxedDealsCount?: number;
}

export interface MonthlySnapshotMetrics {
  monthlyRevenue: number;
  monthlySoldCount: number;
  monthlyExpenses: number;
  monthlyPurchases: number;
}

export interface CashFlowBucket {
  key: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashFlowMetrics {
  inflow: number;
  outflow: number;
  netCashFlow: number;
  vehiclePurchasesOutflow: number;
  repairsOutflow: number;
  generalExpensesOutflow: number;
  taxesOutflow: number;
  series: CashFlowBucket[];
}

export interface ProfitableVehicleRow {
  vehicleId: string;
  vehicleName: string;
  year: number;
  registrationNumber?: string;
  saleDate: string;
  daysToSell: number | null;
  purchasePrice: number;
  totalExpenses: number;
  totalInvested: number;
  revenue: number;
  grossProfit: number;
  taxAmount: number;
  netProfit: number;
  netMarginPercent: number;
  roiPercent: number;
}

export type AgingTier = 'fresh' | 'watch' | 'aging' | 'critical';

export interface AgingVehicleRow {
  vehicleId: string;
  vehicleName: string;
  year: number;
  status: VehicleStatus;
  registrationNumber?: string;
  purchaseDate: string;
  daysInStock: number;
  totalInvested: number;
  targetSalePrice: number;
  potentialProfit: number | null;
  ageTier: AgingTier;
}

export interface DealershipAnalyticsReport {
  inventory: InventoryValuationMetrics;
  salesPerformance: SalesPerformanceMetrics;
  monthlySnapshot: MonthlySnapshotMetrics;
  cashFlow: CashFlowMetrics;
  mostProfitableVehicles: ProfitableVehicleRow[];
  agingUnsoldVehicles: AgingVehicleRow[];
  slowMovingCount: number;
  averageDaysInStock: number | null;
  expenseBreakdown: FleetExpenseAnalytics;
}

const CUSTOM_CATEGORY_COLORS: Array<{ colorClass: string; barColorHex: string }> = [
  { colorClass: 'bg-violet-500', barColorHex: '#8b5cf6' },
  { colorClass: 'bg-teal-500', barColorHex: '#14b8a6' },
  { colorClass: 'bg-pink-500', barColorHex: '#ec4899' },
  { colorClass: 'bg-cyan-500', barColorHex: '#06b6d4' },
  { colorClass: 'bg-rose-500', barColorHex: '#f43f5e' },
  { colorClass: 'bg-lime-500', barColorHex: '#84cc16' },
];

const BUILT_IN_GENERAL_EXPENSE_KEYS = new Set<string>([
  'transport',
  'fuel',
  'controle_technique',
  'detailing',
  'admin',
  'insurance',
  'other',
]);

export function formatCustomExpenseCategoryLabel(categoryKey: string): string {
  const spaced = categoryKey
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return 'Other';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function getCustomCategoryColor(categoryKey: string): { colorClass: string; barColorHex: string } {
  let hash = 0;
  for (let i = 0; i < categoryKey.length; i += 1) {
    hash = (hash * 31 + categoryKey.charCodeAt(i)) >>> 0;
  }
  return CUSTOM_CATEGORY_COLORS[hash % CUSTOM_CATEGORY_COLORS.length];
}

function buildCustomCategoryMeta(
  categoryId: string,
  dynamicMap: Map<string, DynamicExpenseCategory>
): AnalyticsCategoryMeta {
  const configured = dynamicMap.get(categoryId);
  const fallbackLabel = formatCustomExpenseCategoryLabel(categoryId);
  const { colorClass, barColorHex } = getCustomCategoryColor(categoryId);
  if (configured) {
    const primaryLabel = configured.labelFr?.trim() || configured.labelRu?.trim() || fallbackLabel;
    return {
      id: categoryId,
      labelFr: primaryLabel,
      labelRu: configured.labelRu?.trim() || primaryLabel,
      labelHy: configured.labelHy?.trim() || primaryLabel,
      labelKa: configured.labelKa?.trim() || primaryLabel,
      colorClass,
      barColorHex,
      icon: configured.icon,
    };
  }
  return {
    id: categoryId,
    labelFr: fallbackLabel,
    labelRu: fallbackLabel,
    labelHy: fallbackLabel,
    labelKa: fallbackLabel,
    colorClass,
    barColorHex,
    icon: 'Tag',
  };
}

export function mapGeneralExpenseCategory(
  category: GeneralExpenseCategory | string,
  dynamicCategories?: DynamicExpenseCategory[]
): AnalyticsExpenseCategoryId {
  const trimmed = typeof category === 'string' ? category.trim() : '';
  if (!trimmed) return 'other';

  switch (trimmed) {
    case 'parts_labor':
      return 'parts_labor';
    case 'fuel':
      return 'fuel';
    case 'detailing':
      return 'detailing';
    case 'admin':
    case 'controle_technique':
      return 'registration';
    case 'transport':
      return 'transport';
    case 'insurance':
    case 'other':
      return 'other';
    default: {
      if (dynamicCategories) {
        const matched = dynamicCategories.find((c) => c.id === trimmed);
        if (matched) return matched.id;
      }
      return trimmed;
    }
  }
}

export function parseExpenseDateMs(dateStr?: string): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  // Support YYYY-MM-DD or full ISO strings
  const ms = Date.parse(trimmed.length === 10 ? `${trimmed}T12:00:00Z` : trimmed);
  return Number.isNaN(ms) ? null : ms;
}

function getUtcDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractDayKey(dateStr?: string): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const ms = parseExpenseDateMs(trimmed);
  if (ms === null) return null;
  return getUtcDayKey(new Date(ms));
}

function dayKeyToUtcNoonMs(dayKey: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  return Date.parse(`${dayKey}T12:00:00Z`);
}

export function isWithinTimeRange(
  dateStr: string | undefined,
  range: AnalyticsTimeRange,
  now: Date = new Date(),
  customRange?: CustomDateRange
): boolean {
  if (range === 'all') return true;
  const itemMs = parseExpenseDateMs(dateStr);
  if (itemMs === null) return false;

  const itemDayKey = extractDayKey(dateStr);
  const nowDayKey = getUtcDayKey(now);

  if (range === 'today') {
    return itemDayKey === nowDayKey;
  }

  if (range === 'custom') {
    const startKey = customRange?.startDate?.trim() || '';
    const endKey = customRange?.endDate?.trim() || '';
    if (!startKey && !endKey) return true;
    const itemDayMs = itemDayKey ? dayKeyToUtcNoonMs(itemDayKey) : itemMs;
    if (itemDayMs === null) return false;

    const startMs = startKey ? dayKeyToUtcNoonMs(startKey) : null;
    const endMs = endKey ? dayKeyToUtcNoonMs(endKey) : null;

    if (startMs !== null && endMs !== null && startMs > endMs) {
      return itemDayMs >= endMs && itemDayMs <= startMs;
    }
    if (startMs !== null && itemDayMs < startMs) return false;
    if (endMs !== null && itemDayMs > endMs) return false;
    return true;
  }

  if (range === 'week') {
    const itemDayMs = itemDayKey ? dayKeyToUtcNoonMs(itemDayKey) : itemMs;
    const nowDayMs = dayKeyToUtcNoonMs(nowDayKey);
    if (itemDayMs === null || nowDayMs === null) return false;
    const weekStartMs = nowDayMs - 6 * 86400000;
    return itemDayMs >= weekStartMs && itemDayMs <= nowDayMs + 86400000;
  }

  const cutoff = new Date(now.getTime());
  if (range === 'month') {
    cutoff.setDate(cutoff.getDate() - 30);
  } else if (range === 'quarter' || range === '3months') {
    cutoff.setMonth(cutoff.getMonth() - 3);
  } else if (range === '6months') {
    cutoff.setMonth(cutoff.getMonth() - 6);
  } else if (range === 'year') {
    cutoff.setFullYear(cutoff.getFullYear() - 1);
  }

  return itemMs >= cutoff.getTime() && itemMs <= now.getTime() + 86400000;
}

export function computeFleetExpenseAnalytics(params: {
  vehicles: Vehicle[];
  repairs: RepairTask[];
  expenses: GeneralExpense[];
  timeRange: AnalyticsTimeRange;
  customRange?: CustomDateRange;
  dynamicCategories?: DynamicExpenseCategory[];
  now?: Date;
}): FleetExpenseAnalytics {
  const {
    vehicles,
    repairs,
    expenses,
    timeRange,
    customRange,
    dynamicCategories,
    now = new Date(),
  } = params;
  const vehicleMap = new Map<string, Vehicle>();
  for (const v of vehicles) {
    vehicleMap.set(v.id, v);
  }

  const dynamicCatMap = new Map<string, DynamicExpenseCategory>();
  if (dynamicCategories) {
    for (const cat of dynamicCategories) {
      if (cat.id) dynamicCatMap.set(cat.id, cat);
    }
  }

  const normalized: NormalizedExpenseEntry[] = [];

  for (const r of repairs) {
    const amount = Number(r.totalCost ?? (Number(r.partsCost) || 0) + (Number(r.laborCost) || 0)) || 0;
    if (amount <= 0) continue;
    const veh = vehicleMap.get(r.vehicleId);
    const effectiveDate = r.createdAt || veh?.purchaseDate || '';
    if (!isWithinTimeRange(effectiveDate, timeRange, now, customRange)) continue;
    normalized.push({
      id: r.id,
      vehicleId: r.vehicleId,
      categoryId: 'parts_labor',
      amount: roundToTwo(amount),
      date: effectiveDate,
      description: r.title,
    });
  }

  for (const e of expenses) {
    const amount = Number(e.amount) || 0;
    if (amount <= 0) continue;
    const veh = vehicleMap.get(e.vehicleId);
    const effectiveDate = e.date || e.createdAt || veh?.purchaseDate || '';
    if (!isWithinTimeRange(effectiveDate, timeRange, now, customRange)) continue;
    normalized.push({
      id: e.id,
      vehicleId: e.vehicleId,
      categoryId: mapGeneralExpenseCategory(e.category, dynamicCategories),
      amount: roundToTwo(amount),
      date: effectiveDate,
      description: e.description,
    });
  }

  const totalSpent = roundToTwo(normalized.reduce((acc, item) => acc + item.amount, 0));
  const impactedVehicleIds = new Set(normalized.map((item) => item.vehicleId));

  const builtInIdSet = new Set<string>(ANALYTICS_CATEGORIES.map((m) => m.id));
  const allCategoryMetas: AnalyticsCategoryMeta[] = [...ANALYTICS_CATEGORIES];
  const seenCustomIds = new Set<string>();

  if (dynamicCategories) {
    for (const cat of dynamicCategories) {
      if (
        cat.id &&
        !BUILT_IN_GENERAL_EXPENSE_KEYS.has(cat.id) &&
        !builtInIdSet.has(cat.id) &&
        !seenCustomIds.has(cat.id)
      ) {
        seenCustomIds.add(cat.id);
        allCategoryMetas.push(buildCustomCategoryMeta(cat.id, dynamicCatMap));
      }
    }
  }

  for (const entry of normalized) {
    if (!builtInIdSet.has(entry.categoryId) && !seenCustomIds.has(entry.categoryId)) {
      seenCustomIds.add(entry.categoryId);
      allCategoryMetas.push(buildCustomCategoryMeta(entry.categoryId, dynamicCatMap));
    }
  }

  const categories: CategoryBreakdown[] = allCategoryMetas.map((meta) => {
    const catEntries = normalized.filter((item) => item.categoryId === meta.id);
    const catAmount = roundToTwo(catEntries.reduce((acc, item) => acc + item.amount, 0));
    const percentage = totalSpent > 0 ? roundToTwo((catAmount / totalSpent) * 100) : 0;

    // Group by vehicle
    const byVehicle = new Map<string, { amount: number; count: number }>();
    for (const entry of catEntries) {
      const prev = byVehicle.get(entry.vehicleId) || { amount: 0, count: 0 };
      byVehicle.set(entry.vehicleId, {
        amount: roundToTwo(prev.amount + entry.amount),
        count: prev.count + 1,
      });
    }

    const vehicleContributions: VehicleContribution[] = Array.from(byVehicle.entries())
      .map(([vehicleId, stats]) => {
        const v = vehicleMap.get(vehicleId);
        return {
          vehicleId,
          vehicleName: v ? `${v.make} ${v.model}` : vehicleId,
          year: v?.year || 0,
          registrationNumber: v?.registrationNumber,
          vin: v?.vin || '',
          amount: stats.amount,
          percentageOfCategory: catAmount > 0 ? roundToTwo((stats.amount / catAmount) * 100) : 0,
          entryCount: stats.count,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return {
      ...meta,
      amount: catAmount,
      percentage,
      entryCount: catEntries.length,
      topVehicle: vehicleContributions[0] || null,
      vehicleContributions,
    };
  });

  const nonEmptyCategories = [...categories]
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    totalSpent,
    totalEntries: normalized.length,
    impactedVehiclesCount: impactedVehicleIds.size,
    topCategory: nonEmptyCategories[0] || null,
    categories,
    entries: normalized,
  };
}

function getDaysBetween(startDateStr?: string, endDateStr?: string): number | null {
  const startKey = extractDayKey(startDateStr);
  const endKey = extractDayKey(endDateStr);
  if (!startKey || !endKey) return null;
  const startMs = dayKeyToUtcNoonMs(startKey);
  const endMs = dayKeyToUtcNoonMs(endKey);
  if (startMs === null || endMs === null) return null;
  return Math.max(0, Math.round((endMs - startMs) / 86400000));
}

function getAgingTier(days: number): AgingTier {
  if (days >= 90) return 'critical';
  if (days >= 60) return 'aging';
  if (days >= 30) return 'watch';
  return 'fresh';
}

function shouldUseMonthlyBuckets(
  timeRange: AnalyticsTimeRange,
  customRange?: CustomDateRange
): boolean {
  if (timeRange === 'today' || timeRange === 'week' || timeRange === 'month') {
    return false;
  }
  if (timeRange === 'custom' && customRange?.startDate && customRange?.endDate) {
    const days = getDaysBetween(customRange.startDate, customRange.endDate);
    if (days !== null && days <= 45) return false;
  }
  return true;
}

export function computeDealershipAnalytics(params: {
  vehicles: Vehicle[];
  repairs: RepairTask[];
  expenses: GeneralExpense[];
  timeRange: AnalyticsTimeRange;
  customRange?: CustomDateRange;
  dynamicCategories?: DynamicExpenseCategory[];
  taxRegime?: TaxRegime;
  taxRatePercent?: number;
  frenchTaxConfig?: FrenchTaxConfiguration;
  now?: Date;
}): DealershipAnalyticsReport {
  const {
    vehicles,
    repairs,
    expenses,
    timeRange,
    customRange,
    dynamicCategories,
    taxRegime = 'sarl',
    taxRatePercent,
    frenchTaxConfig,
    now = new Date(),
  } = params;

  const normalizedTaxConfig = normalizeFrenchTaxConfig({
    taxRegime,
    taxRatePercent,
    frenchTaxConfig,
  });

  const { label: taxLabel } = resolveTaxRatePercent(
    normalizedTaxConfig.businessTaxRegime,
    taxRatePercent,
    normalizedTaxConfig
  );
  const nowDayKey = getUtcDayKey(now);

  // Aggregate lifetime repairs and general expenses per vehicle
  const repairsByVehicle = new Map<string, number>();
  for (const r of repairs) {
    const amt = Number(r.totalCost ?? (Number(r.partsCost) || 0) + (Number(r.laborCost) || 0)) || 0;
    if (amt <= 0) continue;
    repairsByVehicle.set(r.vehicleId, roundToTwo((repairsByVehicle.get(r.vehicleId) || 0) + amt));
  }

  const expensesByVehicle = new Map<string, number>();
  for (const e of expenses) {
    const amt = Number(e.amount) || 0;
    if (amt <= 0) continue;
    expensesByVehicle.set(e.vehicleId, roundToTwo((expensesByVehicle.get(e.vehicleId) || 0) + amt));
  }

  const getVehicleLifetimeCosts = (v: Vehicle) => {
    const purchasePrice = Number(v.purchasePrice) || 0;
    const hasRepairRows = repairsByVehicle.has(v.id);
    const hasExpenseRows = expensesByVehicle.has(v.id);
    const repairsTotal = hasRepairRows
      ? repairsByVehicle.get(v.id)!
      : Number(v.repairCostTotal) || 0;
    const generalExpensesTotal = hasExpenseRows
      ? expensesByVehicle.get(v.id)!
      : Number(v.generalExpensesTotal) || 0;
    const totalExpenses = roundToTwo(repairsTotal + generalExpensesTotal);
    const totalInvested = roundToTwo(purchasePrice + totalExpenses);
    return { purchasePrice, repairsTotal, generalExpensesTotal, totalExpenses, totalInvested };
  };

  // 1. Active Inventory & Capital Metrics
  const activeVehicles = vehicles.filter((v) => v.status !== 'sold');
  let totalStockValue = 0;
  let totalTargetListingValue = 0;
  let totalInvestedInStock = 0;
  let totalPotentialProfit = 0;
  let pricedCount = 0;
  let unpricedCount = 0;

  const agingUnsoldVehicles: AgingVehicleRow[] = [];

  for (const v of activeVehicles) {
    const { totalInvested } = getVehicleLifetimeCosts(v);
    const targetPrice = Number(v.targetSalePrice) || 0;

    totalInvestedInStock = roundToTwo(totalInvestedInStock + totalInvested);

    if (targetPrice > 0) {
      pricedCount += 1;
      totalTargetListingValue = roundToTwo(totalTargetListingValue + targetPrice);
      totalStockValue = roundToTwo(totalStockValue + targetPrice);
      totalPotentialProfit = roundToTwo(totalPotentialProfit + (targetPrice - totalInvested));
    } else {
      unpricedCount += 1;
      totalStockValue = roundToTwo(totalStockValue + totalInvested);
    }

    const daysInStock = getDaysBetween(v.purchaseDate || v.createdAt, nowDayKey) ?? 0;
    agingUnsoldVehicles.push({
      vehicleId: v.id,
      vehicleName: `${v.make} ${v.model}`.trim(),
      year: v.year,
      status: v.status,
      registrationNumber: v.registrationNumber,
      purchaseDate: v.purchaseDate || '',
      daysInStock,
      totalInvested,
      targetSalePrice: targetPrice,
      potentialProfit: targetPrice > 0 ? roundToTwo(targetPrice - totalInvested) : null,
      ageTier: getAgingTier(daysInStock),
    });
  }

  agingUnsoldVehicles.sort((a, b) => b.daysInStock - a.daysInStock);
  const slowMovingCount = agingUnsoldVehicles.filter((v) => v.daysInStock >= 30).length;
  const averageDaysInStock =
    agingUnsoldVehicles.length > 0
      ? Math.round(
          agingUnsoldVehicles.reduce((sum, item) => sum + item.daysInStock, 0) /
            agingUnsoldVehicles.length
        )
      : null;

  // 2. Realized Sales Performance (Strictly separated: Revenue vs Gross Profit vs Net Profit)
  const soldVehiclesAll = vehicles.filter((v) => getRealizedSalePrice(v) > 0);
  const soldInPeriod = soldVehiclesAll.filter((v) => {
    const effectiveSaleDate = v.buyerInfo?.saleDate || v.updatedAt || v.purchaseDate;
    return isWithinTimeRange(effectiveSaleDate, timeRange, now, customRange);
  });

  let revenue = 0;
  let grossProfit = 0;
  let perVehicleTaxSum = 0;
  let urssafAmount = 0;
  let versementLiberatoireAmount = 0;
  let microBicEstimatedIrAmount = 0;
  let vatAmount = 0;
  let particulierDealsCount = 0;
  let taxedDealsCount = 0;
  const daysToSellSamples: number[] = [];
  const mostProfitableVehicles: ProfitableVehicleRow[] = [];

  const isParticulierMode = normalizedTaxConfig.businessTaxRegime === 'none';

  for (const v of soldInPeriod) {
    const salePrice = getRealizedSalePrice(v);
    const { purchasePrice, repairsTotal, generalExpensesTotal, totalExpenses, totalInvested } =
      getVehicleLifetimeCosts(v);

    const explicitDealProfile = v.buyerInfo?.sellerProfileType;
    const isDealParticulier =
      explicitDealProfile === 'particulier' ||
      (!explicitDealProfile && isParticulierMode);

    let report: SaleFinancialReport;
    if (isDealParticulier) {
      const rawReport = calculateSaleTaxReport({
        salePrice,
        purchasePrice,
        repairCostTotal: repairsTotal,
        generalExpensesTotal,
        taxRegime: 'none',
        taxRatePercent: 0,
      });
      report = {
        ...rawReport,
        taxRegime: 'none' as const,
        taxAmount: 0,
        urssafAmount: 0,
        versementLiberatoireEnabled: false,
        versementLiberatoireAmount: 0,
        microBicEstimatedTax: 0,
        vatAmount: 0,
        netProfitAfterTax: rawReport.grossMargin,
      };
    } else if (explicitDealProfile === 'micro_entrepreneur') {
      const microPatch = buildProfileSettingsPatch('micro_entrepreneur', {
        taxRegime: normalizedTaxConfig.businessTaxRegime,
        frenchTaxConfig: normalizedTaxConfig,
      });
      const snap = v.buyerInfo?.taxSnapshot;
      const useMicroSnap =
        Boolean(snap?.isHistoricalSnapshot) &&
        (snap?.taxRegime === 'micro' || snap?.legalStatus === 'micro_entreprise') &&
        roundToTwo(snap?.repairCostTotal ?? 0) === repairsTotal &&
        roundToTwo(snap?.generalExpensesTotal ?? 0) === generalExpensesTotal;
      report = calculateSaleTaxReport({
        salePrice,
        purchasePrice,
        repairCostTotal: repairsTotal,
        generalExpensesTotal,
        taxRegime: 'micro',
        taxRatePercent: microPatch.taxRatePercent,
        frenchTaxConfig: microPatch.frenchTaxConfig,
        vatRegime: 'franchise_base',
        vatRatePercent: 0,
        taxSnapshot: useMicroSnap ? snap : undefined,
      });
    } else {
      report = calculateSaleTaxReport({
        salePrice,
        purchasePrice,
        repairCostTotal: repairsTotal,
        generalExpensesTotal,
        taxRegime: normalizedTaxConfig.businessTaxRegime,
        taxRatePercent,
        frenchTaxConfig: normalizedTaxConfig,
        vatRegime: v.buyerInfo?.vatRegime,
        vatRatePercent: v.buyerInfo?.vatRatePercent,
        taxSnapshot: v.buyerInfo?.taxSnapshot,
      });
    }

    if (isDealParticulier) {
      particulierDealsCount += 1;
    } else if (
      explicitDealProfile === 'micro_entrepreneur' ||
      report.taxAmount > 0 ||
      report.urssafAmount > 0 ||
      report.versementLiberatoireAmount > 0 ||
      report.vatAmount > 0 ||
      report.taxRegime !== 'none'
    ) {
      taxedDealsCount += 1;
    }

    revenue = roundToTwo(revenue + report.salePrice);
    grossProfit = roundToTwo(grossProfit + report.grossMargin);
    perVehicleTaxSum = roundToTwo(perVehicleTaxSum + report.taxAmount);
    urssafAmount = roundToTwo(urssafAmount + report.urssafAmount);
    versementLiberatoireAmount = roundToTwo(
      versementLiberatoireAmount + report.versementLiberatoireAmount
    );
    microBicEstimatedIrAmount = roundToTwo(
      microBicEstimatedIrAmount + report.microBicEstimatedTax
    );
    vatAmount = roundToTwo(vatAmount + report.vatAmount);

    const effectiveSaleDate = v.buyerInfo?.saleDate || v.updatedAt?.slice(0, 10) || '';
    const daysToSell = getDaysBetween(v.purchaseDate, effectiveSaleDate);
    if (daysToSell !== null) {
      daysToSellSamples.push(daysToSell);
    }

    const netMarginPct =
      report.salePrice > 0 ? roundToTwo((report.netProfitAfterTax / report.salePrice) * 100) : 0;
    const roiPct =
      totalInvested > 0 ? roundToTwo((report.netProfitAfterTax / totalInvested) * 100) : 0;

    mostProfitableVehicles.push({
      vehicleId: v.id,
      vehicleName: `${v.make} ${v.model}`.trim(),
      year: v.year,
      registrationNumber: v.registrationNumber,
      saleDate: effectiveSaleDate,
      daysToSell,
      purchasePrice,
      totalExpenses,
      totalInvested,
      revenue: report.salePrice,
      grossProfit: report.grossMargin,
      taxAmount: report.taxAmount,
      netProfit: report.netProfitAfterTax,
      netMarginPercent: netMarginPct,
      roiPercent: roiPct,
    });
  }

  // Corporate IS (SARL / SAS) calculated progressively on company annual/period taxable profit
  let corporateIsAmount = 0;
  let corporateIsBreakdown: CorporateIsResult | undefined;
  if (
    !isParticulierMode &&
    (normalizedTaxConfig.businessTaxRegime === 'sarl' ||
      normalizedTaxConfig.businessTaxRegime === 'sas')
  ) {
    // Only apply IS to profit from vehicles that don't already have an explicit non-corporate profile/snapshot
    const corporateProfitBase = soldInPeriod.reduce((sum, v) => {
      if (v.buyerInfo?.sellerProfileType) {
        return sum;
      }
      const snap = v.buyerInfo?.taxSnapshot;
      if (snap?.isHistoricalSnapshot && snap.taxRegime !== 'sarl' && snap.taxRegime !== 'sas') {
        return sum;
      }
      const { purchasePrice, repairsTotal, generalExpensesTotal } = getVehicleLifetimeCosts(v);
      return roundToTwo(
        sum + (getRealizedSalePrice(v) - purchasePrice - repairsTotal - generalExpensesTotal)
      );
    }, 0);

    corporateIsBreakdown = calculateCorporateIS({
      annualTaxableProfit: corporateProfitBase,
      config: normalizedTaxConfig,
    });
    corporateIsAmount = corporateIsBreakdown.totalIsTax;
  }

  const taxAmount = roundToTwo(perVehicleTaxSum + corporateIsAmount);
  const netProfit = roundToTwo(grossProfit - taxAmount);

  mostProfitableVehicles.sort((a, b) => b.netProfit - a.netProfit);

  const soldCount = soldInPeriod.length;
  const grossMarginPercent = revenue > 0 ? roundToTwo((grossProfit / revenue) * 100) : 0;
  const netMarginPercent = revenue > 0 ? roundToTwo((netProfit / revenue) * 100) : 0;
  const averageGrossMarginEuro = soldCount > 0 ? roundToTwo(grossProfit / soldCount) : 0;
  const averageNetMarginEuro = soldCount > 0 ? roundToTwo(netProfit / soldCount) : 0;
  const averageDaysToSell =
    daysToSellSamples.length > 0
      ? Math.round(
          daysToSellSamples.reduce((acc, d) => acc + d, 0) / daysToSellSamples.length
        )
      : null;

  // 3. Monthly Snapshot (always last 30 days so monthly Revenue & Expenses stay visible)
  const monthlyExpensesAnalytics = computeFleetExpenseAnalytics({
    vehicles,
    repairs,
    expenses,
    timeRange: 'month',
    dynamicCategories,
    now,
  });

  const soldLastMonth = soldVehiclesAll.filter((v) => {
    const effectiveSaleDate = v.buyerInfo?.saleDate || v.updatedAt || v.purchaseDate;
    return isWithinTimeRange(effectiveSaleDate, 'month', now);
  });

  const monthlyRevenue = roundToTwo(
    soldLastMonth.reduce((sum, v) => sum + getRealizedSalePrice(v), 0)
  );
  const monthlyPurchases = roundToTwo(
    vehicles
      .filter((v) => isWithinTimeRange(v.purchaseDate || v.createdAt, 'month', now))
      .reduce((sum, v) => sum + (Number(v.purchasePrice) || 0), 0)
  );

  // 4. Period Expense Breakdown & Cash Flow
  const expenseBreakdown = computeFleetExpenseAnalytics({
    vehicles,
    repairs,
    expenses,
    timeRange,
    customRange,
    dynamicCategories,
    now,
  });

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const useMonthly = shouldUseMonthlyBuckets(timeRange, customRange);
  const buckets = new Map<string, { inflow: number; outflow: number }>();

  const addBucket = (dateStr: string | undefined, type: 'inflow' | 'outflow', amount: number) => {
    if (amount <= 0) return;
    const dayKey = extractDayKey(dateStr);
    if (!dayKey) return;
    const bucketKey = useMonthly ? dayKey.slice(0, 7) : dayKey;
    const prev = buckets.get(bucketKey) || { inflow: 0, outflow: 0 };
    buckets.set(bucketKey, {
      inflow: type === 'inflow' ? roundToTwo(prev.inflow + amount) : prev.inflow,
      outflow: type === 'outflow' ? roundToTwo(prev.outflow + amount) : prev.outflow,
    });
  };

  let vehiclePurchasesOutflow = 0;
  for (const v of vehicles) {
    const pDate = v.purchaseDate || v.createdAt;
    const pPrice = Number(v.purchasePrice) || 0;
    if (pPrice > 0 && isWithinTimeRange(pDate, timeRange, now, customRange)) {
      vehiclePurchasesOutflow = roundToTwo(vehiclePurchasesOutflow + pPrice);
      addBucket(pDate, 'outflow', pPrice);
    }
  }

  let repairsOutflow = 0;
  for (const r of repairs) {
    const amount = Number(r.totalCost ?? (Number(r.partsCost) || 0) + (Number(r.laborCost) || 0)) || 0;
    if (amount <= 0) continue;
    const veh = vehicleMap.get(r.vehicleId);
    const effectiveDate = r.createdAt || veh?.purchaseDate || '';
    if (isWithinTimeRange(effectiveDate, timeRange, now, customRange)) {
      repairsOutflow = roundToTwo(repairsOutflow + amount);
      addBucket(effectiveDate, 'outflow', amount);
    }
  }

  let generalExpensesOutflow = 0;
  for (const e of expenses) {
    const amount = Number(e.amount) || 0;
    if (amount <= 0) continue;
    const veh = vehicleMap.get(e.vehicleId);
    const effectiveDate = e.date || e.createdAt || veh?.purchaseDate || '';
    if (isWithinTimeRange(effectiveDate, timeRange, now, customRange)) {
      generalExpensesOutflow = roundToTwo(generalExpensesOutflow + amount);
      addBucket(effectiveDate, 'outflow', amount);
    }
  }

  for (const row of mostProfitableVehicles) {
    addBucket(row.saleDate, 'inflow', row.revenue);
    if (row.taxAmount > 0) {
      addBucket(row.saleDate, 'outflow', row.taxAmount);
    }
  }
  if (corporateIsAmount > 0 && mostProfitableVehicles.length > 0) {
    addBucket(mostProfitableVehicles[0].saleDate, 'outflow', corporateIsAmount);
  }

  const inflow = revenue;
  const taxesOutflow = taxAmount;
  const outflow = roundToTwo(
    vehiclePurchasesOutflow + repairsOutflow + generalExpensesOutflow + taxesOutflow
  );
  const netCashFlow = roundToTwo(inflow - outflow);

  const series: CashFlowBucket[] = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, vals]) => {
      const label = useMonthly
        ? `${key.slice(5, 7)}/${key.slice(2, 4)}`
        : `${key.slice(8, 10)}/${key.slice(5, 7)}`;
      return {
        key,
        label,
        inflow: vals.inflow,
        outflow: vals.outflow,
        net: roundToTwo(vals.inflow - vals.outflow),
      };
    });

  return {
    inventory: {
      activeCount: activeVehicles.length,
      totalStockValue,
      totalTargetListingValue,
      totalInvestedInStock,
      totalPotentialProfit,
      pricedCount,
      unpricedCount,
    },
    salesPerformance: {
      soldCount,
      revenue,
      grossProfit,
      taxAmount,
      netProfit,
      taxLabel,
      grossMarginPercent,
      netMarginPercent,
      averageGrossMarginEuro,
      averageNetMarginEuro,
      averageDaysToSell,
      urssafAmount,
      versementLiberatoireAmount,
      microBicEstimatedIrAmount,
      corporateIsAmount,
      vatAmount,
      corporateIsBreakdown,
      particulierDealsCount,
      taxedDealsCount,
    },
    monthlySnapshot: {
      monthlyRevenue,
      monthlySoldCount: soldLastMonth.length,
      monthlyExpenses: monthlyExpensesAnalytics.totalSpent,
      monthlyPurchases,
    },
    cashFlow: {
      inflow,
      outflow,
      netCashFlow,
      vehiclePurchasesOutflow,
      repairsOutflow,
      generalExpensesOutflow,
      taxesOutflow,
      series,
    },
    mostProfitableVehicles,
    agingUnsoldVehicles,
    slowMovingCount,
    averageDaysInStock,
    expenseBreakdown,
  };
}
