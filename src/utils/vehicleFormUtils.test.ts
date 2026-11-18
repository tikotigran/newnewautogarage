import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVehicleSubmitPayload,
  hasVehicleCerfaDetails,
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

test('validateQuickVehicleForm allows creating a vehicle when all mandatory Cerfa fields are provided', () => {
  assert.equal(validateQuickVehicleForm(createBaseInput(), 'ru'), null);
  assert.equal(
    validateQuickVehicleForm(
      createBaseInput({ formulaNumber: '', certificateDate: '2021-05-01' }),
      'fr'
    ),
    null
  );
  assert.equal(
    validateQuickVehicleForm(
      createBaseInput({
        hasRegistrationCertificate: false,
        formulaNumber: '',
        certificateDate: '',
        absenceReason: 'Déclaration de perte jointe',
      }),
      'ru'
    ),
    null
  );
});

test('validateVehicleFormDetailed catches missing mandatory Cerfa fields and emits fieldErrors & toastMessage', () => {
  const missingCert = validateVehicleFormDetailed(
    createBaseInput({
      commercialDesignation: '',
      firstRegistrationDate: '',
      hasRegistrationCertificate: null,
      formulaNumber: '',
    }),
    'ru'
  );
  assert.ok(missingCert.fieldErrors.commercialDesignation);
  assert.ok(missingCert.fieldErrors.firstRegistrationDate);
  assert.ok(missingCert.fieldErrors.hasRegistrationCertificate);
  assert.ok(missingCert.toastMessage?.startsWith('Заполните обязательные поля бланка Cerfa:'));

  const missingFormulaOrCertDate = validateVehicleFormDetailed(
    createBaseInput({
      hasRegistrationCertificate: true,
      formulaNumber: '',
      certificateDate: '',
    }),
    'ru'
  );
  assert.ok(missingFormulaOrCertDate.fieldErrors.formulaOrCertificateDate);

  const missingAbsenceReason = validateVehicleFormDetailed(
    createBaseInput({
      hasRegistrationCertificate: false,
      formulaNumber: '',
      certificateDate: '',
      absenceReason: '  ',
    }),
    'ru'
  );
  assert.ok(missingAbsenceReason.fieldErrors.absenceReason);

  assert.ok(validateQuickVehicleForm(createBaseInput({ make: '' }), 'fr'));
  assert.ok(validateQuickVehicleForm(createBaseInput({ model: '  ' }), 'fr'));
  assert.ok(validateQuickVehicleForm(createBaseInput({ registrationNumber: '' }), 'ru'));
  assert.ok(validateQuickVehicleForm(createBaseInput({ purchasePrice: '' }), 'ru'));
  assert.ok(validateQuickVehicleForm(createBaseInput({ year: 1850 }), 'fr'));
  assert.ok(validateQuickVehicleForm(createBaseInput({ vin: 'SHORT123' }), 'ru'));
  assert.equal(
    validateQuickVehicleForm(createBaseInput({ vin: 'VF3UPHNK0MT129841' }), 'fr'),
    null
  );
});

test('buildVehicleSubmitPayload defaults empty mileage to 0 and normalizes Carte Grise codes', () => {
  const quickPayload = buildVehicleSubmitPayload(createBaseInput(), 'user_1');
  assert.equal(quickPayload.make, 'Peugeot');
  assert.equal(quickPayload.commercialDesignation, '208 GT Line 130ch');
  assert.equal(quickPayload.firstRegistrationDate, '2021-04-15');
  assert.equal(quickPayload.registrationNumber, 'AB-123-CD');
  assert.equal(quickPayload.hasRegistrationCertificate, true);
  assert.equal(quickPayload.formulaNumber, '2021AB12345');
  assert.equal(quickPayload.mileage, 0);
  assert.equal(quickPayload.vin, '');
  assert.equal(quickPayload.nationalGenre, 'VP');
  assert.equal(quickPayload.totalInvested, 8500);
  assert.equal(hasVehicleCerfaDetails(quickPayload), true);

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
      ...quickPayload,
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
