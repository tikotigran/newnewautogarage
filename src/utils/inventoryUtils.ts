import {
  AppUserProfileType,
  GeneralExpense,
  RepairTask,
  Vehicle,
  VehiclePurchaseStatus,
  VehicleStatus,
} from '../types/garage';
import { getIntlLocale, Language, pickLocalized } from './i18nUtils';
import { roundToTwo } from './finance';
import { resolveVehiclePurchaseStatus } from './vehicleFormUtils';
import { resolveVehicleQuickFlags } from './quickListUtils';

export interface VehicleInventoryFinancials {
  purchasePrice: number;
  repairCostTotal: number;
  generalExpensesTotal: number;
  totalExpenses: number;
  totalInvested: number;
}

export interface InventorySummaryTotals {
  vehicleCount: number;
  totalPurchasePrice: number;
  totalExpenses: number;
  totalInvested: number;
}

export type InventorySortField = 'date' | 'invested' | 'price' | 'mileage';

export type InventoryTableSortColumn =
  | 'vehicle'
  | 'mileage'
  | 'status'
  | 'ct'
  | 'docs'
  | 'purchasePrice'
  | 'expenses'
  | 'totalInvested';

export type SortDirection = 'asc' | 'desc';

export interface InventoryTableSortState {
  column: InventoryTableSortColumn;
  direction: SortDirection;
}

export type InventoryTransactionFilter = 'all' | 'micro' | 'particulier';

export interface InventoryStatusCounts {
  all: number;
  preparation: number;
  repair: number;
  for_sale: number;
  sold: number;
}

/**
 * Computes exact inventory financials for a vehicle while strictly avoiding
 * duplicate expense counting (deduplicates task/expense IDs if arrays overlap,
 * and falls back to pre-aggregated vehicle fields only when subcollection rows
 * are not supplied).
 */
export function computeVehicleInventoryFinancials(
  vehicle: Pick<
    Vehicle,
    'purchasePrice' | 'repairCostTotal' | 'generalExpensesTotal' | 'totalExpenses' | 'totalInvested'
  >,
  repairs?: RepairTask[],
  expenses?: GeneralExpense[]
): VehicleInventoryFinancials {
  const purchasePrice = roundToTwo(Math.max(0, Number(vehicle.purchasePrice) || 0));

  let repairCostTotal: number;
  if (repairs && repairs.length > 0) {
    const seenIds = new Set<string>();
    let sum = 0;
    for (const r of repairs) {
      if (r.id) {
        if (seenIds.has(r.id)) continue;
        seenIds.add(r.id);
      }
      const parts = Number(r.partsCost) || 0;
      const labor = Number(r.laborCost) || 0;
      const rowCost =
        parts > 0 || labor > 0 ? parts + labor : Number(r.totalCost) || 0;
      sum += Math.max(0, rowCost);
    }
    repairCostTotal = roundToTwo(sum);
  } else {
    repairCostTotal = roundToTwo(Math.max(0, Number(vehicle.repairCostTotal) || 0));
  }

  let generalExpensesTotal: number;
  if (expenses && expenses.length > 0) {
    const seenIds = new Set<string>();
    let sum = 0;
    for (const e of expenses) {
      if (e.id) {
        if (seenIds.has(e.id)) continue;
        seenIds.add(e.id);
      }
      sum += Math.max(0, Number(e.amount) || 0);
    }
    generalExpensesTotal = roundToTwo(sum);
  } else {
    generalExpensesTotal = roundToTwo(Math.max(0, Number(vehicle.generalExpensesTotal) || 0));
  }

  // Fallback for legacy vehicle docs that only stored totalExpenses directly
  const fallbackTotalExpenses =
    repairCostTotal === 0 &&
    generalExpensesTotal === 0 &&
    (!repairs || repairs.length === 0) &&
    (!expenses || expenses.length === 0)
      ? roundToTwo(Math.max(0, Number(vehicle.totalExpenses) || 0))
      : 0;

  const totalExpenses = roundToTwo(
    fallbackTotalExpenses > 0 ? fallbackTotalExpenses : repairCostTotal + generalExpensesTotal
  );
  const totalInvested = roundToTwo(purchasePrice + totalExpenses);

  return {
    purchasePrice,
    repairCostTotal,
    generalExpensesTotal,
    totalExpenses,
    totalInvested,
  };
}

export function computeInventorySummaryTotals(
  items: VehicleInventoryFinancials[]
): InventorySummaryTotals {
  let totalPurchasePrice = 0;
  let totalExpenses = 0;
  let totalInvested = 0;

  for (const item of items) {
    totalPurchasePrice += item.purchasePrice;
    totalExpenses += item.totalExpenses;
    totalInvested += item.totalInvested;
  }

  return {
    vehicleCount: items.length,
    totalPurchasePrice: roundToTwo(totalPurchasePrice),
    totalExpenses: roundToTwo(totalExpenses),
    totalInvested: roundToTwo(totalInvested),
  };
}

export function formatMileageKm(mileage?: number | null, lang: Language = 'fr'): string {
  const safeMileage = Math.max(0, Number(mileage) || 0);
  const formatted = safeMileage.toLocaleString(getIntlLocale(lang));
  return `${formatted} km`;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[\s\-_.,]+/g, '');
}

export function matchesVehicleSearch(vehicle: Vehicle, rawQuery: string): boolean {
  const trimmed = rawQuery.trim();
  if (!trimmed) return true;

  const q = trimmed.toLowerCase();
  const compactQ = normalizeToken(trimmed);
  const makeModel = `${vehicle.make || ''} ${vehicle.model || ''}`.trim().toLowerCase();

  if ((vehicle.make || '').toLowerCase().includes(q)) return true;
  if ((vehicle.model || '').toLowerCase().includes(q)) return true;
  if (makeModel.includes(q)) return true;
  if ((vehicle.trim || '').toLowerCase().includes(q)) return true;
  if (String(vehicle.year || '').includes(q)) return true;
  if ((vehicle.vin || '').toLowerCase().includes(q)) return true;

  const reg = (vehicle.registrationNumber || '').toLowerCase();
  if (reg.includes(q)) return true;
  if (compactQ && normalizeToken(reg).includes(compactQ)) return true;

  const safeMileage = Math.max(0, Number(vehicle.mileage) || 0);
  const mileageStr = String(safeMileage);
  const mileageFr = safeMileage.toLocaleString('fr-FR').toLowerCase();
  const mileageRu = safeMileage.toLocaleString('ru-RU').toLowerCase();
  const compactMileageQuery = compactQ.replace(/km$|км$/i, '');

  if (mileageStr.includes(q)) return true;
  if (mileageFr.includes(q) || mileageRu.includes(q)) return true;
  if (`${mileageStr} km`.includes(q) || `${mileageFr} km`.includes(q)) return true;
  if (compactMileageQuery && /^\d+$/.test(compactMileageQuery) && mileageStr.includes(compactMileageQuery)) {
    return true;
  }

  return false;
}

export function sortInventoryVehicles(
  vehicles: Vehicle[],
  sortBy: InventorySortField,
  financialsById?: Map<string, VehicleInventoryFinancials>
): Vehicle[] {
  return [...vehicles].sort((a, b) => {
    if (sortBy === 'invested') {
      const invA = financialsById?.get(a.id)?.totalInvested ?? (Number(a.totalInvested) || Number(a.purchasePrice) || 0);
      const invB = financialsById?.get(b.id)?.totalInvested ?? (Number(b.totalInvested) || Number(b.purchasePrice) || 0);
      return invB - invA;
    }
    if (sortBy === 'price') {
      return (Number(b.purchasePrice) || 0) - (Number(a.purchasePrice) || 0);
    }
    if (sortBy === 'mileage') {
      return (Number(b.mileage) || 0) - (Number(a.mileage) || 0);
    }
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}

export function matchesVehicleTransactionType(
  vehicle: Pick<Vehicle, 'purchaseStatus' | 'buyerInfo'>,
  filter: InventoryTransactionFilter,
  fallbackProfileType: AppUserProfileType = 'micro_entrepreneur'
): boolean {
  if (filter === 'all') return true;
  return resolveVehiclePurchaseStatus(vehicle, fallbackProfileType) === filter;
}

export type InventoryScope = 'active' | 'sold';

export interface ActiveInventoryStatusCounts {
  all: number;
  preparation: number;
  repair: number;
  for_sale: number;
}

export function filterVehiclesByInventoryScope<T extends Pick<Vehicle, 'status'>>(
  vehicles: ReadonlyArray<T>,
  scope: InventoryScope
): T[] {
  return vehicles.filter((v) =>
    scope === 'sold' ? v.status === 'sold' : v.status !== 'sold'
  );
}

export function partitionInventoryVehicles<T extends Pick<Vehicle, 'status'>>(
  vehicles: ReadonlyArray<T>
): { activeVehicles: T[]; soldVehicles: T[] } {
  const activeVehicles: T[] = [];
  const soldVehicles: T[] = [];
  for (const v of vehicles) {
    if (v.status === 'sold') {
      soldVehicles.push(v);
    } else {
      activeVehicles.push(v);
    }
  }
  return { activeVehicles, soldVehicles };
}

export function computeActiveInventoryStatusCounts(
  vehicles: ReadonlyArray<Pick<Vehicle, 'status'>>
): ActiveInventoryStatusCounts {
  const counts: ActiveInventoryStatusCounts = {
    all: 0,
    preparation: 0,
    repair: 0,
    for_sale: 0,
  };
  for (const v of vehicles) {
    if (v.status === 'sold') continue;
    counts.all += 1;
    if (v.status === 'preparation') counts.preparation += 1;
    else if (v.status === 'repair') counts.repair += 1;
    else if (v.status === 'for_sale') counts.for_sale += 1;
  }
  return counts;
}

export function computeInventoryStatusCounts(
  vehicles: ReadonlyArray<Pick<Vehicle, 'status'>>
): InventoryStatusCounts {
  const counts: InventoryStatusCounts = {
    all: vehicles.length,
    preparation: 0,
    repair: 0,
    for_sale: 0,
    sold: 0,
  };
  for (const v of vehicles) {
    if (v.status === 'preparation') counts.preparation += 1;
    else if (v.status === 'repair') counts.repair += 1;
    else if (v.status === 'for_sale') counts.for_sale += 1;
    else if (v.status === 'sold') counts.sold += 1;
  }
  return counts;
}

export function formatListTrimSubtitle(
  trim?: string | null,
  maxLength = 15
): { display: string; full: string } {
  const full = (trim || '').trim() || 'Standard';
  if (full.length <= maxLength) {
    return { display: full, full };
  }
  return {
    display: `${full.slice(0, maxLength).trimEnd()}...`,
    full,
  };
}

const STATUS_SORT_ORDER: Record<VehicleStatus, number> = {
  preparation: 0,
  repair: 1,
  for_sale: 2,
  sold: 3,
};

export function toggleTableSortState(
  current: InventoryTableSortState | null,
  column: InventoryTableSortColumn
): InventoryTableSortState | null {
  if (current?.column !== column) {
    return {
      column,
      direction: 'asc',
    };
  }
  if (current.direction === 'asc') {
    return {
      column,
      direction: 'desc',
    };
  }
  return null;
}

export function sortInventoryVehiclesByColumn(
  vehicles: Vehicle[],
  sortState: InventoryTableSortState,
  financialsById?: Map<string, VehicleInventoryFinancials>
): Vehicle[] {
  const dir = sortState.direction === 'asc' ? 1 : -1;
  return [...vehicles].sort((a, b) => {
    let cmp = 0;
    switch (sortState.column) {
      case 'vehicle': {
        const nameA = `${a.make || ''} ${a.model || ''}`.trim();
        const nameB = `${b.make || ''} ${b.model || ''}`.trim();
        cmp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
        if (cmp === 0) {
          cmp = (Number(a.year) || 0) - (Number(b.year) || 0);
        }
        break;
      }
      case 'mileage':
        cmp = (Number(a.mileage) || 0) - (Number(b.mileage) || 0);
        break;
      case 'status':
        cmp = (STATUS_SORT_ORDER[a.status] ?? 99) - (STATUS_SORT_ORDER[b.status] ?? 99);
        break;
      case 'ct': {
        const ctA = resolveVehicleQuickFlags(a).ctPassed ? 1 : 0;
        const ctB = resolveVehicleQuickFlags(b).ctPassed ? 1 : 0;
        cmp = ctA - ctB;
        break;
      }
      case 'docs': {
        const docsA = resolveVehicleQuickFlags(a).docsCompleted ? 1 : 0;
        const docsB = resolveVehicleQuickFlags(b).docsCompleted ? 1 : 0;
        cmp = docsA - docsB;
        break;
      }
      case 'purchasePrice': {
        const pA = financialsById?.get(a.id)?.purchasePrice ?? (Number(a.purchasePrice) || 0);
        const pB = financialsById?.get(b.id)?.purchasePrice ?? (Number(b.purchasePrice) || 0);
        cmp = pA - pB;
        break;
      }
      case 'expenses': {
        const eA = financialsById?.get(a.id)?.totalExpenses ?? (Number(a.totalExpenses) || 0);
        const eB = financialsById?.get(b.id)?.totalExpenses ?? (Number(b.totalExpenses) || 0);
        cmp = eA - eB;
        break;
      }
      case 'totalInvested': {
        const tA =
          financialsById?.get(a.id)?.totalInvested ??
          (Number(a.totalInvested) || Number(a.purchasePrice) || 0);
        const tB =
          financialsById?.get(b.id)?.totalInvested ??
          (Number(b.totalInvested) || Number(b.purchasePrice) || 0);
        cmp = tA - tB;
        break;
      }
    }
    if (cmp !== 0) return cmp * dir;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}

export interface VehicleTransactionBadgeInfo {
  mode: VehiclePurchaseStatus;
  label: string;
}

export function getVehicleTransactionBadgeInfo(
  vehicle: Pick<Vehicle, 'purchaseStatus' | 'buyerInfo'>,
  lang: Language,
  fallbackProfileType: AppUserProfileType = 'micro_entrepreneur'
): VehicleTransactionBadgeInfo {
  const mode = resolveVehiclePurchaseStatus(vehicle, fallbackProfileType);
  const label =
    mode === 'micro'
      ? pickLocalized(lang, {
          fr: 'PRO',
          ru: 'ФИРМА',
          hy: 'ԸՆԿ.',
          ka: 'ფირმა',
        })
      : pickLocalized(lang, {
          fr: 'PERSO',
          ru: 'ЧАСТ.',
          hy: 'ԱՆՀ.',
          ka: 'კერძო',
        });
  return { mode, label };
}




