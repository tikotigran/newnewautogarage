import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  CERFA_CALIBRATION_UPDATED_EVENT,
  CerfaTemplatesCalibrationPayload,
  getCachedCerfaTemplatesCalibration,
  resolveCerfaTemplatesCalibration,
  setCachedCerfaTemplatesCalibration,
} from '../utils/cerfaConfig';
import {
  AppUserProfileType,
  BillingCycle,
  DynamicExpenseCategory,
  FeatureFlagsConfig,
  FrenchTaxConfiguration,
  GlobalTextOverrides,
  SubscriptionPlan,
  SubscriptionPlanId,
  SystemThemeConfig,
  UserProfile,
} from '../types/garage';
import {
  createDefaultFrenchTaxConfig,
  normalizeFrenchTaxConfig,
} from '../utils/frenchTaxEngine';
import {
  applySystemThemeVariables,
  computePlanPricing,
  DEFAULT_DYNAMIC_EXPENSE_CATEGORIES,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_SUBSCRIPTION_PLANS,
  DEFAULT_SYSTEM_THEME_CONFIG,
  getPlanCapabilities,
  isSuperAdminUser,
  normalizeFeatureFlags,
  normalizeSubscriptionPlans,
  resolveSystemThemeConfig,
  sortExpenseCategories,
  SUPERADMIN_BOOTSTRAP_EMAIL,
} from '../utils/adminUtils';

const LOCAL_ACCOUNTS_KEY = 'autogarage_admin_accounts_store';
const LOCAL_CURRENT_PROFILE_KEY = 'autogarage_current_user_profile';
const LOCAL_SYSTEM_CONFIG_KEY = 'autogarage_system_theme_config';
const LOCAL_EXPENSES_CONFIG_KEY = 'autogarage_system_expenses_config';
const LOCAL_FEATURES_CONFIG_KEY = 'autogarage_system_features_config';
const LOCAL_TEXTS_CONFIG_KEY = 'autogarage_system_texts_config';
const LOCAL_TAX_DEFAULTS_KEY = 'autogarage_superadmin_tax_defaults';
const LOCAL_PLANS_KEY = 'autogarage_subscription_plans';

export const PENDING_PROFILE_TYPE_KEY = 'autogarage_pending_profile_type';

export function setPendingProfileType(profileType: AppUserProfileType): void {
  try {
    localStorage.setItem(PENDING_PROFILE_TYPE_KEY, profileType);
  } catch {
    // ignore
  }
}

export function getPendingProfileType(): AppUserProfileType | null {
  try {
    const val = localStorage.getItem(PENDING_PROFILE_TYPE_KEY);
    return val === 'particulier' || val === 'micro_entrepreneur' ? val : null;
  } catch {
    return null;
  }
}

export function clearPendingProfileType(): void {
  try {
    localStorage.removeItem(PENDING_PROFILE_TYPE_KEY);
  } catch {
    // ignore
  }
}

const SEEDED_ACCOUNTS: UserProfile[] = [
  {
    uid: 'garage_hq_admin',
    email: SUPERADMIN_BOOTSTRAP_EMAIL,
    displayName: 'Direction AutoGarage',
    garageName: 'AutoGarage Manager HQ',
    profileType: 'micro_entrepreneur',
    role: 'superadmin',
    planId: 'enterprise',
    vehicleLimit: 9999,
    activeVehiclesCount: 4,
    subscriptionStatus: 'active',
    mrrAmount: 79,
    lastPaymentDate: '2026-11-01',
    createdAt: '2026-01-15T09:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    uid: 'garage_lyon_01',
    email: 'contact@lyonautoselect.fr',
    displayName: 'Marc Dupont',
    garageName: 'Lyon Auto Select',
    profileType: 'micro_entrepreneur',
    role: 'user',
    planId: 'pro',
    vehicleLimit: 50,
    activeVehiclesCount: 24,
    subscriptionStatus: 'active',
    mrrAmount: 39,
    lastPaymentDate: '2026-11-03',
    createdAt: '2026-03-12T14:20:00Z',
    updatedAt: '2026-11-03T08:15:00Z',
  },
  {
    uid: 'garage_paris_02',
    email: 'sophie@parisvo-motors.fr',
    displayName: 'Sophie Martin',
    garageName: 'Paris VO Motors',
    role: 'user',
    planId: 'pro',
    vehicleLimit: 50,
    activeVehiclesCount: 31,
    subscriptionStatus: 'active',
    mrrAmount: 39,
    lastPaymentDate: '2026-11-05',
    createdAt: '2026-05-20T11:00:00Z',
    updatedAt: '2026-11-05T16:40:00Z',
  },
  {
    uid: 'garage_nice_03',
    email: 'luc.bernard@azur-occasion.fr',
    displayName: 'Luc Bernard',
    garageName: 'Azur Occasion',
    role: 'user',
    planId: 'starter',
    vehicleLimit: 5,
    activeVehiclesCount: 4,
    subscriptionStatus: 'trial',
    mrrAmount: 0,
    createdAt: '2026-10-28T09:30:00Z',
    updatedAt: '2026-11-08T12:00:00Z',
  },
  {
    uid: 'garage_bordeaux_04',
    email: 'admin@gironde-auto.fr',
    displayName: 'Antoine Moreau',
    garageName: 'Gironde Auto Négoce',
    role: 'user',
    planId: 'enterprise',
    vehicleLimit: 9999,
    activeVehiclesCount: 86,
    subscriptionStatus: 'past_due',
    mrrAmount: 79,
    lastPaymentDate: '2026-10-01',
    createdAt: '2026-02-04T10:15:00Z',
    updatedAt: '2026-11-02T09:00:00Z',
  },
];

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T, eventName?: string): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (eventName) {
      window.dispatchEvent(new Event(eventName));
    }
  } catch (err) {
    console.warn('localStorage write error:', err);
  }
}

export async function ensureAndGetUserProfile(user: User | null): Promise<UserProfile | null> {
  if (!user) {
    return readLocal<UserProfile | null>(LOCAL_CURRENT_PROFILE_KEY, null);
  }

  const now = new Date().toISOString();
  const ref = doc(db, 'users', user.uid);
  const isBootstrapAdmin = isSuperAdminUser({
    email: user.email,
    emailVerified: user.emailVerified,
  });

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      let profile = snap.data() as UserProfile;
      if (isBootstrapAdmin && profile.role !== 'superadmin') {
        profile = {
          ...profile,
          role: 'superadmin',
          planId: 'enterprise',
          vehicleLimit: 9999,
          updatedAt: now,
        };
        try {
          await updateDoc(ref, {
            role: 'superadmin',
            planId: 'enterprise',
            vehicleLimit: 9999,
            updatedAt: now,
          });
        } catch {
          // ignore if Firestore rules haven't been redeployed yet
        }
      }
      writeLocal(LOCAL_CURRENT_PROFILE_KEY, profile);
      return profile;
    }

    const pendingProfile = getPendingProfileType();
    if (pendingProfile) {
      clearPendingProfileType();
    }

    const defaultPlanId: SubscriptionPlanId = isBootstrapAdmin ? 'enterprise' : 'starter';
    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Garage User',
      garageName: '',
      profileType: pendingProfile || 'micro_entrepreneur',
      role: isBootstrapAdmin ? 'superadmin' : 'user',
      planId: defaultPlanId,
      plan: defaultPlanId,
      subscriptionTier: defaultPlanId,
      billingCycle: 'monthly',
      vehicleLimit: isBootstrapAdmin ? 9999 : 5,
      activeVehiclesCount: 0,
      subscriptionStatus: 'active',
      mrrAmount: isBootstrapAdmin ? 79 : 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(ref, newProfile);
    } catch {
      // If Firestore rules reject self-assigning superadmin on create, create as 'user'
      if (newProfile.role === 'superadmin') {
        await setDoc(ref, { ...newProfile, role: 'user' });
      }
    }
    writeLocal(LOCAL_CURRENT_PROFILE_KEY, newProfile);
    return newProfile;
  } catch (err) {
    console.warn('ensureAndGetUserProfile fallback:', err);
    return readLocal<UserProfile | null>(LOCAL_CURRENT_PROFILE_KEY, null);
  }
}

export function subscribeUserProfile(
  uid: string | undefined,
  onData: (profile: UserProfile | null) => void
): () => void {
  if (!uid) {
    onData(null);
    return () => {};
  }

  let unsub: (() => void) | null = null;
  if (auth.currentUser) {
    try {
      unsub = onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (snap.exists()) {
            const profile = snap.data() as UserProfile;
            writeLocal(LOCAL_CURRENT_PROFILE_KEY, profile);
            onData(profile);
          }
        },
        (err) => {
          console.warn('subscribeUserProfile snapshot warning:', err);
        }
      );
    } catch {
      // ignore
    }
  }

  const localListener = () => {
    const local = readLocal<UserProfile | null>(LOCAL_CURRENT_PROFILE_KEY, null);
    if (local && local.uid === uid) {
      onData(local);
    }
  };
  window.addEventListener('autogarage_user_profile_updated', localListener);

  return () => {
    if (unsub) unsub();
    window.removeEventListener('autogarage_user_profile_updated', localListener);
  };
}

export async function updateUserProfileType(
  uid: string | undefined,
  profileType: AppUserProfileType
): Promise<void> {
  const now = new Date().toISOString();
  const current = readLocal<UserProfile | null>(LOCAL_CURRENT_PROFILE_KEY, null);
  if (current && (!uid || current.uid === uid)) {
    writeLocal(LOCAL_CURRENT_PROFILE_KEY, {
      ...current,
      profileType,
      updatedAt: now,
    });
  }

  if (auth.currentUser && uid) {
    try {
      await updateDoc(doc(db, 'users', uid), {
        profileType,
        updatedAt: now,
      });
    } catch (err) {
      console.warn('updateUserProfileType sync warning:', err);
    }
  }
}

export function getLocalAccounts(): UserProfile[] {
  const existing = readLocal<UserProfile[] | null>(LOCAL_ACCOUNTS_KEY, null);
  if (!existing) {
    writeLocal(LOCAL_ACCOUNTS_KEY, SEEDED_ACCOUNTS);
    return SEEDED_ACCOUNTS;
  }
  return existing;
}

export function subscribeAllUserAccounts(
  onData: (accounts: UserProfile[]) => void
): () => void {
  if (auth.currentUser) {
    const q = collection(db, 'users');
    return onSnapshot(
      q,
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((docSnap) => {
          list.push(docSnap.data() as UserProfile);
        });
        if (list.length === 0) {
          onData(getLocalAccounts());
        } else {
          onData(list);
        }
      },
      () => {
        onData(getLocalAccounts());
      }
    );
  }

  const emitLocal = () => onData(getLocalAccounts());
  emitLocal();
  window.addEventListener('autogarage_admin_updated', emitLocal);
  return () => window.removeEventListener('autogarage_admin_updated', emitLocal);
}

export async function updateUserAccount(
  uid: string,
  updates: Partial<UserProfile>
): Promise<void> {
  const now = new Date().toISOString();
  const updatedLocal = getLocalAccounts().map((acc) =>
    acc.uid === uid ? { ...acc, ...updates, updatedAt: now } : acc
  );
  writeLocal(LOCAL_ACCOUNTS_KEY, updatedLocal, 'autogarage_admin_updated');

  if (auth.currentUser) {
    try {
      await updateDoc(doc(db, 'users', uid), {
        ...updates,
        updatedAt: now,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  }
}

export function getSystemThemeConfig(): SystemThemeConfig {
  const saved = readLocal<SystemThemeConfig | null>(LOCAL_SYSTEM_CONFIG_KEY, null);
  return resolveSystemThemeConfig(saved);
}

export function subscribeSystemThemeConfig(
  onData: (config: SystemThemeConfig) => void
): () => void {
  const initial = getSystemThemeConfig();
  applySystemThemeVariables(initial);
  onData(initial);

  // Always hydrate global branding & UI layout from Firestore on init (publicly readable)
  getDoc(doc(db, 'settings', 'branding'))
    .then((snap) => {
      if (snap.exists()) {
        const cfg = resolveSystemThemeConfig(snap.data() as Partial<SystemThemeConfig>);
        writeLocal(LOCAL_SYSTEM_CONFIG_KEY, cfg);
        applySystemThemeVariables(cfg);
        onData(cfg);
      }
    })
    .catch(() => {});

  let unsubGlobal: (() => void) | null = null;
  let unsubBranding: (() => void) | null = null;
  let unsubUiLayout: (() => void) | null = null;
  try {
    unsubGlobal = onSnapshot(
      doc(db, 'system_config', 'global'),
      (snap) => {
        if (snap.exists()) {
          const cfg = resolveSystemThemeConfig(snap.data() as Partial<SystemThemeConfig>);
          writeLocal(LOCAL_SYSTEM_CONFIG_KEY, cfg);
          applySystemThemeVariables(cfg);
          onData(cfg);
        }
      },
      () => {}
    );
    unsubBranding = onSnapshot(
      doc(db, 'settings', 'branding'),
      (snap) => {
        if (snap.exists()) {
          const cfg = resolveSystemThemeConfig(snap.data() as Partial<SystemThemeConfig>);
          writeLocal(LOCAL_SYSTEM_CONFIG_KEY, cfg);
          applySystemThemeVariables(cfg);
          onData(cfg);
        }
      },
      () => {}
    );
    unsubUiLayout = onSnapshot(
      doc(db, 'settings', 'ui_customization'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { layout?: Partial<SystemThemeConfig> };
          if (data?.layout) {
            const current = getSystemThemeConfig();
            const merged = resolveSystemThemeConfig({ ...current, ...data.layout });
            writeLocal(LOCAL_SYSTEM_CONFIG_KEY, merged);
            applySystemThemeVariables(merged);
            onData(merged);
          }
        }
      },
      () => {}
    );
  } catch {
    // Fallback silently to local config
  }

  const listener = () => {
    const cfg = getSystemThemeConfig();
    applySystemThemeVariables(cfg);
    onData(cfg);
  };
  window.addEventListener('autogarage_system_config_updated', listener);
  return () => {
    if (unsubGlobal) unsubGlobal();
    if (unsubBranding) unsubBranding();
    if (unsubUiLayout) unsubUiLayout();
    window.removeEventListener('autogarage_system_config_updated', listener);
  };
}

export async function saveSystemThemeConfig(
  config: SystemThemeConfig,
  adminUid?: string
): Promise<void> {
  const resolved = resolveSystemThemeConfig(config);
  const now = new Date().toISOString();
  const actor = adminUid || auth.currentUser?.uid || 'superadmin';
  const payload: SystemThemeConfig = {
    ...resolved,
    updatedAt: now,
    updatedBy: actor,
  };

  writeLocal(LOCAL_SYSTEM_CONFIG_KEY, payload, 'autogarage_system_config_updated');
  applySystemThemeVariables(payload);

  if (auth.currentUser) {
    try {
      await Promise.all([
        setDoc(doc(db, 'system_config', 'global'), payload, { merge: true }),
        setDoc(doc(db, 'settings', 'branding'), payload, { merge: true }),
        setDoc(
          doc(db, 'settings', 'ui_customization'),
          {
            layout: {
              cardBorderRadius: resolved.cardBorderRadius,
              buttonBorderRadius: resolved.buttonBorderRadius,
              cardPadding: resolved.cardPadding,
              sectionGap: resolved.sectionGap,
            },
            updatedAt: now,
            updatedBy: actor,
          },
          { merge: true }
        ),
      ]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/branding');
    }
  }
}

export function getSubscriptionPlans(): SubscriptionPlan[] {
  const saved = readLocal<SubscriptionPlan[] | null>(LOCAL_PLANS_KEY, null);
  return normalizeSubscriptionPlans(saved);
}

export async function fetchSubscriptionPlansFromCloud(): Promise<SubscriptionPlan[]> {
  try {
    const snap = await getDoc(doc(db, 'platform_settings', 'subscription_plans'));
    if (snap.exists() && Array.isArray(snap.data()?.plans)) {
      const normalized = normalizeSubscriptionPlans(snap.data()?.plans);
      writeLocal(LOCAL_PLANS_KEY, normalized);
      return normalized;
    }
  } catch (err) {
    console.warn('fetchSubscriptionPlansFromCloud fallback:', err);
  }
  return getSubscriptionPlans();
}

export function subscribeSubscriptionPlans(
  onData: (plans: SubscriptionPlan[]) => void
): () => void {
  onData(getSubscriptionPlans());

  void fetchSubscriptionPlansFromCloud().then((plans) => {
    onData(plans);
  });

  let unsub: (() => void) | null = null;
  try {
    unsub = onSnapshot(
      doc(db, 'platform_settings', 'subscription_plans'),
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.plans)) {
          const normalized = normalizeSubscriptionPlans(snap.data()?.plans);
          writeLocal(LOCAL_PLANS_KEY, normalized);
          onData(normalized);
        }
      },
      (err) => {
        console.warn('subscribeSubscriptionPlans snapshot warning:', err);
      }
    );
  } catch {
    // fallback to local plans
  }

  const listener = () => onData(getSubscriptionPlans());
  window.addEventListener('autogarage_plans_updated', listener);
  window.addEventListener('autogarage_admin_updated', listener);
  return () => {
    if (unsub) unsub();
    window.removeEventListener('autogarage_plans_updated', listener);
    window.removeEventListener('autogarage_admin_updated', listener);
  };
}

export async function saveSubscriptionPlans(
  plans: SubscriptionPlan[],
  adminUid?: string
): Promise<SubscriptionPlan[]> {
  const normalized = normalizeSubscriptionPlans(plans);
  writeLocal(LOCAL_PLANS_KEY, normalized, 'autogarage_plans_updated');
  window.dispatchEvent(new Event('autogarage_admin_updated'));

  if (auth.currentUser) {
    try {
      await setDoc(
        doc(db, 'platform_settings', 'subscription_plans'),
        {
          plans: normalized,
          updatedAtIso: new Date().toISOString(),
          updatedBy: adminUid || auth.currentUser.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'platform_settings/subscription_plans');
    }
  }
  return normalized;
}

function addMonthsOrYearsIsoDate(baseDate: Date, billingCycle: BillingCycle): string {
  const next = new Date(baseDate.getTime());
  if (billingCycle === 'annual') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next.toISOString().slice(0, 10);
}

export async function changeUserSubscriptionPlan(params: {
  uid: string;
  planId: SubscriptionPlanId;
  billingCycle: BillingCycle;
  plans?: SubscriptionPlan[];
  currentProfile?: UserProfile | null;
}): Promise<UserProfile> {
  const { uid, planId, billingCycle, plans = getSubscriptionPlans(), currentProfile } = params;
  const resolvedPlans = normalizeSubscriptionPlans(plans);
  const selectedPlan =
    resolvedPlans.find((p) => p.id === planId) ||
    DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === planId) ||
    DEFAULT_SUBSCRIPTION_PLANS[0];
  const capabilities = getPlanCapabilities(planId, resolvedPlans);
  const pricing = computePlanPricing(selectedPlan.priceMonthly, billingCycle);
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const todayStr = nowIso.slice(0, 10);
  const nextRenewalDate =
    selectedPlan.priceMonthly > 0 ? addMonthsOrYearsIsoDate(nowDate, billingCycle) : '';

  const subscriptionPatch = {
    planId,
    plan: planId,
    subscriptionTier: planId,
    billingCycle,
    vehicleLimit: capabilities.vehicleLimit,
    subscriptionStatus: 'active' as const,
    mrrAmount: pricing.effectiveMonthly,
    lastPaymentDate: todayStr,
    nextRenewalDate,
    updatedAt: nowIso,
  };

  const baseProfile: UserProfile =
    currentProfile ||
    readLocal<UserProfile | null>(LOCAL_CURRENT_PROFILE_KEY, null) || {
      uid,
      email: auth.currentUser?.email || '',
      displayName: auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Garage User',
      garageName: '',
      role: 'user',
      planId,
      vehicleLimit: capabilities.vehicleLimit,
      activeVehiclesCount: 0,
      subscriptionStatus: 'active',
      mrrAmount: pricing.effectiveMonthly,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

  const updatedProfile: UserProfile = {
    ...baseProfile,
    ...subscriptionPatch,
  };

  writeLocal(LOCAL_CURRENT_PROFILE_KEY, updatedProfile, 'autogarage_user_profile_updated');

  const existingAccounts = getLocalAccounts();
  const hasAcc = existingAccounts.some((acc) => acc.uid === uid);
  const updatedAccounts = hasAcc
    ? existingAccounts.map((acc) => (acc.uid === uid ? { ...acc, ...subscriptionPatch } : acc))
    : [updatedProfile, ...existingAccounts];
  writeLocal(LOCAL_ACCOUNTS_KEY, updatedAccounts, 'autogarage_admin_updated');

  if (auth.currentUser) {
    try {
      const userRef = doc(db, 'users', uid);
      try {
        await updateDoc(userRef, subscriptionPatch);
      } catch (updateErr) {
        // Fallback if doc was not created yet
        await setDoc(userRef, updatedProfile, { merge: true });
        void updateErr;
      }

      // Sync all user-owned garage documents in Firestore
      const garagesSnap = await getDocs(
        query(collection(db, 'garages'), where('userId', '==', uid))
      );
      await Promise.all(
        garagesSnap.docs.map((gDoc) =>
          updateDoc(gDoc.ref, {
            planId,
            plan: planId,
            subscriptionTier: planId,
            billingCycle,
            updatedAt: nowIso,
          }).catch(() => undefined)
        )
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  }

  return updatedProfile;
}

// 1. Dynamic Expense Categories (/system_config/expenses)
export function getDynamicExpenseCategories(): DynamicExpenseCategory[] {
  const saved = readLocal<DynamicExpenseCategory[] | null>(LOCAL_EXPENSES_CONFIG_KEY, null);
  return sortExpenseCategories(saved && saved.length > 0 ? saved : DEFAULT_DYNAMIC_EXPENSE_CATEGORIES);
}

export function subscribeDynamicExpenseCategories(
  onData: (categories: DynamicExpenseCategory[]) => void
): () => void {
  onData(getDynamicExpenseCategories());

  if (auth.currentUser) {
    const ref = doc(db, 'system_config', 'expenses');
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const list = (snap.data()?.categories as DynamicExpenseCategory[]) || DEFAULT_DYNAMIC_EXPENSE_CATEGORIES;
          const sorted = sortExpenseCategories(list);
          writeLocal(LOCAL_EXPENSES_CONFIG_KEY, sorted);
          onData(sorted);
        }
      },
      () => {}
    );
  }

  const listener = () => onData(getDynamicExpenseCategories());
  window.addEventListener('autogarage_expenses_config_updated', listener);
  return () => window.removeEventListener('autogarage_expenses_config_updated', listener);
}

export async function saveDynamicExpenseCategories(
  categories: DynamicExpenseCategory[],
  adminUid?: string
): Promise<void> {
  const sorted = sortExpenseCategories(categories);
  writeLocal(LOCAL_EXPENSES_CONFIG_KEY, sorted, 'autogarage_expenses_config_updated');
  if (auth.currentUser) {
    try {
      await setDoc(
        doc(db, 'system_config', 'expenses'),
        { categories: sorted, updatedAt: new Date().toISOString(), updatedBy: adminUid || auth.currentUser.uid },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'system_config/expenses');
    }
  }
}

// 2. Global Feature Flags (/platform_settings/feature_flags)
export function getFeatureFlags(): FeatureFlagsConfig {
  const saved = readLocal<Partial<FeatureFlagsConfig> | null>(LOCAL_FEATURES_CONFIG_KEY, null);
  return normalizeFeatureFlags(saved);
}

export async function fetchFeatureFlagsFromCloud(): Promise<FeatureFlagsConfig> {
  try {
    const snap = await getDoc(doc(db, 'platform_settings', 'feature_flags'));
    if (snap.exists()) {
      const normalized = normalizeFeatureFlags(snap.data() as Record<string, unknown>);
      writeLocal(LOCAL_FEATURES_CONFIG_KEY, normalized);
      return normalized;
    }
    // Legacy fallback if older system_config/features document exists
    const legacySnap = await getDoc(doc(db, 'system_config', 'features'));
    if (legacySnap.exists()) {
      const normalized = normalizeFeatureFlags(legacySnap.data() as Record<string, unknown>);
      writeLocal(LOCAL_FEATURES_CONFIG_KEY, normalized);
      return normalized;
    }
  } catch (err) {
    console.warn('fetchFeatureFlagsFromCloud fallback:', err);
  }
  return getFeatureFlags();
}

export function subscribeFeatureFlags(
  onData: (flags: FeatureFlagsConfig) => void
): () => void {
  onData(getFeatureFlags());

  void fetchFeatureFlagsFromCloud().then((flags) => {
    onData(flags);
  });

  let unsub: (() => void) | null = null;
  try {
    const ref = doc(db, 'platform_settings', 'feature_flags');
    unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const flags = normalizeFeatureFlags(snap.data() as Record<string, unknown>);
          writeLocal(LOCAL_FEATURES_CONFIG_KEY, flags);
          onData(flags);
        }
      },
      (err) => {
        console.warn('subscribeFeatureFlags snapshot warning:', err);
      }
    );
  } catch {
    // fallback to local cache
  }

  const listener = () => onData(getFeatureFlags());
  window.addEventListener('autogarage_features_config_updated', listener);
  return () => {
    if (unsub) unsub();
    window.removeEventListener('autogarage_features_config_updated', listener);
  };
}

export async function saveFeatureFlags(
  flags: FeatureFlagsConfig,
  adminUid?: string
): Promise<{ savedToCloud: boolean; flags: FeatureFlagsConfig }> {
  const normalized = normalizeFeatureFlags(flags);
  const nowIso = new Date().toISOString();
  const actor = adminUid || auth.currentUser?.uid || 'superadmin';
  writeLocal(LOCAL_FEATURES_CONFIG_KEY, normalized, 'autogarage_features_config_updated');

  if (auth.currentUser) {
    try {
      await setDoc(
        doc(db, 'platform_settings', 'feature_flags'),
        {
          cerfaGenerator: normalized.cerfaGenerator,
          pnlCalculator: normalized.pnlCalculator,
          expenseAnalytics: normalized.expenseAnalytics,
          multiGarage: normalized.multiGarage,
          repairChecklist: normalized.repairChecklist,
          suppliersModule: normalized.suppliersModule,
          documentsModule: normalized.documentsModule,
          exportsBackup: normalized.exportsBackup,
          updatedAtIso: nowIso,
          updatedBy: actor,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return { savedToCloud: true, flags: normalized };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'platform_settings/feature_flags');
    }
  }

  return { savedToCloud: false, flags: normalized };
}

// 3. Global UI & Copywriting Text Overrides (/settings/ui_customization + /settings/copywriting + /system_config/texts)
export function getGlobalTextOverrides(): GlobalTextOverrides {
  return readLocal<GlobalTextOverrides>(LOCAL_TEXTS_CONFIG_KEY, {});
}

export function subscribeGlobalTextOverrides(
  onData: (overrides: GlobalTextOverrides) => void
): () => void {
  onData(getGlobalTextOverrides());

  // Always hydrate global UI customization & copywriting overrides on init (publicly readable)
  getDoc(doc(db, 'settings', 'ui_customization'))
    .then((snap) => {
      if (snap.exists() && snap.data()?.overrides) {
        const overrides = (snap.data()?.overrides as GlobalTextOverrides) || {};
        writeLocal(LOCAL_TEXTS_CONFIG_KEY, overrides);
        onData(overrides);
      }
    })
    .catch(() => {});

  let unsubUiCustomization: (() => void) | null = null;
  let unsubCopywriting: (() => void) | null = null;
  let unsubTexts: (() => void) | null = null;

  try {
    unsubUiCustomization = onSnapshot(
      doc(db, 'settings', 'ui_customization'),
      (snap) => {
        if (snap.exists() && snap.data()?.overrides) {
          const overrides = (snap.data()?.overrides as GlobalTextOverrides) || {};
          writeLocal(LOCAL_TEXTS_CONFIG_KEY, overrides);
          onData(overrides);
        }
      },
      () => {}
    );
    unsubCopywriting = onSnapshot(
      doc(db, 'settings', 'copywriting'),
      (snap) => {
        if (snap.exists() && snap.data()?.overrides) {
          const overrides = (snap.data()?.overrides as GlobalTextOverrides) || {};
          writeLocal(LOCAL_TEXTS_CONFIG_KEY, overrides);
          onData(overrides);
        }
      },
      () => {}
    );
    unsubTexts = onSnapshot(
      doc(db, 'system_config', 'texts'),
      (snap) => {
        if (snap.exists() && snap.data()?.overrides) {
          const overrides = (snap.data()?.overrides as GlobalTextOverrides) || {};
          writeLocal(LOCAL_TEXTS_CONFIG_KEY, overrides);
          onData(overrides);
        }
      },
      () => {}
    );
  } catch {
    // Fallback silently to local overrides
  }

  const listener = () => onData(getGlobalTextOverrides());
  window.addEventListener('autogarage_texts_config_updated', listener);
  return () => {
    if (unsubUiCustomization) unsubUiCustomization();
    if (unsubCopywriting) unsubCopywriting();
    if (unsubTexts) unsubTexts();
    window.removeEventListener('autogarage_texts_config_updated', listener);
  };
}

export async function saveGlobalTextOverrides(
  overrides: GlobalTextOverrides,
  adminUid?: string
): Promise<void> {
  writeLocal(LOCAL_TEXTS_CONFIG_KEY, overrides, 'autogarage_texts_config_updated');
  if (auth.currentUser) {
    const now = new Date().toISOString();
    const actor = adminUid || auth.currentUser.uid;
    const payload = { overrides, updatedAt: now, updatedBy: actor };
    try {
      await Promise.all([
        setDoc(doc(db, 'settings', 'ui_customization'), payload, { merge: true }),
        setDoc(doc(db, 'settings', 'copywriting'), payload, { merge: true }),
        setDoc(doc(db, 'system_config', 'texts'), payload, { merge: true }),
      ]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/ui_customization');
    }
  }
}

// 4. SuperAdmin Global French Tax Defaults (/settings/tax_defaults)
export function getSuperAdminTaxDefaults(): FrenchTaxConfiguration {
  const saved = readLocal<Partial<FrenchTaxConfiguration> | null>(LOCAL_TAX_DEFAULTS_KEY, null);
  return saved
    ? normalizeFrenchTaxConfig({ frenchTaxConfig: saved as FrenchTaxConfiguration })
    : createDefaultFrenchTaxConfig('micro_entreprise');
}

export function subscribeSuperAdminTaxDefaults(
  onData: (config: FrenchTaxConfiguration) => void
): () => void {
  onData(getSuperAdminTaxDefaults());

  getDoc(doc(db, 'settings', 'tax_defaults'))
    .then((snap) => {
      if (snap.exists()) {
        const cfg = normalizeFrenchTaxConfig({
          frenchTaxConfig: snap.data() as FrenchTaxConfiguration,
        });
        writeLocal(LOCAL_TAX_DEFAULTS_KEY, cfg);
        onData(cfg);
      }
    })
    .catch(() => {});

  let unsub: (() => void) | null = null;
  try {
    unsub = onSnapshot(
      doc(db, 'settings', 'tax_defaults'),
      (snap) => {
        if (snap.exists()) {
          const cfg = normalizeFrenchTaxConfig({
            frenchTaxConfig: snap.data() as FrenchTaxConfiguration,
          });
          writeLocal(LOCAL_TAX_DEFAULTS_KEY, cfg);
          onData(cfg);
        }
      },
      () => {}
    );
  } catch {
    // ignore
  }

  const listener = () => onData(getSuperAdminTaxDefaults());
  window.addEventListener('autogarage_tax_defaults_updated', listener);
  return () => {
    if (unsub) unsub();
    window.removeEventListener('autogarage_tax_defaults_updated', listener);
  };
}

export async function saveSuperAdminTaxDefaults(
  config: FrenchTaxConfiguration,
  adminUid?: string
): Promise<void> {
  const normalized = normalizeFrenchTaxConfig({ frenchTaxConfig: config });
  writeLocal(LOCAL_TAX_DEFAULTS_KEY, normalized, 'autogarage_tax_defaults_updated');
  if (auth.currentUser) {
    try {
      await setDoc(
        doc(db, 'settings', 'tax_defaults'),
        {
          ...normalized,
          updatedAt: new Date().toISOString(),
          updatedBy: adminUid || auth.currentUser.uid,
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/tax_defaults');
    }
  }
}

// 5. Global Cerfa Field Calibration Coordinates (/platform_settings/cerfa_templates)
let cerfaCalibrationCloudHydrated = false;
let cerfaCalibrationInFlight: Promise<CerfaTemplatesCalibrationPayload> | null = null;

export function getCerfaTemplatesCalibration(): CerfaTemplatesCalibrationPayload {
  return getCachedCerfaTemplatesCalibration();
}

export async function fetchCerfaTemplatesCalibrationFromCloud(): Promise<CerfaTemplatesCalibrationPayload> {
  if (cerfaCalibrationInFlight) {
    return cerfaCalibrationInFlight;
  }

  cerfaCalibrationInFlight = (async () => {
    try {
      const snap = await getDoc(doc(db, 'platform_settings', 'cerfa_templates'));
      cerfaCalibrationCloudHydrated = true;
      if (snap.exists()) {
        const resolved = resolveCerfaTemplatesCalibration(
          snap.data() as Partial<CerfaTemplatesCalibrationPayload>
        );
        return setCachedCerfaTemplatesCalibration(resolved);
      }
    } catch (err) {
      console.warn('fetchCerfaTemplatesCalibrationFromCloud fallback:', err);
    } finally {
      cerfaCalibrationInFlight = null;
    }
    return getCachedCerfaTemplatesCalibration();
  })();

  return cerfaCalibrationInFlight;
}

export async function ensureCerfaCalibrationHydrated(): Promise<CerfaTemplatesCalibrationPayload> {
  if (cerfaCalibrationCloudHydrated) {
    return getCachedCerfaTemplatesCalibration();
  }
  return fetchCerfaTemplatesCalibrationFromCloud();
}

export function subscribeCerfaTemplatesCalibration(
  onData: (calibration: CerfaTemplatesCalibrationPayload) => void
): () => void {
  onData(getCachedCerfaTemplatesCalibration());

  void fetchCerfaTemplatesCalibrationFromCloud().then((cal) => {
    onData(cal);
  });

  let unsub: (() => void) | null = null;
  try {
    unsub = onSnapshot(
      doc(db, 'platform_settings', 'cerfa_templates'),
      (snap) => {
        cerfaCalibrationCloudHydrated = true;
        if (snap.exists()) {
          const resolved = resolveCerfaTemplatesCalibration(
            snap.data() as Partial<CerfaTemplatesCalibrationPayload>
          );
          setCachedCerfaTemplatesCalibration(resolved);
          onData(resolved);
        }
      },
      (err) => {
        console.warn('subscribeCerfaTemplatesCalibration snapshot warning:', err);
      }
    );
  } catch {
    // Fallback to local cache
  }

  const listener = () => onData(getCachedCerfaTemplatesCalibration());
  window.addEventListener(CERFA_CALIBRATION_UPDATED_EVENT, listener);
  return () => {
    if (unsub) unsub();
    window.removeEventListener(CERFA_CALIBRATION_UPDATED_EVENT, listener);
  };
}

export async function saveCerfaTemplatesCalibration(
  calibration: Partial<CerfaTemplatesCalibrationPayload>,
  adminUid?: string
): Promise<{ savedToCloud: boolean; calibration: CerfaTemplatesCalibrationPayload }> {
  const nowIso = new Date().toISOString();
  const actor = adminUid || auth.currentUser?.uid || 'superadmin';
  const resolved = setCachedCerfaTemplatesCalibration({
    ...resolveCerfaTemplatesCalibration(calibration),
    updatedAtIso: nowIso,
    updatedBy: actor,
  });
  cerfaCalibrationCloudHydrated = true;

  if (auth.currentUser) {
    try {
      await setDoc(
        doc(db, 'platform_settings', 'cerfa_templates'),
        {
          cerfa_15776_02: resolved.cerfa_15776_02,
          cerfa_13750_07: resolved.cerfa_13750_07,
          declaration_achat: resolved.declaration_achat,
          updatedAtIso: nowIso,
          updatedBy: actor,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return { savedToCloud: true, calibration: resolved };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'platform_settings/cerfa_templates');
    }
  }

  return { savedToCloud: false, calibration: resolved };
}



