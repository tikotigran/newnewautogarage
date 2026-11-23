import {
  AppUserProfileType,
  GarageSettings,
  SellerProfileEntry,
  StatusProfileData,
  Vehicle,
  VehiclePurchaseStatus,
} from '../types/garage';
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
  country: '',
  phone: '',
  email: '',
  legalForm: '',
  tvaMention: '',
  vatNumber: '',
  iban: '',
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
  country: '',
  phone: '',
  email: '',
  legalForm: 'Micro-entrepreneur',
  tvaMention: 'TVA non applicable, art. 293 B du CGI',
  vatNumber: '',
  iban: '',
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
    country: src.country ?? '',
    phone: src.phone ?? '',
    email: src.email ?? '',
    legalForm: isParticulier ? '' : src.legalForm || EMPTY_PRO_PROFILE.legalForm,
    tvaMention: cleanedTva,
    vatNumber: isParticulier ? '' : src.vatNumber ?? '',
    iban: src.iban ?? '',
  };
}

export function hasAnyIdentityOrContactData(source: Partial<StatusProfileData> | null | undefined): boolean {
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
      source.country?.trim() ||
      source.phone?.trim() ||
      source.email?.trim() ||
      source.vatNumber?.trim() ||
      source.iban?.trim()
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

export function createSellerProfileId(mode: VehiclePurchaseStatus): string {
  const prefix = mode === 'particulier' ? 'pers' : 'biz';
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getSellerProfileDisplayName(
  entry: Partial<StatusProfileData> | null | undefined,
  mode: VehiclePurchaseStatus
): string {
  if (!entry) return '';
  if (mode === 'particulier') {
    const full = [entry.lastName, entry.firstName].filter(Boolean).join(' ').trim();
    return full || (entry.name || '').trim();
  }
  return (
    (entry.name || '').trim() ||
    [entry.lastName, entry.firstName].filter(Boolean).join(' ').trim()
  );
}

function normalizeSellerProfileList(
  entries: SellerProfileEntry[],
  mode: VehiclePurchaseStatus
): SellerProfileEntry[] {
  const profileType: AppUserProfileType =
    mode === 'particulier' ? 'particulier' : 'micro_entrepreneur';
  const seen = new Set<string>();
  const cleaned: SellerProfileEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i];
    if (!raw || typeof raw !== 'object') continue;
    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : `${mode === 'particulier' ? 'pers' : 'biz'}_${i + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const fields = pickStatusProfileFields(raw, profileType);
    cleaned.push({
      ...fields,
      id,
      ...(raw.label?.trim() ? { label: raw.label.trim() } : {}),
      isDefault: Boolean(raw.isDefault),
      ...(raw.updatedAt ? { updatedAt: raw.updatedAt } : {}),
    });
  }
  if (cleaned.length > 0 && !cleaned.some((item) => item.isDefault)) {
    cleaned[0] = { ...cleaned[0], isDefault: true };
  }
  return cleaned;
}

export function ensureBusinessProfiles(
  settings?: Partial<GarageSettings> | null
): SellerProfileEntry[] {
  if (Array.isArray(settings?.businessProfiles) && settings.businessProfiles.length > 0) {
    return normalizeSellerProfileList(settings.businessProfiles, 'micro');
  }
  if (hasAnyIdentityOrContactData(settings?.proProfile)) {
    return normalizeSellerProfileList(
      [
        {
          ...pickStatusProfileFields(settings?.proProfile, 'micro_entrepreneur'),
          id: 'biz_default',
          isDefault: true,
        },
      ],
      'micro'
    );
  }
  const hasFlatBusiness =
    resolveUserProfileType(settings) === 'micro_entrepreneur' &&
    hasAnyIdentityOrContactData(settings);
  if (hasFlatBusiness) {
    return normalizeSellerProfileList(
      [
        {
          ...pickStatusProfileFields(settings, 'micro_entrepreneur'),
          id: 'biz_default',
          isDefault: true,
        },
      ],
      'micro'
    );
  }
  return [];
}

export function ensurePersonalProfiles(
  settings?: Partial<GarageSettings> | null
): SellerProfileEntry[] {
  if (Array.isArray(settings?.personalProfiles) && settings.personalProfiles.length > 0) {
    return normalizeSellerProfileList(settings.personalProfiles, 'particulier');
  }
  if (hasAnyIdentityOrContactData(settings?.particulierProfile)) {
    return normalizeSellerProfileList(
      [
        {
          ...pickStatusProfileFields(settings?.particulierProfile, 'particulier'),
          id: 'pers_default',
          isDefault: true,
        },
      ],
      'particulier'
    );
  }
  const hasFlatPersonal =
    resolveUserProfileType(settings) === 'particulier' && hasAnyIdentityOrContactData(settings);
  if (hasFlatPersonal) {
    return normalizeSellerProfileList(
      [
        {
          ...pickStatusProfileFields(settings, 'particulier'),
          id: 'pers_default',
          isDefault: true,
        },
      ],
      'particulier'
    );
  }
  return [];
}

export function upsertSellerProfileEntry(
  list: readonly SellerProfileEntry[],
  entry: Partial<SellerProfileEntry> & { id?: string },
  mode: VehiclePurchaseStatus
): { list: SellerProfileEntry[]; saved: SellerProfileEntry } {
  const profileType: AppUserProfileType =
    mode === 'particulier' ? 'particulier' : 'micro_entrepreneur';
  const id = entry.id?.trim() || createSellerProfileId(mode);
  const existsIdx = list.findIndex((item) => item.id === id);
  const existing = existsIdx >= 0 ? list[existsIdx] : undefined;
  const shouldBeDefault = Boolean(entry.isDefault) || list.length === 0 || Boolean(existing?.isDefault);
  const nextEntry: SellerProfileEntry = {
    ...pickStatusProfileFields({ ...(existing || {}), ...entry }, profileType),
    id,
    ...(entry.label?.trim()
      ? { label: entry.label.trim() }
      : existing?.label
      ? { label: existing.label }
      : {}),
    isDefault: shouldBeDefault,
    updatedAt: new Date().toISOString(),
  };

  let nextList =
    existsIdx >= 0
      ? list.map((item, idx) => (idx === existsIdx ? nextEntry : item))
      : [...list, nextEntry];

  if (shouldBeDefault) {
    nextList = nextList.map((item) => ({
      ...item,
      isDefault: item.id === id,
    }));
  }

  const normalized = normalizeSellerProfileList(nextList, mode);
  const saved = normalized.find((item) => item.id === id) || nextEntry;
  return { list: normalized, saved };
}

export function deleteSellerProfileEntry(
  list: readonly SellerProfileEntry[],
  id: string,
  mode: VehiclePurchaseStatus
): SellerProfileEntry[] {
  const filtered = list.filter((item) => item.id !== id);
  return normalizeSellerProfileList(filtered, mode);
}

export function setDefaultSellerProfileEntry(
  list: readonly SellerProfileEntry[],
  id: string,
  mode: VehiclePurchaseStatus
): SellerProfileEntry[] {
  const next = list.map((item) => ({
    ...item,
    isDefault: item.id === id,
  }));
  return normalizeSellerProfileList(next, mode);
}

/**
 * Synchronizes both Business & Personal multi-profile arrays back into GarageSettings
 * without global mode flipping:
 * - Primary Business profile syncs into `proProfile` AND top-level flat business fields.
 * - Primary Personal profile syncs into `particulierProfile`.
 */
export function syncSellerProfileArraysToSettings(
  settings: GarageSettings,
  businessProfilesInput: readonly SellerProfileEntry[],
  personalProfilesInput: readonly SellerProfileEntry[]
): GarageSettings {
  const businessProfiles = normalizeSellerProfileList([...businessProfilesInput], 'micro');
  const personalProfiles = normalizeSellerProfileList([...personalProfilesInput], 'particulier');

  const defaultBiz =
    businessProfiles.find((p) => p.isDefault) || businessProfiles[0] || null;
  const defaultPersonal =
    personalProfiles.find((p) => p.isDefault) || personalProfiles[0] || null;

  const nextProProfile: StatusProfileData = defaultBiz
    ? pickStatusProfileFields(defaultBiz, 'micro_entrepreneur')
    : hasAnyIdentityOrContactData(settings.proProfile)
    ? pickStatusProfileFields(settings.proProfile, 'micro_entrepreneur')
    : { ...EMPTY_PRO_PROFILE };

  const nextParticulierProfile: StatusProfileData = defaultPersonal
    ? pickStatusProfileFields(defaultPersonal, 'particulier')
    : { ...EMPTY_PARTICULIER_PROFILE };

  const preservedBusinessRegime =
    settings.taxRegime && settings.taxRegime !== 'none' ? settings.taxRegime : 'micro';
  const preservedLegalStatus =
    settings.legalStatus && settings.legalStatus !== 'particulier'
      ? settings.legalStatus
      : 'micro_entreprise';

  return {
    ...settings,
    ...nextProProfile,
    profileType: 'micro_entrepreneur',
    entityType: 'physique',
    legalStatus: preservedLegalStatus,
    taxRegime: preservedBusinessRegime,
    proProfile: nextProProfile,
    particulierProfile: nextParticulierProfile,
    businessProfiles,
    personalProfiles,
  };
}

export interface ResolvedSellerProfileResult {
  mode: VehiclePurchaseStatus;
  profileId?: string;
  profile: StatusProfileData;
  displayName: string;
  isPersonal: boolean;
}

export function resolveSellerProfileForVehicle(params: {
  vehicle?: Pick<Vehicle, 'purchaseStatus' | 'sellerProfileId' | 'buyerInfo'> | null;
  garageSettings?: Partial<GarageSettings> | null;
  overrideMode?: VehiclePurchaseStatus;
  overrideProfileId?: string;
}): ResolvedSellerProfileResult {
  const { vehicle, garageSettings, overrideMode, overrideProfileId } = params;
  const mode: VehiclePurchaseStatus = overrideMode
    ? overrideMode
    : vehicle?.purchaseStatus === 'particulier' || vehicle?.purchaseStatus === 'micro'
    ? vehicle.purchaseStatus
    : vehicle?.buyerInfo?.sellerProfileType === 'particulier'
    ? 'particulier'
    : vehicle?.buyerInfo?.sellerProfileType === 'micro_entrepreneur'
    ? 'micro'
    : resolveUserProfileType(garageSettings) === 'particulier'
    ? 'particulier'
    : 'micro';

  const isPersonal = mode === 'particulier';
  const pool = isPersonal
    ? ensurePersonalProfiles(garageSettings)
    : ensureBusinessProfiles(garageSettings);
  const candidateId =
    overrideProfileId?.trim() ||
    vehicle?.sellerProfileId?.trim() ||
    vehicle?.buyerInfo?.sellerProfileId?.trim();

  const matched =
    (candidateId ? pool.find((item) => item.id === candidateId) : undefined) ||
    pool.find((item) => item.isDefault) ||
    pool[0];

  if (matched) {
    const clean = pickStatusProfileFields(
      matched,
      isPersonal ? 'particulier' : 'micro_entrepreneur'
    );
    return {
      mode,
      profileId: matched.id,
      profile: clean,
      displayName: getSellerProfileDisplayName(clean, mode),
      isPersonal,
    };
  }

  const { particulierProfile, proProfile } = resolveSeparatedProfiles(
    garageSettings,
    isPersonal ? 'particulier' : 'micro_entrepreneur'
  );
  const fallbackProfile = isPersonal ? particulierProfile : proProfile;
  return {
    mode,
    profileId: undefined,
    profile: fallbackProfile,
    displayName: getSellerProfileDisplayName(fallbackProfile, mode),
    isPersonal,
  };
}

