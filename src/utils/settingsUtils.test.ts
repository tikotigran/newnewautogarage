import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSiret,
  validatePostalCode,
  validateGarageSettings,
  serializeBackupPayload,
  parseBackupPayload,
  vehiclesToCsv,
} from './settingsUtils';
import { GarageSettings, Vehicle } from '../types/garage';

const validSettings: GarageSettings = {
  name: 'AutoGarage Manager SARL',
  siret: '894 123 456 00012',
  streetNumber: '12',
  streetExtension: 'bis',
  streetType: 'Rue',
  streetName: 'de l’Industrie',
  postalCode: '75011',
  city: 'Paris',
  phone: '01 45 88 90 00',
  email: 'contact@autogarage.fr',
  defaultCerfaTemplate: 'cerfa_15776_02',
  theme: 'dark',
};

test('validateSiret accepts 14 digits with or without spaces and rejects invalid lengths', () => {
  const ok = validateSiret('894 123 456 00012');
  assert.equal(ok.valid, true);
  assert.equal(ok.cleaned, '89412345600012');

  const short = validateSiret('894123456');
  assert.equal(short.valid, false);
  assert.ok(short.error);

  const alpha = validateSiret('8941234560001A');
  assert.equal(alpha.valid, false);
});

test('validatePostalCode accepts 5 digits and rejects invalid codes', () => {
  const ok = validatePostalCode(' 75011 ');
  assert.equal(ok.valid, true);
  assert.equal(ok.cleaned, '75011');

  const bad = validatePostalCode('7501');
  assert.equal(bad.valid, false);
});

test('validateGarageSettings returns empty errors for valid profile and flags missing/invalid fields', () => {
  assert.deepEqual(validateGarageSettings(validSettings), {});

  const invalid: GarageSettings = {
    ...validSettings,
    name: '  ',
    siret: '1234',
    postalCode: '750',
    email: 'not-an-email',
  };
  const errs = validateGarageSettings(invalid);
  assert.ok(errs.name);
  assert.ok(errs.siret);
  assert.ok(errs.postalCode);
  assert.ok(errs.email);

  // Personne physique skips name/siret and validates lastName + firstName
  const physiqueValid: GarageSettings = {
    ...validSettings,
    entityType: 'physique',
    name: '',
    siret: '',
    lastName: 'Dupont',
    firstName: 'Jean',
    sex: 'M',
  };
  assert.deepEqual(validateGarageSettings(physiqueValid), {});

  const physiqueMissing = validateGarageSettings({
    ...physiqueValid,
    lastName: '',
    firstName: '',
  });
  assert.ok(physiqueMissing.lastName);
  assert.ok(physiqueMissing.firstName);
  assert.equal(physiqueMissing.siret, undefined);
});

test('serializeBackupPayload and parseBackupPayload round-trip cleanly and reject invalid JSON', () => {
  const sampleVehicle: Vehicle = {
    id: 'veh_1',
    userId: 'u1',
    make: 'Volkswagen',
    model: 'Golf VII',
    trim: '1.6 TDI',
    year: 2019,
    mileage: 94000,
    vin: 'WVWZZZAUZKP512984',
    purchaseDate: '2026-08-10',
    purchasePrice: 10400,
    targetSalePrice: 13990,
    status: 'for_sale',
    photos: [],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 10400,
    netProfit: 3590,
    marginPercentage: 25.66,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  };

  const json = serializeBackupPayload({
    version: 1,
    exportedAt: '2026-11-10T10:00:00.000Z',
    vehicles: [sampleVehicle],
    repairs: [],
    expenses: [],
    settings: validSettings,
  });

  const restored = parseBackupPayload(json);
  assert.equal(restored.vehicles.length, 1);
  assert.equal(restored.vehicles[0].vin, 'WVWZZZAUZKP512984');
  assert.equal(restored.settings.siret, validSettings.siret);

  assert.throws(() => parseBackupPayload('{bad json'), /invalide/i);
  assert.throws(() => parseBackupPayload('{"vehicles": "nope"}'), /vehicles/i);
});

test('vehiclesToCsv formats headers and rows with semicolon delimiter', () => {
  const csv = vehiclesToCsv([
    {
      id: 'veh_1',
      userId: 'u1',
      make: 'Peugeot',
      model: '208',
      trim: 'GT;Line',
      year: 2021,
      mileage: 48500,
      vin: 'VF3UPHNK0MT129841',
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
      createdAt: '',
      updatedAt: '',
    },
  ]);

  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('ID;Marque;Modele;'));
  assert.ok(lines[1].includes('"GT;Line"'));
});
