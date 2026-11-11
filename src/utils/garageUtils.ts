import { Vehicle } from '../types/garage';
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
