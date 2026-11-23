import { Vehicle } from '../types/garage';
import { matchesVehicleSearch } from './inventoryUtils';

export type QuickCreateVehicleAction = 'sales' | 'expenses';

export type QuickCreateResolution =
  | { mode: 'direct'; vehicle: Vehicle }
  | { mode: 'pick_vehicle' }
  | { mode: 'empty' };

export function isViewingVehicleDetailView(params: {
  activeView: string;
  selectedVehicle: Vehicle | null;
  documentsAlignerMode?: boolean;
  isAdminMode?: boolean;
}): boolean {
  if (params.isAdminMode || params.documentsAlignerMode) return false;
  const isInventoryRoute =
    params.activeView === 'desktop' || params.activeView === 'sold_vehicles';
  return isInventoryRoute && Boolean(params.selectedVehicle);
}

export function getQuickCreateEligibleVehicles(
  vehicles: ReadonlyArray<Vehicle>,
  action: QuickCreateVehicleAction
): Vehicle[] {
  if (action === 'sales') {
    return vehicles.filter((v) => v.status !== 'sold');
  }
  const active: Vehicle[] = [];
  const sold: Vehicle[] = [];
  for (const v of vehicles) {
    if (v.status === 'sold') {
      sold.push(v);
    } else {
      active.push(v);
    }
  }
  return [...active, ...sold];
}

export function filterQuickCreateVehicles(
  vehicles: ReadonlyArray<Vehicle>,
  query: string
): Vehicle[] {
  if (!query.trim()) return [...vehicles];
  return vehicles.filter((v) => matchesVehicleSearch(v, query));
}

export function resolveQuickCreateVehicleAction(params: {
  action: QuickCreateVehicleAction;
  activeView: string;
  selectedVehicle: Vehicle | null;
  garageVehicles: ReadonlyArray<Vehicle>;
  documentsAlignerMode?: boolean;
  isAdminMode?: boolean;
}): QuickCreateResolution {
  const isDetail = isViewingVehicleDetailView({
    activeView: params.activeView,
    selectedVehicle: params.selectedVehicle,
    documentsAlignerMode: params.documentsAlignerMode,
    isAdminMode: params.isAdminMode,
  });

  if (isDetail && params.selectedVehicle) {
    if (params.action === 'expenses') {
      return { mode: 'direct', vehicle: params.selectedVehicle };
    }
    if (params.selectedVehicle.status !== 'sold') {
      return { mode: 'direct', vehicle: params.selectedVehicle };
    }
  }

  const eligible = getQuickCreateEligibleVehicles(params.garageVehicles, params.action);
  if (eligible.length === 0) {
    return { mode: 'empty' };
  }

  return { mode: 'pick_vehicle' };
}
