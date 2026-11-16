import { GeneralExpense, RepairTask, Vehicle } from '../types/garage';
import { getIntlLocale, Language } from './i18nUtils';
import { roundToTwo } from './finance';

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
