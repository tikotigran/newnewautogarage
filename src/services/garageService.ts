import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  where,
  getDocs,
  getDoc,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import {
  AppUserProfileType,
  Vehicle,
  VehicleStatus,
  RepairTask,
  GeneralExpense,
  GarageSettings,
  GarageWorkspace,
  LegalStatus,
  TaxRegime,
} from '../types/garage';
import { calculateSaleTaxReport, calculateVehicleFinancials, roundToTwo } from '../utils/finance';
import {
  createDefaultFrenchTaxConfig,
  mapTaxRegimeToLegalStatus,
  normalizeFrenchTaxConfig,
  resolveDealSellerProfileType,
  resolveEffectiveSettingsForDeal,
  resolveUserProfileType,
} from '../utils/frenchTaxEngine';
import { buildGarageUpdatePayload, DEFAULT_GARAGE_ID } from '../utils/garageUtils';
import { normalizeCerfaTemplateId } from '../utils/cerfaConfig';
import {
  buildSoldRevertUpdate,
  LEGACY_SALE_FIELDS,
  stripSaleFieldsFromLocalVehicle,
} from '../utils/vehicleFormUtils';
import { removeVehicleSaleHistory } from './auditAndBackupService';
import {
  applyProfileSlotToSettings,
  EMPTY_PARTICULIER_PROFILE,
  EMPTY_PRO_PROFILE,
  ensureBusinessProfiles,
  ensurePersonalProfiles,
  pickStatusProfileFields,
  resolveSeparatedProfiles,
  switchGarageSettingsProfile,
  syncSellerProfileArraysToSettings,
} from '../utils/profileSeparationUtils';

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

// Helper to generate IDs
export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Real-time Vehicles Subscription
 */
const LOCAL_STORAGE_KEY = 'autogarage_vehicles_store';
const LOCAL_REPAIRS_KEY = 'autogarage_repairs_store';
const LOCAL_EXPENSES_KEY = 'autogarage_expenses_store';
const LOCAL_SETTINGS_KEY = 'autogarage_settings_store';
const LOCAL_GARAGES_KEY = 'autogarage_garages_store';
const ACTIVE_GARAGE_ID_KEY = 'autogarage_active_garage_id';

export function getActiveGarageId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_GARAGE_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveGarageId(garageId: string | null): void {
  try {
    if (garageId) {
      localStorage.setItem(ACTIVE_GARAGE_ID_KEY, garageId);
    } else {
      localStorage.removeItem(ACTIVE_GARAGE_ID_KEY);
    }
    window.dispatchEvent(new Event('autogarage_settings_updated'));
  } catch {
    // ignore
  }
}

export const DEFAULT_GARAGE_SETTINGS: GarageSettings = {
  profileType: 'micro_entrepreneur',
  entityType: 'physique',
  legalStatus: 'micro_entreprise',
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
  logoDataUrl: '',
  brandPrimaryColor: '#0f172a',
  brandSecondaryColor: '#f59e0b',
  signatureDataUrl: '',
  accountantEmail: '',
  particulierProfile: { ...EMPTY_PARTICULIER_PROFILE },
  proProfile: { ...EMPTY_PRO_PROFILE },
  businessProfiles: [],
  personalProfiles: [],
  defaultCerfaTemplate: 'cerfa_15776_02',
  theme: 'dark',
  taxRegime: 'micro',
  taxRatePercent: 13.3,
  frenchTaxConfig: createDefaultFrenchTaxConfig('micro_entreprise'),
  isCalculationHistory: [],
  taxAuditHistory: [],
};

export function getDefaultTaxRateForRegime(regime?: TaxRegime): number {
  if (regime === 'micro') return 13.3;
  if (regime === 'none') return 0;
  return 13.3;
}

function hydrateGarageSettings(raw: Partial<GarageSettings>, targetId: string): GarageSettings {
  const mergedBase: GarageSettings = {
    ...DEFAULT_GARAGE_SETTINGS,
    ...raw,
    garageId: targetId,
  };

  // Preserve Business tax configuration regardless of whether legacy workspace had profileType='particulier'
  const isCorporateRegime =
    raw.taxRegime === 'sarl' || raw.taxRegime === 'sas' || raw.taxRegime === 'custom';
  const businessTaxRegime: TaxRegime = isCorporateRegime ? raw.taxRegime! : 'micro';
  const normalizedBusinessTaxConfig = normalizeFrenchTaxConfig({
    ...mergedBase,
    profileType: 'micro_entrepreneur',
    legalStatus: isCorporateRegime
      ? mergedBase.legalStatus === 'particulier'
        ? mapTaxRegimeToLegalStatus(businessTaxRegime, 'morale')
        : mergedBase.legalStatus
      : 'micro_entreprise',
    taxRegime: businessTaxRegime,
    frenchTaxConfig:
      raw.frenchTaxConfig && raw.frenchTaxConfig.businessTaxRegime !== 'none'
        ? {
            ...raw.frenchTaxConfig,
            legalStatus: isCorporateRegime
              ? raw.frenchTaxConfig.legalStatus
              : 'micro_entreprise',
            businessTaxRegime,
          }
        : createDefaultFrenchTaxConfig('micro_entreprise'),
  });

  const resolvedTaxRate =
    businessTaxRegime === 'micro'
      ? roundToTwo(
          normalizedBusinessTaxConfig.socialContributionRate +
            (normalizedBusinessTaxConfig.versementLiberatoireEnabled
              ? normalizedBusinessTaxConfig.versementLiberatoireRate
              : 0)
        )
      : mergedBase.taxRatePercent ?? getDefaultTaxRateForRegime(businessTaxRegime);

  const businessProfiles = ensureBusinessProfiles(raw);
  const personalProfiles = ensurePersonalProfiles(raw);

  const hydratedBase: GarageSettings = {
    ...mergedBase,
    defaultCerfaTemplate: normalizeCerfaTemplateId(mergedBase.defaultCerfaTemplate),
    profileType: 'micro_entrepreneur',
    entityType: 'physique',
    legalStatus: normalizedBusinessTaxConfig.legalStatus,
    taxRegime: businessTaxRegime,
    taxRatePercent: resolvedTaxRate,
    frenchTaxConfig: normalizedBusinessTaxConfig,
    brandPrimaryColor:
      typeof mergedBase.brandPrimaryColor === 'string' && mergedBase.brandPrimaryColor.trim()
        ? mergedBase.brandPrimaryColor
        : '#0f172a',
    brandSecondaryColor:
      typeof mergedBase.brandSecondaryColor === 'string' && mergedBase.brandSecondaryColor.trim()
        ? mergedBase.brandSecondaryColor
        : '#f59e0b',
    logoDataUrl: typeof mergedBase.logoDataUrl === 'string' ? mergedBase.logoDataUrl : '',
    signatureDataUrl: typeof mergedBase.signatureDataUrl === 'string' ? mergedBase.signatureDataUrl : '',
    accountantEmail: typeof mergedBase.accountantEmail === 'string' ? mergedBase.accountantEmail : '',
    isCalculationHistory: Array.isArray(mergedBase.isCalculationHistory)
      ? mergedBase.isCalculationHistory
      : [],
    taxAuditHistory: Array.isArray(mergedBase.taxAuditHistory) ? mergedBase.taxAuditHistory : [],
  };

  return syncSellerProfileArraysToSettings(
    hydratedBase,
    businessProfiles,
    personalProfiles
  );
}

export function getGarageSettings(garageIdOverride?: string): GarageSettings {
  const targetId = garageIdOverride || getActiveGarageId() || DEFAULT_GARAGE_ID;
  try {
    const garages = getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY);
    const match = garages.find((g) => g.id === targetId);
    const matchProfileType: AppUserProfileType | undefined = match
      ? resolveUserProfileType(match)
      : undefined;
    const matchTaxRegime =
      match?.taxRegime && match.taxRegime !== 'none'
        ? match.taxRegime
        : DEFAULT_GARAGE_SETTINGS.taxRegime;
    const matchTaxRate =
      typeof match?.taxRatePercent === 'number' &&
      !Number.isNaN(match.taxRatePercent) &&
      match.taxRatePercent > 0
        ? match.taxRatePercent
        : getDefaultTaxRateForRegime(matchTaxRegime);

    const hasMatchSeparatedProfiles = Boolean(
      match?.particulierProfile ||
        match?.proProfile ||
        (match?.businessProfiles && match.businessProfiles.length > 0) ||
        (match?.personalProfiles && match.personalProfiles.length > 0)
    );
    const matchOverrides: Partial<GarageSettings> = match
      ? {
          profileType: 'micro_entrepreneur',
          entityType: match.entityType || 'physique',
          legalStatus:
            match.legalStatus && match.legalStatus !== 'particulier'
              ? match.legalStatus
              : mapTaxRegimeToLegalStatus(matchTaxRegime, match.entityType),
          taxRegime: matchTaxRegime,
          taxRatePercent: matchTaxRate,
          ...(hasMatchSeparatedProfiles
            ? {
                particulierProfile: match.particulierProfile,
                proProfile: match.proProfile,
                businessProfiles: match.businessProfiles,
                personalProfiles: match.personalProfiles,
              }
            : {
                name: matchProfileType === 'particulier' ? '' : match.name || '',
                city: match.city || '',
                siret: matchProfileType === 'particulier' ? '' : match.siret || '',
              }),
        }
      : {};

    const scopedRaw = localStorage.getItem(`${LOCAL_SETTINGS_KEY}_${targetId}`);
    if (scopedRaw) {
      const parsed = JSON.parse(scopedRaw) as Partial<GarageSettings>;
      return hydrateGarageSettings({ ...matchOverrides, ...parsed }, targetId);
    }
    if (targetId === DEFAULT_GARAGE_ID) {
      const legacyRaw = localStorage.getItem(LOCAL_SETTINGS_KEY);
      if (legacyRaw) {
        return hydrateGarageSettings(JSON.parse(legacyRaw) as Partial<GarageSettings>, targetId);
      }
    }
    if (match) {
      return hydrateGarageSettings(matchOverrides, targetId);
    }
    return hydrateGarageSettings({}, targetId);
  } catch {
    return hydrateGarageSettings({}, targetId);
  }
}

export async function fetchGarageSettingsFromCloud(
  userId?: string,
  garageIdOverride?: string
): Promise<GarageSettings> {
  const targetId = garageIdOverride || getActiveGarageId() || DEFAULT_GARAGE_ID;
  const local = getGarageSettings(targetId);
  if (auth.currentUser && userId) {
    try {
      const snap = await getDoc(doc(db, 'settings', `${userId}_${targetId}`));
      if (snap.exists()) {
        const cloudData = snap.data() as Partial<GarageSettings>;
        const hasCloudProfileStruct = Boolean(
          cloudData.particulierProfile ||
            cloudData.proProfile ||
            (cloudData.businessProfiles && cloudData.businessProfiles.length > 0) ||
            (cloudData.personalProfiles && cloudData.personalProfiles.length > 0)
        );
        const rawForHydration: Partial<GarageSettings> = hasCloudProfileStruct
          ? { ...local, ...cloudData }
          : {
              theme: local.theme,
              defaultMarginPercent: local.defaultMarginPercent,
              currency: local.currency,
              defaultCerfaTemplate: local.defaultCerfaTemplate,
              ...cloudData,
            };
        const merged = hydrateGarageSettings(rawForHydration, targetId);
        localStorage.setItem(`${LOCAL_SETTINGS_KEY}_${targetId}`, JSON.stringify(merged));
        window.dispatchEvent(new Event('autogarage_settings_updated'));
        return merged;
      }
    } catch (err) {
      console.warn('fetchGarageSettingsFromCloud warning:', err);
    }
  }
  return local;
}

export async function saveGarageSettings(
  settings: GarageSettings,
  userId?: string,
  garageIdOverride?: string
): Promise<void> {
  const targetId = garageIdOverride || settings.garageId || getActiveGarageId() || DEFAULT_GARAGE_ID;
  let existingLocal: Partial<GarageSettings> | null = null;
  try {
    const raw = localStorage.getItem(`${LOCAL_SETTINGS_KEY}_${targetId}`);
    if (raw) {
      existingLocal = JSON.parse(raw) as Partial<GarageSettings>;
    }
  } catch {
    existingLocal = null;
  }

  const isCorporateRegime =
    settings.taxRegime === 'sarl' ||
    settings.taxRegime === 'sas' ||
    settings.taxRegime === 'custom';
  const resolvedRegime: TaxRegime = isCorporateRegime ? settings.taxRegime! : 'micro';
  const resolvedLegalStatus: LegalStatus = isCorporateRegime
    ? settings.legalStatus && settings.legalStatus !== 'particulier'
      ? settings.legalStatus
      : mapTaxRegimeToLegalStatus(resolvedRegime, 'morale')
    : 'micro_entreprise';

  const normalizedTaxConfig = normalizeFrenchTaxConfig({
    ...settings,
    profileType: 'micro_entrepreneur',
    legalStatus: resolvedLegalStatus,
    taxRegime: resolvedRegime,
  });
  const resolvedRate =
    resolvedRegime === 'micro'
      ? Math.max(
          0,
          roundToTwo(
            normalizedTaxConfig.socialContributionRate +
              (normalizedTaxConfig.versementLiberatoireEnabled
                ? normalizedTaxConfig.versementLiberatoireRate
                : 0)
          )
        )
      : typeof settings.taxRatePercent === 'number' && !Number.isNaN(settings.taxRatePercent)
      ? Math.max(0, settings.taxRatePercent)
      : getDefaultTaxRateForRegime(resolvedRegime);

  const businessProfiles =
    settings.businessProfiles !== undefined
      ? ensureBusinessProfiles(settings)
      : ensureBusinessProfiles({ ...existingLocal, ...settings });
  const personalProfiles =
    settings.personalProfiles !== undefined
      ? ensurePersonalProfiles(settings)
      : ensurePersonalProfiles({ ...existingLocal, ...settings });

  const baseSynced = syncSellerProfileArraysToSettings(
    {
      ...settings,
      defaultCerfaTemplate: normalizeCerfaTemplateId(settings.defaultCerfaTemplate),
      garageId: targetId,
      profileType: 'micro_entrepreneur',
      entityType: 'physique',
      legalStatus: resolvedLegalStatus,
      taxRegime: resolvedRegime,
      taxRatePercent: resolvedRate,
      frenchTaxConfig: {
        ...normalizedTaxConfig,
        legalStatus: resolvedLegalStatus,
        businessTaxRegime: resolvedRegime,
      },
      isCalculationHistory: Array.isArray(settings.isCalculationHistory)
        ? settings.isCalculationHistory.slice(0, 50)
        : [],
      taxAuditHistory: Array.isArray(settings.taxAuditHistory)
        ? settings.taxAuditHistory.slice(0, 100)
        : [],
    },
    businessProfiles,
    personalProfiles
  );

  const scopedSettings: GarageSettings = stripUndefined(baseSynced);
  try {
    localStorage.setItem(`${LOCAL_SETTINGS_KEY}_${targetId}`, JSON.stringify(scopedSettings));
    if (targetId === DEFAULT_GARAGE_ID) {
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(scopedSettings));
    }
    window.dispatchEvent(new Event('autogarage_settings_updated'));
    // Keep workspace metadata in sync with primary business entity
    const garages = getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY);
    const now = new Date().toISOString();
    const existingGarage = garages.find((g) => g.id === targetId);
    const syncedGarageName = (scopedSettings.name || '').trim();
    const persistedGarageName = (syncedGarageName || existingGarage?.name || '').trim();
    if (existingGarage) {
      const updatedGarages = garages.map((g) =>
        g.id === targetId
          ? {
              ...g,
              name: syncedGarageName || g.name,
              profileType: 'micro_entrepreneur' as const,
              entityType: 'physique' as const,
              legalStatus: resolvedLegalStatus,
              city: scopedSettings.city || '',
              siret: scopedSettings.siret || '',
              taxRegime: resolvedRegime,
              taxRatePercent: resolvedRate,
              particulierProfile: scopedSettings.particulierProfile,
              proProfile: scopedSettings.proProfile,
              businessProfiles: scopedSettings.businessProfiles,
              personalProfiles: scopedSettings.personalProfiles,
              updatedAt: now,
            }
          : g
      );
      setLocalStore(LOCAL_GARAGES_KEY, updatedGarages);
    }
    window.dispatchEvent(new Event('autogarage_settings_updated'));
    if (auth.currentUser && userId) {
      await setDoc(doc(db, 'settings', `${userId}_${targetId}`), scopedSettings, { merge: true });
      if (existingGarage && persistedGarageName.length > 0) {
        await setDoc(
          doc(db, 'garages', targetId),
          stripUndefined({
            userId,
            name: persistedGarageName,
            profileType: 'micro_entrepreneur',
            entityType: 'physique',
            legalStatus: resolvedLegalStatus,
            city: scopedSettings.city || '',
            siret: scopedSettings.siret || '',
            taxRegime: resolvedRegime,
            taxRatePercent: resolvedRate,
            particulierProfile: scopedSettings.particulierProfile,
            proProfile: scopedSettings.proProfile,
            businessProfiles: scopedSettings.businessProfiles,
            personalProfiles: scopedSettings.personalProfiles,
            updatedAt: now,
          }),
          { merge: true }
        );
      }
    }
  } catch (err) {
    console.warn('saveGarageSettings warning:', err);
  }
}

export function exportGarageDatabase(vehiclesOverride?: Vehicle[]) {
  const vehicles = vehiclesOverride && vehiclesOverride.length > 0
    ? vehiclesOverride
    : getLocalStore<Vehicle>(LOCAL_STORAGE_KEY);
  const repairs = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY);
  const expenses = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY);
  const settings = getGarageSettings();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    vehicles,
    repairs,
    expenses,
    settings,
  };
}

export async function importGarageDatabase(
  payload: {
    vehicles: Vehicle[];
    repairs: RepairTask[];
    expenses: GeneralExpense[];
    settings: GarageSettings;
  },
  userId?: string
): Promise<void> {
  setLocalStore(LOCAL_STORAGE_KEY, payload.vehicles || []);
  setLocalStore(LOCAL_REPAIRS_KEY, payload.repairs || []);
  setLocalStore(LOCAL_EXPENSES_KEY, payload.expenses || []);
  await saveGarageSettings({ ...DEFAULT_GARAGE_SETTINGS, ...payload.settings }, userId);

  if (auth.currentUser && userId) {
    for (const v of payload.vehicles || []) {
      await setDoc(doc(db, 'vehicles', v.id), { ...v, userId }, { merge: true });
    }
  }
}

export function clearLocalGarageCache(): void {
  try {
    const keysToRemove = [
      LOCAL_STORAGE_KEY,
      LOCAL_REPAIRS_KEY,
      LOCAL_EXPENSES_KEY,
      LOCAL_SETTINGS_KEY,
      LOCAL_GARAGES_KEY,
      ACTIVE_GARAGE_ID_KEY,
      'autogarage_current_user_profile',
      'autogarage_pending_profile_type',
      'autogarage_guest_demo_active',
      'autogarage_suppliers_store',
      'autogarage_purchases_store',
      'autogarage_documents_store',
      'autogarage_document_history_store',
      'autogarage_activity_logs_store',
      'autogarage_change_logs_store',
      'autogarage_backup_snapshots_store',
    ];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${LOCAL_SETTINGS_KEY}_`)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    window.dispatchEvent(new Event('autogarage_store_updated'));
    window.dispatchEvent(new Event('autogarage_settings_updated'));
  } catch (err) {
    console.warn('clearLocalGarageCache warning:', err);
  }
}

function getLocalStore<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalStore<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new Event('autogarage_store_updated'));
  } catch (e) {
    console.warn('localStorage write error:', e);
  }
}

const pendingDeletedGarageIds = new Set<string>();

export function subscribeGarages(
  userId: string,
  onData: (garages: GarageWorkspace[]) => void
): () => void {
  const ensureDefault = (list: GarageWorkspace[]): GarageWorkspace[] => {
    if (list.length > 0) return list;
    const now = new Date().toISOString();
    const legacySettingsRaw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    const legacySettings = legacySettingsRaw ? (JSON.parse(legacySettingsRaw) as GarageSettings) : null;
    let pendingProfile: AppUserProfileType | null = null;
    try {
      const rawPending = localStorage.getItem('autogarage_pending_profile_type');
      if (rawPending === 'particulier' || rawPending === 'micro_entrepreneur') {
        pendingProfile = rawPending;
      }
      if (!pendingProfile) {
        const rawUserProfile = localStorage.getItem('autogarage_current_user_profile');
        if (rawUserProfile) {
          const parsedProfile = JSON.parse(rawUserProfile) as { profileType?: string };
          if (
            parsedProfile?.profileType === 'particulier' ||
            parsedProfile?.profileType === 'micro_entrepreneur'
          ) {
            pendingProfile = parsedProfile.profileType;
          }
        }
      }
    } catch {
      // ignore
    }
    const defaultProfileType: AppUserProfileType =
      pendingProfile ||
      (legacySettings ? resolveUserProfileType(legacySettings) : 'micro_entrepreneur');
    const isParticulier = defaultProfileType === 'particulier';
    const defaultGarage: GarageWorkspace = {
      id: DEFAULT_GARAGE_ID,
      userId,
      name: legacySettings?.name || '',
      profileType: defaultProfileType,
      entityType: 'physique',
      legalStatus: isParticulier ? 'particulier' : 'micro_entreprise',
      taxRegime: isParticulier ? 'none' : 'micro',
      taxRatePercent: isParticulier ? 0 : 13.3,
      city: legacySettings?.city || '',
      siret: isParticulier ? '' : legacySettings?.siret || '',
      createdAt: now,
      updatedAt: now,
    };
    setLocalStore(LOCAL_GARAGES_KEY, [defaultGarage]);
    return [defaultGarage];
  };

  const getUserScopedLocalGarages = (): GarageWorkspace[] =>
    getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY).filter(
      (g) => !g.userId || g.userId === userId
    );

  if (auth.currentUser) {
    const q = query(collection(db, 'garages'), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const list: GarageWorkspace[] = [];
        snap.forEach((docSnap) => {
          if (!pendingDeletedGarageIds.has(docSnap.id)) {
            list.push({ ...(docSnap.data() as GarageWorkspace), id: docSnap.id });
          }
        });
        list.sort(
          (a, b) =>
            new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
        );
        if (list.length === 0) {
          onData(ensureDefault(getUserScopedLocalGarages()));
        } else {
          try {
            localStorage.setItem(LOCAL_GARAGES_KEY, JSON.stringify(list));
          } catch {
            // ignore
          }
          onData(list);
        }
      },
      () => {
        onData(ensureDefault(getUserScopedLocalGarages()));
      }
    );
  }

  const emitLocal = () => {
    const list = ensureDefault(getUserScopedLocalGarages());
    onData(list);
  };
  emitLocal();
  window.addEventListener('autogarage_store_updated', emitLocal);
  return () => window.removeEventListener('autogarage_store_updated', emitLocal);
}

export async function createGarage(
  userId: string,
  input: {
    name: string;
    profileType?: AppUserProfileType;
    entityType?: 'morale' | 'physique';
    legalStatus?: LegalStatus;
    city?: string;
    siret?: string;
    taxRegime?: TaxRegime;
    taxRatePercent?: number;
  }
): Promise<GarageWorkspace> {
  const id = generateId('garage');
  const now = new Date().toISOString();
  const profileType = resolveUserProfileType({
    profileType: input.profileType,
    legalStatus: input.legalStatus,
    taxRegime: input.taxRegime,
    entityType: input.entityType,
  });
  const isParticulier = profileType === 'particulier';
  const resolvedRegime: TaxRegime = input.taxRegime || (isParticulier ? 'none' : 'micro');
  const resolvedLegalStatus: LegalStatus =
    input.legalStatus || (isParticulier ? 'particulier' : 'micro_entreprise');
  const resolvedTaxRate =
    isParticulier
      ? 0
      : typeof input.taxRatePercent === 'number' && !Number.isNaN(input.taxRatePercent)
      ? Math.max(0, input.taxRatePercent)
      : getDefaultTaxRateForRegime(resolvedRegime);
  const frenchTaxConfig = createDefaultFrenchTaxConfig(resolvedLegalStatus, {
    businessTaxRegime: resolvedRegime,
  });

  const newGarage: GarageWorkspace = stripUndefined({
    id,
    userId,
    name: input.name.trim(),
    profileType,
    entityType: 'physique',
    legalStatus: resolvedLegalStatus,
    city: input.city?.trim() || '',
    siret: isParticulier ? '' : input.siret?.trim() || '',
    taxRegime: resolvedRegime,
    taxRatePercent: resolvedTaxRate,
    createdAt: now,
    updatedAt: now,
  });

  const initialProfileSlot = pickStatusProfileFields(
    {
      name: newGarage.name,
      city: newGarage.city || '',
      siret: newGarage.siret || '',
      legalForm: isParticulier ? '' : 'Micro-entrepreneur',
      tvaMention: isParticulier ? '' : DEFAULT_GARAGE_SETTINGS.tvaMention,
    },
    profileType
  );
  const newGarageWithProfiles: GarageWorkspace = stripUndefined({
    ...newGarage,
    particulierProfile: isParticulier ? initialProfileSlot : { ...EMPTY_PARTICULIER_PROFILE },
    proProfile: isParticulier ? { ...EMPTY_PRO_PROFILE } : initialProfileSlot,
  });

  const existing = getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY);
  setLocalStore(LOCAL_GARAGES_KEY, [...existing, newGarageWithProfiles]);

  await saveGarageSettings(
    applyProfileSlotToSettings(
      {
        ...DEFAULT_GARAGE_SETTINGS,
        garageId: id,
        profileType,
        entityType: 'physique',
        legalStatus: resolvedLegalStatus,
        taxRegime: resolvedRegime,
        taxRatePercent: resolvedTaxRate,
        frenchTaxConfig,
      },
      profileType,
      newGarageWithProfiles.particulierProfile!,
      newGarageWithProfiles.proProfile!
    ),
    userId,
    id
  );

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'garages', id), newGarageWithProfiles);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `garages/${id}`);
    }
  }

  return newGarageWithProfiles;
}

export async function updateGarage(
  userId: string,
  garageId: string,
  input: {
    name: string;
    profileType: AppUserProfileType;
    city?: string;
    siret?: string;
    taxRatePercent?: number;
  },
  currentWorkspace?: GarageWorkspace
): Promise<GarageWorkspace> {
  const existingLocalList = getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY);
  const existingMatch =
    currentWorkspace ||
    existingLocalList.find((g) => g.id === garageId) || {
      id: garageId,
      userId,
      name: input.name.trim(),
      profileType: input.profileType,
      entityType: 'physique' as const,
      legalStatus: (input.profileType === 'particulier' ? 'particulier' : 'micro_entreprise') as LegalStatus,
      taxRegime: (input.profileType === 'particulier' ? 'none' : 'micro') as TaxRegime,
      taxRatePercent: input.profileType === 'particulier' ? 0 : 13.3,
      city: input.city?.trim() || '',
      siret: input.profileType === 'particulier' ? '' : input.siret?.trim() || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

  const updatedGarage = stripUndefined(
    buildGarageUpdatePayload({ ...existingMatch, userId }, input)
  );
  const isParticulier = updatedGarage.profileType === 'particulier';

  const currentSettings = getGarageSettings(garageId);
  const currentActiveProfile = resolveUserProfileType(currentSettings);
  const nextActiveProfile = resolveUserProfileType(updatedGarage);
  const switchedBase =
    currentActiveProfile !== nextActiveProfile
      ? switchGarageSettingsProfile(currentSettings, nextActiveProfile)
      : currentSettings;

  const frenchTaxConfig = createDefaultFrenchTaxConfig(
    updatedGarage.legalStatus || (isParticulier ? 'particulier' : 'micro_entreprise'),
    {
      ...(switchedBase.frenchTaxConfig || {}),
      businessTaxRegime: updatedGarage.taxRegime || (isParticulier ? 'none' : 'micro'),
    }
  );

  const nextSettings: GarageSettings = {
    ...switchedBase,
    garageId,
    profileType: updatedGarage.profileType,
    entityType: 'physique',
    legalStatus: updatedGarage.legalStatus || (isParticulier ? 'particulier' : 'micro_entreprise'),
    legalForm: isParticulier ? '' : switchedBase.legalForm || 'Micro-entrepreneur',
    tvaMention: isParticulier
      ? ''
      : switchedBase.tvaMention || DEFAULT_GARAGE_SETTINGS.tvaMention,
    name: updatedGarage.name,
    city: updatedGarage.city ?? switchedBase.city ?? '',
    siret: isParticulier ? '' : updatedGarage.siret ?? switchedBase.siret ?? '',
    taxRegime: updatedGarage.taxRegime || (isParticulier ? 'none' : 'micro'),
    taxRatePercent: updatedGarage.taxRatePercent ?? (isParticulier ? 0 : 13.3),
    frenchTaxConfig,
  };

  await saveGarageSettings(nextSettings, userId, garageId);

  const savedSettings = getGarageSettings(garageId);
  const updatedGarageWithProfiles = stripUndefined({
    ...updatedGarage,
    particulierProfile: savedSettings.particulierProfile,
    proProfile: savedSettings.proProfile,
  });

  const nextLocalList = existingLocalList.some((g) => g.id === garageId)
    ? existingLocalList.map((g) => (g.id === garageId ? updatedGarageWithProfiles : g))
    : [...existingLocalList, updatedGarageWithProfiles];
  setLocalStore(LOCAL_GARAGES_KEY, nextLocalList);

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'garages', garageId), updatedGarageWithProfiles, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `garages/${garageId}`);
    }
  }

  return updatedGarageWithProfiles;
}

export async function deleteGarage(userId: string, garageId: string): Promise<void> {
  pendingDeletedGarageIds.add(garageId);

  // 1. Immediately purge local caches synchronously so no subsequent local fallback or listener can resurrect it
  const remainingLocalGarages = getLocalStore<GarageWorkspace>(LOCAL_GARAGES_KEY).filter(
    (g) => g.id !== garageId
  );
  setLocalStore(LOCAL_GARAGES_KEY, remainingLocalGarages);

  const allLocalVehicles = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY);
  const deletedLocalVehicleIds = new Set<string>();
  const remainingLocalVehicles = allLocalVehicles.filter((v) => {
    const belongsToGarage = v.garageId
      ? v.garageId === garageId
      : garageId === DEFAULT_GARAGE_ID;
    if (belongsToGarage) {
      deletedLocalVehicleIds.add(v.id);
      return false;
    }
    return true;
  });
  if (deletedLocalVehicleIds.size > 0) {
    setLocalStore(LOCAL_STORAGE_KEY, remainingLocalVehicles);
    setLocalStore(
      LOCAL_REPAIRS_KEY,
      getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY).filter((r) => !deletedLocalVehicleIds.has(r.vehicleId))
    );
    setLocalStore(
      LOCAL_EXPENSES_KEY,
      getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY).filter((e) => !deletedLocalVehicleIds.has(e.vehicleId))
    );
  }

  try {
    localStorage.removeItem(`${LOCAL_SETTINGS_KEY}_${garageId}`);
    if (garageId === DEFAULT_GARAGE_ID) {
      localStorage.removeItem(LOCAL_SETTINGS_KEY);
    }
  } catch {
    // ignore
  }

  if (getActiveGarageId() === garageId) {
    setActiveGarageId(null);
  }
  window.dispatchEvent(new Event('autogarage_settings_updated'));

  // 2. Delete vehicles, scoped settings, and garage document in Firestore (in parallel)
  if (auth.currentUser) {
    try {
      const vehCleanupPromise = (async () => {
        const vehSnap = await getDocs(
          query(collection(db, 'vehicles'), where('userId', '==', userId))
        );
        const matchingIds: string[] = [];
        vehSnap.forEach((vDoc) => {
          const vData = vDoc.data() as Vehicle;
          const belongsToGarage = vData.garageId
            ? vData.garageId === garageId
            : garageId === DEFAULT_GARAGE_ID;
          if (belongsToGarage) {
            matchingIds.push(vDoc.id);
          }
        });
        if (matchingIds.length > 0) {
          await Promise.all(matchingIds.map((vid) => deleteVehicle(vid)));
        }
      })();

      const settingsCleanupPromise = userId
        ? deleteDoc(doc(db, 'settings', `${userId}_${garageId}`)).catch(() => undefined)
        : Promise.resolve();

      const garageDocCleanupPromise = (async () => {
        const garagesSnap = await getDocs(
          query(collection(db, 'garages'), where('userId', '==', userId))
        );
        if (garagesSnap.docs.some((d) => d.id === garageId)) {
          await deleteDoc(doc(db, 'garages', garageId));
        }
      })();

      await Promise.all([vehCleanupPromise, settingsCleanupPromise, garageDocCleanupPromise]);
      setTimeout(() => {
        pendingDeletedGarageIds.delete(garageId);
      }, 15000);
    } catch (err) {
      pendingDeletedGarageIds.delete(garageId);
      handleFirestoreError(err, OperationType.DELETE, `garages/${garageId}`);
    }
  } else {
    pendingDeletedGarageIds.delete(garageId);
  }
}

function normalizeVehicleRecord(raw: Vehicle, docId?: string): Vehicle {
  const purchasePrice = Math.max(0, Number(raw.purchasePrice) || 0);
  const repairCostTotal = Math.max(0, Number(raw.repairCostTotal) || 0);
  const generalExpensesTotal = Math.max(0, Number(raw.generalExpensesTotal) || 0);
  const rawTotalExpenses = Math.max(0, Number(raw.totalExpenses) || 0);
  const totalExpenses =
    rawTotalExpenses > 0 && repairCostTotal === 0 && generalExpensesTotal === 0
      ? rawTotalExpenses
      : Math.round((repairCostTotal + generalExpensesTotal + Number.EPSILON) * 100) / 100;
  const totalInvested =
    typeof raw.totalInvested === 'number' && !Number.isNaN(raw.totalInvested) && raw.totalInvested >= purchasePrice
      ? raw.totalInvested
      : Math.round((purchasePrice + totalExpenses + Number.EPSILON) * 100) / 100;

  return {
    ...raw,
    id: docId || raw.id,
    mileage: Math.max(0, Number(raw.mileage) || 0),
    vin: raw.vin || '',
    registrationNumber: raw.registrationNumber || '',
    purchasePrice,
    targetSalePrice: Number(raw.targetSalePrice) || 0,
    photos: Array.isArray(raw.photos) ? raw.photos : [],
    documents: Array.isArray(raw.documents) ? raw.documents : [],
    repairCostTotal,
    generalExpensesTotal,
    totalExpenses,
    totalInvested,
    netProfit: Number(raw.netProfit) || 0,
    marginPercentage: Number(raw.marginPercentage) || 0,
  };
}

export function subscribeVehicles(
  userId: string,
  onData: (vehicles: Vehicle[]) => void,
  onError?: (err: unknown) => void
) {
  // If user is logged into Firebase, listen to real Firestore collection
  if (auth.currentUser) {
    const collectionPath = 'vehicles';
    const q = query(
      collection(db, collectionPath),
      where('userId', '==', userId)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const vehicles: Vehicle[] = [];
        snapshot.forEach((docSnap) => {
          vehicles.push(normalizeVehicleRecord(docSnap.data() as Vehicle, docSnap.id));
        });
        vehicles.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        onData(vehicles);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, collectionPath);
      }
    );
  }

  // Local storage listener for immediate offline/guest exploration
  const emitLocal = () => {
    const list = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY).map((v) => normalizeVehicleRecord(v));
    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    onData(list);
  };

  emitLocal();
  const listener = () => emitLocal();
  window.addEventListener('autogarage_store_updated', listener);
  return () => window.removeEventListener('autogarage_store_updated', listener);
}

/**
 * Create Vehicle
 */
export async function createVehicle(
  vehicle: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = generateId('veh');
  const now = new Date().toISOString();
  const path = `vehicles/${id}`;

  const financials = calculateVehicleFinancials({
    purchasePrice: vehicle.purchasePrice,
    targetSalePrice: vehicle.targetSalePrice,
    finalSalePrice: vehicle.status === 'sold' ? vehicle.buyerInfo?.salePrice : undefined,
    repairs: [],
    expenses: [],
  });

  const newVehicle: Vehicle = stripUndefined({
    ...vehicle,
    buyerInfo: vehicle.status === 'sold' ? vehicle.buyerInfo : undefined,
    id,
    repairCostTotal: financials.repairCostTotal,
    generalExpensesTotal: financials.generalExpensesTotal,
    totalExpenses: financials.totalExpenses,
    totalInvested: financials.totalInvested,
    netProfit: financials.netProfit,
    marginPercentage: financials.marginPercentage,
    photos: vehicle.photos || [],
    documents: vehicle.documents || [],
    createdAt: now,
    updatedAt: now,
  });

  if (!auth.currentUser) {
    const list = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY);
    setLocalStore(LOCAL_STORAGE_KEY, [newVehicle, ...list]);
    return id;
  }

  try {
    await setDoc(doc(db, 'vehicles', id), newVehicle);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Update Vehicle
 */
export async function updateVehicle(
  vehicleId: string,
  updates: Partial<Vehicle>
): Promise<void> {
  const path = `vehicles/${vehicleId}`;
  const explicitClearBuyerInfo = 'buyerInfo' in updates && updates.buyerInfo === undefined;
  const cleanUpdates = stripUndefined(updates);
  if (cleanUpdates.registrationNumber !== undefined) {
    cleanUpdates.registrationNumber = String(cleanUpdates.registrationNumber).trim().toUpperCase();
  }
  if (cleanUpdates.mileage !== undefined) {
    cleanUpdates.mileage = Math.max(0, Number(cleanUpdates.mileage) || 0);
  }

  if (!auth.currentUser) {
    const list = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY);
    const updated = list.map((v) => {
      if (v.id !== vehicleId) return v;
      const isRevertingFromSold =
        v.status === 'sold' &&
        cleanUpdates.status !== undefined &&
        cleanUpdates.status !== 'sold';

      let next: Vehicle = isRevertingFromSold
        ? {
            ...v,
            ...stripUndefined(
              buildSoldRevertUpdate(v, cleanUpdates.status!, cleanUpdates).updates
            ),
          }
        : { ...v, ...cleanUpdates };

      if (isRevertingFromSold || explicitClearBuyerInfo) {
        next = stripSaleFieldsFromLocalVehicle(next);
      }

      if (cleanUpdates.purchasePrice !== undefined && cleanUpdates.totalInvested === undefined) {
        const exp = Math.max(0, Number(next.totalExpenses) || 0);
        next.totalInvested = Math.round(((Number(cleanUpdates.purchasePrice) || 0) + exp + Number.EPSILON) * 100) / 100;
      }
      return { ...next, updatedAt: new Date().toISOString() };
    });
    setLocalStore(LOCAL_STORAGE_KEY, updated);
    return;
  }

  try {
    let payload: Record<string, unknown> = stripUndefined({
      ...cleanUpdates,
      updatedAt: new Date().toISOString(),
    });
    let shouldDeleteBuyerInfo = explicitClearBuyerInfo;
    const needsExistingDoc =
      payload.purchasePrice !== undefined ||
      (cleanUpdates.status !== undefined && cleanUpdates.status !== 'sold');

    if (needsExistingDoc) {
      const snap = await getDoc(doc(db, 'vehicles', vehicleId));
      if (snap.exists()) {
        const existingData = normalizeVehicleRecord(snap.data() as Vehicle, snap.id);
        const isRevertingFromSold =
          existingData.status === 'sold' &&
          cleanUpdates.status !== undefined &&
          cleanUpdates.status !== 'sold';

        if (isRevertingFromSold) {
          shouldDeleteBuyerInfo = true;
          const reverted = stripUndefined(
            buildSoldRevertUpdate(existingData, cleanUpdates.status!, cleanUpdates).updates
          );
          payload = {
            ...payload,
            ...reverted,
            updatedAt: payload.updatedAt,
          };
        } else if (payload.purchasePrice !== undefined && payload.totalInvested === undefined) {
          const exp = Math.max(0, Number(existingData.totalExpenses) || 0);
          payload.totalInvested = Math.round(((Number(payload.purchasePrice) || 0) + exp + Number.EPSILON) * 100) / 100;
        }
      }
    }

    if (shouldDeleteBuyerInfo) {
      payload.buyerInfo = deleteField();
      for (const legacyField of LEGACY_SALE_FIELDS) {
        payload[legacyField] = deleteField();
      }
    }

    await updateDoc(doc(db, 'vehicles', vehicleId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Cancel a completed sale: resets vehicle status (defaults to 'for_sale'),
 * deletes buyerInfo and all legacy flat sale fields in Firestore/localStorage,
 * restores unsold P&L projections, and deletes sale audit history entries.
 */
export async function cancelVehicleSale(
  vehicleId: string,
  userId?: string,
  targetStatus: VehicleStatus = 'for_sale'
): Promise<void> {
  const safeTargetStatus: VehicleStatus = targetStatus === 'sold' ? 'for_sale' : targetStatus;
  const path = `vehicles/${vehicleId}`;
  const now = new Date().toISOString();

  if (!auth.currentUser) {
    const list = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY);
    const updated = list.map((v) => {
      if (v.id !== vehicleId) return v;
      const revert = buildSoldRevertUpdate(v, safeTargetStatus);
      const cleaned = stripSaleFieldsFromLocalVehicle({
        ...v,
        ...stripUndefined(revert.updates),
        status: safeTargetStatus,
        updatedAt: now,
      });
      return cleaned;
    });
    setLocalStore(LOCAL_STORAGE_KEY, updated);
    await removeVehicleSaleHistory(userId || 'garage_pro_dealer', vehicleId);
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'vehicles', vehicleId));
    const existing = snap.exists()
      ? normalizeVehicleRecord(snap.data() as Vehicle, snap.id)
      : null;

    const revertUpdates = existing
      ? stripUndefined(buildSoldRevertUpdate(existing, safeTargetStatus).updates)
      : { status: safeTargetStatus, netProfit: 0, marginPercentage: 0 };

    const payload: Record<string, unknown> = {
      ...revertUpdates,
      status: safeTargetStatus,
      buyerInfo: deleteField(),
      updatedAt: now,
    };
    for (const legacyField of LEGACY_SALE_FIELDS) {
      payload[legacyField] = deleteField();
    }

    await updateDoc(doc(db, 'vehicles', vehicleId), payload);
    await removeVehicleSaleHistory(userId || existing?.userId || auth.currentUser.uid, vehicleId);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Delete Vehicle and subcollections
 */
export async function deleteVehicle(vehicleId: string): Promise<void> {
  const path = `vehicles/${vehicleId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY).filter((v) => v.id !== vehicleId);
    setLocalStore(LOCAL_STORAGE_KEY, list);
    const repairs = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY).filter((r) => r.vehicleId !== vehicleId);
    setLocalStore(LOCAL_REPAIRS_KEY, repairs);
    const expenses = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY).filter((e) => e.vehicleId !== vehicleId);
    setLocalStore(LOCAL_EXPENSES_KEY, expenses);
    return;
  }

  try {
    // Delete repairs subcollection
    const repairsSnap = await getDocs(collection(db, 'vehicles', vehicleId, 'repairs'));
    for (const rDoc of repairsSnap.docs) {
      await deleteDoc(doc(db, 'vehicles', vehicleId, 'repairs', rDoc.id));
    }
    // Delete expenses subcollection
    const expensesSnap = await getDocs(collection(db, 'vehicles', vehicleId, 'expenses'));
    for (const eDoc of expensesSnap.docs) {
      await deleteDoc(doc(db, 'vehicles', vehicleId, 'expenses', eDoc.id));
    }
    // Delete main vehicle document
    await deleteDoc(doc(db, 'vehicles', vehicleId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Real-time Repairs Subscription
 */
export function subscribeRepairs(
  vehicleId: string,
  onData: (repairs: RepairTask[]) => void,
  onError?: (err: unknown) => void
) {
  if (auth.currentUser) {
    const path = `vehicles/${vehicleId}/repairs`;
    const q = collection(db, 'vehicles', vehicleId, 'repairs');

    return onSnapshot(
      q,
      (snapshot) => {
        const repairs: RepairTask[] = [];
        snapshot.forEach((docSnap) => {
          repairs.push({ ...(docSnap.data() as RepairTask), id: docSnap.id });
        });
        repairs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        onData(repairs);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  }

  const emitLocal = () => {
    const all = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY);
    const filtered = all.filter((r) => r.vehicleId === vehicleId);
    filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    onData(filtered);
  };

  emitLocal();
  const listener = () => emitLocal();
  window.addEventListener('autogarage_store_updated', listener);
  return () => window.removeEventListener('autogarage_store_updated', listener);
}

/**
 * Add Repair Task
 */
export async function addRepairTask(
  vehicleId: string,
  userId: string,
  task: Omit<RepairTask, 'id' | 'vehicleId' | 'userId' | 'createdAt' | 'updatedAt' | 'totalCost'>
): Promise<string> {
  const id = generateId('task');
  const path = `vehicles/${vehicleId}/repairs/${id}`;
  const now = new Date().toISOString();
  const partsCost = Number(task.partsCost) || 0;
  const laborCost = Number(task.laborCost) || 0;

  const newTask: RepairTask = stripUndefined({
    ...task,
    id,
    vehicleId,
    userId,
    partsCost,
    laborCost,
    totalCost: partsCost + laborCost,
    createdAt: now,
    updatedAt: now,
  });

  if (!auth.currentUser) {
    const list = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY);
    setLocalStore(LOCAL_REPAIRS_KEY, [newTask, ...list]);
    await recalculateAndSyncVehicleById(vehicleId);
    return id;
  }

  try {
    await setDoc(doc(db, 'vehicles', vehicleId, 'repairs', id), newTask);
    await recalculateAndSyncVehicleById(vehicleId);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Update Repair Task
 */
export async function updateRepairTask(
  vehicleId: string,
  taskId: string,
  updates: Partial<RepairTask>
): Promise<void> {
  const path = `vehicles/${vehicleId}/repairs/${taskId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY);
    const updated = list.map((t) => {
      if (t.id === taskId) {
        const parts = updates.partsCost !== undefined ? Number(updates.partsCost) : t.partsCost;
        const labor = updates.laborCost !== undefined ? Number(updates.laborCost) : t.laborCost;
        return {
          ...t,
          ...updates,
          partsCost: parts,
          laborCost: labor,
          totalCost: parts + labor,
          updatedAt: new Date().toISOString(),
        };
      }
      return t;
    });
    setLocalStore(LOCAL_REPAIRS_KEY, updated);
    await recalculateAndSyncVehicleById(vehicleId);
    return;
  }

  try {
    const payload: Record<string, unknown> = stripUndefined({
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    if (updates.partsCost !== undefined || updates.laborCost !== undefined) {
      const existingSnap = await getDoc(doc(db, 'vehicles', vehicleId, 'repairs', taskId));
      const existing = existingSnap.exists() ? (existingSnap.data() as RepairTask) : null;
      const parts = updates.partsCost !== undefined ? Number(updates.partsCost) : (existing?.partsCost ?? 0);
      const labor = updates.laborCost !== undefined ? Number(updates.laborCost) : (existing?.laborCost ?? 0);
      payload.totalCost = parts + labor;
    }
    await updateDoc(doc(db, 'vehicles', vehicleId, 'repairs', taskId), payload);
    await recalculateAndSyncVehicleById(vehicleId);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Delete Repair Task
 */
export async function deleteRepairTask(vehicleId: string, taskId: string): Promise<void> {
  const path = `vehicles/${vehicleId}/repairs/${taskId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY).filter((t) => t.id !== taskId);
    setLocalStore(LOCAL_REPAIRS_KEY, list);
    await recalculateAndSyncVehicleById(vehicleId);
    return;
  }

  try {
    await deleteDoc(doc(db, 'vehicles', vehicleId, 'repairs', taskId));
    await recalculateAndSyncVehicleById(vehicleId);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Real-time General Expenses Subscription
 */
export function subscribeExpenses(
  vehicleId: string,
  onData: (expenses: GeneralExpense[]) => void,
  onError?: (err: unknown) => void
) {
  if (auth.currentUser) {
    const path = `vehicles/${vehicleId}/expenses`;
    const q = collection(db, 'vehicles', vehicleId, 'expenses');

    return onSnapshot(
      q,
      (snapshot) => {
        const expenses: GeneralExpense[] = [];
        snapshot.forEach((docSnap) => {
          expenses.push({ ...(docSnap.data() as GeneralExpense), id: docSnap.id });
        });
        expenses.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        onData(expenses);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  }

  const emitLocal = () => {
    const all = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY);
    const filtered = all.filter((e) => e.vehicleId === vehicleId);
    filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onData(filtered);
  };

  emitLocal();
  const listener = () => emitLocal();
  window.addEventListener('autogarage_store_updated', listener);
  return () => window.removeEventListener('autogarage_store_updated', listener);
}

/**
 * Subscribe to ALL repairs and general expenses across the entire fleet for Analytics
 */
export function subscribeAllFleetExpensesAndRepairs(
  vehicles: Vehicle[],
  onData: (data: { repairs: RepairTask[]; expenses: GeneralExpense[] }) => void
): () => void {
  if (auth.currentUser) {
    let active = true;
    const loadAll = async () => {
      try {
        const repairs: RepairTask[] = [];
        const expenses: GeneralExpense[] = [];
        await Promise.all(
          vehicles.map(async (v) => {
            const [rSnap, eSnap] = await Promise.all([
              getDocs(collection(db, 'vehicles', v.id, 'repairs')),
              getDocs(collection(db, 'vehicles', v.id, 'expenses')),
            ]);
            rSnap.forEach((docSnap) => {
              repairs.push({ ...(docSnap.data() as RepairTask), id: docSnap.id });
            });
            eSnap.forEach((docSnap) => {
              expenses.push({ ...(docSnap.data() as GeneralExpense), id: docSnap.id });
            });
          })
        );
        if (active) {
          onData({ repairs, expenses });
        }
      } catch (err) {
        console.warn('subscribeAllFleetExpensesAndRepairs warning:', err);
      }
    };
    loadAll();
    const listener = () => loadAll();
    window.addEventListener('autogarage_store_updated', listener);
    return () => {
      active = false;
      window.removeEventListener('autogarage_store_updated', listener);
    };
  }

  const emitLocal = () => {
    const vehicleIds = new Set(vehicles.map((v) => v.id));
    const repairs = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY).filter((r) =>
      vehicleIds.has(r.vehicleId)
    );
    const expenses = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY).filter((e) =>
      vehicleIds.has(e.vehicleId)
    );
    onData({ repairs, expenses });
  };

  emitLocal();
  const listener = () => emitLocal();
  window.addEventListener('autogarage_store_updated', listener);
  return () => window.removeEventListener('autogarage_store_updated', listener);
}

/**
 * Add General Expense
 */
export async function addGeneralExpense(
  vehicleId: string,
  userId: string,
  expense: Omit<GeneralExpense, 'id' | 'vehicleId' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = generateId('exp');
  const path = `vehicles/${vehicleId}/expenses/${id}`;
  const now = new Date().toISOString();

  const newExpense: GeneralExpense = stripUndefined({
    ...expense,
    id,
    vehicleId,
    userId,
    category: String(expense.category || '').trim(),
    description: String(expense.description || '').trim(),
    amount: Math.max(0, Number(expense.amount) || 0),
    createdAt: now,
    updatedAt: now,
  });

  if (!auth.currentUser) {
    const list = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY);
    setLocalStore(LOCAL_EXPENSES_KEY, [newExpense, ...list]);
    await recalculateAndSyncVehicleById(vehicleId);
    return id;
  }

  try {
    await setDoc(doc(db, 'vehicles', vehicleId, 'expenses', id), newExpense);
    await recalculateAndSyncVehicleById(vehicleId);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Update General Expense
 */
export async function updateGeneralExpense(
  vehicleId: string,
  expenseId: string,
  updates: Partial<GeneralExpense>
): Promise<void> {
  const path = `vehicles/${vehicleId}/expenses/${expenseId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY);
    const updated = list.map((e) =>
      e.id === expenseId
        ? { ...e, ...updates, updatedAt: new Date().toISOString() }
        : e
    );
    setLocalStore(LOCAL_EXPENSES_KEY, updated);
    await recalculateAndSyncVehicleById(vehicleId);
    return;
  }

  try {
    const payload = stripUndefined({
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    await updateDoc(doc(db, 'vehicles', vehicleId, 'expenses', expenseId), payload);
    await recalculateAndSyncVehicleById(vehicleId);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Delete General Expense
 */
export async function deleteGeneralExpense(vehicleId: string, expenseId: string): Promise<void> {
  const path = `vehicles/${vehicleId}/expenses/${expenseId}`;

  if (!auth.currentUser) {
    const list = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY).filter((e) => e.id !== expenseId);
    setLocalStore(LOCAL_EXPENSES_KEY, list);
    await recalculateAndSyncVehicleById(vehicleId);
    return;
  }

  try {
    await deleteDoc(doc(db, 'vehicles', vehicleId, 'expenses', expenseId));
    await recalculateAndSyncVehicleById(vehicleId);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Recalculate & Sync Vehicle Financials directly from stored subcollections / local arrays
 */
export async function recalculateAndSyncVehicleById(vehicleId: string): Promise<void> {
  if (!auth.currentUser) {
    const vehicles = getLocalStore<Vehicle>(LOCAL_STORAGE_KEY);
    const target = vehicles.find((v) => v.id === vehicleId);
    if (!target) return;
    const repairs = getLocalStore<RepairTask>(LOCAL_REPAIRS_KEY).filter((r) => r.vehicleId === vehicleId);
    const expenses = getLocalStore<GeneralExpense>(LOCAL_EXPENSES_KEY).filter((e) => e.vehicleId === vehicleId);
    await syncVehicleFinancials(target, repairs, expenses);
    return;
  }

  try {
    const [vehSnap, repairsSnap, expensesSnap] = await Promise.all([
      getDoc(doc(db, 'vehicles', vehicleId)),
      getDocs(collection(db, 'vehicles', vehicleId, 'repairs')),
      getDocs(collection(db, 'vehicles', vehicleId, 'expenses')),
    ]);
    if (!vehSnap.exists()) return;
    const target = normalizeVehicleRecord(vehSnap.data() as Vehicle, vehSnap.id);
    const repairs: RepairTask[] = [];
    repairsSnap.forEach((d) => repairs.push({ ...(d.data() as RepairTask), id: d.id }));
    const expenses: GeneralExpense[] = [];
    expensesSnap.forEach((d) => expenses.push({ ...(d.data() as GeneralExpense), id: d.id }));
    await syncVehicleFinancials(target, repairs, expenses);
    window.dispatchEvent(new Event('autogarage_store_updated'));
  } catch (err) {
    console.warn('recalculateAndSyncVehicleById warning:', err);
  }
}

/**
 * Recalculate & Sync Vehicle Financials across database
 * Triggers instant recalculation of total capital invested, net profit, margin %
 */
export async function syncVehicleFinancials(
  vehicle: Vehicle,
  repairs: RepairTask[],
  expenses: GeneralExpense[]
): Promise<void> {
  const fin = calculateVehicleFinancials({
    purchasePrice: vehicle.purchasePrice,
    targetSalePrice: vehicle.targetSalePrice,
    finalSalePrice: vehicle.status === 'sold' ? vehicle.buyerInfo?.salePrice : undefined,
    repairs,
    expenses,
  });

  let resolvedNetProfit = fin.netProfit;
  let resolvedMarginPercentage = fin.marginPercentage;

  if (vehicle.status === 'sold' && vehicle.buyerInfo?.salePrice && vehicle.buyerInfo.salePrice > 0) {
    const settingsForGarage = getGarageSettings(vehicle.garageId);
    const dealProfile = resolveDealSellerProfileType(vehicle, settingsForGarage);
    const dealSettings = resolveEffectiveSettingsForDeal({
      vehicle,
      garageSettings: settingsForGarage,
    });
    const frozenSnap = vehicle.buyerInfo.taxSnapshot;
    const snapMatchesProfile =
      !vehicle.buyerInfo.sellerProfileType ||
      (dealProfile === 'particulier'
        ? frozenSnap?.taxRegime === 'none' || frozenSnap?.legalStatus === 'particulier'
        : frozenSnap?.taxRegime === 'micro' || frozenSnap?.legalStatus === 'micro_entreprise');
    const snapMatchesCosts =
      frozenSnap?.isHistoricalSnapshot &&
      snapMatchesProfile &&
      roundToTwo(frozenSnap.repairCostTotal) === fin.repairCostTotal &&
      roundToTwo(frozenSnap.generalExpensesTotal) === fin.generalExpensesTotal;

    const saleReport = calculateSaleTaxReport({
      salePrice: vehicle.buyerInfo.salePrice,
      purchasePrice: vehicle.purchasePrice,
      repairCostTotal: fin.repairCostTotal,
      generalExpensesTotal: fin.generalExpensesTotal,
      taxRegime:
        !vehicle.buyerInfo.sellerProfileType && frozenSnap?.isHistoricalSnapshot
          ? frozenSnap.taxRegime
          : dealSettings.taxRegime,
      taxRatePercent: dealSettings.taxRatePercent,
      frenchTaxConfig:
        !vehicle.buyerInfo.sellerProfileType && frozenSnap?.isHistoricalSnapshot
          ? createDefaultFrenchTaxConfig(frozenSnap.legalStatus, {
              businessTaxRegime: frozenSnap.taxRegime,
              socialContributionRate: frozenSnap.urssafRate,
              versementLiberatoireEnabled: frozenSnap.versementLiberatoireEnabled,
              versementLiberatoireRate: frozenSnap.versementLiberatoireRate,
              vatRegime: frozenSnap.vatRegime,
              vatRatePercent: frozenSnap.vatRatePercent,
            })
          : dealSettings.frenchTaxConfig,
      vatRegime: vehicle.buyerInfo.vatRegime,
      vatRatePercent: vehicle.buyerInfo.vatRatePercent,
      taxSnapshot: snapMatchesCosts ? frozenSnap : undefined,
    });

    resolvedNetProfit = saleReport.netProfitAfterTax;
    resolvedMarginPercentage =
      saleReport.salePrice > 0
        ? roundToTwo((resolvedNetProfit / saleReport.salePrice) * 100)
        : 0;
  }

  if (
    vehicle.repairCostTotal === fin.repairCostTotal &&
    vehicle.generalExpensesTotal === fin.generalExpensesTotal &&
    vehicle.totalExpenses === fin.totalExpenses &&
    vehicle.totalInvested === fin.totalInvested &&
    vehicle.netProfit === resolvedNetProfit &&
    vehicle.marginPercentage === resolvedMarginPercentage
  ) {
    return; // Already up-to-date, avoid redundant store updates
  }

  await updateVehicle(vehicle.id, {
    repairCostTotal: fin.repairCostTotal,
    generalExpensesTotal: fin.generalExpensesTotal,
    totalExpenses: fin.totalExpenses,
    totalInvested: fin.totalInvested,
    netProfit: resolvedNetProfit,
    marginPercentage: resolvedMarginPercentage,
  });
}

/**
 * Seed realistic starter vehicles & repair tasks for instant testing
 */
export async function seedDemoGarageData(
  userId: string,
  garageId: string = DEFAULT_GARAGE_ID
): Promise<Vehicle[]> {
  const createdVehicles: Vehicle[] = [];
  const now = new Date().toISOString();

  // Vehicle 1: Peugeot 208 GT - In preparation
  const v1Payload = {
    userId,
    garageId,
    make: 'Peugeot',
    model: '208',
    commercialDesignation: '208 GT Line 130ch',
    firstRegistrationDate: '2021-04-15',
    trim: '1.2 PureTech 130ch GT Line EAT8',
    year: 2021,
    mileage: 48500,
    vin: 'VF3UPHNK0MT129841',
    registrationNumber: 'GH-208-AB',
    hasRegistrationCertificate: true,
    formulaNumber: '2021AB48501',
    purchaseDate: '2026-10-15',
    purchasePrice: 11200,
    targetSalePrice: 14900,
    status: 'preparation' as const,
    purchaseStatus: 'micro' as const,
    photos: [
      'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80',
    ],
    documents: [
      { id: 'doc1', name: 'Certificat_Situation_NonGage.pdf', url: '#', date: '2026-10-15', type: 'PDF' },
      { id: 'doc2', name: 'Facture_Achat_Enchere.pdf', url: '#', date: '2026-10-15', type: 'PDF' },
    ],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 11200,
    netProfit: 3700,
    marginPercentage: 24.83,
    isDemo: true,
  };
  const v1Id = await createVehicle(v1Payload);
  if (v1Id) createdVehicles.push({ ...v1Payload, id: v1Id, createdAt: now, updatedAt: now });

  if (v1Id) {
    await addRepairTask(v1Id, userId, {
      title: 'Vidange moteur 0W20 & Filtres (Huile, Air, Habitacle)',
      status: 'in_progress',
      partsCost: 95,
      laborCost: 65,
      date: '2026-10-17',
      categoryPreset: 'oil_change',
      notes: 'Filtre habitacle charbon actif à remplacer',
    });
    await addRepairTask(v1Id, userId, {
      title: 'Disques & Plaquettes avant Brembo',
      status: 'todo',
      partsCost: 140,
      laborCost: 70,
      date: '2026-10-19',
      categoryPreset: 'brake_pads',
      notes: 'Plaquettes usées à 80%',
    });
    await addGeneralExpense(v1Id, userId, {
      category: 'transport',
      description: 'Rapatriement plateau dépanneuse depuis parc vente',
      amount: 180,
      date: '2026-10-16',
    });
    await addGeneralExpense(v1Id, userId, {
      category: 'controle_technique',
      description: 'Passage visite périodique Contrôle Technique Dekra',
      amount: 85,
      date: '2026-10-18',
    });
  }

  // Vehicle 2: Renault Clio V - In repair
  const v2Payload = {
    userId,
    garageId,
    make: 'Renault',
    model: 'Clio V',
    commercialDesignation: 'CLIO TCe 90 INTENS',
    firstRegistrationDate: '2020-06-12',
    trim: 'TCe 90 Intens',
    year: 2020,
    mileage: 62000,
    vin: 'VF1RJA00365891234',
    registrationNumber: 'FW-415-CL',
    hasRegistrationCertificate: true,
    formulaNumber: '2020CD62002',
    purchaseDate: '2026-09-28',
    purchasePrice: 8900,
    targetSalePrice: 12200,
    status: 'repair' as const,
    purchaseStatus: 'particulier' as const,
    photos: [
      'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1200&q=80',
    ],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 8900,
    netProfit: 3300,
    marginPercentage: 27.05,
    isDemo: true,
  };
  const v2Id = await createVehicle(v2Payload);
  if (v2Id) createdVehicles.push({ ...v2Payload, id: v2Id, createdAt: now, updatedAt: now });

  if (v2Id) {
    await addRepairTask(v2Id, userId, {
      title: 'Kit Distribution complète & Pompe à eau + Courroie accessoires',
      status: 'in_progress',
      partsCost: 240,
      laborCost: 260,
      date: '2026-10-01',
      categoryPreset: 'timing_belt',
      notes: 'Pièces d’origine Gates commandées',
    });
    await addRepairTask(v2Id, userId, {
      title: 'Diagnostic valise OBD & Réinitialisation voyant vidange',
      status: 'done',
      partsCost: 0,
      laborCost: 40,
      date: '2026-10-03',
      categoryPreset: 'diagnostics',
    });
    await addGeneralExpense(v2Id, userId, {
      category: 'detailing',
      description: 'Pressing sièges tissu & lustrage carrosserie',
      amount: 120,
      date: '2026-10-02',
    });
  }

  // Vehicle 3: Volkswagen Golf VII - For Sale (En vente)
  const v3Payload = {
    userId,
    garageId,
    make: 'Volkswagen',
    model: 'Golf VII',
    commercialDesignation: 'GOLF 1.6 TDI CONFORTLINE',
    firstRegistrationDate: '2019-03-20',
    trim: '1.6 TDI 115ch Confortline DSG7',
    year: 2019,
    mileage: 94000,
    vin: 'WVWZZZAUZKP512984',
    registrationNumber: 'EV-719-VW',
    hasRegistrationCertificate: true,
    formulaNumber: '2019EF94003',
    purchaseDate: '2026-08-10',
    purchasePrice: 10400,
    targetSalePrice: 13990,
    status: 'for_sale' as const,
    purchaseStatus: 'micro' as const,
    photos: [
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
    ],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 10400,
    netProfit: 3590,
    marginPercentage: 25.66,
    isDemo: true,
  };
  const v3Id = await createVehicle(v3Payload);
  if (v3Id) createdVehicles.push({ ...v3Payload, id: v3Id, createdAt: now, updatedAt: now });

  if (v3Id) {
    await addRepairTask(v3Id, userId, {
      title: 'Entretien boîte de vitesses DSG7 vidange et filtres',
      status: 'done',
      partsCost: 190,
      laborCost: 120,
      date: '2026-08-18',
    });
    await addGeneralExpense(v3Id, userId, {
      category: 'controle_technique',
      description: 'Contrôle Technique Vierge sans réserve',
      amount: 85,
      date: '2026-08-20',
    });
    await addGeneralExpense(v3Id, userId, {
      category: 'admin',
      description: 'Frais de dossier et déclaration d’achat SIV',
      amount: 30,
      date: '2026-08-12',
    });
    await addGeneralExpense(v3Id, userId, {
      category: 'fuel',
      description: 'Plein Gazole essais routiers & convoyage',
      amount: 65,
      date: '2026-10-28',
    });
  }

  // Vehicle 4: Audi A3 Sportback - Sold (Vendu) with Buyer Details and final P&L
  const v4Payload = {
    userId,
    garageId,
    make: 'Audi',
    model: 'A3 Sportback',
    commercialDesignation: 'A3 SPORTBACK 35 TFSI S LINE',
    firstRegistrationDate: '2021-05-18',
    trim: '35 TFSI 150ch S Line S Tronic',
    year: 2021,
    mileage: 51200,
    vin: 'WAUZZZGY4NA029145',
    registrationNumber: 'GK-903-AA',
    hasRegistrationCertificate: true,
    formulaNumber: '2021GH51204',
    purchaseDate: '2026-07-05',
    purchasePrice: 18500,
    targetSalePrice: 22900,
    status: 'sold' as const,
    purchaseStatus: 'micro' as const,
    photos: [
      'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=1200&q=80',
    ],
    buyerInfo: {
      fullName: 'Thomas Beaumont',
      birthDate: '1988-07-14',
      birthPlace: 'Lyon',
      streetNumber: '14',
      streetName: 'Rue des Lilas',
      postalCode: '69003',
      city: 'Lyon',
      phone: '06 42 19 88 34',
      email: 'thomas.beaumont@gmail.com',
      address: '14 Rue des Lilas, 69003 Lyon, France',
      salePrice: 22500,
      saleDate: '2026-10-24',
      saleChannel: 'leboncoin',
    },
    documents: [],
    repairCostTotal: 580,
    generalExpensesTotal: 340,
    totalExpenses: 920,
    totalInvested: 19420,
    netProfit: 3080,
    marginPercentage: 13.69,
    isDemo: true,
  };
  const v4Id = await createVehicle(v4Payload);
  if (v4Id) createdVehicles.push({ ...v4Payload, id: v4Id, createdAt: now, updatedAt: now });

  if (v4Id) {
    await addRepairTask(v4Id, userId, {
      title: 'Pneumatiques Michelin Pilot Sport 4 x2 train avant',
      status: 'done',
      partsCost: 260,
      laborCost: 50,
      date: '2026-07-14',
      categoryPreset: 'tires',
    });
    await addRepairTask(v4Id, userId, {
      title: 'Vidange LongLife 5W30 + Filtres complets',
      status: 'done',
      partsCost: 150,
      laborCost: 120,
      date: '2026-07-18',
      categoryPreset: 'oil_change',
    });
    await addGeneralExpense(v4Id, userId, {
      category: 'detailing',
      description: 'Traitement céramique carrosserie & nettoyage vapeur',
      amount: 220,
      date: '2026-07-15',
    });
    await addGeneralExpense(v4Id, userId, {
      category: 'controle_technique',
      description: 'Contrôle Technique obligatoire vente',
      amount: 85,
      date: '2026-10-20',
    });
    await addGeneralExpense(v4Id, userId, {
      category: 'admin',
      description: 'Certificat de conformité & frais SIV',
      amount: 35,
      date: '2026-10-24',
    });
  }

  return createdVehicles;
}
