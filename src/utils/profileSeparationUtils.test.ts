import test from 'node:test';
import assert from 'node:assert/strict';
import { GarageSettings } from '../types/garage';
import { createDefaultFrenchTaxConfig } from './frenchTaxEngine';
import {
  EMPTY_PARTICULIER_PROFILE,
  EMPTY_PRO_PROFILE,
  deleteSellerProfileEntry,
  ensureBusinessProfiles,
  ensurePersonalProfiles,
  pickStatusProfileFields,
  resolveSellerProfileForVehicle,
  resolveSeparatedProfiles,
  setDefaultSellerProfileEntry,
  switchGarageSettingsProfile,
  syncActiveProfileOnEdit,
  syncSellerProfileArraysToSettings,
  upsertSellerProfileEntry,
} from './profileSeparationUtils';

function createBaseSettings(): GarageSettings {
  return {
    garageId: 'garage_test',
    profileType: 'micro_entrepreneur',
    entityType: 'physique',
    legalStatus: 'micro_entreprise',
    taxRegime: 'micro',
    taxRatePercent: 13.3,
    ...EMPTY_PRO_PROFILE,
    particulierProfile: { ...EMPTY_PARTICULIER_PROFILE },
    proProfile: { ...EMPTY_PRO_PROFILE },
    frenchTaxConfig: createDefaultFrenchTaxConfig('micro_entreprise'),
  };
}

test('empty separated profiles contain no hardcoded mock values', () => {
  assert.equal(EMPTY_PARTICULIER_PROFILE.name, '');
  assert.equal(EMPTY_PARTICULIER_PROFILE.lastName, '');
  assert.equal(EMPTY_PARTICULIER_PROFILE.firstName, '');
  assert.equal(EMPTY_PARTICULIER_PROFILE.streetNumber, '');
  assert.equal(EMPTY_PARTICULIER_PROFILE.streetName, '');
  assert.equal(EMPTY_PARTICULIER_PROFILE.postalCode, '');
  assert.equal(EMPTY_PARTICULIER_PROFILE.city, '');
  assert.equal(EMPTY_PARTICULIER_PROFILE.phone, '');
  assert.equal(EMPTY_PARTICULIER_PROFILE.email, '');

  assert.equal(EMPTY_PRO_PROFILE.name, '');
  assert.equal(EMPTY_PRO_PROFILE.siret, '');
  assert.equal(EMPTY_PRO_PROFILE.streetNumber, '');
  assert.equal(EMPTY_PRO_PROFILE.streetName, '');
  assert.equal(EMPTY_PRO_PROFILE.postalCode, '');
  assert.equal(EMPTY_PRO_PROFILE.city, '');
  assert.equal(EMPTY_PRO_PROFILE.phone, '');
  assert.equal(EMPTY_PRO_PROFILE.email, '');
});

test('editing Micro-entrepreneur and Particulier stores strictly independent data without bleed', () => {
  let state = createBaseSettings();

  // Fill Micro-entrepreneur profile fields
  state = syncActiveProfileOnEdit(state, {
    name: 'Garage Lyon Pro',
    siret: '12345678900012',
    streetNumber: '24',
    streetType: 'Avenue',
    streetName: 'Jean Jaurès',
    postalCode: '69007',
    city: 'Lyon',
    phone: '04 78 00 11 22',
    email: 'pro@lyon-auto.fr',
  });

  assert.equal(state.proProfile?.name, 'Garage Lyon Pro');
  assert.equal(state.proProfile?.city, 'Lyon');
  assert.equal(state.particulierProfile?.streetName, '');
  assert.equal(state.particulierProfile?.city, '');
  assert.equal(state.particulierProfile?.phone, '');

  // Switch to Particulier -> fields must instantly become empty (Particulier's own profile)
  state = switchGarageSettingsProfile(state, 'particulier');
  assert.equal(state.profileType, 'particulier');
  assert.equal(state.legalStatus, 'particulier');
  assert.equal(state.taxRegime, 'none');
  assert.equal(state.taxRatePercent, 0);
  assert.equal(state.name, '');
  assert.equal(state.siret, '');
  assert.equal(state.streetNumber, '');
  assert.equal(state.streetName, '');
  assert.equal(state.postalCode, '');
  assert.equal(state.city, '');
  assert.equal(state.phone, '');
  assert.equal(state.email, '');
  // Stored proProfile must remain intact
  assert.equal(state.proProfile?.name, 'Garage Lyon Pro');
  assert.equal(state.proProfile?.siret, '12345678900012');
  assert.equal(state.proProfile?.city, 'Lyon');

  // Edit Particulier details
  state = syncActiveProfileOnEdit(state, {
    lastName: 'MARTIN',
    firstName: 'Sophie',
    sex: 'F',
    streetNumber: '5',
    streetType: 'Rue',
    streetName: 'Victor Hugo',
    postalCode: '75016',
    city: 'Paris',
    phone: '06 11 22 33 44',
    email: 'sophie.martin@perso.fr',
  });

  assert.equal(state.particulierProfile?.lastName, 'MARTIN');
  assert.equal(state.particulierProfile?.city, 'Paris');
  assert.equal(state.particulierProfile?.phone, '06 11 22 33 44');
  // Micro-entrepreneur data must remain completely untouched
  assert.equal(state.proProfile?.name, 'Garage Lyon Pro');
  assert.equal(state.proProfile?.siret, '12345678900012');
  assert.equal(state.proProfile?.streetName, 'Jean Jaurès');
  assert.equal(state.proProfile?.postalCode, '69007');
  assert.equal(state.proProfile?.city, 'Lyon');
  assert.equal(state.proProfile?.phone, '04 78 00 11 22');
  assert.equal(state.proProfile?.email, 'pro@lyon-auto.fr');

  // Switch back to Micro-entrepreneur -> restores proProfile cleanly
  state = switchGarageSettingsProfile(state, 'micro_entrepreneur');
  assert.equal(state.profileType, 'micro_entrepreneur');
  assert.equal(state.name, 'Garage Lyon Pro');
  assert.equal(state.siret, '12345678900012');
  assert.equal(state.streetNumber, '24');
  assert.equal(state.streetName, 'Jean Jaurès');
  assert.equal(state.postalCode, '69007');
  assert.equal(state.city, 'Lyon');
  assert.equal(state.phone, '04 78 00 11 22');
  assert.equal(state.email, 'pro@lyon-auto.fr');
  assert.equal(state.lastName, '');
  assert.equal(state.firstName, '');

  // Switch back to Particulier -> restores particulierProfile cleanly
  state = switchGarageSettingsProfile(state, 'particulier');
  assert.equal(state.lastName, 'MARTIN');
  assert.equal(state.firstName, 'Sophie');
  assert.equal(state.sex, 'F');
  assert.equal(state.streetNumber, '5');
  assert.equal(state.streetName, 'Victor Hugo');
  assert.equal(state.postalCode, '75016');
  assert.equal(state.city, 'Paris');
  assert.equal(state.phone, '06 11 22 33 44');
  assert.equal(state.email, 'sophie.martin@perso.fr');
  assert.equal(state.siret, '');
});

test('legacy flat settings migrate ONLY into the active profile without seeding the other status', () => {
  const legacyPro: Partial<GarageSettings> = {
    profileType: 'micro_entrepreneur',
    name: 'Legacy Pro Garage',
    siret: '99988877700011',
    streetNumber: '12',
    streetName: 'Rue Nationale',
    postalCode: '59000',
    city: 'Lille',
    phone: '03 20 00 00 00',
    email: 'legacy@pro.fr',
  };

  const resolved = resolveSeparatedProfiles(legacyPro, 'micro_entrepreneur');
  assert.equal(resolved.proProfile.name, 'Legacy Pro Garage');
  assert.equal(resolved.proProfile.city, 'Lille');
  assert.equal(resolved.particulierProfile.name, '');
  assert.equal(resolved.particulierProfile.streetName, '');
  assert.equal(resolved.particulierProfile.city, '');
  assert.equal(resolved.particulierProfile.email, '');
});

test('pickStatusProfileFields strips SIRET, legalForm, and TVA mention in Particulier mode', () => {
  const cleaned = pickStatusProfileFields(
    {
      lastName: 'LEFEVRE',
      firstName: 'Marc',
      siret: '12345678900012',
      legalForm: 'Micro-entrepreneur',
      tvaMention: 'TVA non applicable, art. 293 B du CGI',
      city: 'Nice',
    },
    'particulier'
  );
  assert.equal(cleaned.lastName, 'LEFEVRE');
  assert.equal(cleaned.siret, '');
  assert.equal(cleaned.legalForm, '');
  assert.equal(cleaned.tvaMention, '');
  assert.equal(cleaned.city, 'Nice');
});

test('multi-profile CRUD supports multiple Business and Personal profiles without cross-contamination', () => {
  const base = createBaseSettings();

  // Add 2 Business entities
  const b1Res = upsertSellerProfileEntry(
    [],
    {
      name: 'AutoGarage Pro Lyon',
      siret: '11122233300011',
      streetNumber: '10',
      streetName: 'Rue Pro',
      postalCode: '69001',
      city: 'Lyon',
      phone: '0478000001',
      email: 'pro1@garage.fr',
      isDefault: true,
    },
    'micro'
  );
  const b2Res = upsertSellerProfileEntry(
    b1Res.list,
    {
      name: 'AutoImport Paris SAS',
      siret: '99988877700022',
      city: 'Paris',
      postalCode: '75001',
    },
    'micro'
  );
  assert.equal(b2Res.list.length, 2);

  // Add 3 Personal individuals (Owner, Brother, Spouse)
  const p1Res = upsertSellerProfileEntry(
    [],
    {
      lastName: 'PETROSYAN',
      firstName: 'Armen',
      sex: 'M',
      siret: '11122233300011', // Should be stripped cleanly!
      streetNumber: '5',
      streetName: 'Rue Perso',
      postalCode: '69002',
      city: 'Lyon',
      phone: '0600000001',
      email: 'armen@perso.fr',
      isDefault: true,
    },
    'particulier'
  );
  const p2Res = upsertSellerProfileEntry(
    p1Res.list,
    {
      lastName: 'PETROSYAN',
      firstName: 'Karen',
      sex: 'M',
      streetNumber: '22',
      streetName: 'Avenue Frere',
      postalCode: '69003',
      city: 'Villeurbanne',
      phone: '0600000002',
      email: 'karen@perso.fr',
    },
    'particulier'
  );
  assert.equal(p2Res.list.length, 2);
  assert.equal(p2Res.list[0].siret, '');
  assert.equal(p2Res.list[1].isDefault, false);

  // Set Brother (p2) as default personal profile
  const redefaultedPersonal = setDefaultSellerProfileEntry(p2Res.list, p2Res.saved.id, 'particulier');
  assert.equal(redefaultedPersonal.find((p) => p.id === p2Res.saved.id)?.isDefault, true);
  assert.equal(redefaultedPersonal.find((p) => p.id === p1Res.saved.id)?.isDefault, false);

  const synced = syncSellerProfileArraysToSettings(base, b2Res.list, redefaultedPersonal);
  assert.equal(ensureBusinessProfiles(synced).length, 2);
  assert.equal(ensurePersonalProfiles(synced).length, 2);
  // Primary slots mirror the default entries (sorted/maintained with default promoted)
  assert.equal(synced.proProfile?.name, 'AutoGarage Pro Lyon');
  assert.equal(synced.particulierProfile?.firstName, 'Karen');

  // Resolve exact Personal seller by vehicle.sellerProfileId (Owner even though Brother is default)
  const ownerResolution = resolveSellerProfileForVehicle({
    vehicle: { purchaseStatus: 'particulier', sellerProfileId: p1Res.saved.id },
    garageSettings: synced,
  });
  assert.equal(ownerResolution.isPersonal, true);
  assert.equal(ownerResolution.displayName, 'PETROSYAN Armen');
  assert.equal(ownerResolution.profile.siret, '');
  assert.equal(ownerResolution.profile.city, 'Lyon');

  // Resolve exact Business entity 2 by vehicle.sellerProfileId
  const biz2Resolution = resolveSellerProfileForVehicle({
    vehicle: { purchaseStatus: 'micro', sellerProfileId: b2Res.saved.id },
    garageSettings: synced,
  });
  assert.equal(biz2Resolution.isPersonal, false);
  assert.equal(biz2Resolution.displayName, 'AutoImport Paris SAS');
  assert.equal(biz2Resolution.profile.siret, '99988877700022');

  // Deleting default promotes remaining item
  const afterDelete = deleteSellerProfileEntry(redefaultedPersonal, p2Res.saved.id, 'particulier');
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, p1Res.saved.id);
  assert.equal(afterDelete[0].isDefault, true);
});

