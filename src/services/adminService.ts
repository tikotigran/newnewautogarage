import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  DynamicExpenseCategory,
  FeatureFlagsConfig,
  GlobalTextOverrides,
  SubscriptionPlan,
  SystemThemeConfig,
  UserProfile,
} from '../types/garage';
import {
  applySystemThemeVariables,
  DEFAULT_DYNAMIC_EXPENSE_CATEGORIES,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_SUBSCRIPTION_PLANS,
  DEFAULT_SYSTEM_THEME_CONFIG,
  isSuperAdminUser,
  sortExpenseCategories,
  SUPERADMIN_BOOTSTRAP_EMAIL,
} from '../utils/adminUtils';

const LOCAL_ACCOUNTS_KEY = 'autogarage_admin_accounts_store';
const LOCAL_CURRENT_PROFILE_KEY = 'autogarage_current_user_profile';
const LOCAL_SYSTEM_CONFIG_KEY = 'autogarage_system_theme_config';
const LOCAL_EXPENSES_CONFIG_KEY = 'autogarage_system_expenses_config';
const LOCAL_FEATURES_CONFIG_KEY = 'autogarage_system_features_config';
const LOCAL_TEXTS_CONFIG_KEY = 'autogarage_system_texts_config';
const LOCAL_PLANS_KEY = 'autogarage_subscription_plans';

const SEEDED_ACCOUNTS: UserProfile[] = [
  {
    uid: 'garage_hq_admin',
    email: SUPERADMIN_BOOTSTRAP_EMAIL,
    displayName: 'Direction AutoGarage',
    garageName: 'AutoGarage Manager HQ',
    role: 'superadmin',
    planId: 'enterprise',
    vehicleLimit: 9999,
    activeVehiclesCount: 4,
    subscriptionStatus: 'active',
    mrrAmount: 149,
    lastPaymentDate: '2026-11-01',
    createdAt: '2026-01-15T09:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    uid: 'garage_lyon_01',
    email: 'contact@lyonautoselect.fr',
    displayName: 'Marc Dupont',
    garageName: 'Lyon Auto Select SARL',
    role: 'user',
    planId: 'pro',
    vehicleLimit: 50,
    activeVehiclesCount: 24,
    subscriptionStatus: 'active',
    mrrAmount: 49,
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
    mrrAmount: 49,
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
    mrrAmount: 149,
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
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const profile = snap.data() as UserProfile;
      writeLocal(LOCAL_CURRENT_PROFILE_KEY, profile);
      return profile;
    }

    const isBootstrapAdmin = isSuperAdminUser({
      email: user.email,
      emailVerified: user.emailVerified,
    });

    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Garage User',
      garageName: 'AutoGarage Manager',
      role: isBootstrapAdmin ? 'superadmin' : 'user',
      planId: isBootstrapAdmin ? 'enterprise' : 'starter',
      vehicleLimit: isBootstrapAdmin ? 9999 : 5,
      activeVehiclesCount: 0,
      subscriptionStatus: 'active',
      mrrAmount: isBootstrapAdmin ? 149 : 0,
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
  return saved
    ? {
        ...DEFAULT_SYSTEM_THEME_CONFIG,
        ...saved,
        cerfaAdjustments: {
          ...DEFAULT_SYSTEM_THEME_CONFIG.cerfaAdjustments,
          ...(saved.cerfaAdjustments || {}),
        },
      }
    : DEFAULT_SYSTEM_THEME_CONFIG;
}

export function subscribeSystemThemeConfig(
  onData: (config: SystemThemeConfig) => void
): () => void {
  const initial = getSystemThemeConfig();
  applySystemThemeVariables(initial);
  onData(initial);

  if (auth.currentUser) {
    const ref = doc(db, 'system_config', 'global');
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const cfg = {
            ...DEFAULT_SYSTEM_THEME_CONFIG,
            ...(snap.data() as SystemThemeConfig),
          };
          writeLocal(LOCAL_SYSTEM_CONFIG_KEY, cfg);
          applySystemThemeVariables(cfg);
          onData(cfg);
        }
      },
      () => {
        // Fallback silently to local config
      }
    );
  }

  const listener = () => {
    const cfg = getSystemThemeConfig();
    applySystemThemeVariables(cfg);
    onData(cfg);
  };
  window.addEventListener('autogarage_system_config_updated', listener);
  return () => window.removeEventListener('autogarage_system_config_updated', listener);
}

export async function saveSystemThemeConfig(
  config: SystemThemeConfig,
  adminUid?: string
): Promise<void> {
  const payload: SystemThemeConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUid || auth.currentUser?.uid || 'superadmin',
  };

  writeLocal(LOCAL_SYSTEM_CONFIG_KEY, payload, 'autogarage_system_config_updated');
  applySystemThemeVariables(payload);

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'system_config', 'global'), payload, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'system_config/global');
    }
  }
}

export function getSubscriptionPlans(): SubscriptionPlan[] {
  return readLocal<SubscriptionPlan[]>(LOCAL_PLANS_KEY, DEFAULT_SUBSCRIPTION_PLANS);
}

export function saveSubscriptionPlans(plans: SubscriptionPlan[]): void {
  writeLocal(LOCAL_PLANS_KEY, plans, 'autogarage_admin_updated');
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

// 2. Global Feature Flags (/system_config/features)
export function getFeatureFlags(): FeatureFlagsConfig {
  const saved = readLocal<Partial<FeatureFlagsConfig> | null>(LOCAL_FEATURES_CONFIG_KEY, null);
  return { ...DEFAULT_FEATURE_FLAGS, ...(saved || {}) };
}

export function subscribeFeatureFlags(
  onData: (flags: FeatureFlagsConfig) => void
): () => void {
  onData(getFeatureFlags());

  if (auth.currentUser) {
    const ref = doc(db, 'system_config', 'features');
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const flags = { ...DEFAULT_FEATURE_FLAGS, ...(snap.data() as Partial<FeatureFlagsConfig>) };
          writeLocal(LOCAL_FEATURES_CONFIG_KEY, flags);
          onData(flags);
        }
      },
      () => {}
    );
  }

  const listener = () => onData(getFeatureFlags());
  window.addEventListener('autogarage_features_config_updated', listener);
  return () => window.removeEventListener('autogarage_features_config_updated', listener);
}

export async function saveFeatureFlags(
  flags: FeatureFlagsConfig,
  adminUid?: string
): Promise<void> {
  writeLocal(LOCAL_FEATURES_CONFIG_KEY, flags, 'autogarage_features_config_updated');
  if (auth.currentUser) {
    try {
      await setDoc(
        doc(db, 'system_config', 'features'),
        { ...flags, updatedAt: new Date().toISOString(), updatedBy: adminUid || auth.currentUser.uid },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'system_config/features');
    }
  }
}

// 3. Global Text Overrides (/system_config/texts)
export function getGlobalTextOverrides(): GlobalTextOverrides {
  return readLocal<GlobalTextOverrides>(LOCAL_TEXTS_CONFIG_KEY, {});
}

export function subscribeGlobalTextOverrides(
  onData: (overrides: GlobalTextOverrides) => void
): () => void {
  onData(getGlobalTextOverrides());

  if (auth.currentUser) {
    const ref = doc(db, 'system_config', 'texts');
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const overrides = (snap.data()?.overrides as GlobalTextOverrides) || {};
          writeLocal(LOCAL_TEXTS_CONFIG_KEY, overrides);
          onData(overrides);
        }
      },
      () => {}
    );
  }

  const listener = () => onData(getGlobalTextOverrides());
  window.addEventListener('autogarage_texts_config_updated', listener);
  return () => window.removeEventListener('autogarage_texts_config_updated', listener);
}

export async function saveGlobalTextOverrides(
  overrides: GlobalTextOverrides,
  adminUid?: string
): Promise<void> {
  writeLocal(LOCAL_TEXTS_CONFIG_KEY, overrides, 'autogarage_texts_config_updated');
  if (auth.currentUser) {
    try {
      await setDoc(
        doc(db, 'system_config', 'texts'),
        { overrides, updatedAt: new Date().toISOString(), updatedBy: adminUid || auth.currentUser.uid },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'system_config/texts');
    }
  }
}

