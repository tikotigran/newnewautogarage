import { GarageDocument, Purchase, Supplier, Vehicle } from '../types/garage';
import { DEFAULT_GARAGE_ID } from './garageUtils';

export const GUEST_DEMO_STORAGE_KEY = 'autogarage_guest_demo_active';

/**
 * Known deterministic demo fleet signatures seeded by seedDemoGarageData
 * (used for backward compatibility with demo records created prior to the explicit isDemo flag).
 */
const LEGACY_DEMO_VEHICLE_SIGNATURES: ReadonlySet<string> = new Set([
  'VF3UPHNK0MT129841|GH-208-AB',
  'VF1RJA00365891234|FW-415-CL',
  'WVWZZZAUZKP512984|EV-719-VW',
  'WAUZZZGY4NA029145|GK-903-AA',
]);

const LEGACY_DEMO_SUPPLIER_NAMES: ReadonlySet<string> = new Set([
  'BCA Enchères France',
  'Lyon Auto Sélection',
  'Marc Delacroix (Particulier)',
  'Autodoc / Oscaro Pro',
  'Atelier Méca Express',
  'TransAuto Plateau',
]);

export function isDemoVehicleRecord(vehicle: Pick<Vehicle, 'isDemo' | 'vin' | 'registrationNumber'>): boolean {
  if (vehicle.isDemo === true) return true;
  const vin = String(vehicle.vin || '').trim().toUpperCase();
  const plate = String(vehicle.registrationNumber || '').trim().toUpperCase();
  if (!vin || !plate) return false;
  return LEGACY_DEMO_VEHICLE_SIGNATURES.has(`${vin}|${plate}`);
}

export function isDemoSupplierRecord(supplier: Pick<Supplier, 'isDemo' | 'name'>): boolean {
  if (supplier.isDemo === true) return true;
  return LEGACY_DEMO_SUPPLIER_NAMES.has(String(supplier.name || '').trim());
}

export function isDemoPurchaseRecord(
  purchase: Pick<Purchase, 'isDemo' | 'supplierId' | 'vehicleId'>,
  demoSupplierIds: ReadonlySet<string>,
  demoVehicleIds: ReadonlySet<string>
): boolean {
  if (purchase.isDemo === true) return true;
  if (purchase.supplierId && demoSupplierIds.has(purchase.supplierId)) return true;
  if (purchase.vehicleId && demoVehicleIds.has(purchase.vehicleId)) return true;
  return false;
}

export function isDemoDocumentRecord(
  docItem: Pick<GarageDocument, 'isDemo' | 'vehicleId'>,
  demoVehicleIds: ReadonlySet<string>
): boolean {
  if (docItem.isDemo === true) return true;
  if (docItem.vehicleId && demoVehicleIds.has(docItem.vehicleId)) return true;
  return false;
}

function belongsToTargetGarage(recordGarageId: string | undefined, activeGarageId: string | null): boolean {
  if (!activeGarageId) return true;
  const normalized = recordGarageId || DEFAULT_GARAGE_ID;
  return normalized === activeGarageId;
}

export function hasActiveDemoFleet(params: {
  isDemoModeFlag: boolean;
  isAuthenticated: boolean;
  vehicles: Vehicle[];
  suppliers?: Supplier[];
  documents?: GarageDocument[];
}): boolean {
  if (!params.isAuthenticated) {
    return params.isDemoModeFlag;
  }
  if (params.isDemoModeFlag) return true;
  if (params.vehicles.some((v) => isDemoVehicleRecord(v))) return true;
  if (params.suppliers?.some((s) => s.isDemo === true)) return true;
  if (params.documents?.some((d) => d.isDemo === true)) return true;
  return false;
}

export interface DemoCleanupPlan {
  vehicleIds: string[];
  supplierIds: string[];
  purchaseIds: string[];
  documents: GarageDocument[];
}

export function collectDemoRecordsForCleanup(params: {
  activeGarageId: string | null;
  vehicles: Vehicle[];
  suppliers: Supplier[];
  purchases: Purchase[];
  documents: GarageDocument[];
}): DemoCleanupPlan {
  const scopedVehicles = params.vehicles.filter((v) =>
    belongsToTargetGarage(v.garageId, params.activeGarageId)
  );
  const demoVehicles = scopedVehicles.filter((v) => isDemoVehicleRecord(v));
  const demoVehicleIds = new Set(demoVehicles.map((v) => v.id));

  const scopedSuppliers = params.suppliers.filter((s) =>
    belongsToTargetGarage(s.garageId, params.activeGarageId)
  );
  const demoSuppliers = scopedSuppliers.filter((s) => isDemoSupplierRecord(s));
  const demoSupplierIds = new Set(demoSuppliers.map((s) => s.id));

  const scopedPurchases = params.purchases.filter((p) =>
    belongsToTargetGarage(p.garageId, params.activeGarageId)
  );
  const demoPurchases = scopedPurchases.filter((p) =>
    isDemoPurchaseRecord(p, demoSupplierIds, demoVehicleIds)
  );

  const scopedDocuments = params.documents.filter((d) =>
    belongsToTargetGarage(d.garageId, params.activeGarageId)
  );
  const demoDocuments = scopedDocuments.filter((d) =>
    isDemoDocumentRecord(d, demoVehicleIds)
  );

  return {
    vehicleIds: demoVehicles.map((v) => v.id),
    supplierIds: demoSuppliers.map((s) => s.id),
    purchaseIds: demoPurchases.map((p) => p.id),
    documents: demoDocuments,
  };
}
