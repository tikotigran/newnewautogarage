import { AppUserProfileType, GarageSettings, StatusProfileData } from '../types/garage';
import { buildProfileSettingsPatch, resolveUserProfileType } from './frenchTaxEngine';

export const EMPTY_PARTICULIER_PROFILE: StatusProfileData = {
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
};

export const EMPTY_PRO_PROFILE: StatusProfileData = {
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
  legalForm: 'Micro-entrepreneur',
  tvaMention: 'TVA non applicable, art. 293 B du CGI',
};

export function createEmptyStatusProfile(profileType: AppUserProfileType): StatusProfileData {
  return profileType === 'particulier'
    ? { ...EMPTY_PARTICULIER_PROFILE }
    : { ...EMPTY_PRO_PROFILE };
}

export function pickStatusProfileFields(
  source: Partial<StatusProfileData> | null | undefined,
  profileType: AppUserProfileType
): StatusProfileData {
  const base = createEmptyStatusProfile(profileType);
  const src = source || {};
  const isParticulier = profileType === 'particulier';

  const rawTva = src.tvaMention ?? base.tvaMention ?? '';
  const cleanedTva = isParticulier
    ? ''
    : rawTva && !rawTva.includes('297 A')
    ? rawTva
    : EMPTY_PRO_PROFILE.tvaMention;

  return {
    name: src.name ?? base.name,
    lastName: src.lastName ?? base.lastName ?? '',
    firstName: src.firstName ?? base.firstName ?? '',
    sex: src.sex === 'M' || src.sex === 'F' ? src.sex : '',
    siret: isParticulier ? '' : src.siret ?? '',
    streetNumber: src.streetNumber ?? '',
    streetExtension: src.streetExtension ?? '',
    streetType: src.streetType ?? '',
    streetName: src.streetName ?? '',
    postalCode: src.postalCode ?? '',
    city: src.city ?? '',
    phone: src.phone ?? '',
    email: src.email ?? '',
    legalForm: isParticulier ? '' : src.legalForm || EMPTY_PRO_PROFILE.legalForm,
    tvaMention: cleanedTva,
  };
}

function hasAnyIdentityOrContactData(source: Partial<StatusProfileData> | null | undefined): boolean {
  if (!source) return false;
  return Boolean(
    source.name?.trim() ||
      source.lastName?.trim() ||
      source.firstName?.trim() ||
      source.sex ||
      source.siret?.trim() ||
      source.streetNumber?.trim() ||
      source.streetExtension?.trim() ||
      source.streetType?.trim() ||
      source.streetName?.trim() ||
      source.postalCode?.trim() ||
      source.city?.trim() ||
      source.phone?.trim() ||
      source.email?.trim()
  );
}

/**
 * Resolves independent `particulierProfile` and `proProfile` objects from a raw settings payload.
 * When migrating legacy flat settings that pre-date separated profiles, ONLY the currently active
 * profile slot inherits the legacy flat fields, ensuring the inactive profile starts empty.
 */
export function resolveSeparatedProfiles(
  raw: Partial<GarageSettings> | null | undefined,
  activeProfile?: AppUserProfileType
): {
  particulierProfile: StatusProfileData;
  proProfile: StatusProfileData;
} {
  const src = raw || {};
  const resolvedProfile = activeProfile || resolveUserProfileType(src);
  const hasExplicitParticulier = Boolean(src.particulierProfile);
  const hasExplicitPro = Boolean(src.proProfile);

  const particulierProfile = hasExplicitParticulier
    ? pickStatusProfileFields(src.particulierProfile, 'particulier')
    : resolvedProfile === 'particulier' && hasAnyIdentityOrContactData(src)
    ? pickStatusProfileFields(src, 'particulier')
    : createEmptyStatusProfile('particulier');

  const proProfile = hasExplicitPro
    ? pickStatusProfileFields(src.proProfile, 'micro_entrepreneur')
    : resolvedProfile === 'micro_entrepreneur' && hasAnyIdentityOrContactData(src)
    ? pickStatusProfileFields(src, 'micro_entrepreneur')
    : createEmptyStatusProfile('micro_entrepreneur');

  return { particulierProfile, proProfile };
}

export function applyProfileSlotToSettings(
  settings: GarageSettings,
  activeProfile: AppUserProfileType,
  particulierProfile: StatusProfileData,
  proProfile: StatusProfileData
): GarageSettings {
  const activeSlot = activeProfile === 'particulier' ? particulierProfile : proProfile;
  return {
    ...settings,
    ...activeSlot,
    profileType: activeProfile,
    particulierProfile,
    proProfile,
  };
}

/**
 * Updates both the top-level active profile fields and the active profile slot (`particulierProfile`
 * or `proProfile`) in real time while keeping the inactive status's profile completely untouched.
 */
export function syncActiveProfileOnEdit(
  prevSettings: GarageSettings,
  fieldPatch: Partial<StatusProfileData>
): GarageSettings {
  const activeProfile = resolveUserProfileType(prevSettings);
  const { particulierProfile, proProfile } = resolveSeparatedProfiles(prevSettings, activeProfile);

  if (activeProfile === 'particulier') {
    const nextParticulier = pickStatusProfileFields(
      { ...particulierProfile, ...fieldPatch },
      'particulier'
    );
    return applyProfileSlotToSettings(
      { ...prevSettings, ...fieldPatch },
      'particulier',
      nextParticulier,
      proProfile
    );
  }

  const nextPro = pickStatusProfileFields(
    { ...proProfile, ...fieldPatch },
    'micro_entrepreneur'
  );
  return applyProfileSlotToSettings(
    { ...prevSettings, ...fieldPatch },
    'micro_entrepreneur',
    particulierProfile,
    nextPro
  );
}

/**
 * Switches between 'particulier' and 'micro_entrepreneur' without losing or bleeding data:
 * 1. Snapshots the current top-level form fields into the profile slot being left.
 * 2. Loads the target profile's stored data into the top-level form fields.
 * 3. Applies the non-destructive legal/tax status patch for the target profile.
 */
export function switchGarageSettingsProfile(
  currentSettings: GarageSettings,
  targetProfile: AppUserProfileType
): GarageSettings {
  const currentProfile = resolveUserProfileType(currentSettings);
  const resolved = resolveSeparatedProfiles(currentSettings, currentProfile);

  const snapshotCurrent = pickStatusProfileFields(currentSettings, currentProfile);
  const particulierProfile =
    currentProfile === 'particulier' ? snapshotCurrent : resolved.particulierProfile;
  const proProfile =
    currentProfile === 'micro_entrepreneur' ? snapshotCurrent : resolved.proProfile;

  const taxPatch = buildProfileSettingsPatch(targetProfile, currentSettings);
  const targetSlot = targetProfile === 'particulier' ? particulierProfile : proProfile;

  return {
    ...currentSettings,
    ...taxPatch,
    ...targetSlot,
    profileType: targetProfile,
    particulierProfile,
    proProfile,
  };
}
