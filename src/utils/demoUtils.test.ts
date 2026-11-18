import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDemoRecordsForCleanup,
  hasActiveDemoFleet,
  isDemoVehicleRecord,
} from './demoUtils';
import { GarageDocument, Purchase, Supplier, Vehicle } from '../types/garage';

const makeVehicle = (overrides: Partial<Vehicle> = {}): Vehicle => ({
  id: 'veh_1',
  userId: 'u1',
  garageId: 'garage_default',
  make: 'Peugeot',
  model: '208',
  trim: 'GT',
  year: 2021,
  mileage: 48500,
  vin: 'VF3UPHNK0MT129841',
  registrationNumber: 'GH-208-AB',
  purchaseDate: '2026-10-15',
  purchasePrice: 11200,
  targetSalePrice: 14900,
  status: 'preparation',
  photos: [],
  documents: [],
  repairCostTotal: 0,
  generalExpensesTotal: 0,
  totalExpenses: 0,
  totalInvested: 11200,
  netProfit: 3700,
  marginPercentage: 24.83,
  createdAt: '2026-10-15T10:00:00Z',
  updatedAt: '2026-10-15T10:00:00Z',
  ...overrides,
});

const makeSupplier = (overrides: Partial<Supplier> = {}): Supplier => ({
  id: 'sup_1',
  userId: 'u1',
  garageId: 'garage_default',
  name: 'BCA Enchères France',
  type: 'auction',
  createdAt: '2026-10-15T10:00:00Z',
  updatedAt: '2026-10-15T10:00:00Z',
  ...overrides,
});

const makePurchase = (overrides: Partial<Purchase> = {}): Purchase => ({
  id: 'pur_1',
  userId: 'u1',
  garageId: 'garage_default',
  supplierId: 'sup_1',
  supplierName: 'BCA Enchères France',
  supplierType: 'auction',
  vehicleId: 'veh_1',
  category: 'vehicle',
  description: 'Achat lot',
  amount: 11200,
  date: '2026-10-15',
  paymentMethod: 'bank_transfer',
  vehicleDocuments: [],
  createdAt: '2026-10-15T10:00:00Z',
  updatedAt: '2026-10-15T10:00:00Z',
  ...overrides,
});

const makeDoc = (overrides: Partial<GarageDocument> = {}): GarageDocument => ({
  id: 'doc_1',
  userId: 'u1',
  garageId: 'garage_default',
  title: 'Carte grise — Peugeot 208',
  category: 'carte_grise',
  bindingType: 'vehicle',
  vehicleId: 'veh_1',
  fileName: 'cg.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024,
  fileUrl: 'data:application/pdf;base64,AA==',
  documentDate: '2026-10-15',
  createdAt: '2026-10-15T10:00:00Z',
  updatedAt: '2026-10-15T10:00:00Z',
  ...overrides,
});

test('isDemoVehicleRecord identifies explicit isDemo flag and legacy seeded signatures', () => {
  assert.equal(isDemoVehicleRecord(makeVehicle({ isDemo: true, vin: 'CUSTOM1', registrationNumber: 'AA-111-AA' })), true);
  assert.equal(isDemoVehicleRecord(makeVehicle({ isDemo: undefined })), true);
  assert.equal(
    isDemoVehicleRecord(
      makeVehicle({
        isDemo: false,
        vin: 'VF3CUSTOM12345678',
        registrationNumber: 'ZZ-999-ZZ',
      })
    ),
    false
  );
});

test('hasActiveDemoFleet activates banner for guest demo or authenticated demo fleet and clears cleanly', () => {
  assert.equal(
    hasActiveDemoFleet({
      isDemoModeFlag: true,
      isAuthenticated: false,
      vehicles: [],
    }),
    true
  );
  assert.equal(
    hasActiveDemoFleet({
      isDemoModeFlag: false,
      isAuthenticated: false,
      vehicles: [makeVehicle({ isDemo: true })],
    }),
    false
  );
  assert.equal(
    hasActiveDemoFleet({
      isDemoModeFlag: false,
      isAuthenticated: true,
      vehicles: [makeVehicle({ isDemo: true })],
    }),
    true
  );
  assert.equal(
    hasActiveDemoFleet({
      isDemoModeFlag: false,
      isAuthenticated: true,
      vehicles: [makeVehicle({ isDemo: false, vin: 'REALVIN123', registrationNumber: 'BB-222-CC' })],
    }),
    false
  );
});

test('collectDemoRecordsForCleanup collects only active-garage demo records and preserves real ones', () => {
  const demoVehG1 = makeVehicle({ id: 'veh_demo_1', garageId: 'garage_default', isDemo: true });
  const realVehG1 = makeVehicle({
    id: 'veh_real_1',
    garageId: 'garage_default',
    isDemo: false,
    vin: 'REALVIN123',
    registrationNumber: 'CC-333-DD',
  });
  const demoVehG2 = makeVehicle({ id: 'veh_demo_g2', garageId: 'garage_other', isDemo: true });

  const demoSup = makeSupplier({ id: 'sup_demo_1', garageId: 'garage_default', isDemo: true });
  const realSup = makeSupplier({
    id: 'sup_real_1',
    garageId: 'garage_default',
    name: 'Mon Fournisseur Perso',
    isDemo: false,
  });

  const demoPur = makePurchase({
    id: 'pur_demo_1',
    garageId: 'garage_default',
    supplierId: 'sup_demo_1',
    vehicleId: 'veh_demo_1',
    isDemo: true,
  });
  const realPur = makePurchase({
    id: 'pur_real_1',
    garageId: 'garage_default',
    supplierId: 'sup_real_1',
    vehicleId: 'veh_real_1',
    isDemo: false,
  });

  const demoDoc = makeDoc({ id: 'doc_demo_1', garageId: 'garage_default', vehicleId: 'veh_demo_1', isDemo: true });
  const realDoc = makeDoc({ id: 'doc_real_1', garageId: 'garage_default', vehicleId: 'veh_real_1', isDemo: false });

  const plan = collectDemoRecordsForCleanup({
    activeGarageId: 'garage_default',
    vehicles: [demoVehG1, realVehG1, demoVehG2],
    suppliers: [demoSup, realSup],
    purchases: [demoPur, realPur],
    documents: [demoDoc, realDoc],
  });

  assert.deepEqual(plan.vehicleIds, ['veh_demo_1']);
  assert.deepEqual(plan.supplierIds, ['sup_demo_1']);
  assert.deepEqual(plan.purchaseIds, ['pur_demo_1']);
  assert.deepEqual(
    plan.documents.map((d) => d.id),
    ['doc_demo_1']
  );
});
