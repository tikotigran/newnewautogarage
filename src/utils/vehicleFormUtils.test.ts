import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSoldRevertUpdate,
  buildVehicleSubmitPayload,
  hasVehicleCerfaDetails,
  mapProfileTypeToPurchaseStatus,
  resolveDefaultPurchaseStatus,
  resolvePendingVehicleSelection,
  resolveTargetGarageId,
  resolveVehiclePurchaseStatus,
  validateQuickVehicleForm,
  validateVehicleFormDetailed,
  VehicleFormInput,
} from './vehicleFormUtils';

function createBaseInput(overrides: Partial<VehicleFormInput> = {}): VehicleFormInput {
  return {
    make: 'Peugeot',
    model: '208',
    commercialDesignation: '208 GT Line 130ch',
    firstRegistrationDate: '2021-04-15',
    trim: '',
    year: 2021,
    registrationNumber: 'AB-123-CD',
    purchasePrice: 8500,
    vin: '',
    mileage: '',
    fuelType: '',
    gearbox: '',
    typeVariantVersion: '',
    nationalGenre: 'VP',
    bodyType: '',
    hasRegistrationCertificate: true,
    formulaNumber: '2021AB12345',
    certificateDate: '',
    absenceReason: '',
    purchaseDate: '2026-11-15',
    targetSalePrice: '',
    status: 'preparation',
    photos: [],
    ...overrides,
  };
}

test('validateQuickVehicleForm allows creating a vehicle with only the 5 standard fields and without Cerfa registration fields', () => {
  assert.equal(
    validateQuickVehicleForm(
      createBaseInput({
        commercialDesignation: '',
        firstRegistrationDate: '',
        hasRegistrationCertificate: null,
        formulaNumber: '',
        certificateDate: '',
        absenceReason: '',
      }),
      'ru'
    ),
    null
  );
  assert.equal(validateQuickVehicleForm(createBaseInput(), 'fr'), null);
});

test('validateVehicleFormDetailed catches missing standard fields & invalid VIN/mileage without blocking on Cerfa fields', () => {
  const noCerfaErrors = validateVehicleFormDetailed(
    createBaseInput({
      commercialDesignation: '',
      firstRegistrationDate: '',
      hasRegistrationCertificate: null,
      formulaNumber: '',
      certificateDate: '',
      absenceReason: '',
    }),
    'ru'
  );
  assert.equal(noCerfaErrors.firstError, null);
  assert.deepEqual(noCerfaErrors.fieldErrors, {});

  const missingCore = validateVehicleFormDetailed(
    createBaseInput({
      make: '',
      model: '  ',
      year: 1850,
      registrationNumber: '',
      purchasePrice: '',
    }),
    'ru'
  );
  assert.ok(missingCore.fieldErrors.make);
  assert.ok(missingCore.fieldErrors.model);
  assert.ok(missingCore.fieldErrors.year);
  assert.ok(missingCore.fieldErrors.registrationNumber);
  assert.ok(missingCore.fieldErrors.purchasePrice);
  assert.ok(missingCore.toastMessage?.startsWith('Заполните обязательные поля автомобиля:'));

  assert.ok(validateQuickVehicleForm(createBaseInput({ vin: 'SHORT123' }), 'ru'));
  assert.ok(validateQuickVehicleForm(createBaseInput({ mileage: -10 }), 'ru'));
  assert.equal(
    validateQuickVehicleForm(createBaseInput({ vin: 'VF3UPHNK0MT129841' }), 'fr'),
    null
  );
});

test('buildVehicleSubmitPayload preserves unset Cerfa fields without fallback synthesis and normalizes Carte Grise codes', () => {
  const quickPayload = buildVehicleSubmitPayload(
    createBaseInput({
      commercialDesignation: '',
      firstRegistrationDate: '',
      hasRegistrationCertificate: null,
      formulaNumber: '',
      certificateDate: '',
      absenceReason: '',
    }),
    'user_1'
  );
  assert.equal(quickPayload.make, 'Peugeot');
  assert.equal(quickPayload.commercialDesignation, '');
  assert.equal(quickPayload.firstRegistrationDate, '');
  assert.equal(quickPayload.registrationNumber, 'AB-123-CD');
  assert.equal(quickPayload.hasRegistrationCertificate, undefined);
  assert.equal(quickPayload.formulaNumber, '');
  assert.equal(quickPayload.mileage, 0);
  assert.equal(quickPayload.vin, '');
  assert.equal(quickPayload.nationalGenre, 'VP');
  assert.equal(quickPayload.totalInvested, 8500);
  assert.equal(hasVehicleCerfaDetails(quickPayload), false);

  const fullPayload = buildVehicleSubmitPayload(
    createBaseInput({
      vin: ' vf3uphnk0mt129841 ',
      mileage: 64200,
      fuelType: 'Essence',
      gearbox: 'Automatique EAT8',
      typeVariantVersion: 'UPHNK-D2',
      nationalGenre: 'VP',
      bodyType: 'ci',
      formulaNumber: '2021 ab 12345',
      certificateDate: '2021-05-12',
    }),
    'user_1'
  );
  assert.equal(fullPayload.vin, 'VF3UPHNK0MT129841');
  assert.equal(fullPayload.mileage, 64200);
  assert.equal(fullPayload.fuelType, 'Essence');
  assert.equal(fullPayload.gearbox, 'Automatique EAT8');
  assert.equal(fullPayload.typeVariantVersion, 'UPHNK-D2');
  assert.equal(fullPayload.bodyType, 'CI');
  assert.equal(fullPayload.formulaNumber, '2021AB12345');
  assert.equal(fullPayload.certificateDate, '2021-05-12');
  assert.equal(hasVehicleCerfaDetails(fullPayload), true);
  assert.equal(
    hasVehicleCerfaDetails({
      ...fullPayload,
      formulaNumber: '',
      certificateDate: '',
    }),
    false
  );
});

test('buildVehicleSubmitPayload recalculates totalInvested when purchasePrice or mileage is edited on an existing vehicle', () => {
  const existing = {
    id: 'veh_99',
    userId: 'user_1',
    make: 'Renault',
    model: 'Clio V',
    commercialDesignation: 'Clio V Intens',
    firstRegistrationDate: '2020-02-01',
    trim: 'Intens',
    year: 2020,
    mileage: 50000,
    vin: '',
    registrationNumber: 'AA-111-BB',
    hasRegistrationCertificate: true,
    formulaNumber: '2020CD99999',
    purchaseDate: '2026-09-01',
    purchasePrice: 8900,
    targetSalePrice: 12500,
    status: 'repair' as const,
    photos: [],
    documents: [],
    repairCostTotal: 700,
    generalExpensesTotal: 500,
    totalExpenses: 1200,
    totalInvested: 10100,
    netProfit: 2400,
    marginPercentage: 19.2,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  const edited = buildVehicleSubmitPayload(
    createBaseInput({
      make: 'Renault',
      model: 'Clio V',
      commercialDesignation: 'Clio V Intens',
      firstRegistrationDate: '2020-02-01',
      year: 2020,
      registrationNumber: 'cc-222-dd',
      mileage: 54320,
      purchasePrice: 9500,
      targetSalePrice: 12500,
      status: 'repair',
    }),
    'user_1',
    existing
  );

  assert.equal(edited.registrationNumber, 'CC-222-DD');
  assert.equal(edited.mileage, 54320);
  assert.equal(edited.repairCostTotal, 700);
  assert.equal(edited.generalExpensesTotal, 500);
  assert.equal(edited.totalExpenses, 1200);
  assert.equal(edited.totalInvested, 10700);
});

test('resolveDefaultPurchaseStatus and resolveVehiclePurchaseStatus track active profile and per-vehicle override', () => {
  assert.equal(mapProfileTypeToPurchaseStatus('micro_entrepreneur'), 'micro');
  assert.equal(mapProfileTypeToPurchaseStatus('particulier'), 'particulier');

  assert.equal(resolveDefaultPurchaseStatus('micro_entrepreneur'), 'micro');
  assert.equal(resolveDefaultPurchaseStatus('particulier'), 'particulier');
  assert.equal(
    resolveDefaultPurchaseStatus(undefined, { profileType: 'particulier' }),
    'particulier'
  );
  assert.equal(
    resolveDefaultPurchaseStatus(undefined, { legalStatus: 'micro_entreprise' }),
    'micro'
  );

  // Explicit vehicle purchaseStatus overrides workspace fallback
  assert.equal(
    resolveVehiclePurchaseStatus({ purchaseStatus: 'particulier' }, 'micro_entrepreneur'),
    'particulier'
  );
  assert.equal(
    resolveVehiclePurchaseStatus({ purchaseStatus: 'micro' }, 'particulier'),
    'micro'
  );

  // Build payload persists purchaseStatus both on creation and edit
  const createdParticulier = buildVehicleSubmitPayload(
    createBaseInput({ purchaseStatus: 'particulier' }),
    'user_1'
  );
  assert.equal(createdParticulier.purchaseStatus, 'particulier');

  const createdMicro = buildVehicleSubmitPayload(
    createBaseInput({ purchaseStatus: 'micro' }),
    'user_1'
  );
  assert.equal(createdMicro.purchaseStatus, 'micro');
});

test('resolveTargetGarageId and buildVehicleSubmitPayload enforce strict per-garage assignment', () => {
  assert.equal(resolveTargetGarageId({ garageId: 'garage_alpha' }, 'garage_beta'), 'garage_alpha');
  assert.equal(resolveTargetGarageId({ garageId: undefined }, 'garage_beta'), 'garage_beta');
  assert.equal(resolveTargetGarageId(null, 'garage_beta'), 'garage_beta');
  assert.equal(resolveTargetGarageId(null, null), undefined);

  // New vehicle created inside active garage gets assigned activeGarageId
  const createdInBeta = buildVehicleSubmitPayload(
    createBaseInput(),
    'user_1',
    null,
    'garage_beta'
  );
  assert.equal(createdInBeta.garageId, 'garage_beta');

  // Editing an existing vehicle preserves its own garageId even if activeGarageId differs
  const editedAlpha = buildVehicleSubmitPayload(
    createBaseInput({ purchasePrice: 9100 }),
    'user_1',
    {
      ...createdInBeta,
      id: 'veh_alpha_1',
      garageId: 'garage_alpha',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    },
    'garage_beta'
  );
  assert.equal(editedAlpha.garageId, 'garage_alpha');

  // Editing a legacy vehicle missing garageId adopts activeGarageId
  const editedLegacy = buildVehicleSubmitPayload(
    createBaseInput(),
    'user_1',
    {
      ...createdInBeta,
      id: 'veh_legacy',
      garageId: undefined,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    },
    'garage_beta'
  );
  assert.equal(editedLegacy.garageId, 'garage_beta');
});

test('buildVehicleSubmitPayload and buildSoldRevertUpdate clear stale buyerInfo when leaving sold status', () => {
  const soldVehicle = {
    id: 'veh_sold_1',
    userId: 'user_1',
    make: 'Audi',
    model: 'A3',
    trim: 'S-Line',
    year: 2022,
    mileage: 30000,
    vin: 'WAUZZZ11111111111',
    registrationNumber: 'AA-123-BB',
    purchaseDate: '2026-09-01',
    purchasePrice: 15000,
    targetSalePrice: 20000,
    status: 'sold' as const,
    photos: [],
    documents: [],
    buyerInfo: {
      fullName: 'Jean Dupont',
      address: '10 Rue de Rivoli, Paris',
      phone: '0600000000',
      email: 'jean@dupont.fr',
      salePrice: 19500,
      saleDate: '2026-10-15',
    },
    repairCostTotal: 600,
    generalExpensesTotal: 400,
    totalExpenses: 1000,
    totalInvested: 16000,
    netProfit: 3500,
    marginPercentage: 17.95,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-15T10:00:00Z',
  };

  // Staying sold keeps buyerInfo and realized margin
  const stillSold = buildVehicleSubmitPayload(
    createBaseInput({
      make: 'Audi',
      model: 'A3',
      purchasePrice: 15000,
      targetSalePrice: 20000,
      status: 'sold',
    }),
    'user_1',
    soldVehicle
  );
  assert.equal(stillSold.buyerInfo?.fullName, 'Jean Dupont');
  assert.equal(stillSold.netProfit, 3500);

  // Reverting to for_sale clears buyerInfo and computes expected profit from targetSalePrice
  const revertedViaModal = buildVehicleSubmitPayload(
    createBaseInput({
      make: 'Audi',
      model: 'A3',
      purchasePrice: 15000,
      targetSalePrice: 20000,
      status: 'for_sale',
    }),
    'user_1',
    soldVehicle
  );
  assert.equal(revertedViaModal.buyerInfo, undefined);
  assert.equal(revertedViaModal.totalInvested, 16000);
  assert.equal(revertedViaModal.netProfit, 4000);
  assert.equal(revertedViaModal.marginPercentage, 20);

  // Reverting via quick status change to preparation or for_sale clears buyerInfo
  const prepRevert = buildSoldRevertUpdate(soldVehicle, 'preparation');
  assert.equal(prepRevert.shouldClearBuyerInfo, true);
  assert.equal(prepRevert.updates.status, 'preparation');
  assert.equal(prepRevert.updates.buyerInfo, undefined);
  assert.equal(prepRevert.updates.totalInvested, 16000);
  assert.equal(prepRevert.updates.netProfit, 4000);
  assert.equal(prepRevert.updates.marginPercentage, 20);

  const forSaleRevert = buildSoldRevertUpdate(soldVehicle, 'for_sale');
  assert.equal(forSaleRevert.shouldClearBuyerInfo, true);
  assert.equal(forSaleRevert.updates.status, 'for_sale');
  assert.equal(forSaleRevert.updates.buyerInfo, undefined);

  // Non-sold transitions do not flag buyerInfo cleanup
  const nonSold = buildSoldRevertUpdate({ ...soldVehicle, status: 'preparation', buyerInfo: undefined }, 'for_sale');
  assert.equal(nonSold.shouldClearBuyerInfo, false);
  assert.equal(nonSold.updates.status, 'for_sale');
});

test('resolvePendingVehicleSelection waits until created vehicle exists in resolved list', () => {
  const existingVehicle = {
    ...buildVehicleSubmitPayload(createBaseInput(), 'user_1'),
    id: 'veh_1',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  };
  const newlyCreatedVehicle = {
    ...buildVehicleSubmitPayload(createBaseInput({ make: 'BMW', model: '320d' }), 'user_1'),
    id: 'veh_new_2',
    createdAt: '2026-11-18T10:00:00Z',
    updatedAt: '2026-11-18T10:00:00Z',
  };

  // Before subscription / store includes new vehicle -> returns null
  assert.equal(resolvePendingVehicleSelection('veh_new_2', [existingVehicle]), null);
  assert.equal(resolvePendingVehicleSelection(null, [existingVehicle, newlyCreatedVehicle]), null);

  // Once resolved list receives the new vehicle -> returns it
  const resolved = resolvePendingVehicleSelection('veh_new_2', [existingVehicle, newlyCreatedVehicle]);
  assert.equal(resolved?.id, 'veh_new_2');
  assert.equal(resolved?.make, 'BMW');
});


