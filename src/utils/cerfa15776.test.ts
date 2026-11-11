import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialCerfaData,
  formatFrenchDate,
  sanitizeWinAnsi,
  splitFrenchDateDigits,
  splitStreetTypeAndName,
  validateCerfaStep,
  CERFA_15776_CONFIG,
} from './cerfa15776';
import { GarageSettings, Vehicle } from '../types/garage';

const mockVehicle: Vehicle = {
  id: 'veh_1',
  userId: 'user_1',
  make: 'Volkswagen',
  model: 'Golf VII - 1.6 TDI 115ch',
  trim: 'Confortline DSG7',
  year: 2019,
  mileage: 94000,
  vin: 'WVWZZZAUZKP512984',
  purchaseDate: '2026-10-01',
  purchasePrice: 9500,
  targetSalePrice: 12900,
  status: 'for_sale',
  photos: [],
  documents: [],
  buyerInfo: {
    fullName: 'Tigran Sergoyan',
    isCompany: false,
    birthDate: '1990-01-01',
    birthPlace: 'Erevan',
    streetNumber: '1',
    streetName: 'square des hautes ourmes',
    postalCode: '35200',
    city: 'Rennes',
    address: '1 square des hautes ourmes, 35200 Rennes',
    phone: '06 11 22 33 44',
    email: 'tigran@example.com',
    salePrice: 12500,
    saleDate: '2026-11-10',
    saleTime: '14:00',
  },
  repairCostTotal: 0,
  generalExpensesTotal: 0,
  totalExpenses: 0,
  totalInvested: 9500,
  netProfit: 3000,
  marginPercentage: 24,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-11-10T10:00:00Z',
};

const mockGarage: GarageSettings = {
  name: 'AutoGarage Manager SARL',
  siret: '894 123 456 00012',
  streetNumber: '12',
  streetName: 'Rue de l’Industrie',
  postalCode: '75011',
  city: 'Paris',
  phone: '01 45 88 90 00',
  email: 'contact@autogarage.fr',
};

test('formatFrenchDate and splitFrenchDateDigits convert ISO dates to DD/MM/YYYY', () => {
  assert.equal(formatFrenchDate('2026-11-10'), '10/11/2026');
  assert.deepEqual(splitFrenchDateDigits('2026-11-10'), { dd: '10', mm: '11', yyyy: '2026' });
  assert.equal(formatFrenchDate('01/01/2019'), '01/01/2019');
});

test('splitStreetTypeAndName extracts street type prefix', () => {
  assert.deepEqual(splitStreetTypeAndName('Rue de l’Industrie'), {
    streetType: 'Rue',
    streetName: 'de l’Industrie',
  });
  assert.deepEqual(splitStreetTypeAndName('square des hautes ourmes'), {
    streetType: 'square',
    streetName: 'des hautes ourmes',
  });
});

test('sanitizeWinAnsi replaces curly apostrophes and strips non-WinAnsi glyphs', () => {
  assert.equal(sanitizeWinAnsi('Rue de l’Industrie — №1'), "Rue de l'Industrie - 1");
});

test('buildInitialCerfaData pre-fills all 3 steps from vehicle, garage, and buyer', () => {
  const data = buildInitialCerfaData(mockVehicle, mockGarage);
  assert.equal(data.vehicle.vin, 'WVWZZZAUZKP512984');
  assert.equal(data.vehicle.make, 'VOLKSWAGEN');
  assert.equal(data.vehicle.mileage, 94000);
  assert.equal(data.seller.entityType, 'morale');
  assert.equal(data.seller.siret, '89412345600012');
  assert.equal(data.seller.streetType, 'Rue');
  assert.equal(data.buyer.nameOrCompany, 'Tigran Sergoyan');
  assert.equal(data.buyer.streetType, 'square');
  assert.equal(data.buyer.postalCode, '35200');

  const physiqueData = buildInitialCerfaData(mockVehicle, {
    ...mockGarage,
    entityType: 'physique',
    lastName: 'Dupont',
    firstName: 'Jean',
    sex: 'M',
  });
  assert.equal(physiqueData.seller.entityType, 'physique');
  assert.equal(physiqueData.seller.sex, 'M');
  assert.equal(physiqueData.seller.nameOrCompany, 'DUPONT JEAN');
  assert.equal(physiqueData.seller.siret, '');

  const withPlate = buildInitialCerfaData(
    { ...mockVehicle, registrationNumber: 'AB-123-CD', vin: 'WVWZZZAUZKP512984' },
    mockGarage
  );
  assert.equal(withPlate.vehicle.registrationNumber, 'AB-123-CD');
  assert.equal(withPlate.vehicle.vin, 'WVWZZZAUZKP512984');
});

test('validateCerfaStep catches missing required fields per step', () => {
  const data = buildInitialCerfaData(mockVehicle, mockGarage);
  // Step 1 requires registrationNumber when VIN > 10 chars
  const step1Errors = validateCerfaStep(1, data);
  assert.ok(step1Errors.registrationNumber);

  data.vehicle.registrationNumber = 'AB-123-CD';
  assert.deepEqual(validateCerfaStep(1, data), {});
  assert.deepEqual(validateCerfaStep(2, data), {});
  assert.deepEqual(validateCerfaStep(3, data), {});
});

test('CERFA_15776_CONFIG exposes structured sections with valid coordinates', () => {
  assert.ok(CERFA_15776_CONFIG.templatePath.endsWith('cerfa_15776-02__1__c28daa99.pdf'));
  assert.equal(CERFA_15776_CONFIG.section1Vehicle.vin.maxChars, 17);
  assert.equal(CERFA_15776_CONFIG.section2Seller.siret.maxChars, 14);
  assert.equal(CERFA_15776_CONFIG.section3Buyer.address.postalCode.maxChars, 5);
  assert.ok(CERFA_15776_CONFIG.section2Seller.signatures.faitA.y > CERFA_15776_CONFIG.section3Buyer.signatures.faitA.y);
  assert.ok(CERFA_15776_CONFIG.checkboxes.opposeProspecting.x > 0);
});
