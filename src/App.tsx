import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar, SidebarNavTarget } from './components/Sidebar';
import { VehicleList } from './components/VehicleList';
import { VehicleDetail } from './components/VehicleDetail';
import { VehicleModal } from './components/VehicleModal';
import { BuyerModal } from './components/BuyerModal';
import { Settings, SettingsTab } from './components/Settings';
import { Cerfa15776Modal } from './components/Cerfa15776Modal';
import { AnalyticsView } from './components/AnalyticsView';
import { SuppliersView } from './components/SuppliersView';
import { DocumentsView } from './components/DocumentsView';
import { ExportsBackupView } from './components/ExportsBackupView';
import { AdminPanel } from './components/AdminPanel';
import { AuthModal } from './components/AuthModal';
import { GarageSelector } from './components/GarageSelector';
import { Vehicle, VehicleStatus, BuyerInfo, UserProfile, SystemThemeConfig, GarageWorkspace, FeatureFlagsConfig, UserLayoutPreference, Supplier, Purchase, GarageDocument, DocumentHistoryEvent, UserActivityLog, ChangeLogEntry, BackupSnapshotRecord, LegalStatus, TaxRegime, RepairTask, GeneralExpense } from './types/garage';
import {
  auth,
  onAuthStateChanged,
  signOut,
  User,
} from './services/firebase';
import {
  subscribeVehicles,
  subscribeGarages,
  subscribeAllFleetExpensesAndRepairs,
  createGarage,
  getGarageSettings,
  setActiveGarageId as persistActiveGarageId,
  fetchGarageSettingsFromCloud,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  seedDemoGarageData,
} from './services/garageService';
import { buildTransactionTaxSnapshot } from './utils/frenchTaxEngine';
import {
  ensureAndGetUserProfile,
  subscribeCerfaTemplatesCalibration,
  subscribeFeatureFlags,
  subscribeSystemThemeConfig,
} from './services/adminService';
import {
  applySystemThemeVariables,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_SYSTEM_THEME_CONFIG,
  isSuperAdminUser,
  parseUserLayoutPreference,
  resolveEffectiveLayoutMode,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  USER_LAYOUT_MODE_STORAGE_KEY,
} from './utils/adminUtils';
import {
  DEFAULT_GARAGE_ID,
  filterVehiclesByGarage,
} from './utils/garageUtils';
import {
  subscribeSuppliers,
  subscribePurchases,
  seedDemoSuppliersAndPurchases,
} from './services/supplierService';
import {
  filterSuppliersByGarage,
  filterPurchasesByGarage,
} from './utils/suppliers';
import {
  subscribeDocuments,
  subscribeDocumentHistory,
  seedDemoDocuments,
} from './services/documentService';
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
import { ArrowLeft, Loader2, Menu } from 'lucide-react';
import { useI18n } from './i18n/I18nContext';
import { pickLocalized } from './utils/i18nUtils';

export type ActiveAppView = 'desktop' | 'analytics' | 'suppliers' | 'documents' | 'exports' | 'settings' | 'admin';

const isAdminUrl = (): boolean => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('view') === 'admin' ||
    params.get('mode') === 'admin' ||
    window.location.pathname === '/admin'
  );
};

export default function App() {
  const { lang, t } = useI18n();
  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => isAdminUrl());
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemThemeConfig>(DEFAULT_SYSTEM_THEME_CONFIG);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagsConfig>(DEFAULT_FEATURE_FLAGS);
  const [authReady, setAuthReady] = useState(false);
  const [garages, setGarages] = useState<GarageWorkspace[]>([]);
  const [activeGarageId, setActiveGarageId] = useState<string | null>(null);
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
  const [activeView, setActiveView] = useState<ActiveAppView>(() =>
    isAdminUrl() ? 'admin' : 'desktop'
  );
  const [previousViewBeforeSettings, setPreviousViewBeforeSettings] =
    useState<Exclude<ActiveAppView, 'settings'>>('desktop');
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('company');

  // Dual-Layout Architecture state (Classic Top-Nav vs Modern Sidebar Layout)
  const [userLayoutPreference, setUserLayoutPreference] = useState<UserLayoutPreference>(() => {
    try {
      return parseUserLayoutPreference(localStorage.getItem(USER_LAYOUT_MODE_STORAGE_KEY));
    } catch {
      return 'global';
    }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const effectiveLayoutMode = useMemo(
    () =>
      resolveEffectiveLayoutMode({
        userPreference: userLayoutPreference,
        systemLayoutMode: systemConfig.layoutMode,
      }),
    [userLayoutPreference, systemConfig.layoutMode]
  );

  const handleLayoutPreferenceChange = (pref: UserLayoutPreference) => {
    setUserLayoutPreference(pref);
    try {
      if (pref === 'global') {
        localStorage.removeItem(USER_LAYOUT_MODE_STORAGE_KEY);
      } else {
        localStorage.setItem(USER_LAYOUT_MODE_STORAGE_KEY, pref);
      }
    } catch {
      // ignore
    }
  };

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
  const [isQuickAlignerOpen, setIsQuickAlignerOpen] = useState(false);
  const [documentsAlignerMode, setDocumentsAlignerMode] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [cerfaVehicle, setCerfaVehicle] = useState<Vehicle | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
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

  // Sync /admin or ?view=admin URL path
  const handleSetActiveView = (view: ActiveAppView) => {
    if (view === 'settings' && activeView !== 'settings') {
      setPreviousViewBeforeSettings(activeView as Exclude<ActiveAppView, 'settings'>);
    }
    if (view !== 'documents') {
      setDocumentsAlignerMode(false);
    }
    setIsAdminMode(view === 'admin');
    setActiveView(view);
    if (typeof window !== 'undefined') {
      const targetUrl = view === 'admin' ? `${window.location.origin}/?view=admin` : '/';
      const currentFull = `${window.location.pathname}${window.location.search}`;
      if (
        (view === 'admin' && !isAdminUrl()) ||
        (view !== 'admin' && (currentFull !== '/' || isAdminUrl()))
      ) {
        window.history.pushState({}, '', targetUrl);
      }
    }
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
      setIsAdminMode(admin);
      setActiveView(admin ? 'admin' : 'desktop');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Subscribe to global system theme config, feature flags, and Cerfa field calibration
  useEffect(() => {
    const unsubTheme = subscribeSystemThemeConfig((cfg) => {
      setSystemConfig(cfg);
    });
    const unsubFlags = subscribeFeatureFlags((flags) => {
      setFeatureFlags(flags);
    });
    const unsubCerfa = subscribeCerfaTemplatesCalibration(() => {});
    return () => {
      unsubTheme();
      unsubFlags();
      unsubCerfa();
    };
  }, []);

  // Enforce multiGarage & expenseAnalytics guards
  useEffect(() => {
    if (!featureFlags.multiGarage && !activeGarageId) {
      setActiveGarageId(DEFAULT_GARAGE_ID);
      persistActiveGarageId(DEFAULT_GARAGE_ID);
    }
    if (!featureFlags.expenseAnalytics && activeView === 'analytics') {
      setActiveView('desktop');
    }
  }, [featureFlags.multiGarage, featureFlags.expenseAnalytics, activeGarageId, activeView]);

  // Initialize Auth & RBAC Profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      const profile = await ensureAndGetUserProfile(currentUser);
      setUserProfile(profile);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const isSuperAdmin = isSuperAdminUser({
    email: user?.email,
    emailVerified: user?.emailVerified,
    profile: userProfile,
  });

  const handleDevSuperAdminLogin = (profile: UserProfile) => {
    try {
      localStorage.setItem('autogarage_current_user_profile', JSON.stringify(profile));
    } catch {
      // ignore
    }
    setUserProfile(profile);
  };

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('autogarage_current_user_profile');
    } catch {
      // ignore
    }
    setUserProfile(null);
    if (auth.currentUser) {
      await signOut(auth);
    }
  };

  const effectiveUserId = user?.uid || 'garage_pro_dealer';

  // Subscribe to garages (main garage workspace only)
  useEffect(() => {
    if (!authReady || isAdminMode) return;
    const unsubscribe = subscribeGarages(effectiveUserId, (list) => {
      setGarages(list);
    });
    return () => unsubscribe();
  }, [authReady, isAdminMode, effectiveUserId]);

  // Sync activeGarageId with garageService for per-garage Cerfa & Settings isolation
  const handleSelectGarage = (garageId: string | null) => {
    setActiveGarageId(garageId);
    setSelectedVehicle(null);
    persistActiveGarageId(garageId);
    if (garageId && user?.uid) {
      fetchGarageSettingsFromCloud(user.uid, garageId)
        .then((cloudSettings) => {
          if (cloudSettings.layoutMode && !localStorage.getItem(USER_LAYOUT_MODE_STORAGE_KEY)) {
            setUserLayoutPreference(parseUserLayoutPreference(cloudSettings.layoutMode));
          }
        })
        .catch(() => {});
    }
    if (garageId && activeView === 'admin') {
      handleSetActiveView('desktop');
    }
  };

  const handleCreateGarage = async (input: {
    name: string;
    entityType: 'morale' | 'physique';
    legalStatus?: LegalStatus;
    city?: string;
    siret?: string;
    taxRegime?: TaxRegime;
    taxRatePercent?: number;
  }) => {
    const created = await createGarage(effectiveUserId, input);
    handleSelectGarage(created.id);
  };

  // Subscribe to real-time vehicles (main garage workspace only)
  useEffect(() => {
    if (!authReady || isAdminMode) return;

    const unsubscribe = subscribeVehicles(effectiveUserId, (data) => {
      setVehicles(data);

      // Keep selected vehicle in sync if updated
      setSelectedVehicle((prev) => {
        if (!prev) return null;
        return data.find((v) => v.id === prev.id) || null;
      });
    });

    return () => unsubscribe();
  }, [authReady, isAdminMode, effectiveUserId]);

  // Subscribe to all fleet repair tasks and general expenses for accurate Active Inventory financial totals
  useEffect(() => {
    if (!authReady || isAdminMode || vehicles.length === 0) {
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
  }, [authReady, isAdminMode, vehicles]);

  // Subscribe to real-time suppliers, purchases, documents & document history
  useEffect(() => {
    if (!authReady || isAdminMode) return;
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
  }, [authReady, isAdminMode, effectiveUserId]);

  // Strictly isolated vehicles for the active garage
  const garageVehicles = useMemo(() => {
    if (!activeGarageId) return [];
    return filterVehiclesByGarage(vehicles, activeGarageId);
  }, [vehicles, activeGarageId]);

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
  };

  // Seed demo data handler (scoped to active garage)
  const handleSeedData = async () => {
    try {
      setIsSeeding(true);
      const targetGarageId = activeGarageId || DEFAULT_GARAGE_ID;
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
    } catch (err) {
      console.error('Seed demo error:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  // Quick status change
  const handleQuickStatusChange = async (vehicleId: string, newStatus: VehicleStatus) => {
    const prev = vehicles.find((v) => v.id === vehicleId);
    await updateVehicle(vehicleId, { status: newStatus });
    if (prev && prev.status !== newStatus) {
      const actor = userProfile?.email || user?.email || null;
      const label = `${prev.make} ${prev.model} (${prev.registrationNumber || prev.vin})`;
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
        changes: [{ field: 'status', oldValue: prev.status, newValue: newStatus }],
      });
    }
  };

  // Open sell modal
  const handleOpenSellModal = (vehicle: Vehicle) => {
    setSellingVehicle(vehicle);
    setIsBuyerModalOpen(true);
  };

  // Confirm sale (always preserves or freezes an immutable TransactionTaxSnapshot)
  const handleConfirmSale = async (vehicleId: string, buyerInfo: BuyerInfo) => {
    const targetVehicle = vehicles.find((v) => v.id === vehicleId);
    if (!targetVehicle) return;

    const settingsForGarage = getGarageSettings(targetVehicle.garageId || activeGarageId || undefined);
    const enrichedBuyerInfo: BuyerInfo = buyerInfo.taxSnapshot?.isHistoricalSnapshot
      ? buyerInfo
      : {
          ...buyerInfo,
          vatRegime: buyerInfo.vatRegime || settingsForGarage.frenchTaxConfig?.vatRegime || 'tva_marge',
          vatRatePercent:
            buyerInfo.vatRatePercent ?? settingsForGarage.frenchTaxConfig?.vatRatePercent ?? 20,
          taxSnapshot: buildTransactionTaxSnapshot({
            salePrice: Number(buyerInfo.salePrice) || 0,
            purchasePrice: Number(targetVehicle.purchasePrice) || 0,
            repairCostTotal: Number(targetVehicle.repairCostTotal) || 0,
            generalExpensesTotal: Number(targetVehicle.generalExpensesTotal) || 0,
            settings: settingsForGarage,
            vatRegimeOverride: buyerInfo.vatRegime,
            vatRateOverride: buyerInfo.vatRatePercent,
          }),
        };

    const netProfit = Number(enrichedBuyerInfo.salePrice) - (targetVehicle.totalInvested || 0);
    const marginPercentage =
      Number(enrichedBuyerInfo.salePrice) > 0
        ? (netProfit / Number(enrichedBuyerInfo.salePrice)) * 100
        : 0;

    await updateVehicle(vehicleId, {
      status: 'sold',
      buyerInfo: enrichedBuyerInfo,
      netProfit,
      marginPercentage,
    });

    const actor = userProfile?.email || user?.email || null;
    const label = `${targetVehicle.make} ${targetVehicle.model} (${targetVehicle.registrationNumber || targetVehicle.vin})`;
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
      await updateVehicle(editingVehicle.id, data);
      const label = `${data.make} ${data.model} (${data.registrationNumber || data.vin})`;
      const diffs = computeEntityFieldDiffs(
        editingVehicle as unknown as Record<string, unknown>,
        data as unknown as Record<string, unknown>,
        ['make', 'model', 'trim', 'year', 'mileage', 'vin', 'registrationNumber', 'purchasePrice', 'targetSalePrice', 'status']
      );
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
      const targetGarage = activeGarageId || DEFAULT_GARAGE_ID;
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
      const created = vehicles.find((v) => v.id === newId);
      if (created) setSelectedVehicle(created);
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
    setSelectedVehicle(null);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center text-[var(--foreground)] space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
        <p className="text-sm font-semibold text-[var(--muted-foreground)]">
          Initialisation sécurisée d'AutoGarage Manager...
        </p>
      </div>
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
            onGlobalLayoutChanged={() => handleLayoutPreferenceChange('global')}
          />
        </div>

        {/* Quick Aligner Mode triggered from Superadmin Cerfa configurator */}
        <Cerfa15776Modal
          isOpen={isQuickAlignerOpen}
          onClose={() => setIsQuickAlignerOpen(false)}
          vehicle={createDemoCerfaVehicle(effectiveUserId)}
          userId={effectiveUserId}
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
      setSelectedVehicle(null);
      handleSetActiveView('desktop');
    } else if (target === 'analytics') {
      handleSetActiveView('analytics');
    } else if (target === 'suppliers') {
      handleSetActiveView('suppliers');
    } else if (target === 'documents') {
      setDocumentsAlignerMode(false);
      handleSetActiveView('documents');
    } else if (target === 'exports') {
      handleSetActiveView('exports');
    } else if (target === 'settings') {
      handleSetActiveView('settings');
    } else if (target === 'admin') {
      handleSetActiveView('admin');
    }
  };

  const showInlineMobileNavTrigger =
    activeView !== 'desktop' ||
    Boolean(selectedVehicle) ||
    Boolean(featureFlags.multiGarage && !activeGarageId);

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
        activeSettingsTab={activeSettingsTab}
        onSelectSettingsTab={setActiveSettingsTab}
        onExitSettings={() => handleSetActiveView(previousViewBeforeSettings)}
        garages={garages}
        activeGarageId={activeGarageId}
        onSelectGarage={handleSelectGarage}
        featureFlags={featureFlags}
        isSuperAdmin={isSuperAdmin}
        theme={theme}
        onThemeChange={setTheme}
        user={user}
        activeSessionEmail={userProfile?.email || null}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Workspace Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Main App Container */}
        <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6">
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
                <span>
                  {activeView === 'settings'
                    ? pickLocalized(lang, {
                        fr: 'Menu paramètres',
                        ru: 'Разделы настроек',
                        hy: 'Կարգավորումներ',
                        ka: 'პარამეტრების მენიუ',
                      })
                    : t('navSectionLabel')}
                </span>
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

          {activeView === 'analytics' && featureFlags.expenseAnalytics ? (
            <AnalyticsView
              vehicles={activeGarageId ? garageVehicles : vehicles}
              featureFlags={featureFlags}
              onSelectVehicle={(v) => {
                setSelectedVehicle(v);
                handleSetActiveView('desktop');
              }}
            />
          ) : activeView === 'suppliers' ? (
            <SuppliersView
              vehicles={activeGarageId ? garageVehicles : vehicles}
              suppliers={garageSuppliers}
              purchases={garagePurchases}
              userId={effectiveUserId}
              activeGarageId={activeGarageId}
              onSelectVehicle={(v) => {
                setSelectedVehicle(v);
                handleSetActiveView('desktop');
              }}
              onSeedSuppliers={handleSeedSuppliers}
            />
          ) : activeView === 'documents' ? (
            documentsAlignerMode && featureFlags.cerfaGenerator ? (
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
                isSuperAdmin={isSuperAdmin}
                initialAlignerMode={false}
                onSaveVehicleFields={async (vehicleId, patch) => {
                  await updateVehicle(vehicleId, patch);
                }}
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
                  setSelectedVehicle(v);
                  handleSetActiveView('desktop');
                }}
                onSeedDocuments={handleSeedDocuments}
                onOpenCerfaGenerator={
                  featureFlags.cerfaGenerator
                    ? (v) => {
                        if (v) setSelectedVehicle(v);
                        setDocumentsAlignerMode(true);
                      }
                    : undefined
                }
              />
            )
          ) : activeView === 'exports' ? (
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
              onNavigateSettings={() => handleSetActiveView('settings')}
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
              vehicles={garageVehicles}
              theme={theme}
              onThemeChange={setTheme}
              onOpenAlignerMode={() => {
                if (featureFlags.cerfaGenerator) {
                  setDocumentsAlignerMode(true);
                  handleSetActiveView('documents');
                } else {
                  setIsQuickAlignerOpen(true);
                }
              }}
              userEmail={userProfile?.email || user?.email || null}
              userRole={isSuperAdmin ? 'superadmin' : (userProfile?.role || 'user')}
              layoutPreference={userLayoutPreference}
              effectiveLayoutMode={effectiveLayoutMode}
              globalLayoutMode={systemConfig.layoutMode || 'sidebar'}
              onLayoutPreferenceChange={handleLayoutPreferenceChange}
            />
          ) : featureFlags.multiGarage && !activeGarageId ? (
            <GarageSelector
              garages={garages}
              allVehicles={vehicles}
              onSelectGarage={handleSelectGarage}
              onCreateGarage={handleCreateGarage}
            />
          ) : selectedVehicle ? (
            <VehicleDetail
              vehicle={selectedVehicle}
              onBack={() => setSelectedVehicle(null)}
              onOpenEdit={(v) => {
                setEditingVehicle(v);
                setIsVehicleModalOpen(true);
              }}
              onOpenSellModal={handleOpenSellModal}
              onDeleteVehicle={handleDeleteVehicle}
              userId={effectiveUserId}
              featureFlags={featureFlags}
            />
          ) : (
            <VehicleList
              vehicles={garageVehicles}
              repairs={fleetRepairs}
              expenses={fleetExpenses}
              onSelectVehicle={(v) => setSelectedVehicle(v)}
              onEditVehicle={(v) => {
                setEditingVehicle(v);
                setIsVehicleModalOpen(true);
              }}
              onNewVehicle={() => {
                setEditingVehicle(null);
                setIsVehicleModalOpen(true);
              }}
              onQuickStatusChange={handleQuickStatusChange}
              onOpenSellModal={handleOpenSellModal}
              onOpenCerfa={featureFlags.cerfaGenerator ? (v) => setCerfaVehicle(v) : undefined}
              onSeedData={handleSeedData}
              isSeeding={isSeeding}
              featureFlags={featureFlags}
              onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
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
        onConfirmSale={handleConfirmSale}
      />

      {/* Quick Cerfa Preview Modal fallback when Documents page mode is off */}
      <Cerfa15776Modal
        isOpen={isQuickAlignerOpen}
        onClose={() => setIsQuickAlignerOpen(false)}
        vehicle={selectedVehicle || vehicles[0] || createDemoCerfaVehicle(effectiveUserId)}
        userId={effectiveUserId}
        isSuperAdmin={isSuperAdmin}
      />

      {/* Quick Cerfa 15776*02 Modal from List View */}
      {cerfaVehicle && (
        <Cerfa15776Modal
          isOpen={true}
          onClose={() => setCerfaVehicle(null)}
          vehicle={cerfaVehicle}
          userId={effectiveUserId}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onDevSuperAdminLogin={handleDevSuperAdminLogin}
      />
    </div>
  );
}
