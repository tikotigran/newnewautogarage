import { Vehicle, RepairTask, GeneralExpense, GeneralExpenseCategory } from '../types/garage';
import { roundToTwo } from './finance';

export type AnalyticsExpenseCategoryId =
  | 'parts_labor'
  | 'fuel'
  | 'detailing'
  | 'registration'
  | 'transport'
  | 'other';

export type AnalyticsTimeRange = 'month' | '3months' | '6months' | 'year' | 'all';

export interface AnalyticsCategoryMeta {
  id: AnalyticsExpenseCategoryId;
  labelFr: string;
  labelRu: string;
  colorClass: string;
  barColorHex: string;
}

export const ANALYTICS_CATEGORIES: AnalyticsCategoryMeta[] = [
  {
    id: 'parts_labor',
    labelFr: 'Pièces & Main d’œuvre',
    labelRu: 'Запчасти и ремонт',
    colorClass: 'bg-amber-500',
    barColorHex: '#f59e0b',
  },
  {
    id: 'fuel',
    labelFr: 'Carburant',
    labelRu: 'Топливо',
    colorClass: 'bg-sky-500',
    barColorHex: '#0ea5e9',
  },
  {
    id: 'detailing',
    labelFr: 'Lavage / Detailing',
    labelRu: 'Мойка / Детейлинг',
    colorClass: 'bg-emerald-500',
    barColorHex: '#10b981',
  },
  {
    id: 'registration',
    labelFr: 'Immatriculation & Carte Grise',
    labelRu: 'Оформление и Carte Grise',
    colorClass: 'bg-indigo-500',
    barColorHex: '#6366f1',
  },
  {
    id: 'transport',
    labelFr: 'Dépannage / Logistique',
    labelRu: 'Эвакуатор / Логистика',
    colorClass: 'bg-orange-500',
    barColorHex: '#f97316',
  },
  {
    id: 'other',
    labelFr: 'Autres frais généraux',
    labelRu: 'Прочие накладные расходы',
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
  colorClass: string;
  barColorHex: string;
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

export function mapGeneralExpenseCategory(
  category: GeneralExpenseCategory | string
): AnalyticsExpenseCategoryId {
  switch (category) {
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
    default:
      return 'other';
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

export function isWithinTimeRange(
  dateStr: string | undefined,
  range: AnalyticsTimeRange,
  now: Date = new Date()
): boolean {
  if (range === 'all') return true;
  const itemMs = parseExpenseDateMs(dateStr);
  if (itemMs === null) return false;

  const cutoff = new Date(now.getTime());
  if (range === 'month') {
    cutoff.setDate(cutoff.getDate() - 30);
  } else if (range === '3months') {
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
  now?: Date;
}): FleetExpenseAnalytics {
  const { vehicles, repairs, expenses, timeRange, now = new Date() } = params;
  const vehicleMap = new Map<string, Vehicle>();
  for (const v of vehicles) {
    vehicleMap.set(v.id, v);
  }

  const normalized: NormalizedExpenseEntry[] = [];

  for (const r of repairs) {
    const amount = Number(r.totalCost ?? (Number(r.partsCost) || 0) + (Number(r.laborCost) || 0)) || 0;
    if (amount <= 0) continue;
    const veh = vehicleMap.get(r.vehicleId);
    const effectiveDate = r.createdAt || veh?.purchaseDate || '';
    if (!isWithinTimeRange(effectiveDate, timeRange, now)) continue;
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
    if (!isWithinTimeRange(effectiveDate, timeRange, now)) continue;
    normalized.push({
      id: e.id,
      vehicleId: e.vehicleId,
      categoryId: mapGeneralExpenseCategory(e.category),
      amount: roundToTwo(amount),
      date: effectiveDate,
      description: e.description,
    });
  }

  const totalSpent = roundToTwo(normalized.reduce((acc, item) => acc + item.amount, 0));
  const impactedVehicleIds = new Set(normalized.map((item) => item.vehicleId));

  const categories: CategoryBreakdown[] = ANALYTICS_CATEGORIES.map((meta) => {
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
