import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Sidebar, SidebarNavTarget } from './components/Sidebar';
import { VehicleList } from './components/VehicleList';
import { VehicleDetail } from './components/VehicleDetail';
import { VehicleModal } from './components/VehicleModal';
import { AddVehiclePage } from './components/AddVehiclePage';
import { BuyerModal } from './components/BuyerModal';
import { CancelSaleConfirmModal } from './components/CancelSaleConfirmModal';
import { Settings, SettingsTab } from './components/Settings';
import { Cerfa15776Modal } from './components/Cerfa15776Modal';
import { AnalyticsView } from './components/AnalyticsView';
import { SuppliersView } from './components/SuppliersView';
import { DocumentsView } from './components/DocumentsView';
import { ExportsBackupView } from './components/ExportsBackupView';
import { AdminPanel } from './components/AdminPanel';
import { AuthModal } from './components/AuthModal';
import { GarageSelector } from './components/GarageSelector';
import { DemoModeBanner } from './components/DemoModeBanner';
import { QuickCreateAction, QuickCreateDropdown } from './components/QuickCreateDropdown';
import { HeaderNotifications } from './components/HeaderNotifications';
import { HeaderLanguageDropdown } from './components/HeaderLanguageDropdown';
import { AppUserProfileType, Vehicle, VehicleStatus, BuyerInfo, UserProfile, SystemThemeConfig, GarageWorkspace, FeatureFlagsConfig, Supplier, Purchase, GarageDocument, DocumentHistoryEvent, UserActivityLog, ChangeLogEntry, BackupSnapshotRecord, LegalStatus, TaxRegime, RepairTask, GeneralExpense, SubscriptionPlan } from './types/garage';
import {
  auth,
  onAuthStateChanged,
  signOut,
  User,
} from './services/firebase';
import {
  clearLocalGarageCache,
  subscribeVehicles,
  subscribeGarages,
  subscribeAllFleetExpensesAndRepairs,
  createGarage,
  updateGarage,
  deleteGarage,
  getGarageSettings,
  setActiveGarageId as persistActiveGarageId,
  fetchGarageSettingsFromCloud,
  createVehicle,
  updateVehicle,
  cancelVehicleSale,
  deleteVehicle,
  addGeneralExpense,
  deleteGeneralExpense,
  deleteRepairTask,
  seedDemoGarageData,
  getActiveGarageId,
} from './services/garageService';
import { buildProfileSettingsPatch, buildTransactionTaxSnapshot, resolveUserProfileType } from './utils/frenchTaxEngine';
import {
  ensureAndGetUserProfile,
  subscribeCerfaTemplatesCalibration,
  subscribeFeatureFlags,
  subscribeSubscriptionPlans,
  subscribeSystemThemeConfig,
  subscribeUserProfile,
  updateUserProfileType,
} from './services/adminService';
import {
  applySystemThemeVariables,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_SUBSCRIPTION_PLANS,
  DEFAULT_SYSTEM_THEME_CONFIG,
  getPlanCapabilities,
  isSuperAdminUser,
  isViewAllowedByFeatureFlags,
  resolveEffectiveFeatureFlagsForPlan,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from './utils/adminUtils';
import {
  buildGarageUpdatePayload,
  canDeleteGarage,
  DEFAULT_GARAGE_ID,
  filterVehiclesByGarage,
  hasOpenGarageWorkspace,
  removeGarageFromList,
  removeVehiclesForGarage,
  resolveNextActiveGarageId,
  resolveSinglePrimaryGarageId,
  upsertGarageInList,
} from './utils/garageUtils';
import {
  subscribeSuppliers,
  subscribePurchases,
  seedDemoSuppliersAndPurchases,
  deleteSupplier,
  deletePurchase,
} from './services/supplierService';
import {
  filterSuppliersByGarage,
  filterPurchasesByGarage,
} from './utils/suppliers';
import {
  subscribeDocuments,
  subscribeDocumentHistory,
  seedDemoDocuments,
  deleteGarageDocument,
} from './services/documentService';
import {
  collectDemoRecordsForCleanup,
  GUEST_DEMO_STORAGE_KEY,
  hasActiveDemoFleet,
} from './utils/demoUtils';
import {
  filterDocumentsByGarage,
  filterDocumentHistoryByGarage,
} from './utils/documents';
import {
  logEntityChange,
  logUserActivity,
  subscribeActivityLogs,
  subscribeBackupSnapshots,
  subscribeChangeLogs,
} from './services/auditAndBackupService';
import { computeEntityFieldDiffs, filterAuditLogsByGarage } from './utils/exportBackup';
import { createDemoCerfaVehicle } from './utils/cerfa15776';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Menu, Moon, Sun } from 'lucide-react';
import { useI18n } from './i18n/I18nContext';
import { pickLocalized } from './utils/i18nUtils';
import { buildSoldRevertUpdate, resolvePendingVehicleSelection } from './utils/vehicleFormUtils';

export type ActiveAppView =
  | 'desktop'
  | 'sold_vehicles'
  | 'new_vehicle'
  | 'analytics'
  | 'suppliers'
  | 'documents'
  | 'exports'
  | 'settings'
  | 'admin';

const isAdminUrl = (): boolean => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('view') === 'admin' ||
    params.get('mode') === 'admin' ||
    window.location.pathname === '/admin'
  );
};

const isNewVehicleUrl = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/vehicles/new';
};

const isDemoUrl = (): boolean => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('demo') === '1';
};

const readGuestDemoStorage = (): boolean => {
  try {
    return localStorage.getItem(GUEST_DEMO_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export default function App() {
  const { lang, t } = useI18n();
  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => isAdminUrl());
  const [user, setUser] = useState<User | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(
    () => !auth.currentUser && (isDemoUrl() || readGuestDemoStorage())
  );
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const guestDemoAutoSeededRef = useRef(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemThemeConfig>(DEFAULT_SYSTEM_THEME_CONFIG);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagsConfig>(DEFAULT_FEATURE_FLAGS);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>(DEFAULT_SUBSCRIPTION_PLANS);
  const [globalToast, setGlobalToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showGlobalToast = useCallback((message: string) => {
    setGlobalToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setGlobalToast(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);
  const [authReady, setAuthReady] = useState(false);
  const [garages, setGarages] = useState<GarageWorkspace[]>([]);
  const [activeGarageId, setActiveGarageId] = useState<string | null>(() => {
    if (!auth.currentUser && (isDemoUrl() || readGuestDemoStorage())) {
      return getActiveGarageId() || DEFAULT_GARAGE_ID;
    }
    return null;
  });
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleetRepairs, setFleetRepairs] = useState<RepairTask[]>([]);
  const [fleetExpenses, setFleetExpenses] = useState<GeneralExpense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [documents, setDocuments] = useState<GarageDocument[]>([]);
  const [documentHistory, setDocumentHistory] = useState<DocumentHistoryEvent[]>([]);
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([]);
  const [backupSnapshots, setBackupSnapshots] = useState<BackupSnapshotRecord[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [pendingSelectedVehicleId, setPendingSelectedVehicleId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveAppView>(() =>
    isAdminUrl() ? 'admin' : isNewVehicleUrl() ? 'new_vehicle' : 'desktop'
  );
  const [previousViewBeforeSettings, setPreviousViewBeforeSettings] =
    useState<Exclude<ActiveAppView, 'settings'>>('desktop');
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('company');

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleToggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Modals state
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isBuyerModalOpen, setIsBuyerModalOpen] = useState(false);
  const [sellingVehicle, setSellingVehicle] = useState<Vehicle | null>(null);
  const [cancelSaleTarget, setCancelSaleTarget] = useState<{
    vehicle: Vehicle;
    targetStatus: VehicleStatus;
  } | null>(null);
  const [isQuickAlignerOpen, setIsQuickAlignerOpen] = useState(false);
  const [documentsAlignerMode, setDocumentsAlignerMode] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [cerfaVehicle, setCerfaVehicle] = useState<Vehicle | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [suppliersTabRequest, setSuppliersTabRequest] = useState<{
    tab: 'purchases' | 'suppliers' | 'channels';
    nonce: number;
  } | null>(null);
  const [exportsTabRequest, setExportsTabRequest] = useState<{
    tab: 'exports' | 'facturx' | 'audit' | 'backup';
    nonce: number;
  } | null>(null);
  const [vehicleDetailTabRequest, setVehicleDetailTabRequest] = useState<{
    tab: 'overview' | 'repairs' | 'expenses' | 'documents';
    nonce: number;
  } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('autogarage_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    applySystemThemeVariables(systemConfig, theme);
    try {
      localStorage.setItem('autogarage_theme', theme);
    } catch {
      // ignore
    }
  }, [theme, systemConfig]);

  const isSuperAdmin = isSuperAdminUser({
    email: user?.email,
    emailVerified: user?.emailVerified,
    profile: userProfile,
  });

  const activePlanId = userProfile?.planId || (isSuperAdmin ? 'enterprise' : 'starter');
  const currentPlanObj = useMemo(
    () =>
      subscriptionPlans.find((p) => p.id === activePlanId) ||
      subscriptionPlans[0],
    [subscriptionPlans, activePlanId]
  );
  const upgradePlanObj = useMemo(() => {
    const nextId = activePlanId === 'starter' ? 'pro' : 'enterprise';
    return (
      subscriptionPlans.find((p) => p.id === nextId) ||
      subscriptionPlans[1] ||
      subscriptionPlans[0]
    );
  }, [subscriptionPlans, activePlanId]);
  const planCapabilities = useMemo(
    () => getPlanCapabilities(activePlanId, subscriptionPlans),
    [activePlanId, subscriptionPlans]
  );
  const effectiveFeatureFlags = useMemo(
    () =>
      resolveEffectiveFeatureFlagsForPlan(
        featureFlags,
        activePlanId,
        isSuperAdmin,
        subscriptionPlans
      ),
    [featureFlags, activePlanId, isSuperAdmin, subscriptionPlans]
  );

  // Sync /admin, ?view=admin, or /vehicles/new URL path
  const handleSetActiveView = (view: ActiveAppView) => {
    const safeView = isViewAllowedByFeatureFlags(view, effectiveFeatureFlags) ? view : 'desktop';
    if (safeView === 'settings' && activeView !== 'settings') {
      setPreviousViewBeforeSettings(activeView as Exclude<ActiveAppView, 'settings'>);
    }
    if (safeView !== 'documents') {
      setDocumentsAlignerMode(false);
    }
    setIsAdminMode(safeView === 'admin');
    setActiveView(safeView);
    if (typeof window !== 'undefined') {
      const targetPath =
        safeView === 'admin'
          ? `${window.location.origin}/?view=admin`
          : safeView === 'new_vehicle'
          ? '/vehicles/new'
          : '/';
      const currentFull = `${window.location.pathname}${window.location.search}`;
      if (
        (safeView === 'admin' && !isAdminUrl()) ||
        (safeView === 'new_vehicle' && window.location.pathname !== '/vehicles/new') ||
        (safeView !== 'admin' && safeView !== 'new_vehicle' && (currentFull !== '/' || isAdminUrl()))
      ) {
        window.history.pushState({}, '', targetPath);
      }
    }
  };

  const handleOpenUpgradePlan = () => {
    setSelectedVehicle(null);
    setActiveSettingsTab('subscription');
    handleSetActiveView('settings');
  };

  const handleBackToGarageFromAdmin = () => {
    if (typeof window !== 'undefined') {
      window.location.assign(`${window.location.origin}/`);
      return;
    }
    setIsAdminMode(false);
    setActiveView('desktop');
  };

  useEffect(() => {
    const onPopState = () => {
      const admin = isAdminUrl();
      if (admin) {
        setIsAdminMode(true);
        setActiveView('admin');
        return;
      }
      setIsAdminMode(false);
      setActiveView(isNewVehicleUrl() ? 'new_vehicle' : 'desktop');
    };
    const onSettingsUpdated = () => {
      setSettingsVersion((n) => n + 1);
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('autogarage_settings_updated', onSettingsUpdated);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('autogarage_settings_updated', onSettingsUpdated);
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Subscribe to global system theme config, feature flags, subscription plans, and Cerfa field calibration
  useEffect(() => {
    const unsubTheme = subscribeSystemThemeConfig((cfg) => {
      setSystemConfig(cfg);
    });
    const unsubFlags = subscribeFeatureFlags((flags) => {
      setFeatureFlags(flags);
    });
    const unsubPlans = subscribeSubscriptionPlans((plans) => {
      setSubscriptionPlans(plans);
    });
    const unsubCerfa = subscribeCerfaTemplatesCalibration(() => {});
    return () => {
      unsubTheme();
      unsubFlags();
      unsubPlans();
      unsubCerfa();
    };
  }, []);

  // Enforce multiGarage & module feature flag guards globally across all users
  useEffect(() => {
    if (!authReady || (!user && !isDemoMode)) return;
    if (!effectiveFeatureFlags.multiGarage) {
      const primaryGarageId = resolveSinglePrimaryGarageId(garages, activeGarageId);
      if (activeGarageId !== primaryGarageId) {
        setActiveGarageId(primaryGarageId);
        persistActiveGarageId(primaryGarageId);
      }
    }
    if (!isViewAllowedByFeatureFlags(activeView, effectiveFeatureFlags)) {
      setDocumentsAlignerMode(false);
      setActiveView('desktop');
    }
    if (!effectiveFeatureFlags.documentsModule && documentsAlignerMode) {
      setDocumentsAlignerMode(false);
    }
  }, [authReady, user, isDemoMode, effectiveFeatureFlags, garages, activeGarageId, activeView, documentsAlignerMode]);

  // Initialize Auth & RBAC Profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const prevUid = localStorage.getItem('autogarage_last_uid');
          if (prevUid !== currentUser.uid) {
            clearLocalGarageCache();
            localStorage.setItem('autogarage_last_uid', currentUser.uid);
          }
          localStorage.removeItem(GUEST_DEMO_STORAGE_KEY);
        } catch {
          // ignore
        }
        setIsDemoMode(false);
        if (typeof window !== 'undefined' && isDemoUrl()) {
          window.history.replaceState({}, '', '/');
        }
      }
      const profile = await ensureAndGetUserProfile(currentUser);
      setUserProfile(profile);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  // Real-time sync of current user's subscription & profile document
  useEffect(() => {
    if (!user?.uid) return;
    const unsubProfile = subscribeUserProfile(user.uid, (profile) => {
      if (profile) setUserProfile(profile);
    });
    return () => unsubProfile();
  }, [user?.uid]);

  const handleDevSuperAdminLogin = (profile: UserProfile) => {
    try {
      localStorage.setItem('autogarage_current_user_profile', JSON.stringify(profile));
    } catch {
      // ignore
    }
    setUserProfile(profile);
  };

  const handleSignOut = async () => {
    clearLocalGarageCache();
    persistActiveGarageId(null);
    setActiveGarageId(null);
    setSelectedVehicle(null);
    setPendingSelectedVehicleId(null);
    setGarages([]);
    setVehicles([]);
    setFleetRepairs([]);
    setFleetExpenses([]);
    setSuppliers([]);
    setPurchases([]);
    setDocuments([]);
    setDocumentHistory([]);
    setActivityLogs([]);
    setChangeLogs([]);
    setBackupSnapshots([]);
    setUserProfile(null);
    setMobileSidebarOpen(false);
    setIsAuthModalOpen(false);
    setDocumentsAlignerMode(false);
    setIsDemoMode(false);
    setAuthInitialMode('login');
    guestDemoAutoSeededRef.current = false;
    setActiveView('desktop');
    setIsAdminMode(false);
    setUser(null);
    if (typeof window !== 'undefined' && (isAdminUrl() || isDemoUrl())) {
      window.history.replaceState({}, '', '/');
    }
    if (auth.currentUser) {
      await signOut(auth);
    }
  };

  const effectiveUserId = user?.uid || 'garage_pro_dealer';

  // Subscribe to garages (authenticated main garage workspace or active guest demo)
  useEffect(() => {
    if (!authReady || (!user && !isDemoMode) || isAdminMode) {
      setGarages([]);
      return;
    }
    const unsubscribe = subscribeGarages(effectiveUserId, (list) => {
      setGarages(list);
    });
    return () => unsubscribe();
  }, [authReady, user, isDemoMode, isAdminMode, effectiveUserId]);

  // Sync activeGarageId with garageService for per-garage Cerfa & Settings isolation
  const handleSelectGarage = (garageId: string | null) => {
    setActiveGarageId(garageId);
    setSelectedVehicle(null);
    setPendingSelectedVehicleId(null);
    persistActiveGarageId(garageId);
    if (garageId && user?.uid) {
      fetchGarageSettingsFromCloud(user.uid, garageId).catch(() => {});
    }
    if (garageId === null && activeView !== 'desktop' && activeView !== 'settings') {
      handleSetActiveView('desktop');
    }
    if (garageId && activeView === 'admin') {
      handleSetActiveView('desktop');
    }
  };

  const handleCreateGarage = async (input: {
    name: string;
    profileType?: AppUserProfileType;
    entityType: 'morale' | 'physique';
    legalStatus?: LegalStatus;
    city?: string;
    siret?: string;
    taxRegime?: TaxRegime;
    taxRatePercent?: number;
  }) => {
    const created = await createGarage(effectiveUserId, input);
    setGarages((prev) => upsertGarageInList(prev, created));
    if (!effectiveFeatureFlags.multiGarage) {
      handleSelectGarage(created.id);
    }
  };

  const handleUpdateGarage = async (
    garageId: string,
    input: {
      name: string;
      profileType: AppUserProfileType;
      city?: string;
      siret?: string;
    }
  ) => {
    const existing = garages.find((g) => g.id === garageId);
    if (existing) {
      const optimistic = buildGarageUpdatePayload(existing, input);
      setGarages((prev) => upsertGarageInList(prev, optimistic));
    }
    try {
      const updated = await updateGarage(effectiveUserId, garageId, input, existing);
      setGarages((prev) => upsertGarageInList(prev, updated));
      setSettingsVersion((n) => n + 1);
    } catch (err) {
      if (existing) {
        setGarages((prev) => upsertGarageInList(prev, existing));
      }
      throw err;
    }
  };

  const handleDeleteGarage = async (garageId: string) => {
    const check = canDeleteGarage(garages, garageId);
    if (!check.allowed) return;

    const prevGarages = garages;
    const prevVehicles = vehicles;
    const prevActiveGarageId = activeGarageId;
    const prevSelectedVehicle = selectedVehicle;

    const remaining = removeGarageFromList(garages, garageId);
    const nextActiveId = resolveNextActiveGarageId(
      remaining,
      garageId,
      activeGarageId,
      effectiveFeatureFlags.multiGarage
    );

    setGarages(remaining);
    setVehicles((prev) => removeVehiclesForGarage(prev, garageId));
    if (prevSelectedVehicle) {
      const belongsToDeleted = prevSelectedVehicle.garageId
        ? prevSelectedVehicle.garageId === garageId
        : garageId === DEFAULT_GARAGE_ID;
      if (belongsToDeleted) {
        setSelectedVehicle(null);
        setPendingSelectedVehicleId(null);
      }
    }
    if (nextActiveId !== activeGarageId) {
      handleSelectGarage(nextActiveId);
    }

    try {
      await deleteGarage(effectiveUserId, garageId);
      setGarages((prev) => removeGarageFromList(prev, garageId));
      setVehicles((prev) => removeVehiclesForGarage(prev, garageId));
      setSettingsVersion((n) => n + 1);
    } catch (err) {
      setGarages(prevGarages);
      setVehicles(prevVehicles);
      if (nextActiveId !== prevActiveGarageId) {
        handleSelectGarage(prevActiveGarageId);
      }
      setSelectedVehicle(prevSelectedVehicle);
      throw err;
    }
  };

  const activeProfileType: AppUserProfileType = useMemo(() => {
    const activeGarage = activeGarageId ? garages.find((g) => g.id === activeGarageId) : null;
    if (activeGarage?.profileType || activeGarage?.legalStatus || activeGarage?.taxRegime) {
      return resolveUserProfileType(activeGarage);
    }
    if (activeGarageId) {
      return resolveUserProfileType(getGarageSettings(activeGarageId));
    }
    if (userProfile?.profileType) {
      return userProfile.profileType;
    }
    return resolveUserProfileType(getGarageSettings());
  }, [activeGarageId, garages, userProfile?.profileType, settingsVersion]);

  // Subscribe to real-time vehicles (authenticated workspace or active guest demo)
  useEffect(() => {
    if (!authReady || (!user && !isDemoMode) || isAdminMode) {
      setVehicles([]);
      setSelectedVehicle(null);
      return;
    }

    const unsubscribe = subscribeVehicles(effectiveUserId, (data) => {
      setVehicles(data);

      // Keep selected vehicle in sync if updated
      setSelectedVehicle((prev) => {
        if (!prev) return null;
        return data.find((v) => v.id === prev.id) || null;
      });
    });

    return () => unsubscribe();
  }, [authReady, user, isDemoMode, isAdminMode, effectiveUserId]);

  // Subscribe to all fleet repair tasks and general expenses for accurate Active Inventory financial totals
  useEffect(() => {
    if (!authReady || (!user && !isDemoMode) || isAdminMode || vehicles.length === 0) {
      setFleetRepairs([]);
      setFleetExpenses([]);
      return;
    }
    const unsub = subscribeAllFleetExpensesAndRepairs(
      vehicles,
      ({ repairs, expenses }) => {
        setFleetRepairs(repairs);
        setFleetExpenses(expenses);
      }
    );
    return () => unsub();
  }, [authReady, user, isDemoMode, isAdminMode, vehicles]);

  // Subscribe to real-time suppliers, purchases, documents & document history
  useEffect(() => {
    if (!authReady || (!user && !isDemoMode) || isAdminMode) {
      setSuppliers([]);
      setPurchases([]);
      setDocuments([]);
      setDocumentHistory([]);
      setActivityLogs([]);
      setChangeLogs([]);
      setBackupSnapshots([]);
      return;
    }
    const unsubSuppliers = subscribeSuppliers(effectiveUserId, setSuppliers);
    const unsubPurchases = subscribePurchases(effectiveUserId, setPurchases);
    const unsubDocuments = subscribeDocuments(effectiveUserId, setDocuments);
    const unsubDocHistory = subscribeDocumentHistory(effectiveUserId, setDocumentHistory);
    const unsubActivity = subscribeActivityLogs(effectiveUserId, setActivityLogs);
    const unsubChanges = subscribeChangeLogs(effectiveUserId, setChangeLogs);
    const unsubSnapshots = subscribeBackupSnapshots(effectiveUserId, setBackupSnapshots);
    return () => {
      unsubSuppliers();
      unsubPurchases();
      unsubDocuments();
      unsubDocHistory();
      unsubActivity();
      unsubChanges();
      unsubSnapshots();
    };
  }, [authReady, user, isDemoMode, isAdminMode, effectiveUserId]);

  // Strictly isolated vehicles for the active garage
  const garageVehicles = useMemo(() => {
    if (!activeGarageId) return [];
    return filterVehiclesByGarage(vehicles, activeGarageId);
  }, [vehicles, activeGarageId]);

  const soldGarageVehiclesCount = useMemo(
    () => garageVehicles.filter((v) => v.status === 'sold').length,
    [garageVehicles]
  );

  // Wait until a newly created vehicle appears in the resolved list before opening its detail view
  useEffect(() => {
    if (!pendingSelectedVehicleId) return;
    const resolvedList = activeGarageId ? garageVehicles : vehicles;
    const matched = resolvePendingVehicleSelection(pendingSelectedVehicleId, resolvedList);
    if (matched) {
      setSelectedVehicle(matched);
      setPendingSelectedVehicleId(null);
    }
  }, [pendingSelectedVehicleId, activeGarageId, garageVehicles, vehicles]);

  const garageSuppliers = useMemo(
    () => filterSuppliersByGarage(suppliers, activeGarageId),
    [suppliers, activeGarageId]
  );

  const garagePurchases = useMemo(
    () => filterPurchasesByGarage(purchases, activeGarageId),
    [purchases, activeGarageId]
  );

  const garageDocuments = useMemo(
    () => filterDocumentsByGarage(documents, activeGarageId),
    [documents, activeGarageId]
  );

  const garageDocumentHistory = useMemo(
    () => filterDocumentHistoryByGarage(documentHistory, activeGarageId),
    [documentHistory, activeGarageId]
  );

  const garageActivityLogs = useMemo(
    () => filterAuditLogsByGarage(activityLogs, activeGarageId),
    [activityLogs, activeGarageId]
  );

  const garageChangeLogs = useMemo(
    () => filterAuditLogsByGarage(changeLogs, activeGarageId),
    [changeLogs, activeGarageId]
  );

  const garageBackupSnapshots = useMemo(
    () => filterAuditLogsByGarage(backupSnapshots, activeGarageId),
    [backupSnapshots, activeGarageId]
  );

  const handleSeedSuppliers = async () => {
    const targetGarageId = activeGarageId || DEFAULT_GARAGE_ID;
    let scopedVehicles = activeGarageId ? garageVehicles : vehicles;
    if (scopedVehicles.length === 0) {
      scopedVehicles = await seedDemoGarageData(effectiveUserId, targetGarageId);
    }
    await seedDemoSuppliersAndPurchases(
      effectiveUserId,
      targetGarageId,
      scopedVehicles
    );
    setIsDemoMode(true);
  };

  const handleSeedDocuments = async () => {
    const targetGarageId = activeGarageId || DEFAULT_GARAGE_ID;
    let scopedVehicles = activeGarageId ? garageVehicles : vehicles;
    if (scopedVehicles.length === 0) {
      scopedVehicles = await seedDemoGarageData(effectiveUserId, targetGarageId);
    }
    await seedDemoDocuments(
      effectiveUserId,
      targetGarageId,
      scopedVehicles,
      userProfile?.email || user?.email || undefined
    );
    setIsDemoMode(true);
  };

  // Seed demo data handler (scoped to active garage)
  const handleSeedData = async () => {
    try {
      setIsSeeding(true);
      const targetGarageId = activeGarageId || DEFAULT_GARAGE_ID;
      if (!activeGarageId) {
        setActiveGarageId(targetGarageId);
        persistActiveGarageId(targetGarageId);
      }
      const seededVehicles = await seedDemoGarageData(effectiveUserId, targetGarageId);
      if (garageSuppliers.length === 0) {
        await seedDemoSuppliersAndPurchases(
          effectiveUserId,
          targetGarageId,
          seededVehicles
        );
      }
      if (garageDocuments.length === 0) {
        await seedDemoDocuments(
          effectiveUserId,
          targetGarageId,
          seededVehicles,
          userProfile?.email || user?.email || undefined
        );
      }
      setIsDemoMode(true);
    } catch (err) {
      console.error('Seed demo error:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleEnterGuestDemo = async () => {
    clearLocalGarageCache();
    try {
      localStorage.setItem(GUEST_DEMO_STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    guestDemoAutoSeededRef.current = true;
    persistActiveGarageId(DEFAULT_GARAGE_ID);
    setActiveGarageId(DEFAULT_GARAGE_ID);
    setSelectedVehicle(null);
    setPendingSelectedVehicleId(null);
    setDocumentsAlignerMode(false);
    setActiveView('desktop');
    setIsAdminMode(false);
    setAuthInitialMode('login');
    setIsDemoMode(true);
    try {
      setIsSeeding(true);
      const seededVehicles = await seedDemoGarageData(effectiveUserId, DEFAULT_GARAGE_ID);
      await seedDemoSuppliersAndPurchases(effectiveUserId, DEFAULT_GARAGE_ID, seededVehicles);
      await seedDemoDocuments(effectiveUserId, DEFAULT_GARAGE_ID, seededVehicles);
    } catch (err) {
      console.error('Guest demo seed error:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleExitGuestDemo = (targetMode: 'login' | 'register' = 'login') => {
    clearLocalGarageCache();
    persistActiveGarageId(null);
    guestDemoAutoSeededRef.current = false;
    setActiveGarageId(null);
    setSelectedVehicle(null);
    setPendingSelectedVehicleId(null);
    setGarages([]);
    setVehicles([]);
    setFleetRepairs([]);
    setFleetExpenses([]);
    setSuppliers([]);
    setPurchases([]);
    setDocuments([]);
    setDocumentHistory([]);
    setActivityLogs([]);
    setChangeLogs([]);
    setBackupSnapshots([]);
    setMobileSidebarOpen(false);
    setIsAuthModalOpen(false);
    setDocumentsAlignerMode(false);
    setIsAdminMode(false);
    setActiveView('desktop');
    setAuthInitialMode(targetMode);
    setIsDemoMode(false);
    if (typeof window !== 'undefined' && isDemoUrl()) {
      window.history.replaceState({}, '', '/');
    }
  };

  const handleClearAuthenticatedDemo = async () => {
    const plan = collectDemoRecordsForCleanup({
      activeGarageId,
      vehicles,
      suppliers,
      purchases,
      documents,
    });
    const actor = userProfile?.email || user?.email || undefined;
    await Promise.all([
      ...plan.purchaseIds.map((pid) => deletePurchase(pid)),
      ...plan.supplierIds.map((sid) => deleteSupplier(sid)),
      ...plan.documents.map((docItem) => deleteGarageDocument(docItem, actor)),
      ...plan.vehicleIds.map((vid) => deleteVehicle(vid)),
    ]);

    const deletedVehicleIds = new Set(plan.vehicleIds);
    const deletedSupplierIds = new Set(plan.supplierIds);
    const deletedPurchaseIds = new Set(plan.purchaseIds);
    const deletedDocumentIds = new Set(plan.documents.map((d) => d.id));

    if (deletedVehicleIds.size > 0) {
      setVehicles((prev) => prev.filter((v) => !deletedVehicleIds.has(v.id)));
    }
    if (deletedSupplierIds.size > 0) {
      setSuppliers((prev) => prev.filter((s) => !deletedSupplierIds.has(s.id)));
    }
    if (deletedPurchaseIds.size > 0) {
      setPurchases((prev) => prev.filter((p) => !deletedPurchaseIds.has(p.id)));
    }
    if (deletedDocumentIds.size > 0) {
      setDocuments((prev) => prev.filter((d) => !deletedDocumentIds.has(d.id)));
    }

    try {
      localStorage.removeItem(GUEST_DEMO_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSelectedVehicle(null);
    setPendingSelectedVehicleId(null);
    setDocumentsAlignerMode(false);
    setIsDemoMode(false);
    if (activeView !== 'desktop') {
      handleSetActiveView('desktop');
    }
    showGlobalToast(
      pickLocalized(lang, {
        fr: 'Mode démo quitté — données de démonstration supprimées.',
        ru: 'Вы вышли из демо-режима. Демо-данные удалены.',
        hy: 'Դուրս եկաք դեմո ռեժիմից։ Դեմո տվյալները ջնջված են։',
        ka: 'გახვედით დემო რეჟიმიდან. დემო მონაცემები წაშლილია.',
      })
    );
  };

  useEffect(() => {
    if (!authReady || user || !isDemoMode || guestDemoAutoSeededRef.current) return;
    guestDemoAutoSeededRef.current = true;
    if (!activeGarageId) {
      setActiveGarageId(DEFAULT_GARAGE_ID);
      persistActiveGarageId(DEFAULT_GARAGE_ID);
    }
    let hasLocalVehicles = false;
    try {
      const raw = localStorage.getItem('autogarage_vehicles_store');
      const parsed = raw ? (JSON.parse(raw) as Vehicle[]) : [];
      hasLocalVehicles = Array.isArray(parsed) && parsed.length > 0;
    } catch {
      hasLocalVehicles = false;
    }
    if (!hasLocalVehicles) {
      void (async () => {
        try {
          setIsSeeding(true);
          const seededVehicles = await seedDemoGarageData(effectiveUserId, DEFAULT_GARAGE_ID);
          await seedDemoSuppliersAndPurchases(effectiveUserId, DEFAULT_GARAGE_ID, seededVehicles);
          await seedDemoDocuments(effectiveUserId, DEFAULT_GARAGE_ID, seededVehicles);
        } finally {
          setIsSeeding(false);
        }
      })();
    }
  }, [authReady, user, isDemoMode, activeGarageId, effectiveUserId]);

  // Quick status change (prompts for confirmation when reverting from 'sold')
  const handleQuickStatusChange = async (vehicleId: string, newStatus: VehicleStatus) => {
    const prev = vehicles.find((v) => v.id === vehicleId);
    if (!prev) {
      await updateVehicle(vehicleId, { status: newStatus });
      return;
    }
    if (prev.status === 'sold' && newStatus !== 'sold') {
      setCancelSaleTarget({ vehicle: prev, targetStatus: newStatus });
      return;
    }
    const revertPlan = buildSoldRevertUpdate(prev, newStatus);
    await updateVehicle(vehicleId, revertPlan.updates);
    if (prev.status !== newStatus) {
      const actor = userProfile?.email || user?.email || null;
      const label = `${prev.make} ${prev.model} (${prev.registrationNumber || prev.vin})`;
      const changes: Array<{ field: string; oldValue: string; newValue: string }> = [
        { field: 'status', oldValue: prev.status, newValue: newStatus },
      ];
      void logUserActivity({
        userId: effectiveUserId,
        garageId: prev.garageId || activeGarageId,
        actorEmail: actor,
        action: 'vehicle_updated',
        entityType: 'vehicle',
        entityId: vehicleId,
        targetLabel: label,
        details: `Statut: ${prev.status} → ${newStatus}`,
      });
      void logEntityChange({
        userId: effectiveUserId,
        garageId: prev.garageId || activeGarageId,
        actorEmail: actor,
        operation: 'update',
        entityType: 'vehicle',
        entityId: vehicleId,
        entityLabel: label,
        changes,
      });
    }
  };

  const handleQuickToggleField = async (
    vehicleId: string,
    field: 'ctPassed' | 'docsCompleted',
    value: boolean
  ) => {
    await updateVehicle(vehicleId, { [field]: value });
  };

  const handleAddQuickExpense = async (
    vehicleId: string,
    payload: { category: string; description: string; amount: number; date: string }
  ) => {
    const target = vehicles.find((v) => v.id === vehicleId);
    await addGeneralExpense(vehicleId, effectiveUserId, {
      garageId: target?.garageId || activeGarageId || undefined,
      category: payload.category,
      description: payload.description,
      amount: payload.amount,
      date: payload.date,
    });
  };

  const handleDeleteQuickExpense = async (vehicleId: string, expenseId: string) => {
    await deleteGeneralExpense(vehicleId, expenseId);
  };

  const handleDeleteQuickRepair = async (vehicleId: string, repairId: string) => {
    await deleteRepairTask(vehicleId, repairId);
  };

  // Confirm sale cancellation (clears buyer & sale fields in Firestore/localStorage + sale history)
  const handleConfirmCancelSale = async () => {
    if (!cancelSaleTarget) return;
    const { vehicle: targetVehicle, targetStatus } = cancelSaleTarget;
    await cancelVehicleSale(targetVehicle.id, effectiveUserId, targetStatus);
    setCancelSaleTarget(null);
    showGlobalToast(
      pickLocalized(lang, {
        fr: 'Vente annulée. Les données acheteur ont été supprimées et le véhicule est remis en vente.',
        ru: 'Продажа отменена. Данные покупателя удалены, автомобиль возвращён в статус «В продаже».',
        hy: 'Վաճառքը չեղարկված է։ Գնորդի տվյալները ջնջվել են, մեքենան վերադարձվել է վաճառքի։',
        ka: 'გაყიდვა გაუქმებულია. მყიდველის მონაცემები წაშლილია, ავტომობილი დაბრუნდა გაყიდვაში.',
      })
    );
  };

  // Open sell modal
  const handleOpenSellModal = (vehicle: Vehicle) => {
    setSellingVehicle(vehicle);
    setIsBuyerModalOpen(true);
  };

  // Confirm sale (always preserves or freezes an immutable TransactionTaxSnapshot)
  const handleConfirmSale = async (
    vehicleId: string,
    buyerInfo: BuyerInfo,
    vehicleUpdates?: Partial<Vehicle>
  ) => {
    const targetVehicle = vehicles.find((v) => v.id === vehicleId);
    if (!targetVehicle) return;

    const settingsForGarage = getGarageSettings(targetVehicle.garageId || activeGarageId || undefined);
    const sellerProfile: AppUserProfileType =
      buyerInfo.sellerProfileType === 'particulier' || buyerInfo.sellerProfileType === 'micro_entrepreneur'
        ? buyerInfo.sellerProfileType
        : vehicleUpdates?.purchaseStatus === 'particulier' || targetVehicle.purchaseStatus === 'particulier'
        ? 'particulier'
        : 'micro_entrepreneur';
    const resolvedSellerProfileId =
      buyerInfo.sellerProfileId ||
      vehicleUpdates?.sellerProfileId ||
      targetVehicle.sellerProfileId;
    const effectiveSaleSettings = {
      ...settingsForGarage,
      ...buildProfileSettingsPatch(sellerProfile, settingsForGarage),
    };
    const isVatExemptSeller =
      sellerProfile === 'particulier' ||
      sellerProfile === 'micro_entrepreneur' ||
      effectiveSaleSettings.taxRegime === 'micro' ||
      effectiveSaleSettings.taxRegime === 'none';

    const submittedSnap = buyerInfo.taxSnapshot;
    const submittedSnapMatchesSeller =
      Boolean(submittedSnap?.isHistoricalSnapshot) &&
      (sellerProfile === 'particulier'
        ? submittedSnap?.taxRegime === 'none' || submittedSnap?.legalStatus === 'particulier'
        : submittedSnap?.taxRegime === 'micro' || submittedSnap?.legalStatus === 'micro_entreprise');

    const enrichedBuyerInfo: BuyerInfo = submittedSnapMatchesSeller
      ? {
          ...buyerInfo,
          sellerProfileType: sellerProfile,
          sellerProfileId: resolvedSellerProfileId,
        }
      : {
          ...buyerInfo,
          sellerProfileType: sellerProfile,
          sellerProfileId: resolvedSellerProfileId,
          vatRegime: isVatExemptSeller
            ? 'franchise_base'
            : buyerInfo.vatRegime || effectiveSaleSettings.frenchTaxConfig?.vatRegime || 'tva_marge',
          vatRatePercent: isVatExemptSeller
            ? 0
            : buyerInfo.vatRatePercent ?? effectiveSaleSettings.frenchTaxConfig?.vatRatePercent ?? 20,
          taxSnapshot: buildTransactionTaxSnapshot({
            salePrice: Number(buyerInfo.salePrice) || 0,
            purchasePrice: Number(targetVehicle.purchasePrice) || 0,
            repairCostTotal: Number(targetVehicle.repairCostTotal) || 0,
            generalExpensesTotal: Number(targetVehicle.generalExpensesTotal) || 0,
            settings: effectiveSaleSettings,
            vatRegimeOverride: isVatExemptSeller ? 'franchise_base' : buyerInfo.vatRegime,
            vatRateOverride: isVatExemptSeller ? 0 : buyerInfo.vatRatePercent,
          }),
        };

    const computedTotalInvested =
      Math.round(
        ((Number(targetVehicle.purchasePrice) || 0) +
          (Number(targetVehicle.repairCostTotal) || 0) +
          (Number(targetVehicle.generalExpensesTotal) || 0) +
          Number.EPSILON) *
          100
      ) / 100;

    const realizedSalePrice = Number(enrichedBuyerInfo.salePrice) || 0;
    const netProfit = enrichedBuyerInfo.taxSnapshot
      ? enrichedBuyerInfo.taxSnapshot.netProfitAfterTax
      : Math.round((realizedSalePrice - computedTotalInvested + Number.EPSILON) * 100) / 100;
    const marginPercentage =
      realizedSalePrice > 0
        ? Math.round(((netProfit / realizedSalePrice) * 100 + Number.EPSILON) * 100) / 100
        : 0;

    await updateVehicle(vehicleId, {
      ...(vehicleUpdates || {}),
      purchaseStatus: sellerProfile === 'particulier' ? 'particulier' : 'micro',
      sellerProfileId: resolvedSellerProfileId,
      status: 'sold',
      buyerInfo: enrichedBuyerInfo,
      totalInvested: computedTotalInvested,
      netProfit,
      marginPercentage,
    });

    const actor = userProfile?.email || user?.email || null;
    const label = `${targetVehicle.make} ${targetVehicle.model} (${vehicleUpdates?.registrationNumber || targetVehicle.registrationNumber || vehicleUpdates?.vin || targetVehicle.vin})`;
    void logUserActivity({
      userId: effectiveUserId,
      garageId: targetVehicle.garageId || activeGarageId,
      actorEmail: actor,
      action: 'vehicle_sold',
      entityType: 'vehicle',
      entityId: vehicleId,
      targetLabel: label,
      details: `${buyerInfo.fullName} · ${buyerInfo.salePrice} €`,
    });
    void logEntityChange({
      userId: effectiveUserId,
      garageId: targetVehicle.garageId || activeGarageId,
      actorEmail: actor,
      operation: 'update',
      entityType: 'vehicle',
      entityId: vehicleId,
      entityLabel: label,
      changes: [
        { field: 'status', oldValue: targetVehicle.status, newValue: 'sold' },
        { field: 'salePrice', oldValue: String(targetVehicle.buyerInfo?.salePrice || '—'), newValue: String(buyerInfo.salePrice) },
        { field: 'buyer', oldValue: targetVehicle.buyerInfo?.fullName || '—', newValue: buyerInfo.fullName },
      ],
    });
  };

  // Create or Update vehicle
  const handleSaveVehicle = async (data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>) => {
    const actor = userProfile?.email || user?.email || null;
    if (editingVehicle) {
      const preservedGarageId =
        data.garageId || editingVehicle.garageId || activeGarageId || undefined;
      const revertPlan = buildSoldRevertUpdate(editingVehicle, data.status, {
        ...data,
        ...(preservedGarageId ? { garageId: preservedGarageId } : {}),
      });
      await updateVehicle(editingVehicle.id, revertPlan.updates);
      const label = `${data.make} ${data.model} (${data.registrationNumber || data.vin})`;
      const diffs = computeEntityFieldDiffs(
        editingVehicle as unknown as Record<string, unknown>,
        data as unknown as Record<string, unknown>,
        ['make', 'model', 'trim', 'year', 'mileage', 'vin', 'registrationNumber', 'purchasePrice', 'targetSalePrice', 'status']
      );
      if (revertPlan.shouldClearBuyerInfo && editingVehicle.buyerInfo?.fullName) {
        diffs.push({
          field: 'buyer',
          oldValue: editingVehicle.buyerInfo.fullName,
          newValue: '—',
        });
      }
      void logUserActivity({
        userId: effectiveUserId,
        garageId: editingVehicle.garageId || activeGarageId,
        actorEmail: actor,
        action: 'vehicle_updated',
        entityType: 'vehicle',
        entityId: editingVehicle.id,
        targetLabel: label,
        details: `${diffs.length} champ(s) modifié(s)`,
      });
      if (diffs.length > 0) {
        void logEntityChange({
          userId: effectiveUserId,
          garageId: editingVehicle.garageId || activeGarageId,
          actorEmail: actor,
          operation: 'update',
          entityType: 'vehicle',
          entityId: editingVehicle.id,
          entityLabel: label,
          changes: diffs,
        });
      }
      setEditingVehicle(null);
    } else {
      if (
        !planCapabilities.isUnlimitedVehicles &&
        vehicles.length >= planCapabilities.vehicleLimit
      ) {
        const curName = currentPlanObj?.name || 'Starter';
        const nextName = upgradePlanObj?.name || 'Pro';
        setIsVehicleModalOpen(false);
        handleOpenUpgradePlan();
        showGlobalToast(
          pickLocalized(lang, {
            fr: `Limite atteinte (${planCapabilities.vehicleLimit} véhicules sur ${curName}). Passez à ${nextName}.`,
            ru: `Достигнут лимит тарифа ${curName} (${planCapabilities.vehicleLimit} авто). Перейдите на ${nextName}.`,
            hy: `${curName} սակագնի սահմանաչափը սպառվել է (${planCapabilities.vehicleLimit} մեքենա)։`,
            ka: `${curName} ტარიფის ლიმიტი ამოწურულია (${planCapabilities.vehicleLimit} ავტო).`,
          })
        );
        return;
      }
      const targetGarage = data.garageId || activeGarageId || DEFAULT_GARAGE_ID;
      const newId = await createVehicle({
        ...data,
        garageId: targetGarage,
      });
      const label = `${data.make} ${data.model} (${data.registrationNumber || data.vin || 'Nouveau'})`;
      if (newId) {
        void logUserActivity({
          userId: effectiveUserId,
          garageId: targetGarage,
          actorEmail: actor,
          action: 'vehicle_created',
          entityType: 'vehicle',
          entityId: newId,
          targetLabel: label,
          details: `${data.year} · ${data.purchasePrice} €`,
        });
        void logEntityChange({
          userId: effectiveUserId,
          garageId: targetGarage,
          actorEmail: actor,
          operation: 'create',
          entityType: 'vehicle',
          entityId: newId,
          entityLabel: label,
          changes: [
            { field: 'make', oldValue: '—', newValue: data.make },
            { field: 'model', oldValue: '—', newValue: data.model },
            { field: 'purchasePrice', oldValue: '—', newValue: `${data.purchasePrice} €` },
          ],
        });
      }
      if (newId) {
        const resolvedList = activeGarageId ? garageVehicles : vehicles;
        const immediateCreated = resolvePendingVehicleSelection(newId, resolvedList);
        if (immediateCreated) {
          setSelectedVehicle(immediateCreated);
          setPendingSelectedVehicleId(null);
        } else {
          setPendingSelectedVehicleId(newId);
        }
      }
      handleSetActiveView('desktop');
    }
  };

  // Delete vehicle
  const handleDeleteVehicle = async (vehicleId: string) => {
    const prev = vehicles.find((v) => v.id === vehicleId);
    await deleteVehicle(vehicleId);
    if (prev) {
      const actor = userProfile?.email || user?.email || null;
      const label = `${prev.make} ${prev.model} (${prev.registrationNumber || prev.vin})`;
      void logUserActivity({
        userId: effectiveUserId,
        garageId: prev.garageId || activeGarageId,
        actorEmail: actor,
        action: 'vehicle_deleted',
        entityType: 'vehicle',
        entityId: vehicleId,
        targetLabel: label,
      });
      void logEntityChange({
        userId: effectiveUserId,
        garageId: prev.garageId || activeGarageId,
        actorEmail: actor,
        operation: 'delete',
        entityType: 'vehicle',
        entityId: vehicleId,
        entityLabel: label,
        changes: [{ field: 'status', oldValue: prev.status, newValue: 'deleted' }],
      });
    }
    setPendingSelectedVehicleId(null);
    setSelectedVehicle(null);
  };

  const authLoading = !authReady;

  if (authLoading) {
    return (
      <div
        data-testid="auth-loading-screen"
        className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center text-[var(--foreground)] space-y-4 p-4"
      >
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
        <p className="text-sm font-semibold text-[var(--muted-foreground)]">
          Initialisation sécurisée d'AutoGarage Manager...
        </p>
      </div>
    );
  }

  if (!user && !isDemoMode) {
    return (
      <AuthModal
        variant="page"
        isOpen={true}
        initialMode={authInitialMode}
        onClose={() => {}}
        onDevSuperAdminLogin={handleDevSuperAdminLogin}
        onEnterDemoMode={handleEnterGuestDemo}
      />
    );
  }

  if (isAdminMode) {
    return (
      <div
        data-layout-mode="standalone-admin"
        className="min-h-screen flex bg-[var(--background)] text-[var(--foreground)] font-sans selection:bg-[var(--primary)] selection:text-[var(--primary-foreground)]"
      >
        <div className="flex-1 min-w-0">
          <AdminPanel
            isSuperAdmin={isSuperAdmin}
            currentUserUid={user?.uid || userProfile?.uid}
            systemConfig={systemConfig}
            theme={theme}
            onThemeChange={setTheme}
            onBackToApp={handleBackToGarageFromAdmin}
            onSignIn={() => setIsAuthModalOpen(true)}
            onOpenAlignerMode={() => setIsQuickAlignerOpen(true)}
          />
        </div>

        {/* Quick Aligner Mode triggered from Superadmin Cerfa configurator */}
        <Cerfa15776Modal
          isOpen={isQuickAlignerOpen}
          onClose={() => setIsQuickAlignerOpen(false)}
          vehicle={createDemoCerfaVehicle(effectiveUserId)}
          userId={effectiveUserId}
          activeGarageId={activeGarageId}
          isSuperAdmin={isSuperAdmin}
          initialAlignerMode={true}
          calibrationDummyMode={true}
        />

        {/* Auth Modal */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onDevSuperAdminLogin={handleDevSuperAdminLogin}
        />
      </div>
    );
  }

  const handleSidebarNavigate = (target: SidebarNavTarget) => {
    if (target === 'inventory') {
      setPendingSelectedVehicleId(null);
      setSelectedVehicle(null);
      handleSetActiveView('desktop');
    } else if (target === 'sold_vehicles') {
      setPendingSelectedVehicleId(null);
      setSelectedVehicle(null);
      handleSetActiveView('sold_vehicles');
    } else if (target === 'analytics' && effectiveFeatureFlags.expenseAnalytics) {
      handleSetActiveView('analytics');
    } else if (target === 'suppliers' && effectiveFeatureFlags.suppliersModule) {
      handleSetActiveView('suppliers');
    } else if (target === 'documents' && effectiveFeatureFlags.documentsModule) {
      setDocumentsAlignerMode(false);
      handleSetActiveView('documents');
    } else if (target === 'exports' && effectiveFeatureFlags.exportsBackup) {
      handleSetActiveView('exports');
    } else if (target === 'settings') {
      if (activeView !== 'settings') {
        setActiveSettingsTab('company');
      }
      handleSetActiveView('settings');
    } else if (target === 'admin') {
      handleSetActiveView('admin');
    }
  };

  const handleQuickCreateAction = (action: QuickCreateAction) => {
    const nonce = Date.now();
    if (action === 'vehicles') {
      if (
        !planCapabilities.isUnlimitedVehicles &&
        vehicles.length >= planCapabilities.vehicleLimit
      ) {
        handleOpenUpgradePlan();
        return;
      }
      setEditingVehicle(null);
      setSelectedVehicle(null);
      handleSetActiveView('new_vehicle');
      return;
    }

    if (action === 'purchases') {
      if (effectiveFeatureFlags.suppliersModule) {
        setSelectedVehicle(null);
        setSuppliersTabRequest({ tab: 'purchases', nonce });
        handleSetActiveView('suppliers');
      } else {
        setEditingVehicle(null);
        setSelectedVehicle(null);
        handleSetActiveView('new_vehicle');
      }
      return;
    }

    if (action === 'sales') {
      const target =
        (selectedVehicle && selectedVehicle.status !== 'sold' ? selectedVehicle : null) ||
        garageVehicles.find((v) => v.status === 'for_sale') ||
        garageVehicles.find((v) => v.status !== 'sold');
      if (target) {
        setPendingSelectedVehicleId(null);
        setSelectedVehicle(target);
        handleSetActiveView('desktop');
        handleOpenSellModal(target);
      } else {
        setSelectedVehicle(null);
        handleSetActiveView('desktop');
        showGlobalToast(
          pickLocalized(lang, {
            fr: 'Aucun véhicule disponible à la vente. Ajoutez d’abord un véhicule.',
            ru: 'Нет доступных непроданных автомобилей. Сначала добавьте автомобиль.',
            hy: 'Վաճառքի համար հասանելի մեքենա չկա։ Սկզբում ավելացրեք մեքենա։',
            ka: 'გასაყიდი ავტომობილი არ არის. ჯერ დაამატეთ ავტომობილი.',
          })
        );
      }
      return;
    }

    if (action === 'expenses') {
      const target =
        selectedVehicle ||
        garageVehicles.find((v) => v.status !== 'sold') ||
        garageVehicles[0];
      if (target) {
        setPendingSelectedVehicleId(null);
        setSelectedVehicle(target);
        setVehicleDetailTabRequest({ tab: 'expenses', nonce });
        handleSetActiveView('desktop');
      } else if (effectiveFeatureFlags.expenseAnalytics) {
        handleSetActiveView('analytics');
      } else {
        handleSetActiveView('new_vehicle');
      }
      return;
    }

    if (action === 'facturx') {
      if (effectiveFeatureFlags.exportsBackup) {
        setSelectedVehicle(null);
        setExportsTabRequest({ tab: 'facturx', nonce });
        handleSetActiveView('exports');
      } else if (effectiveFeatureFlags.documentsModule) {
        setSelectedVehicle(null);
        setDocumentsAlignerMode(false);
        handleSetActiveView('documents');
      } else {
        handleOpenUpgradePlan();
      }
      return;
    }

    if (action === 'clients') {
      if (effectiveFeatureFlags.suppliersModule) {
        setSelectedVehicle(null);
        setSuppliersTabRequest({ tab: 'suppliers', nonce });
        handleSetActiveView('suppliers');
      } else if (effectiveFeatureFlags.documentsModule) {
        setSelectedVehicle(null);
        setDocumentsAlignerMode(false);
        handleSetActiveView('documents');
      } else {
        handleOpenUpgradePlan();
      }
    }
  };

  const activeGarageRecord = garages.find((g) => g.id === activeGarageId) || null;

  const showInlineMobileNavTrigger =
    (activeView !== 'desktop' && activeView !== 'sold_vehicles') ||
    Boolean(selectedVehicle) ||
    Boolean(effectiveFeatureFlags.multiGarage && !activeGarageId);

  return (
    <div
      data-layout-mode="sidebar"
      className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans selection:bg-[var(--primary)] selection:text-[var(--primary-foreground)] flex"
    >
      {/* Left Collapsible Sidebar & Mobile Drawer */}
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        activeView={activeView}
        onNavigate={handleSidebarNavigate}
        soldVehiclesCount={soldGarageVehiclesCount}
        activeSettingsTab={activeSettingsTab}
        onSelectSettingsTab={setActiveSettingsTab}
        onExitSettings={() => handleSetActiveView(previousViewBeforeSettings)}
        garages={garages}
        activeGarageId={activeGarageId}
        onSelectGarage={handleSelectGarage}
        featureFlags={effectiveFeatureFlags}
        isSuperAdmin={isSuperAdmin}
        theme={theme}
        onThemeChange={setTheme}
        user={user}
        activeSessionEmail={userProfile?.email || null}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut}
        profileType={activeProfileType}
        planId={activePlanId}
        plans={subscriptionPlans}
        onOpenSubscription={handleOpenUpgradePlan}
      />

      {/* Workspace Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Global Top Header Bar aligned with Sidebar header (h-16 / 64px) */}
        <header
          data-testid="workspace-top-header"
          className="sticky top-0 z-30 h-16 shrink-0 border-b border-[var(--ag-header-border)] bg-[var(--ag-header-bg)]/95 text-[var(--ag-header-text)] backdrop-blur-md"
        >
          <div className="h-full max-w-6xl w-full mx-auto px-3.5 md:px-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                data-testid="top-header-mobile-menu-btn"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label={t('openNavMenu')}
                className="lg:hidden inline-flex items-center justify-center h-9 w-9 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)]/70 hover:bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] transition shrink-0 cursor-pointer"
              >
                <Menu className="w-4 h-4 text-[var(--primary)]" />
              </button>
              <span className="text-xs font-semibold text-[var(--muted-foreground)] truncate">
                {activeGarageRecord?.name || 'AutoGarage Manager'}
              </span>
            </div>

            <div
              data-testid="header-utility-controls"
              className="flex items-center gap-2 shrink-0"
            >
              <QuickCreateDropdown onSelectAction={handleQuickCreateAction} />

              <HeaderNotifications
                vehicles={activeGarageId ? garageVehicles : vehicles}
                activityLogs={garageActivityLogs}
                onSelectVehicleId={(vehicleId) => {
                  const target =
                    (activeGarageId ? garageVehicles : vehicles).find(
                      (v) => v.id === vehicleId
                    ) || vehicles.find((v) => v.id === vehicleId);
                  if (target) {
                    setPendingSelectedVehicleId(null);
                    setSelectedVehicle(target);
                    handleSetActiveView('desktop');
                  }
                }}
              />

              <HeaderLanguageDropdown />

              <button
                type="button"
                data-testid="header-theme-toggle-btn"
                aria-label={pickLocalized(lang, {
                  fr: theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre',
                  ru: theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему',
                  hy: theme === 'dark' ? 'Անցնել լուսավոր թեմայի' : 'Անցնել մուգ թեմայի',
                  ka: theme === 'dark' ? 'ღია თემაზე გადასვლა' : 'მუქ თემაზე გადასვლა',
                })}
                title={pickLocalized(lang, {
                  fr: theme === 'dark' ? 'Thème clair' : 'Thème sombre',
                  ru: theme === 'dark' ? 'Светлая тема' : 'Тёмная тема',
                  hy: theme === 'dark' ? 'Լուսավոր թեմա' : 'Մուգ թեմա',
                  ka: theme === 'dark' ? 'ღია თემა' : 'მუქი თემა',
                })}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="inline-flex items-center justify-center h-9 w-9 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)]/70 hover:bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--foreground)] transition cursor-pointer shrink-0"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-[var(--primary)]" />
                ) : (
                  <Moon className="w-4 h-4 text-[var(--primary)]" />
                )}
              </button>
            </div>
          </div>
        </header>

        {hasActiveDemoFleet({
          isDemoModeFlag: isDemoMode,
          isAuthenticated: Boolean(user),
          vehicles: activeGarageId ? garageVehicles : vehicles,
          suppliers: activeGarageId ? garageSuppliers : suppliers,
          documents: activeGarageId ? garageDocuments : documents,
        }) && (
          <DemoModeBanner
            isAuthenticated={Boolean(user)}
            onExitGuestDemo={() => handleExitGuestDemo('login')}
            onExitAuthenticatedDemo={handleClearAuthenticatedDemo}
          />
        )}

        {/* Main App Container */}
        <main className="flex-1 max-w-6xl w-full mx-auto p-3.5 md:p-5">
          {showInlineMobileNavTrigger && (
            <div className="lg:hidden flex items-center justify-between gap-2 mb-4">
              <button
                type="button"
                data-testid="sidebar-mobile-trigger"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label={t('openNavMenu')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] text-xs font-bold shadow-sm"
              >
                <Menu className="w-4 h-4 text-[var(--primary)]" />
                <span>{t('navSectionLabel')}</span>
              </button>

              {activeView === 'settings' && (
                <button
                  type="button"
                  data-testid="settings-mobile-back-btn"
                  onClick={() => handleSetActiveView(previousViewBeforeSettings)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--ag-button-radius)] bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] text-xs font-semibold shadow-sm"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  <span>
                    {pickLocalized(lang, {
                      fr: 'Retour',
                      ru: 'В приложение',
                      hy: 'Վերադառնալ',
                      ka: 'დაბრუნება',
                    })}
                  </span>
                </button>
              )}
            </div>
          )}

          {hasOpenGarageWorkspace(effectiveFeatureFlags.multiGarage, activeGarageId) &&
          activeView === 'analytics' &&
          effectiveFeatureFlags.expenseAnalytics ? (
            <AnalyticsView
              vehicles={activeGarageId ? garageVehicles : vehicles}
              featureFlags={effectiveFeatureFlags}
              activeGarageId={activeGarageId}
              profileType={activeProfileType}
              onSelectVehicle={(v) => {
                setPendingSelectedVehicleId(null);
                setSelectedVehicle(v);
                handleSetActiveView('desktop');
              }}
            />
          ) : hasOpenGarageWorkspace(effectiveFeatureFlags.multiGarage, activeGarageId) &&
            activeView === 'suppliers' &&
            effectiveFeatureFlags.suppliersModule ? (
            <SuppliersView
              vehicles={activeGarageId ? garageVehicles : vehicles}
              suppliers={garageSuppliers}
              purchases={garagePurchases}
              userId={effectiveUserId}
              activeGarageId={activeGarageId}
              onSelectVehicle={(v) => {
                setPendingSelectedVehicleId(null);
                setSelectedVehicle(v);
                handleSetActiveView('desktop');
              }}
              onSeedSuppliers={handleSeedSuppliers}
              requestedTab={suppliersTabRequest}
            />
          ) : hasOpenGarageWorkspace(effectiveFeatureFlags.multiGarage, activeGarageId) &&
            activeView === 'documents' &&
            effectiveFeatureFlags.documentsModule ? (
            documentsAlignerMode && effectiveFeatureFlags.cerfaGenerator ? (
              <Cerfa15776Modal
                variant="page"
                isOpen={true}
                onClose={() => {
                  setDocumentsAlignerMode(false);
                }}
                vehicle={
                  selectedVehicle ||
                  garageVehicles[0] ||
                  vehicles[0] ||
                  createDemoCerfaVehicle(effectiveUserId)
                }
                vehicles={garageVehicles.length > 0 ? garageVehicles : vehicles}
                userId={effectiveUserId}
                activeGarageId={activeGarageId}
                isSuperAdmin={isSuperAdmin}
                initialAlignerMode={false}
                canUseCerfaAutofill={planCapabilities.canUseCerfaAutofillAll}
                onSaveVehicleFields={async (vehicleId, patch) => {
                  await updateVehicle(vehicleId, patch);
                }}
                onValidationToast={showGlobalToast}
              />
            ) : (
              <DocumentsView
                vehicles={activeGarageId ? garageVehicles : vehicles}
                purchases={garagePurchases}
                documents={garageDocuments}
                historyEvents={garageDocumentHistory}
                userId={effectiveUserId}
                userEmail={userProfile?.email || user?.email || null}
                activeGarageId={activeGarageId}
                onSelectVehicle={(v) => {
                  setPendingSelectedVehicleId(null);
                  setSelectedVehicle(v);
                  handleSetActiveView('desktop');
                }}
                onSeedDocuments={handleSeedDocuments}
                onOpenCerfaGenerator={
                  effectiveFeatureFlags.cerfaGenerator
                    ? (v) => {
                        if (v) setSelectedVehicle(v);
                        setDocumentsAlignerMode(true);
                      }
                    : undefined
                }
              />
            )
          ) : hasOpenGarageWorkspace(effectiveFeatureFlags.multiGarage, activeGarageId) &&
            activeView === 'exports' &&
            effectiveFeatureFlags.exportsBackup ? (
            <ExportsBackupView
              vehicles={activeGarageId ? garageVehicles : vehicles}
              suppliers={garageSuppliers}
              purchases={garagePurchases}
              documents={garageDocuments}
              documentHistory={garageDocumentHistory}
              activityLogs={garageActivityLogs}
              changeLogs={garageChangeLogs}
              backupSnapshots={garageBackupSnapshots}
              userId={effectiveUserId}
              userEmail={userProfile?.email || user?.email || null}
              activeGarageId={activeGarageId}
              profileType={activeProfileType}
              onNavigateSettings={() => handleSetActiveView('settings')}
              requestedTab={exportsTabRequest}
            />
          ) : activeView === 'settings' ? (
            <Settings
              key={activeGarageId || DEFAULT_GARAGE_ID}
              variant="page"
              isOpen={true}
              activeTab={activeSettingsTab}
              onTabChange={setActiveSettingsTab}
              onClose={() => handleSetActiveView(previousViewBeforeSettings)}
              userId={effectiveUserId}
              userProfile={userProfile}
              subscriptionPlans={subscriptionPlans}
              allVehiclesCount={vehicles.length}
              activeGarageId={activeGarageId}
              vehicles={garageVehicles}
              repairs={fleetRepairs}
              expenses={fleetExpenses}
              purchases={garagePurchases}
              theme={theme}
              onThemeChange={setTheme}
              onPlanUpdated={(updated) => setUserProfile(updated)}
              onSubscriptionToast={showGlobalToast}
              onOpenAlignerMode={() => {
                if (effectiveFeatureFlags.cerfaGenerator) {
                  setDocumentsAlignerMode(true);
                  handleSetActiveView('documents');
                } else {
                  setIsQuickAlignerOpen(true);
                }
              }}
              userEmail={userProfile?.email || user?.email || null}
              userRole={isSuperAdmin ? 'superadmin' : (userProfile?.role || 'user')}
              onSettingsSaved={() => {
                setSettingsVersion((n) => n + 1);
              }}
            />
          ) : effectiveFeatureFlags.multiGarage && !activeGarageId ? (
            <GarageSelector
              garages={garages}
              allVehicles={vehicles}
              onSelectGarage={handleSelectGarage}
              onCreateGarage={handleCreateGarage}
              onUpdateGarage={handleUpdateGarage}
              onDeleteGarage={handleDeleteGarage}
            />
          ) : hasOpenGarageWorkspace(effectiveFeatureFlags.multiGarage, activeGarageId) &&
            activeView === 'new_vehicle' ? (
            <AddVehiclePage
              userId={effectiveUserId}
              activeGarageId={activeGarageId}
              defaultPurchaseStatus="micro"
              suppliers={garageSuppliers}
              onBack={() => handleSetActiveView('desktop')}
              onSubmit={handleSaveVehicle}
              onValidationToast={showGlobalToast}
            />
          ) : selectedVehicle ? (
            <VehicleDetail
              vehicle={selectedVehicle}
              onBack={() => {
                setPendingSelectedVehicleId(null);
                setSelectedVehicle(null);
              }}
              onOpenEdit={(v) => {
                setEditingVehicle(v);
                setIsVehicleModalOpen(true);
              }}
              onOpenSellModal={handleOpenSellModal}
              onRequestCancelSale={(v, targetStatus = 'for_sale') =>
                setCancelSaleTarget({ vehicle: v, targetStatus })
              }
              onDeleteVehicle={handleDeleteVehicle}
              userId={effectiveUserId}
              userEmail={userProfile?.email || user?.email || null}
              activeGarageId={activeGarageId}
              documents={garageDocuments}
              documentHistory={garageDocumentHistory}
              purchases={garagePurchases}
              vehicles={activeGarageId ? garageVehicles : vehicles}
              featureFlags={effectiveFeatureFlags}
              profileType={activeProfileType}
              onValidationToast={showGlobalToast}
              requestedTab={vehicleDetailTabRequest}
            />
          ) : (
            <VehicleList
              key={activeView === 'sold_vehicles' ? 'sold' : 'active'}
              inventoryScope={activeView === 'sold_vehicles' ? 'sold' : 'active'}
              vehicles={garageVehicles}
              repairs={fleetRepairs}
              expenses={fleetExpenses}
              profileType={activeProfileType}
              onSelectVehicle={(v) => {
                setPendingSelectedVehicleId(null);
                setSelectedVehicle(v);
              }}
              onEditVehicle={(v) => {
                setEditingVehicle(v);
                setIsVehicleModalOpen(true);
              }}
              onNewVehicle={() => {
                if (
                  !planCapabilities.isUnlimitedVehicles &&
                  vehicles.length >= planCapabilities.vehicleLimit
                ) {
                  handleOpenUpgradePlan();
                  return;
                }
                setEditingVehicle(null);
                setSelectedVehicle(null);
                handleSetActiveView('new_vehicle');
              }}
              onQuickStatusChange={handleQuickStatusChange}
              onQuickToggleField={handleQuickToggleField}
              onAddQuickExpense={handleAddQuickExpense}
              onDeleteQuickExpense={handleDeleteQuickExpense}
              onDeleteQuickRepair={handleDeleteQuickRepair}
              onOpenSellModal={handleOpenSellModal}
              onOpenCerfa={effectiveFeatureFlags.cerfaGenerator ? (v) => setCerfaVehicle(v) : undefined}
              onSeedData={handleSeedData}
              isSeeding={isSeeding}
              featureFlags={effectiveFeatureFlags}
              onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
              vehicleLimit={planCapabilities.isUnlimitedVehicles ? 9999 : planCapabilities.vehicleLimit}
              totalOwnedVehiclesCount={vehicles.length}
              currentPlanName={currentPlanObj?.name}
              upgradePlanName={upgradePlanObj?.name}
              onOpenUpgradePlan={handleOpenUpgradePlan}
            />
          )}
        </main>
      </div>

      {/* Vehicle Add / Edit Modal */}
      <VehicleModal
        isOpen={isVehicleModalOpen}
        onClose={() => {
          setIsVehicleModalOpen(false);
          setEditingVehicle(null);
        }}
        onSubmit={handleSaveVehicle}
        initialVehicle={editingVehicle}
        userId={effectiveUserId}
        activeGarageId={activeGarageId}
        defaultPurchaseStatus="micro"
        onValidationToast={showGlobalToast}
      />

      {/* Buyer Info & Sale Closing Modal */}
      <BuyerModal
        isOpen={isBuyerModalOpen}
        onClose={() => {
          setIsBuyerModalOpen(false);
          setSellingVehicle(null);
        }}
        vehicle={sellingVehicle}
        garageSettings={getGarageSettings(sellingVehicle?.garageId || activeGarageId || undefined)}
        profileType={activeProfileType}
        onConfirmSale={handleConfirmSale}
        onValidationToast={showGlobalToast}
      />

      {/* Cancel Sale Confirmation Modal */}
      <CancelSaleConfirmModal
        isOpen={Boolean(cancelSaleTarget)}
        vehicle={cancelSaleTarget?.vehicle || null}
        targetStatus={cancelSaleTarget?.targetStatus || 'for_sale'}
        onConfirm={handleConfirmCancelSale}
        onClose={() => setCancelSaleTarget(null)}
      />

      {/* Quick Cerfa Preview Modal fallback when Documents page mode is off */}
      <Cerfa15776Modal
        isOpen={isQuickAlignerOpen}
        onClose={() => setIsQuickAlignerOpen(false)}
        vehicle={selectedVehicle || vehicles[0] || createDemoCerfaVehicle(effectiveUserId)}
        userId={effectiveUserId}
        activeGarageId={activeGarageId}
        isSuperAdmin={isSuperAdmin}
        onValidationToast={showGlobalToast}
      />

      {/* Quick Cerfa 15776*02 Modal from List View */}
      {cerfaVehicle && (
        <Cerfa15776Modal
          isOpen={true}
          onClose={() => setCerfaVehicle(null)}
          vehicle={cerfaVehicle}
          userId={effectiveUserId}
          activeGarageId={activeGarageId}
          isSuperAdmin={isSuperAdmin}
          canUseCerfaAutofill={planCapabilities.canUseCerfaAutofillAll}
          onValidationToast={showGlobalToast}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onDevSuperAdminLogin={handleDevSuperAdminLogin}
      />

      {/* Global Confirmation & Validation Toast */}
      {globalToast && (() => {
        const isValidationAlert =
          /Cerfa|обязательн|obligatoires|պարտադիր|სავალდებულო|Limite atteinte|Достигнут лимит/i.test(
            globalToast
          );
        return (
          <div
            role={isValidationAlert ? 'alert' : 'status'}
            aria-live={isValidationAlert ? 'assertive' : 'polite'}
            data-testid="app-global-toast"
            className={`fixed bottom-4 right-4 z-[60] max-w-md bg-[var(--card)] text-[var(--foreground)] rounded-[var(--ag-card-radius)] px-4 py-3 shadow-2xl flex items-center gap-2.5 text-xs font-semibold border ${
              isValidationAlert
                ? 'border-red-500/80 ring-2 ring-red-500/20'
                : 'border-[var(--primary)]/50'
            }`}
          >
            {isValidationAlert ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[var(--success)] shrink-0" />
            )}
            <span>{globalToast}</span>
          </div>
        );
      })()}
    </div>
  );
}
