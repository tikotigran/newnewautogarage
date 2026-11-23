import test from 'node:test';
import assert from 'node:assert/strict';
import type { Vehicle } from '../types/garage';
import {
  filterQuickCreateVehicles,
  getQuickCreateEligibleVehicles,
  isViewingVehicleDetailView,
  resolveQuickCreateVehicleAction,
} from './quickCreateUtils';

function makeVehicle(overrides: Partial<Vehicle> & { id: string }): Vehicle {
  const { id, ...rest } = overrides;
  return {
    id,
    userId: 'u1',
    make: 'Peugeot',
    model: '308',
    trim: 'Allure',
    year: 2020,
    mileage: 55000,
    vin: `VF3LCBHZ6LS0000${id}`,
    registrationNumber: `AA-10${id}-BB`,
    purchaseDate: '2026-01-01',
    purchasePrice: 8900,
    targetSalePrice: 11900,
    status: 'for_sale',
    photos: [],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 8900,
    netProfit: 0,
    marginPercentage: 0,
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    ...rest,
  };
}

test('resolveQuickCreateVehicleAction NEVER auto-selects first vehicle from inventory list', () => {
  const v1 = makeVehicle({ id: '1', make: 'Peugeot', model: '308', status: 'for_sale' });
  const v2 = makeVehicle({ id: '2', make: 'Renault', model: 'Clio', status: 'preparation' });

  const salesRes = resolveQuickCreateVehicleAction({
    action: 'sales',
    activeView: 'desktop',
    selectedVehicle: null,
    garageVehicles: [v1, v2],
  });
  assert.deepEqual(salesRes, { mode: 'pick_vehicle' });

  const expensesRes = resolveQuickCreateVehicleAction({
    action: 'expenses',
    activeView: 'desktop',
    selectedVehicle: null,
    garageVehicles: [v1, v2],
  });
  assert.deepEqual(expensesRes, { mode: 'pick_vehicle' });
});

test('resolveQuickCreateVehicleAction opens picker even if stale selectedVehicle exists on another view', () => {
  const v1 = makeVehicle({ id: '1', make: 'Peugeot', model: '308', status: 'for_sale' });

  for (const activeView of ['documents', 'suppliers', 'analytics', 'exports', 'settings', 'new_vehicle']) {
    assert.equal(
      isViewingVehicleDetailView({ activeView, selectedVehicle: v1 }),
      false
    );
    assert.deepEqual(
      resolveQuickCreateVehicleAction({
        action: 'sales',
        activeView,
        selectedVehicle: v1,
        garageVehicles: [v1],
      }),
      { mode: 'pick_vehicle' }
    );
    assert.deepEqual(
      resolveQuickCreateVehicleAction({
        action: 'expenses',
        activeView,
        selectedVehicle: v1,
        garageVehicles: [v1],
      }),
      { mode: 'pick_vehicle' }
    );
  }
});

test('resolveQuickCreateVehicleAction preselects current vehicle directly when viewing VehicleDetail', () => {
  const v1 = makeVehicle({ id: '1', make: 'Peugeot', model: '308', status: 'for_sale' });
  const v2 = makeVehicle({ id: '2', make: 'Renault', model: 'Clio', status: 'for_sale' });

  assert.deepEqual(
    resolveQuickCreateVehicleAction({
      action: 'sales',
      activeView: 'desktop',
      selectedVehicle: v2,
      garageVehicles: [v1, v2],
    }),
    { mode: 'direct', vehicle: v2 }
  );

  assert.deepEqual(
    resolveQuickCreateVehicleAction({
      action: 'expenses',
      activeView: 'desktop',
      selectedVehicle: v2,
      garageVehicles: [v1, v2],
    }),
    { mode: 'direct', vehicle: v2 }
  );
});

test('resolveQuickCreateVehicleAction on sold vehicle detail allows expenses directly, but requires picking unsold car for sales', () => {
  const soldCar = makeVehicle({ id: '1', make: 'Peugeot', model: '308', status: 'sold' });
  const activeCar = makeVehicle({ id: '2', make: 'Renault', model: 'Clio', status: 'for_sale' });

  assert.deepEqual(
    resolveQuickCreateVehicleAction({
      action: 'expenses',
      activeView: 'sold_vehicles',
      selectedVehicle: soldCar,
      garageVehicles: [soldCar, activeCar],
    }),
    { mode: 'direct', vehicle: soldCar }
  );

  assert.deepEqual(
    resolveQuickCreateVehicleAction({
      action: 'sales',
      activeView: 'sold_vehicles',
      selectedVehicle: soldCar,
      garageVehicles: [soldCar, activeCar],
    }),
    { mode: 'pick_vehicle' }
  );

  assert.deepEqual(
    resolveQuickCreateVehicleAction({
      action: 'sales',
      activeView: 'sold_vehicles',
      selectedVehicle: soldCar,
      garageVehicles: [soldCar],
    }),
    { mode: 'empty' }
  );
});

test('getQuickCreateEligibleVehicles excludes sold vehicles for sales and orders active before sold for expenses', () => {
  const soldCar = makeVehicle({ id: '1', make: 'Peugeot', model: '308', status: 'sold' });
  const prepCar = makeVehicle({ id: '2', make: 'Renault', model: 'Clio', status: 'preparation' });
  const saleCar = makeVehicle({ id: '3', make: 'BMW', model: 'Serie 1', status: 'for_sale' });

  const forSales = getQuickCreateEligibleVehicles([soldCar, prepCar, saleCar], 'sales');
  assert.deepEqual(
    forSales.map((v) => v.id),
    ['2', '3']
  );

  const forExpenses = getQuickCreateEligibleVehicles([soldCar, prepCar, saleCar], 'expenses');
  assert.deepEqual(
    forExpenses.map((v) => v.id),
    ['2', '3', '1']
  );
});

test('filterQuickCreateVehicles searches by make, model, and license plate (normalized or formatted)', () => {
  const v1 = makeVehicle({ id: '1', make: 'Peugeot', model: '308', registrationNumber: 'AA-123-BB' });
  const v2 = makeVehicle({ id: '2', make: 'Renault', model: 'Clio V', registrationNumber: 'GH-908-ZK' });

  assert.deepEqual(
    filterQuickCreateVehicles([v1, v2], 'clio').map((v) => v.id),
    ['2']
  );
  assert.deepEqual(
    filterQuickCreateVehicles([v1, v2], 'gh908zk').map((v) => v.id),
    ['2']
  );
  assert.deepEqual(
    filterQuickCreateVehicles([v1, v2], 'AA-123').map((v) => v.id),
    ['1']
  );
  assert.deepEqual(
    filterQuickCreateVehicles([v1, v2], '   ').map((v) => v.id),
    ['1', '2']
  );
});
