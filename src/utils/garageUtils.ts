import {
  AppUserProfileType,
  GarageWorkspace,
  LegalStatus,
  TaxRegime,
  Vehicle,
} from '../types/garage';
import { hasDefinedSalePrice, roundToTwo } from './finance';

export const DEFAULT_GARAGE_ID = 'garage_default';

export interface GarageCardStats {
  totalVehicles: number;
  activeStockCount: number;
  prepOrRepairCount: number;
  forSaleCount: number;
  totalInvested: number;
  netProfit: number;
}

export interface HeaderAnalyticsMetrics {
  inStock: number;
  prepOrRepairCount: number;
  forSaleCount: number;
  soldCount: number;
  totalInvested: number;
  realizedProfit: number;
  scope: 'all' | 'garage';
}

export function filterVehiclesByGarage(
  vehicles: Vehicle[],
  garageId: string,
  defaultGarageId: string = DEFAULT_GARAGE_ID
): Vehicle[] {
  return vehicles.filter((v) => {
    if (v.garageId) {
      return v.garageId === garageId;
    }
    return garageId === defaultGarageId;
  });
}

export function computeGarageCardStats(vehicles: Vehicle[]): GarageCardStats {
  const totalVehicles = vehicles.length;
  const activeStockCount = vehicles.filter((v) => v.status !== 'sold').length;
  const prepOrRepairCount = vehicles.filter(
    (v) => v.status === 'preparation' || v.status === 'repair'
  ).length;
  const forSaleCount = vehicles.filter((v) => v.status === 'for_sale').length;
  const totalInvested = roundToTwo(
    vehicles.reduce((sum, v) => sum + (Number(v.totalInvested) || 0), 0)
  );
  const netProfit = roundToTwo(
    vehicles.reduce((sum, v) => sum + (Number(v.netProfit) || 0), 0)
  );

  return {
    totalVehicles,
    activeStockCount,
    prepOrRepairCount,
    forSaleCount,
    totalInvested,
    netProfit,
  };
}

export function computeHeaderAnalyticsMetrics(
  vehicles: Vehicle[],
  activeGarageId: string | null | undefined,
  defaultGarageId: string = DEFAULT_GARAGE_ID
): HeaderAnalyticsMetrics {
  const scopedVehicles = activeGarageId
    ? filterVehiclesByGarage(vehicles, activeGarageId, defaultGarageId)
    : vehicles;

  const activeVehicles = scopedVehicles.filter((v) => v.status !== 'sold');
  const soldVehicles = scopedVehicles.filter((v) => v.status === 'sold');

  const inStock = activeVehicles.length;
  const prepOrRepairCount = activeVehicles.filter(
    (v) => v.status === 'preparation' || v.status === 'repair'
  ).length;
  const forSaleCount = activeVehicles.filter((v) => v.status === 'for_sale').length;
  const soldCount = soldVehicles.length;
  const totalInvested = roundToTwo(
    activeVehicles.reduce((sum, v) => sum + (Number(v.totalInvested) || 0), 0)
  );
  const realizedProfit = roundToTwo(
    soldVehicles.reduce(
      (sum, v) => sum + (hasDefinedSalePrice(v) ? Number(v.netProfit) || 0 : 0),
      0
    )
  );

  return {
    inStock,
    prepOrRepairCount,
    forSaleCount,
    soldCount,
    totalInvested,
    realizedProfit,
    scope: activeGarageId ? 'garage' : 'all',
  };
}

export function canDeleteGarage(
  garages: GarageWorkspace[],
  garageId: string
): { allowed: boolean; reason?: 'not_found' | 'last_garage' } {
  if (!garages.some((g) => g.id === garageId)) {
    return { allowed: false, reason: 'not_found' };
  }
  if (garages.length <= 1) {
    return { allowed: false, reason: 'last_garage' };
  }
  return { allowed: true };
}

export function buildGarageUpdatePayload(
  existing: GarageWorkspace,
  input: {
    name: string;
    profileType: AppUserProfileType;
    city?: string;
    siret?: string;
    taxRatePercent?: number;
  },
  nowIso: string = new Date().toISOString()
): GarageWorkspace {
  const isParticulier = input.profileType === 'particulier';
  const legalStatus: LegalStatus = isParticulier ? 'particulier' : 'micro_entreprise';
  const taxRegime: TaxRegime = isParticulier ? 'none' : 'micro';
  const taxRatePercent = isParticulier
    ? 0
    : typeof input.taxRatePercent === 'number' && !Number.isNaN(input.taxRatePercent)
    ? Math.max(0, input.taxRatePercent)
    : existing.taxRegime === 'micro' && typeof existing.taxRatePercent === 'number'
    ? existing.taxRatePercent
    : 13.3;

  return {
    ...existing,
    name: input.name.trim() || existing.name,
    profileType: input.profileType,
    entityType: 'physique',
    legalStatus,
    taxRegime,
    taxRatePercent,
    city: input.city !== undefined ? input.city.trim() : existing.city || '',
    siret: isParticulier ? '' : input.siret !== undefined ? input.siret.trim() : existing.siret || '',
    updatedAt: nowIso,
  };
}

export function resolveNextActiveGarageId(
  remainingGarages: GarageWorkspace[],
  deletedGarageId: string,
  currentActiveGarageId: string | null,
  multiGarageEnabled: boolean = true
): string | null {
  if (currentActiveGarageId !== deletedGarageId) {
    return currentActiveGarageId;
  }
  if (!multiGarageEnabled) {
    return remainingGarages[0]?.id || DEFAULT_GARAGE_ID;
  }
  return null;
}

export function removeGarageFromList(
  garages: GarageWorkspace[],
  garageId: string
): GarageWorkspace[] {
  return garages.filter((g) => g.id !== garageId);
}

export function upsertGarageInList(
  garages: GarageWorkspace[],
  garage: GarageWorkspace
): GarageWorkspace[] {
  const exists = garages.some((g) => g.id === garage.id);
  if (exists) {
    return garages.map((g) => (g.id === garage.id ? garage : g));
  }
  return [...garages, garage];
}

export function removeVehiclesForGarage(
  vehicles: Vehicle[],
  garageId: string,
  defaultGarageId: string = DEFAULT_GARAGE_ID
): Vehicle[] {
  return vehicles.filter((v) => {
    const belongsToGarage = v.garageId ? v.garageId === garageId : garageId === defaultGarageId;
    return !belongsToGarage;
  });
}

export function hasOpenGarageWorkspace(
  multiGarageEnabled: boolean,
  activeGarageId: string | null | undefined
): boolean {
  if (!multiGarageEnabled) return true;
  return Boolean(activeGarageId);
}

export function resolveSinglePrimaryGarageId(
  garages: GarageWorkspace[],
  currentActiveGarageId: string | null | undefined
): string {
  if (garages.length > 0) {
    if (currentActiveGarageId && garages.some((g) => g.id === currentActiveGarageId)) {
      return currentActiveGarageId;
    }
    return garages[0].id;
  }
  return currentActiveGarageId || DEFAULT_GARAGE_ID;
}


