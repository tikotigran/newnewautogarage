import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialCerfaData,
  buildVehicleCerfaPatch,
  CERFA_TEMPLATE_OPTIONS,
  createCalibrationDummyCerfaData,
  createDemoCerfaVehicle,
  formatFrenchDate,
  pickCerfaTargetVehicle,
  sanitizeWinAnsi,
  splitFrenchDateDigits,
  splitStreetTypeAndName,
  validateCerfaStep,
  CERFA_15776_CONFIG,
} from './cerfa15776';
import {
  applyOffsetsToCerfa15776Config,
  CALIBRATION_DUMMY_TEMPLATE_VALUES,
  createDefaultCerfaTemplatesCalibration,
  DEFAULT_CERFA_13750_07_FIELDS,
  DEFAULT_DECLARATION_ACHAT_FIELDS,
  getCerfa15776FieldAtPath,
  getEffectiveCerfa15776Config,
  resolveCerfaTemplatesCalibration,
  setCachedCerfaTemplatesCalibration,
  updateCerfa15776FieldAtPath,
} from './cerfaConfig';
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

test('pickCerfaTargetVehicle prioritizes preferred ID, then selected, then first vehicle, then demo fallback', () => {
  const secondVehicle: Vehicle = { ...mockVehicle, id: 'veh_2', make: 'Peugeot', model: '208 GT' };
  const pickedPreferred = pickCerfaTargetVehicle({
    preferredVehicleId: 'veh_2',
    selectedVehicle: mockVehicle,
    vehicles: [mockVehicle, secondVehicle],
  });
  assert.equal(pickedPreferred.isDemo, false);
  assert.equal(pickedPreferred.vehicle.id, 'veh_2');

  const pickedFirst = pickCerfaTargetVehicle({
    vehicles: [mockVehicle, secondVehicle],
  });
  assert.equal(pickedFirst.isDemo, false);
  assert.equal(pickedFirst.vehicle.id, 'veh_1');

  const pickedDemo = pickCerfaTargetVehicle({
    vehicles: [],
    userId: 'usr_99',
  });
  assert.equal(pickedDemo.isDemo, true);
  assert.equal(pickedDemo.vehicle.id, createDemoCerfaVehicle('usr_99').id);
  assert.ok(CERFA_TEMPLATE_OPTIONS.some((opt) => opt.id === 'cerfa_15776_02'));
});

test('buildVehicleCerfaPatch returns only modified plate, vin, or mileage', () => {
  const baseVehicle: Vehicle = { ...mockVehicle, registrationNumber: 'AA-111-AA' };
  const unchanged = buildVehicleCerfaPatch(baseVehicle, {
    registrationNumber: 'aa-111-aa',
    vin: 'WVWZZZAUZKP512984',
    make: 'VOLKSWAGEN',
    typeVariantVersion: '',
    commercialDesignation: '',
    firstRegistrationDate: '',
    nationalGenre: 'VP',
    mileage: 94000,
    hasRegistrationCertificate: true,
    formulaNumber: '',
    certificateDate: '',
    absenceReason: '',
  });
  assert.equal(unchanged, null);

  const modified = buildVehicleCerfaPatch(baseVehicle, {
    registrationNumber: 'bb-222-bb',
    vin: 'WVWZZZAUZKP512984',
    make: 'VOLKSWAGEN',
    typeVariantVersion: '',
    commercialDesignation: '',
    firstRegistrationDate: '',
    nationalGenre: 'VP',
    mileage: 95500,
    hasRegistrationCertificate: true,
    formulaNumber: '',
    certificateDate: '',
    absenceReason: '',
  });
  assert.deepEqual(modified, {
    registrationNumber: 'BB-222-BB',
    mileage: 95500,
  });
});

test('buildInitialCerfaData pre-fills Carte Grise codes (D.2, J.1, formulaNumber, certificateDate) from vehicle', () => {
  const withCarteGrise: Vehicle = {
    ...mockVehicle,
    registrationNumber: 'CD-456-EF',
    typeVariantVersion: 'M10PGTVP000H451',
    nationalGenre: 'CTTE',
    bodyType: 'FOURGON',
    formulaNumber: '2022AB98765',
    certificateDate: '2022-03-15',
  };
  const data = buildInitialCerfaData(withCarteGrise, mockGarage);
  assert.equal(data.vehicle.typeVariantVersion, 'M10PGTVP000H451');
  assert.equal(data.vehicle.nationalGenre, 'CTTE');
  assert.equal(data.vehicle.formulaNumber, '2022AB98765');
  assert.equal(data.vehicle.certificateDate, '2022-03-15');
});

test('resolveCerfaTemplatesCalibration merges partial cloud data with defaults safely', () => {
  const defaults = createDefaultCerfaTemplatesCalibration();
  assert.ok(defaults.cerfa_13750_07.fields.registrationNumber);
  assert.ok(defaults.declaration_achat.fields.dealerSiret);

  const resolved = resolveCerfaTemplatesCalibration({
    cerfa_15776_02: {
      offsets: { offsetX: 3.5, offsetY: -2, fontSizeDelta: 0.5 },
      config: updateCerfa15776FieldAtPath(
        defaults.cerfa_15776_02.config,
        'section1Vehicle.registrationNumber',
        { x: 42, y: 725 }
      ),
    },
    cerfa_13750_07: {
      offsets: { offsetX: 1, offsetY: 2, fontSizeDelta: 0 },
      fields: {
        registrationNumber: { label: '(A) Immatriculation', x: 60, y: 715, size: 9.5, stepX: 14 },
      },
    },
  });

  assert.equal(resolved.cerfa_15776_02.offsets.offsetX, 3.5);
  assert.equal(resolved.cerfa_15776_02.config.section1Vehicle.registrationNumber.x, 42);
  assert.equal(resolved.cerfa_15776_02.config.section1Vehicle.vin.maxChars, 17);
  assert.equal(resolved.cerfa_13750_07.fields.registrationNumber.x, 60);
  assert.ok(resolved.cerfa_13750_07.fields.vin.x > 0);
  assert.equal(resolved.declaration_achat.offsets.offsetX, 0);
});

test('applyOffsetsToCerfa15776Config shifts nested field coordinates and clamps min font size', () => {
  const shifted = applyOffsetsToCerfa15776Config(CERFA_15776_CONFIG, {
    offsetX: 4,
    offsetY: -3,
    fontSizeDelta: -10,
  });

  assert.equal(
    shifted.section1Vehicle.registrationNumber.x,
    CERFA_15776_CONFIG.section1Vehicle.registrationNumber.x + 4
  );
  assert.equal(
    shifted.section1Vehicle.registrationNumber.y,
    CERFA_15776_CONFIG.section1Vehicle.registrationNumber.y - 3
  );
  assert.equal(shifted.section1Vehicle.registrationNumber.size, 4);
  assert.equal(
    shifted.checkboxes.opposeProspecting.x,
    CERFA_15776_CONFIG.checkboxes.opposeProspecting.x + 4
  );
});

test('updateCerfa15776FieldAtPath and getEffectiveCerfa15776Config preserve calibrated coordinates', () => {
  const defaults = createDefaultCerfaTemplatesCalibration();
  const updated = updateCerfa15776FieldAtPath(
    defaults.cerfa_15776_02.config,
    'section1Vehicle.registrationNumber',
    { x: 44.5, y: 726.5, size: 9, stepX: 14.2 }
  );
  const readBack = getCerfa15776FieldAtPath(updated, 'section1Vehicle.registrationNumber');
  assert.deepEqual(readBack, {
    x: 44.5,
    y: 726.5,
    size: 9,
    stepX: 14.2,
    maxChars: CERFA_15776_CONFIG.section1Vehicle.registrationNumber.maxChars,
    bold: true,
  });

  const effective = getEffectiveCerfa15776Config(updated, {
    offsetX: 2,
    offsetY: -1,
    fontSizeDelta: 0.5,
  });
  assert.equal(effective.section1Vehicle.registrationNumber.x, 46.5);
  assert.equal(effective.section1Vehicle.registrationNumber.y, 725.5);
  assert.equal(effective.section1Vehicle.registrationNumber.size, 9.5);
});

test('sanitizeWinAnsi converts French narrow and regular no-break spaces to normal ASCII space', () => {
  assert.equal(sanitizeWinAnsi('84\u202f500\u00a0km'), '84 500 km');
});

test('createCalibrationDummyCerfaData populates 100% of Cerfa fields with independent French dummy values', () => {
  const dummy = createCalibrationDummyCerfaData();
  assert.equal(dummy.vehicle.registrationNumber, 'AB-123-CD');
  assert.equal(dummy.vehicle.firstRegistrationDate, '2020-06-15');
  assert.equal(dummy.vehicle.make, 'PEUGEOT');
  assert.equal(dummy.vehicle.typeVariantVersion, 'UPHNK0MT129841');
  assert.equal(dummy.vehicle.commercialDesignation, '208 GT LINE');
  assert.equal(dummy.vehicle.vin, 'VF3UPHNK0MT129841');
  assert.equal(dummy.vehicle.nationalGenre, 'VP');
  assert.equal(dummy.vehicle.bodywork, 'CI');
  assert.equal(dummy.vehicle.mileage, 84500);
  assert.equal(dummy.vehicle.formulaNumber, '2021AB12345');
  assert.equal(dummy.vehicle.certificateDate, '2021-09-20');

  assert.equal(dummy.seller.entityType, 'morale');
  assert.equal(dummy.seller.nameOrCompany, 'AUTOGARAGE MANAGER SARL');
  assert.equal(dummy.seller.siret, '89412345600012');
  assert.equal(dummy.seller.postalCode, '75011');
  assert.equal(dummy.seller.city, 'PARIS');
  assert.equal(dummy.seller.saleDate, '2026-11-17');
  assert.equal(dummy.seller.saleTime, '14:30');
  assert.equal(dummy.seller.signingCity, 'PARIS');
  assert.equal(dummy.seller.saleType, 'cession');

  assert.equal(dummy.buyer.entityType, 'physique');
  assert.equal(dummy.buyer.nameOrCompany, 'DUPONT JEAN-MARC');
  assert.equal(dummy.buyer.birthDate, '1985-04-12');
  assert.equal(dummy.buyer.birthPlace, 'LYON');
  assert.equal(dummy.buyer.postalCode, '69003');
  assert.equal(dummy.buyer.city, 'LYON');

  assert.deepEqual(validateCerfaStep(1, dummy), {});
  assert.deepEqual(validateCerfaStep(2, dummy), {});
  assert.deepEqual(validateCerfaStep(3, dummy), {});

  for (const key of Object.keys(DEFAULT_CERFA_13750_07_FIELDS)) {
    assert.ok(
      CALIBRATION_DUMMY_TEMPLATE_VALUES[key]?.trim().length,
      `Missing dummy value for 13750*07 field ${key}`
    );
  }
  for (const key of Object.keys(DEFAULT_DECLARATION_ACHAT_FIELDS)) {
    assert.ok(
      CALIBRATION_DUMMY_TEMPLATE_VALUES[key]?.trim().length,
      `Missing dummy value for Déclaration d'Achat field ${key}`
    );
  }
});

test('getEffectiveCerfa15776Config() resolves saved Superadmin calibration & offsets as single source of truth', () => {
  const store = new Map<string, string>();
  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevStorage = (globalThis as { localStorage?: unknown }).localStorage;

  (globalThis as { window: unknown }).window = {
    dispatchEvent: () => true,
  };
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };

  try {
    const defaults = createDefaultCerfaTemplatesCalibration();
    const calibratedConfig = updateCerfa15776FieldAtPath(
      defaults.cerfa_15776_02.config,
      'section1Vehicle.vin',
      { x: 111.5, y: 699, size: 10 }
    );
    setCachedCerfaTemplatesCalibration({
      cerfa_15776_02: {
        offsets: { offsetX: 5, offsetY: -3, fontSizeDelta: 1 },
        config: calibratedConfig,
      },
    });

    const effective = getEffectiveCerfa15776Config();
    assert.equal(effective.section1Vehicle.vin.x, 116.5);
    assert.equal(effective.section1Vehicle.vin.y, 696);
    assert.equal(effective.section1Vehicle.vin.size, 11);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
    if (prevStorage === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    } else {
      (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
    }
  }
});





