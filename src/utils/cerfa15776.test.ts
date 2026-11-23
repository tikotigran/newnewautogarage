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
  resolveCerfaSellerModeForVehicle,
  resolveCerfaTargetGarageId,
  sanitizeWinAnsi,
  splitFrenchDateDigits,
  splitStreetTypeAndName,
  validateAllCerfaSteps,
  validateCerfaStep,
  CERFA_15776_CONFIG,
} from './cerfa15776';
import {
  applyOffsetsToCerfa15776Config,
  createDefaultCerfaTemplatesCalibration,
  getCerfa15776FieldAtPath,
  getEffectiveCerfa15776Config,
  normalizeCerfaTemplateId,
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
  commercialDesignation: 'GOLF VII 1.6 TDI',
  firstRegistrationDate: '2019-03-10',
  trim: 'Confortline DSG7',
  year: 2019,
  mileage: 94000,
  vin: 'WVWZZZAUZKP512984',
  hasRegistrationCertificate: true,
  formulaNumber: '2019AB55555',
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

  // Per-deal Particulier overrides commercial garage settings (forces physique + empty SIRET)
  const perDealParticulier = buildInitialCerfaData(
    {
      ...mockVehicle,
      buyerInfo: { ...mockVehicle.buyerInfo!, sellerProfileType: 'particulier' },
    },
    { ...mockGarage, entityType: 'morale', lastName: 'Martin', firstName: 'Luc', sex: 'M' }
  );
  assert.equal(perDealParticulier.seller.entityType, 'physique');
  assert.equal(perDealParticulier.seller.siret, '');
  assert.equal(perDealParticulier.seller.nameOrCompany, 'MARTIN LUC');

  // Per-deal Micro-entrepreneur keeps SIRET and morale entity for business Cerfa when SIRET is configured
  const perDealMicro = buildInitialCerfaData(
    {
      ...mockVehicle,
      buyerInfo: { ...mockVehicle.buyerInfo!, sellerProfileType: 'micro_entrepreneur' },
    },
    { ...mockGarage, entityType: 'physique', lastName: 'Martin', firstName: 'Luc' }
  );
  assert.equal(perDealMicro.seller.entityType, 'morale');
  assert.equal(perDealMicro.seller.siret, '89412345600012');
});

test('validateCerfaStep & validateAllCerfaSteps catch missing mandatory Cerfa fields across all steps', () => {
  const data = buildInitialCerfaData(mockVehicle, mockGarage);
  // Step 1 requires registrationNumber when VIN > 10 chars
  const step1Errors = validateCerfaStep(1, data);
  assert.ok(step1Errors.registrationNumber);

  data.vehicle.registrationNumber = 'AB-123-CD';
  assert.deepEqual(validateCerfaStep(1, data), {});
  assert.deepEqual(validateCerfaStep(2, data), {});
  assert.deepEqual(validateCerfaStep(3, data), {});

  // Missing (B), (D.3), and formula/certificate date on Step 1
  const missingStep1 = validateCerfaStep(1, {
    ...data,
    vehicle: {
      ...data.vehicle,
      firstRegistrationDate: '',
      commercialDesignation: '',
      formulaNumber: '',
      certificateDate: '',
    },
  });
  assert.ok(missingStep1.firstRegistrationDate);
  assert.ok(missingStep1.commercialDesignation);
  assert.ok(missingStep1.formulaOrCertificateDate);

  // Missing seller N° de voie and Nom de la voie on Step 2
  const missingStep2 = validateCerfaStep(2, {
    ...data,
    seller: { ...data.seller, streetNumber: '', streetName: '' },
  });
  assert.ok(missingStep2.sellerStreetNumber);
  assert.ok(missingStep2.sellerStreetName);

  // Missing buyer N° de voie and Nom de la voie on Step 3 + full wizard check
  const invalidBuyerData = {
    ...data,
    buyer: { ...data.buyer, streetNumber: '', streetName: '' },
  };
  const missingStep3 = validateCerfaStep(3, invalidBuyerData);
  assert.ok(missingStep3.buyerStreetNumber);
  assert.ok(missingStep3.buyerStreetName);

  const fullResult = validateAllCerfaSteps(invalidBuyerData, 'ru');
  assert.equal(fullResult.firstInvalidStep, 3);
  assert.ok(fullResult.toastMessage?.startsWith('Заполните обязательные поля бланка Cerfa:'));
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
  assert.deepEqual(
    CERFA_TEMPLATE_OPTIONS.map((opt) => opt.id),
    ['cerfa_15776_02']
  );
  assert.equal(normalizeCerfaTemplateId('cerfa_13750_07'), 'cerfa_15776_02');
  assert.equal(normalizeCerfaTemplateId('declaration_achat'), 'cerfa_15776_02');
  assert.equal(normalizeCerfaTemplateId(undefined), 'cerfa_15776_02');
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

test('resolveCerfaTemplatesCalibration merges partial cloud data with defaults safely and strips unsupported templates', () => {
  const defaults = createDefaultCerfaTemplatesCalibration();
  assert.ok(defaults.cerfa_15776_02.config.section1Vehicle.vin);
  assert.equal('cerfa_13750_07' in defaults, false);
  assert.equal('declaration_achat' in defaults, false);

  const resolved = resolveCerfaTemplatesCalibration({
    cerfa_15776_02: {
      offsets: { offsetX: 3.5, offsetY: -2, fontSizeDelta: 0.5 },
      config: updateCerfa15776FieldAtPath(
        defaults.cerfa_15776_02.config,
        'section1Vehicle.registrationNumber',
        { x: 42, y: 725 }
      ),
    },
    ...( { cerfa_13750_07: { offsets: { offsetX: 1, offsetY: 2, fontSizeDelta: 0 }, fields: {} } } as Record<string, unknown> ),
  });

  assert.equal(resolved.cerfa_15776_02.offsets.offsetX, 3.5);
  assert.equal(resolved.cerfa_15776_02.config.section1Vehicle.registrationNumber.x, 42);
  assert.equal(resolved.cerfa_15776_02.config.section1Vehicle.vin.maxChars, 17);
  assert.equal('cerfa_13750_07' in resolved, false);
  assert.equal('declaration_achat' in resolved, false);
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
  assert.equal(dummy.seller.nameOrCompany, 'MON GARAGE AUTO');
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

test('vehicle.purchaseStatus automatically binds Cerfa Step 2 seller profile without cross-profile bleed', () => {
  const dualProfileSettings: GarageSettings = {
    ...mockGarage,
    profileType: 'micro_entrepreneur',
    legalStatus: 'micro_entreprise',
    name: 'GARAGE PRO SARL',
    siret: '12345678900012',
    streetNumber: '10',
    streetName: 'Avenue de la République',
    postalCode: '75011',
    city: 'Paris',
    proProfile: {
      name: 'GARAGE PRO SARL',
      lastName: '',
      firstName: '',
      sex: '',
      siret: '12345678900012',
      streetNumber: '10',
      streetExtension: '',
      streetType: 'Avenue',
      streetName: 'de la République',
      postalCode: '75011',
      city: 'Paris',
      phone: '01 40 00 00 00',
      email: 'pro@garage.fr',
      legalForm: 'Micro-entrepreneur',
      tvaMention: 'TVA non applicable, art. 293 B du CGI',
    },
    particulierProfile: {
      name: '',
      lastName: 'DUPONT',
      firstName: 'Jean',
      sex: 'M',
      siret: '',
      streetNumber: '5',
      streetExtension: '',
      streetType: 'Rue',
      streetName: 'Victor Hugo',
      postalCode: '69001',
      city: 'Lyon',
      phone: '06 11 22 33 44',
      email: 'jean.dupont@perso.fr',
      legalForm: '',
      tvaMention: '',
    },
  };

  // 1. Vehicle purchased as Particulier while workspace is currently Micro-entrepreneur
  const particulierVehicle: Vehicle = {
    ...mockVehicle,
    purchaseStatus: 'particulier',
    buyerInfo: undefined,
  };
  assert.equal(resolveCerfaSellerModeForVehicle(particulierVehicle, dualProfileSettings), 'particulier');
  const cerfaParticulier = buildInitialCerfaData(particulierVehicle, dualProfileSettings);
  assert.equal(cerfaParticulier.seller.entityType, 'physique');
  assert.equal(cerfaParticulier.seller.sex, 'M');
  assert.equal(cerfaParticulier.seller.nameOrCompany, 'DUPONT JEAN');
  assert.equal(cerfaParticulier.seller.siret, '');
  assert.equal(cerfaParticulier.seller.city, 'Lyon');
  assert.equal(cerfaParticulier.seller.streetNumber, '5');

  // 2. Vehicle purchased as Micro-entrepreneur while workspace is currently Particulier
  const activeParticulierWorkspace: GarageSettings = {
    ...dualProfileSettings,
    profileType: 'particulier',
    legalStatus: 'particulier',
    name: '',
    lastName: 'DUPONT',
    firstName: 'Jean',
    siret: '',
    city: 'Lyon',
  };
  const microVehicle: Vehicle = {
    ...mockVehicle,
    purchaseStatus: 'micro',
    buyerInfo: undefined,
  };
  assert.equal(
    resolveCerfaSellerModeForVehicle(microVehicle, activeParticulierWorkspace),
    'micro_entrepreneur'
  );
  const cerfaMicro = buildInitialCerfaData(microVehicle, activeParticulierWorkspace);
  assert.equal(cerfaMicro.seller.entityType, 'morale');
  assert.equal(cerfaMicro.seller.nameOrCompany, 'GARAGE PRO SARL');
  assert.equal(cerfaMicro.seller.siret, '12345678900012');
  assert.equal(cerfaMicro.seller.city, 'Paris');
  assert.equal(cerfaMicro.seller.streetNumber, '10');

  // 3. Vehicle purchased as Particulier when Particulier slot is still empty -> MUST NOT leak GARAGE PRO SARL or its SIRET
  const proOnlySettings: GarageSettings = {
    ...dualProfileSettings,
    particulierProfile: {
      name: '',
      lastName: '',
      firstName: '',
      sex: '',
      siret: '',
      streetNumber: '',
      streetExtension: '',
      streetType: '',
      streetName: '',
      postalCode: '',
      city: '',
      phone: '',
      email: '',
      legalForm: '',
      tvaMention: '',
    },
  };
  const cerfaParticulierEmpty = buildInitialCerfaData(particulierVehicle, proOnlySettings);
  assert.equal(cerfaParticulierEmpty.seller.entityType, 'physique');
  assert.equal(cerfaParticulierEmpty.seller.nameOrCompany, '');
  assert.equal(cerfaParticulierEmpty.seller.siret, '');
  assert.equal(cerfaParticulierEmpty.seller.city, '');
});

test('vehicle saved without (B), (D.3), or certificate presence prompts for them in Cerfa Step 1 while auto-binding seller profile', () => {
  const quickSavedVehicle: Vehicle = {
    ...mockVehicle,
    commercialDesignation: '',
    firstRegistrationDate: '',
    hasRegistrationCertificate: undefined,
    formulaNumber: '',
    certificateDate: '',
    absenceReason: '',
    vin: '',
    registrationNumber: 'EE-111-FF',
    purchaseStatus: 'particulier',
    buyerInfo: undefined,
  };

  const cerfaData = buildInitialCerfaData(quickSavedVehicle, {
    ...mockGarage,
    profileType: 'micro_entrepreneur',
    particulierProfile: {
      name: '',
      lastName: 'DUPONT',
      firstName: 'Jean',
      sex: 'M',
      siret: '',
      streetNumber: '5',
      streetExtension: '',
      streetType: 'Rue',
      streetName: 'Victor Hugo',
      postalCode: '69001',
      city: 'Lyon',
      phone: '',
      email: '',
      legalForm: '',
      tvaMention: '',
    },
  });

  // Unset Cerfa fields stay empty/null instead of silently synthesizing defaults
  assert.equal(cerfaData.vehicle.firstRegistrationDate, '');
  assert.equal(cerfaData.vehicle.commercialDesignation, '');
  assert.equal(cerfaData.vehicle.hasRegistrationCertificate, null);

  // Seller Step 2 still auto-binds to Particulier based on vehicle.purchaseStatus
  assert.equal(cerfaData.seller.entityType, 'physique');
  assert.equal(cerfaData.seller.nameOrCompany, 'DUPONT JEAN');
  assert.equal(cerfaData.seller.siret, '');

  // Cerfa Step 1 validation requires (B), (D.3), certificate presence, and VIN when generating Cerfa
  const step1Errors = validateCerfaStep(1, cerfaData);
  assert.ok(step1Errors.firstRegistrationDate);
  assert.ok(step1Errors.commercialDesignation);
  assert.ok(step1Errors.hasRegistrationCertificate);
  assert.ok(step1Errors.vin);

  const fullValidation = validateAllCerfaSteps(cerfaData, 'ru');
  assert.equal(fullValidation.firstInvalidStep, 1);
  assert.ok(fullValidation.toastMessage?.startsWith('Заполните обязательные поля бланка Cerfa:'));
});

test('resolveCerfaTargetGarageId prioritizes vehicle.garageId and isolates seller SIRET/address per garage', () => {
  assert.equal(
    resolveCerfaTargetGarageId({ garageId: 'garage_a' }, 'garage_b'),
    'garage_a'
  );
  assert.equal(
    resolveCerfaTargetGarageId({ garageId: undefined }, 'garage_b'),
    'garage_b'
  );
  assert.equal(resolveCerfaTargetGarageId(null, null), undefined);

  const settingsByGarage: Record<string, GarageSettings> = {
    garage_a: {
      ...mockGarage,
      garageId: 'garage_a',
      profileType: 'micro_entrepreneur',
      name: 'GARAGE ALPHA LYON',
      siret: '11122233300011',
      streetNumber: '12',
      streetName: 'Rue Garibaldi',
      postalCode: '69006',
      city: 'Lyon',
    },
    garage_b: {
      ...mockGarage,
      garageId: 'garage_b',
      profileType: 'micro_entrepreneur',
      name: 'GARAGE BETA MARSEILLE',
      siret: '99988877700022',
      streetNumber: '88',
      streetName: 'Avenue du Prado',
      postalCode: '13008',
      city: 'Marseille',
    },
  };

  const vehicleInA: Vehicle = {
    ...mockVehicle,
    id: 'veh_a',
    garageId: 'garage_a',
    registrationNumber: 'AA-100-AA',
    purchaseStatus: 'micro',
  };
  const vehicleWithoutGarage: Vehicle = {
    ...mockVehicle,
    id: 'veh_fallback',
    garageId: undefined,
    registrationNumber: 'BB-200-BB',
    purchaseStatus: 'micro',
  };

  // Vehicle belonging to Garage A keeps Garage A SIRET & address even if activeGarageId is Garage B
  const resolvedA = resolveCerfaTargetGarageId(vehicleInA, 'garage_b')!;
  const cerfaA = buildInitialCerfaData(vehicleInA, settingsByGarage[resolvedA]);
  assert.equal(cerfaA.seller.nameOrCompany, 'GARAGE ALPHA LYON');
  assert.equal(cerfaA.seller.siret, '11122233300011');
  assert.equal(cerfaA.seller.postalCode, '69006');
  assert.equal(cerfaA.seller.city, 'Lyon');

  // Vehicle missing garageId falls back strictly to activeGarageId (Garage B)
  const resolvedFallback = resolveCerfaTargetGarageId(vehicleWithoutGarage, 'garage_b')!;
  const cerfaB = buildInitialCerfaData(vehicleWithoutGarage, settingsByGarage[resolvedFallback]);
  assert.equal(cerfaB.seller.nameOrCompany, 'GARAGE BETA MARSEILLE');
  assert.equal(cerfaB.seller.siret, '99988877700022');
  assert.equal(cerfaB.seller.postalCode, '13008');
  assert.equal(cerfaB.seller.city, 'Marseille');
});

test('buildInitialCerfaData selects exact multi-profile Seller via vehicle.sellerProfileId without SIRET bleed', () => {
  const multiSettings: GarageSettings = {
    ...mockGarage,
    businessProfiles: [
      {
        id: 'biz_1',
        name: 'GARAGE PRINCIPAL SAS',
        siret: '12345678900011',
        streetNumber: '1',
        streetType: 'Rue',
        streetName: 'Principale',
        postalCode: '69001',
        city: 'Lyon',
        phone: '0400000001',
        email: 'biz1@garage.fr',
        isDefault: true,
      },
      {
        id: 'biz_2',
        name: 'GARAGE SECONDAIRE SARL',
        siret: '98765432100022',
        streetNumber: '99',
        streetType: 'Avenue',
        streetName: 'Secondaire',
        postalCode: '75008',
        city: 'Paris',
        phone: '0100000002',
        email: 'biz2@garage.fr',
        isDefault: false,
      },
    ],
    personalProfiles: [
      {
        id: 'pers_1',
        name: '',
        siret: '',
        lastName: 'DUPONT',
        firstName: 'Jean',
        sex: 'M',
        streetNumber: '10',
        streetType: 'Rue',
        streetName: 'Proprio',
        postalCode: '69002',
        city: 'Lyon',
        phone: '0600000001',
        email: 'jean@perso.fr',
        isDefault: true,
      },
      {
        id: 'pers_2',
        name: '',
        lastName: 'DUPONT',
        firstName: 'Luc',
        sex: 'M',
        siret: '99999999999999', // must be ignored/stripped for physique
        streetNumber: '44',
        streetType: 'Boulevard',
        streetName: 'Du Frere',
        postalCode: '13001',
        city: 'Marseille',
        phone: '0600000002',
        email: 'luc@perso.fr',
        isDefault: false,
      },
    ],
  };

  // Personal vehicle bound to brother (pers_2) -> uses DUPONT Luc & Marseille with empty SIRET
  const brotherVehicle: Vehicle = {
    ...mockVehicle,
    purchaseStatus: 'particulier',
    sellerProfileId: 'pers_2',
    buyerInfo: undefined,
  };
  const cerfaBrother = buildInitialCerfaData(brotherVehicle, multiSettings);
  assert.equal(cerfaBrother.seller.entityType, 'physique');
  assert.equal(cerfaBrother.seller.nameOrCompany, 'DUPONT LUC');
  assert.equal(cerfaBrother.seller.siret, '');
  assert.equal(cerfaBrother.seller.streetNumber, '44');
  assert.equal(cerfaBrother.seller.city, 'Marseille');

  // Business vehicle bound to biz_2 -> uses GARAGE SECONDAIRE SARL & SIRET 98765432100022
  const secondaryBizVehicle: Vehicle = {
    ...mockVehicle,
    purchaseStatus: 'micro',
    sellerProfileId: 'biz_2',
    buyerInfo: undefined,
  };
  const cerfaBiz2 = buildInitialCerfaData(secondaryBizVehicle, multiSettings);
  assert.equal(cerfaBiz2.seller.entityType, 'morale');
  assert.equal(cerfaBiz2.seller.nameOrCompany, 'GARAGE SECONDAIRE SARL');
  assert.equal(cerfaBiz2.seller.siret, '98765432100022');
  assert.equal(cerfaBiz2.seller.city, 'Paris');
});


