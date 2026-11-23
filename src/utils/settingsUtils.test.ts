import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSiret,
  validatePostalCode,
  validateIban,
  validateEmail,
  validateHexColor,
  normalizeHexColor,
  hexToRgbTuple,
  isLightRgb,
  validateGarageSettings,
  serializeBackupPayload,
  parseBackupPayload,
  vehiclesToCsv,
  buildSalesJournalCsv,
  buildExpensesJournalCsv,
  buildAccountantMailtoUrl,
} from './settingsUtils';
import { buildFacturXXml } from './exportBackup';
import { GarageSettings, GeneralExpense, Purchase, RepairTask, Vehicle } from '../types/garage';

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
    streetNumber: '',
    postalCode: '750',
    email: 'not-an-email',
  };
  const errs = validateGarageSettings(invalid);
  assert.ok(errs.name);
  assert.ok(errs.siret);
  assert.ok(errs.streetNumber);
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

test('DEFAULT_GARAGE_SETTINGS initializes all profile, address, and contact fields as empty strings', async () => {
  const { DEFAULT_GARAGE_SETTINGS } = await import('../services/garageService');
  const emptyKeys: Array<keyof GarageSettings> = [
    'name',
    'lastName',
    'firstName',
    'sex',
    'siret',
    'streetNumber',
    'streetExtension',
    'streetType',
    'streetName',
    'postalCode',
    'city',
    'phone',
    'email',
  ];
  for (const key of emptyKeys) {
    assert.equal(
      DEFAULT_GARAGE_SETTINGS[key],
      '',
      `Expected DEFAULT_GARAGE_SETTINGS.${String(key)} to be empty string`
    );
  }
  const errs = validateGarageSettings(DEFAULT_GARAGE_SETTINGS);
  assert.ok(errs.name);
  assert.ok(errs.streetNumber);
  assert.ok(errs.streetName);
  assert.ok(errs.postalCode);
  assert.ok(errs.city);
  assert.ok(errs.email);
});

test('validateIban, validateEmail, and hex/rgb color helpers validate and convert cleanly', () => {
  assert.equal(validateIban('').valid, true);
  const okIban = validateIban('fr76 3000 6000 0112 3456 7890 189');
  assert.equal(okIban.valid, true);
  assert.equal(okIban.cleaned, 'FR7630006000011234567890189');

  assert.equal(validateIban('INVALID-IBAN').valid, false);
  assert.equal(validateEmail('compta@garage.fr'), true);
  assert.equal(validateEmail('bad-email'), false);

  assert.equal(validateHexColor('#0f172a'), true);
  assert.equal(validateHexColor('#fff'), true);
  assert.equal(validateHexColor('0f172a'), false);
  assert.equal(normalizeHexColor('#abc', '#000000'), '#aabbcc');
  assert.deepEqual(hexToRgbTuple('#f59e0b', [0, 0, 0]), [245, 158, 11]);
  assert.equal(isLightRgb([255, 255, 255]), true);
  assert.equal(isLightRgb([15, 23, 42]), false);

  const badSettingsErrs = validateGarageSettings({
    ...validSettings,
    iban: '12345',
    accountantEmail: 'not-valid',
  });
  assert.ok(badSettingsErrs.iban);
  assert.ok(badSettingsErrs.accountantEmail);
});

test('buildSalesJournalCsv and buildExpensesJournalCsv filter by period and compute totals', () => {
  const soldInMonth: Vehicle = {
    id: 'v_sold_1',
    userId: 'u1',
    make: 'Renault',
    model: 'Clio V',
    trim: '1.0 TCe',
    year: 2021,
    mileage: 42000,
    vin: 'VF1RJA00000000001',
    registrationNumber: 'AA-111-BB',
    purchaseDate: '2026-10-01',
    purchasePrice: 8000,
    targetSalePrice: 11500,
    status: 'sold',
    purchaseStatus: 'micro',
    photos: [],
    documents: [],
    repairCostTotal: 500,
    generalExpensesTotal: 150,
    totalExpenses: 650,
    totalInvested: 8650,
    netProfit: 2850,
    marginPercentage: 24.78,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
    buyerInfo: {
      fullName: 'Claire Dupont',
      phone: '0600000001',
      email: 'claire@example.fr',
      address: 'Lyon',
      salePrice: 11500,
      saleDate: '2026-11-12',
      sellerProfileType: 'micro_entrepreneur',
    },
  };

  const soldOlder: Vehicle = {
    ...soldInMonth,
    id: 'v_sold_old',
    buyerInfo: {
      ...soldInMonth.buyerInfo!,
      saleDate: '2026-06-05',
      salePrice: 9000,
    },
  };

  const repairs: RepairTask[] = [
    {
      id: 'r1',
      vehicleId: 'v_sold_1',
      userId: 'u1',
      title: 'Vidange; filtre',
      status: 'done',
      partsCost: 120,
      laborCost: 80,
      totalCost: 200,
      date: '2026-11-05',
      createdAt: '2026-11-05T00:00:00.000Z',
      updatedAt: '2026-11-05T00:00:00.000Z',
    },
  ];
  const expenses: GeneralExpense[] = [
    {
      id: 'e1',
      vehicleId: 'v_sold_1',
      userId: 'u1',
      category: 'admin',
      description: 'Carte grise',
      amount: 150,
      date: '2026-11-08',
      createdAt: '2026-11-08T00:00:00.000Z',
      updatedAt: '2026-11-08T00:00:00.000Z',
    },
  ];
  const purchases: Purchase[] = [
    {
      id: 'p1',
      userId: 'u1',
      supplierId: 's1',
      supplierName: 'Oscaro Pro',
      supplierType: 'parts_supplier',
      category: 'parts',
      description: 'Plaquettes frein',
      amount: 95,
      date: '2026-11-09',
      paymentMethod: 'card',
      vehicleDocuments: [],
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-09T00:00:00.000Z',
    },
  ];

  const now = new Date('2026-11-20T12:00:00Z');
  const salesRes = buildSalesJournalCsv({
    vehicles: [soldInMonth, soldOlder],
    garageSettings: validSettings,
    timeRange: 'month',
    now,
  });
  assert.equal(salesRes.count, 1);
  assert.equal(salesRes.totalRevenue, 11500);
  assert.ok(salesRes.csv.includes('Claire Dupont'));
  assert.ok(salesRes.csv.includes('VF1RJA00000000001'));

  const expRes = buildExpensesJournalCsv({
    vehicles: [soldInMonth],
    repairs,
    expenses,
    purchases,
    timeRange: 'month',
    now,
  });
  assert.equal(expRes.count, 3);
  assert.equal(expRes.totalAmount, 445);
  assert.ok(expRes.csv.includes('"Vidange; filtre"'));

  const mailto = buildAccountantMailtoUrl({
    accountantEmail: 'compta@cabinet.fr',
    garageName: 'AutoGarage Manager SARL',
    siret: '89412345600012',
    periodLabel: 'Ce mois',
    soldCount: salesRes.count,
    totalRevenue: salesRes.totalRevenue,
    expensesCount: expRes.count,
    totalExpenses: expRes.totalAmount,
    lang: 'fr',
  });
  assert.ok(mailto.startsWith('mailto:compta%40cabinet.fr?subject='));
  assert.ok(mailto.includes('11500.00'));
});

test('buildFacturXXml includes country, optional VAT number, and IBAN when provided', () => {
  const settingsWithBank: GarageSettings = {
    ...validSettings,
    country: 'France',
    vatNumber: 'FR12894123456',
    iban: 'FR76 3000 6000 0112 3456 7890 189',
  };
  const veh: Vehicle = {
    id: 'veh_fx',
    userId: 'u1',
    make: 'Peugeot',
    model: '3008',
    trim: 'Allure',
    year: 2020,
    mileage: 61000,
    vin: 'VF3MCYHZJLS000001',
    purchaseDate: '2026-10-01',
    purchasePrice: 13000,
    targetSalePrice: 16900,
    status: 'sold',
    photos: [],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 13000,
    netProfit: 3900,
    marginPercentage: 23.08,
    createdAt: '',
    updatedAt: '',
  };
  const xml = buildFacturXXml(veh, settingsWithBank);
  assert.ok(xml.includes('<ram:CountryID>FR</ram:CountryID>'));
  assert.ok(xml.includes('FR12894123456'));
  assert.ok(xml.includes('FR7630006000011234567890189'));
});


