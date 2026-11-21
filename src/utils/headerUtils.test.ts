import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceNotifications,
  countUnreadNotifications,
  getHeaderLanguageOption,
  HEADER_LANGUAGE_OPTIONS,
} from './headerUtils';
import type { Vehicle } from '../types/garage';

const makeVehicle = (overrides: Partial<Vehicle>): Vehicle => ({
  id: 'v1',
  userId: 'u1',
  make: 'Peugeot',
  model: '208',
  trim: 'GT Line',
  year: 2021,
  mileage: 45000,
  vin: 'VF3UPHNK0MT129841',
  registrationNumber: 'AB-123-CD',
  purchasePrice: 10000,
  purchaseDate: '2026-01-10',
  targetSalePrice: 13500,
  status: 'for_sale',
  photos: [],
  documents: [],
  repairCostTotal: 0,
  generalExpensesTotal: 0,
  totalExpenses: 0,
  totalInvested: 10000,
  netProfit: 0,
  marginPercentage: 0,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
  ...overrides,
});

test('HEADER_LANGUAGE_OPTIONS exposes FR, RU, AM, GE badges mapped to internal locales', () => {
  assert.deepEqual(
    HEADER_LANGUAGE_OPTIONS.map((o) => ({ code: o.code, badge: o.badge })),
    [
      { code: 'fr', badge: 'FR' },
      { code: 'ru', badge: 'RU' },
      { code: 'hy', badge: 'AM' },
      { code: 'ka', badge: 'GE' },
    ]
  );
  assert.equal(getHeaderLanguageOption('hy').badge, 'AM');
  assert.equal(getHeaderLanguageOption('ka').badge, 'GE');
  assert.equal(getHeaderLanguageOption('ru').badge, 'RU');
  assert.equal(getHeaderLanguageOption('fr').badge, 'FR');
});

test('buildWorkspaceNotifications builds actionable alerts and respects unread tracking', () => {
  const vehicles = [
    makeVehicle({
      id: 'v-repair',
      status: 'repair',
      make: 'Renault',
      model: 'Clio V',
      updatedAt: '2026-10-05T10:00:00.000Z',
    }),
    makeVehicle({
      id: 'v-prep',
      status: 'preparation',
      make: 'Peugeot',
      model: '208',
      vin: '',
      updatedAt: '2026-10-04T10:00:00.000Z',
    }),
    makeVehicle({
      id: 'v-sold',
      status: 'sold',
      make: 'Audi',
      model: 'A3',
      vin: '',
      updatedAt: '2026-10-06T10:00:00.000Z',
    }),
  ];

  const notifications = buildWorkspaceNotifications({ vehicles, lang: 'ru' });
  // Sold vehicle with missing VIN should NOT raise missing-VIN alert
  assert.equal(notifications.some((n) => n.vehicleId === 'v-sold'), false);
  // Repair + preparation + missing-VIN alert for Peugeot 208
  assert.equal(notifications.length, 3);
  assert.equal(notifications[0].id, 'veh-repair-v-repair');

  const readSet = new Set<string>(['veh-repair-v-repair']);
  assert.equal(countUnreadNotifications(notifications, readSet), 2);
});
